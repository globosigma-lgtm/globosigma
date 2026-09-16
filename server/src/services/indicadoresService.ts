import { dbGet, dbAll } from "../db/pg.js";
import { listarAlertasReposicao } from "./estoqueService.js";
import type { TipoOS } from "./osService.js";
import { hojeSistema } from "../lib/horarioSistema.js";

export interface IndicadoresDashboard {
  periodo_dias: number;
  cumprimento_plano_pct: number | null;
  preventivas_no_prazo: number;
  preventivas_devidas: number;
  os_abertas: number;
  backlog_horas: number;
  pecas_em_ruptura: number;
}

const hoje = hojeSistema;

function somarDiasIso(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/**
 * Painel de indicadores (Fase 11): substitui os "—" do Dashboard por números reais, calculados
 * em cima do que os módulos anteriores já persistem — nenhuma tabela nova.
 * - Cumprimento do plano: das OS preventivas (origem plano_lote/plano_manual) cuja data_limite
 *   caiu dentro da janela, quantas foram concluídas dentro do prazo (data_conclusao <=
 *   data_limite). null quando não havia nenhuma devida no período (não faz sentido mostrar 0%).
 * - OS abertas / backlog em horas: soma de todas as OS que ainda não saíram de
 *   "concluída"/"cancelada", independente da origem.
 * - Peças em ruptura: alertas de reposição (Fase 7) no nível "crítico" (estoque no ou abaixo do
 *   mínimo).
 */
export async function obterIndicadoresDashboard(periodoDias = 30): Promise<IndicadoresDashboard> {
  const fim = hoje();
  const inicio = somarDiasIso(fim, -periodoDias);

  const abertas = (await dbGet<{ n: number; horas: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(horas_estimadas), 0) AS horas
     FROM ordem_servico
     WHERE status NOT IN ('concluida', 'cancelada') AND excluido_em IS NULL`
  ))!;

  const devidas = await dbAll<{ status: string; data_conclusao: string | null; data_limite: string }>(
    `SELECT status, data_conclusao, data_limite
     FROM ordem_servico
     WHERE origem IN ('plano_lote', 'plano_manual') AND data_limite BETWEEN ? AND ? AND excluido_em IS NULL`,
    [inicio, fim]
  );

  const totalDevidas = devidas.length;
  const noPrazo = devidas.filter(
    (d) => d.status === "concluida" && d.data_conclusao != null && d.data_conclusao.slice(0, 10) <= d.data_limite
  ).length;

  const pecasEmRuptura = (await listarAlertasReposicao()).filter((a) => a.nivel === "critico").length;

  return {
    periodo_dias: periodoDias,
    cumprimento_plano_pct: totalDevidas > 0 ? Math.round((noPrazo / totalDevidas) * 1000) / 10 : null,
    preventivas_no_prazo: noPrazo,
    preventivas_devidas: totalDevidas,
    os_abertas: abertas.n,
    backlog_horas: abertas.horas,
    pecas_em_ruptura: pecasEmRuptura,
  };
}

export interface TempoExecucaoPorTipo {
  tipo: TipoOS;
  amostras: number;
  media_horas: number;
}

export interface TempoExecucaoPorAtivo {
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  amostras: number;
  media_horas: number;
}

export interface IndicadorTempoExecucao {
  periodo_inicio: string;
  periodo_fim: string;
  amostras: number;
  media_horas: number | null;
  por_tipo: TempoExecucaoPorTipo[];
  por_ativo: TempoExecucaoPorAtivo[];
}

function media(valores: number[]): number {
  return Math.round((valores.reduce((soma, v) => soma + v, 0) / valores.length) * 10) / 10;
}

/**
 * Tempo médio de execução (MTTR): média de data_conclusao - data_inicio_execucao, em horas, das
 * OS concluídas cuja data_conclusao caiu no período. Só considera OS com os dois timestamps
 * preenchidos (ambos são gravados automaticamente pelas transições "Iniciar execução"/"Concluir",
 * nunca editáveis manualmente — ver osService.iniciarExecucaoOS/concluirOS).
 * `por_ativo` traz só os 10 ativos com maior média no período, não a lista inteira.
 */
export async function obterIndicadorTempoExecucao(inicio?: string, fim?: string): Promise<IndicadorTempoExecucao> {
  const fimStr = fim ?? hoje();
  const inicioStr = inicio ?? somarDiasIso(fimStr, -30);

  const linhas = await dbAll<{
    tipo: TipoOS;
    ativo_id: number;
    ativo_codigo: string;
    ativo_nome: string;
    horas: number;
  }>(
    `SELECT os.tipo, os.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
            EXTRACT(EPOCH FROM (os.data_conclusao::timestamp - os.data_inicio_execucao::timestamp)) / 3600 AS horas
     FROM ordem_servico os
     JOIN ativo a ON a.id = os.ativo_id
     WHERE os.status = 'concluida'
       AND os.data_inicio_execucao IS NOT NULL
       AND os.data_conclusao IS NOT NULL
       AND os.excluido_em IS NULL
       AND os.data_conclusao::date BETWEEN ? AND ?`,
    [inicioStr, fimStr]
  );

  const porTipo = new Map<TipoOS, number[]>();
  const porAtivo = new Map<number, { ativo_codigo: string; ativo_nome: string; valores: number[] }>();
  for (const l of linhas) {
    if (!porTipo.has(l.tipo)) porTipo.set(l.tipo, []);
    porTipo.get(l.tipo)!.push(l.horas);

    if (!porAtivo.has(l.ativo_id)) porAtivo.set(l.ativo_id, { ativo_codigo: l.ativo_codigo, ativo_nome: l.ativo_nome, valores: [] });
    porAtivo.get(l.ativo_id)!.valores.push(l.horas);
  }

  return {
    periodo_inicio: inicioStr,
    periodo_fim: fimStr,
    amostras: linhas.length,
    media_horas: linhas.length > 0 ? media(linhas.map((l) => l.horas)) : null,
    por_tipo: [...porTipo.entries()]
      .map(([tipo, valores]) => ({ tipo, amostras: valores.length, media_horas: media(valores) }))
      .sort((a, b) => b.media_horas - a.media_horas),
    por_ativo: [...porAtivo.entries()]
      .map(([ativo_id, v]) => ({ ativo_id, ativo_codigo: v.ativo_codigo, ativo_nome: v.ativo_nome, amostras: v.valores.length, media_horas: media(v.valores) }))
      .sort((a, b) => b.media_horas - a.media_horas)
      .slice(0, 10),
  };
}

export interface PontoBacklogSemanal {
  semana_fim: string;
  os_em_aberto: number;
  horas_em_aberto: number;
}

/**
 * BI-01: backlog (OS não concluída/cancelada) medido no fim de cada semana das últimas
 * `semanas` semanas — "quantas OS e quantas horas estavam pendentes naquele momento", não só o
 * instantâneo de hoje que o Dashboard já mostrava.
 */
export async function obterBacklogSemanal(semanas = 12): Promise<PontoBacklogSemanal[]> {
  const pontos: PontoBacklogSemanal[] = [];
  const fimHoje = hoje();
  for (let i = semanas - 1; i >= 0; i--) {
    const semanaFim = somarDiasIso(fimHoje, -7 * i);
    const linha = (await dbGet<{ n: number; horas: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(horas_estimadas), 0) AS horas
       FROM ordem_servico
       WHERE excluido_em IS NULL
         AND data_abertura <= ?
         AND (data_conclusao IS NULL OR data_conclusao::date > ?)
         AND status != 'cancelada'`,
      [`${semanaFim} 23:59:59`, semanaFim]
    ))!;
    pontos.push({ semana_fim: semanaFim, os_em_aberto: linha.n, horas_em_aberto: linha.horas });
  }
  return pontos;
}

export interface CustoPorAtivo {
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  custo_pecas: number;
  custo_mao_obra: number;
  custo_total: number;
  os_concluidas: number;
}

/**
 * NOVO-03/BI-01: custo acumulado (peças + mão de obra) por ativo, só de OS concluídas — decisão de
 * reparar vs. substituir vira número. Sem filtro de ativo, é o ranking pro gráfico do BI; com
 * `ativoId`, é o total de um ativo específico pra tela de detalhe.
 */
export async function obterCustoPorAtivo(ativoId?: number, top = 10): Promise<CustoPorAtivo[]> {
  const condicaoAtivo = ativoId ? "AND os.ativo_id = ?" : "";
  const params: unknown[] = ativoId ? [ativoId] : [];
  const linhas = (await dbAll(
    `SELECT os.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
            COALESCE(SUM(os.custo_pecas), 0) AS custo_pecas,
            COALESCE(SUM(os.custo_mao_obra), 0) AS custo_mao_obra,
            COUNT(*) AS os_concluidas
     FROM ordem_servico os
     JOIN ativo a ON a.id = os.ativo_id
     WHERE os.status = 'concluida' AND os.excluido_em IS NULL ${condicaoAtivo}
     GROUP BY os.ativo_id, a.codigo, a.nome
     ORDER BY (COALESCE(SUM(os.custo_pecas), 0) + COALESCE(SUM(os.custo_mao_obra), 0)) DESC
     ${ativoId ? "" : "LIMIT " + top}`,
    params
  )) as Omit<CustoPorAtivo, "custo_total">[];
  return linhas.map((l) => ({ ...l, custo_total: l.custo_pecas + l.custo_mao_obra }));
}

export interface CumprimentoPorSetor {
  setor: string;
  preventivas_no_prazo: number;
  preventivas_devidas: number;
  cumprimento_pct: number | null;
}

/** BI-01: mesma lógica de cumprimento_plano_pct do Dashboard, quebrada por setor do ativo. */
export async function obterCumprimentoPorSetor(periodoDias = 30): Promise<CumprimentoPorSetor[]> {
  const fim = hoje();
  const inicio = somarDiasIso(fim, -periodoDias);
  const linhas = await dbAll<{ setor: string; status: string; data_conclusao: string | null; data_limite: string }>(
    `SELECT COALESCE(a.setor, 'Sem setor') AS setor, os.status, os.data_conclusao, os.data_limite
     FROM ordem_servico os
     JOIN ativo a ON a.id = os.ativo_id
     WHERE os.origem IN ('plano_lote', 'plano_manual') AND os.data_limite BETWEEN ? AND ? AND os.excluido_em IS NULL`,
    [inicio, fim]
  );

  const porSetor = new Map<string, { devidas: number; noPrazo: number }>();
  for (const l of linhas) {
    if (!porSetor.has(l.setor)) porSetor.set(l.setor, { devidas: 0, noPrazo: 0 });
    const agregado = porSetor.get(l.setor)!;
    agregado.devidas += 1;
    if (l.status === "concluida" && l.data_conclusao != null && l.data_conclusao.slice(0, 10) <= l.data_limite) {
      agregado.noPrazo += 1;
    }
  }

  return [...porSetor.entries()]
    .map(([setor, v]) => ({
      setor,
      preventivas_no_prazo: v.noPrazo,
      preventivas_devidas: v.devidas,
      cumprimento_pct: v.devidas > 0 ? Math.round((v.noPrazo / v.devidas) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.preventivas_devidas - a.preventivas_devidas);
}

export interface ItemCurvaABC {
  peca_id: number;
  codigo: string;
  descricao: string;
  valor_consumido: number;
  pct_do_total: number;
  pct_acumulado: number;
  classe: "A" | "B" | "C";
}

/**
 * NOVO-05: curva ABC por valor consumido (SUM quantidade de saída × custo unitário no momento,
 * de movimento_estoque) — não por volume, porque uma peça barata em grande quantidade não deveria
 * competir por atenção com uma peça cara. Classe A = itens até 80% do valor acumulado, B até 95%,
 * C o resto — cortes clássicos de Pareto pra curva ABC de estoque.
 */
export async function obterCurvaABC(): Promise<ItemCurvaABC[]> {
  const linhas = await dbAll<{ peca_id: number; codigo: string; descricao: string; valor_consumido: number }>(
    `SELECT p.id AS peca_id, p.codigo, p.descricao,
            SUM(-m.quantidade * COALESCE(m.custo_unitario, 0)) AS valor_consumido
     FROM movimento_estoque m
     JOIN peca p ON p.id = m.peca_id
     WHERE m.tipo = 'saida'
     GROUP BY p.id
     HAVING SUM(-m.quantidade * COALESCE(m.custo_unitario, 0)) > 0
     ORDER BY valor_consumido DESC`
  );

  const total = linhas.reduce((soma, l) => soma + l.valor_consumido, 0);
  let acumulado = 0;
  return linhas.map((l) => {
    acumulado += l.valor_consumido;
    const pctAcumulado = total > 0 ? (acumulado / total) * 100 : 0;
    const classe: ItemCurvaABC["classe"] = pctAcumulado <= 80 ? "A" : pctAcumulado <= 95 ? "B" : "C";
    return {
      ...l,
      pct_do_total: total > 0 ? Math.round((l.valor_consumido / total) * 1000) / 10 : 0,
      pct_acumulado: Math.round(pctAcumulado * 10) / 10,
      classe,
    };
  });
}

export interface TicketMedioTecnico {
  responsavel_id: number;
  responsavel_nome: string;
  os_concluidas: number;
  horas_totais: number;
  ticket_medio_horas: number;
}

/**
 * NOVO: "ticket médio" por técnico — cruza, num período, quantas OS cada responsável concluiu com
 * quantas horas reais ele registrou nelas. ticket_medio_horas = horas_totais / os_concluidas é a
 * métrica em si (tempo médio por atendimento); os dois números que a compõem vêm junto porque o
 * mesmo ticket médio pode vir de "poucas OS longas" ou "muitas OS curtas" — só o quociente esconde
 * essa diferença. Considera só OS concluídas com responsável atribuído; horas_reais nulo conta como
 * 0 (não deveria acontecer numa OS concluída, mas evita NaN se acontecer).
 */
export async function obterTicketMedioPorTecnico(inicio?: string, fim?: string): Promise<TicketMedioTecnico[]> {
  const fimStr = fim ?? hoje();
  const inicioStr = inicio ?? somarDiasIso(fimStr, -30);

  const linhas = (await dbAll(
    `SELECT os.responsavel_id, u.nome AS responsavel_nome,
            COUNT(*) AS os_concluidas,
            COALESCE(SUM(os.horas_reais), 0) AS horas_totais
     FROM ordem_servico os
     JOIN usuario u ON u.id = os.responsavel_id
     WHERE os.status = 'concluida'
       AND os.responsavel_id IS NOT NULL
       AND os.excluido_em IS NULL
       AND os.data_conclusao::date BETWEEN ? AND ?
     GROUP BY os.responsavel_id, u.nome
     ORDER BY horas_totais DESC`,
    [inicioStr, fimStr]
  )) as Omit<TicketMedioTecnico, "ticket_medio_horas">[];

  return linhas.map((l) => ({
    ...l,
    ticket_medio_horas: l.os_concluidas > 0 ? Math.round((l.horas_totais / l.os_concluidas) * 10) / 10 : 0,
  }));
}
