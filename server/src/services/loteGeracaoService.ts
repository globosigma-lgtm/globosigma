import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { caminhosAtivos } from "./ativoService.js";
import { listarTarefasDoPlano } from "./planoTarefaService.js";
import { listarPecasDoPlano } from "./planoPecaService.js";
import { listarPecasDoAtivo } from "./ativoPecaService.js";
import { ajustarDiaNaoUtil, calcularOcorrencias, type Periodicidade, type TratamentoDiaNaoUtil } from "./recorrenciaService.js";
import { criarReserva, excluirReservasDaOS } from "./estoqueService.js";
import { processarComConcorrencia } from "../lib/concorrencia.js";

/** Limite de OS confirmadas em paralelo por lote — ver comentário em processarComConcorrencia. */
const CONCORRENCIA_CONFIRMACAO = 8;

export type TipoOS = "preventiva" | "corretiva" | "inspecao" | "melhoria" | "calibracao";
export type StatusLote = "simulado" | "confirmado" | "revertido" | "processando" | "erro";

/**
 * Nem todo tipo_manutencao do plano tem correspondente exato em ordem_servico.tipo — a spec não
 * detalha o mapeamento (Seção 5), então lubrificação/limpeza técnica/preditiva manual caem no
 * tipo mais próximo disponível. Revisar se a Seção 5 completa especificar outra regra.
 */
const MAPA_TIPO_OS: Record<string, TipoOS> = {
  preventiva: "preventiva",
  preditiva_manual: "inspecao",
  inspecao: "inspecao",
  calibracao: "calibracao",
  lubrificacao: "preventiva",
  limpeza_tecnica: "preventiva",
};

export interface FiltrosGeracao {
  ativoId?: number;
  tipoManutencao?: string;
  texto?: string;
}

export interface PlanoDaOcorrencia {
  id: number;
  codigo: string;
  nome: string;
  tipo_manutencao: string;
  periodicidade: Periodicidade;
}

export interface OcorrenciaSimulada {
  /** Plano "principal" do grupo (o de menor id) — mantido para telas/integrações que só leem 1 plano. */
  plano_id: number;
  plano_codigo: string;
  plano_nome: string;
  /** Todos os planos consolidados nesta OS (1 item quando não há consolidação). */
  planos: PlanoDaOcorrencia[];
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  tipo_manutencao: string;
  periodicidade: Periodicidade;
  tipo_os: TipoOS;
  prioridade: string;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  data_prevista: string;
  data_ajustada: string;
  data_limite: string;
  horas_estimadas: number;
  exige_parada_linha: number;
  chave_idempotencia: string;
  ja_gerada: boolean;
}

export interface AlertaSobrecarga {
  responsavel_id: number;
  responsavel_nome: string;
  data: string;
  horas_totais: number;
  limite_horas: number;
}

export interface ResultadoSimulacao {
  data_inicio: string;
  data_fim: string;
  tratamento_dia_nao_util: TratamentoDiaNaoUtil;
  ocorrencias: OcorrenciaSimulada[];
  total_novas: number;
  total_ja_geradas: number;
  sobrecargas: AlertaSobrecarga[];
}

export interface LoteGeracao {
  id: number;
  codigo: string;
  data_inicio_periodo: string;
  data_fim_periodo: string;
  filtros_aplicados: string | null;
  quantidade_gerada: number;
  gerado_em: string;
  gerado_por: number;
  gerado_por_nome: string;
  status: StatusLote;
  revertido_em: string | null;
  revertido_por: number | null;
  erro_mensagem: string | null;
}

export class ErroValidacaoLote extends Error {}

interface PlanoElegivel {
  id: number;
  codigo: string;
  nome: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  tipo_manutencao: string;
  periodicidade: Periodicidade;
  intervalo_customizado_dias: number | null;
  data_base: string;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
  ativo: number;
  duracao_estimada_horas: number;
  responsavel_padrao_id: number | null;
  responsavel_nome: string | null;
  prioridade_padrao: string;
  exige_parada_linha: number;
}

async function configuracao<T>(chave: string, padrao: T): Promise<T> {
  const row = await dbGet<{ valor: string }>("SELECT valor FROM configuracao WHERE chave = ?", [chave]);
  return row ? (JSON.parse(row.valor) as T) : padrao;
}

function somarDiasIso(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return data.toISOString().slice(0, 10);
}

async function planosElegiveis(filtros: FiltrosGeracao): Promise<PlanoElegivel[]> {
  const condicoes = ["p.ativo = 1", "p.excluido_em IS NULL", "a.excluido_em IS NULL"];
  const params: unknown[] = [];
  if (filtros.ativoId) {
    condicoes.push("p.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.tipoManutencao) {
    condicoes.push("p.tipo_manutencao = ?");
    params.push(filtros.tipoManutencao);
  }
  if (filtros.texto) {
    condicoes.push("(p.codigo ILIKE ? OR p.nome ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  const sql = `
    SELECT p.id, p.codigo, p.nome, p.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
           p.tipo_manutencao, p.periodicidade, p.intervalo_customizado_dias, p.data_base,
           p.data_inicio_vigencia, p.data_fim_vigencia, p.ativo, p.duracao_estimada_horas,
           p.responsavel_padrao_id, u.nome AS responsavel_nome, p.prioridade_padrao, p.exige_parada_linha
    FROM plano_manutencao p
    JOIN ativo a ON a.id = p.ativo_id
    LEFT JOIN usuario u ON u.id = p.responsavel_padrao_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY a.nome, p.nome
  `;
  return (await dbAll(sql, params)) as unknown as PlanoElegivel[];
}

/**
 * Calcula, sem persistir nada, quais OS seriam geradas para o período informado. Usada tanto
 * pela pré-visualização (endpoint /simular) quanto internamente por confirmarLote — que refaz o
 * cálculo em vez de reaproveitar uma prévia antiga, para refletir planos criados/alterados entre
 * a simulação e a confirmação.
 */
const ORDEM_PRIORIDADE = ["baixa", "media", "alta", "critica"];

function prioridadeMaisAlta(a: string, b: string): string {
  return ORDEM_PRIORIDADE.indexOf(b) > ORDEM_PRIORIDADE.indexOf(a) ? b : a;
}

interface OcorrenciaIndividual {
  plano: PlanoElegivel;
  data_prevista: string;
  data_ajustada: string;
}

/**
 * Agrupa as ocorrências individuais (1 por plano) por ativo+data: quando duas ou mais atividades
 * do mesmo equipamento caem no mesmo dia, o usuário quer 1 OS só, com o checklist de todas juntas
 * — não uma OS por plano. `data_ajustada` já reflete o tratamento de dia não útil, então o
 * agrupamento acontece na data que efetivamente vira a OS.
 */
async function consolidarPorAtivoEData(individuais: OcorrenciaIndividual[], margemDias: number): Promise<OcorrenciaSimulada[]> {
  const grupos = new Map<string, OcorrenciaIndividual[]>();
  for (const o of individuais) {
    const chave = `${o.plano.ativo_id}:${o.data_ajustada}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(o);
  }

  // PERF: as duas consultas abaixo eram feitas uma por grupo (caminhoAtivo + existente), o que em
  // lotes sem filtro (centenas de grupos) virava centenas de round-trips seriais ao Postgres remoto
  // e estourava o tempo limite da function serverless — mesma classe de problema já resolvida em
  // ativoService.caminhosAtivos (PERF-01) para inspeções, aplicada aqui e batchada também para a
  // checagem de idempotência.
  const chavesIdempotencia = [...grupos.values()].map((membros) => {
    const principal = [...membros].sort((a, b) => a.plano.id - b.plano.id)[0].plano;
    return `ativo:${principal.ativo_id}:${membros[0].data_ajustada}`;
  });
  const existentes = new Set(
    chavesIdempotencia.length
      ? (
          await dbAll<{ chave_idempotencia: string }>(
            "SELECT chave_idempotencia FROM ordem_servico WHERE chave_idempotencia = ANY(?)",
            [chavesIdempotencia]
          )
        ).map((r) => r.chave_idempotencia)
      : []
  );
  const caminhos = await caminhosAtivos([...grupos.values()].map((membros) => membros[0].plano.ativo_id));

  const resultado: OcorrenciaSimulada[] = [];
  for (const membros of grupos.values()) {
    membros.sort((a, b) => a.plano.id - b.plano.id);
    const principal = membros[0].plano;
    const dataAjustada = membros[0].data_ajustada;

    const tiposOsDoGrupo = new Set(membros.map((m) => MAPA_TIPO_OS[m.plano.tipo_manutencao] ?? "preventiva"));
    const responsaveisDoGrupo = new Set(membros.map((m) => m.plano.responsavel_padrao_id));

    const chaveIdempotencia = `ativo:${principal.ativo_id}:${dataAjustada}`;

    resultado.push({
      plano_id: principal.id,
      plano_codigo: principal.codigo,
      plano_nome: principal.nome,
      planos: membros.map((m) => ({
        id: m.plano.id,
        codigo: m.plano.codigo,
        nome: m.plano.nome,
        tipo_manutencao: m.plano.tipo_manutencao,
        periodicidade: m.plano.periodicidade,
      })),
      ativo_id: principal.ativo_id,
      ativo_codigo: principal.ativo_codigo,
      ativo_nome: principal.ativo_nome,
      ativo_caminho: caminhos.get(principal.ativo_id) ?? principal.ativo_nome,
      tipo_manutencao: principal.tipo_manutencao,
      periodicidade: principal.periodicidade,
      tipo_os: tiposOsDoGrupo.size === 1 ? [...tiposOsDoGrupo][0] : "preventiva",
      prioridade: membros.reduce((maior, m) => prioridadeMaisAlta(maior, m.plano.prioridade_padrao), "baixa"),
      responsavel_id: responsaveisDoGrupo.size === 1 ? principal.responsavel_padrao_id : null,
      responsavel_nome: responsaveisDoGrupo.size === 1 ? principal.responsavel_nome : null,
      data_prevista: membros[0].data_prevista,
      data_ajustada: dataAjustada,
      data_limite: somarDiasIso(dataAjustada, margemDias),
      horas_estimadas: membros.reduce((soma, m) => soma + m.plano.duracao_estimada_horas, 0),
      exige_parada_linha: membros.some((m) => m.plano.exige_parada_linha) ? 1 : 0,
      chave_idempotencia: chaveIdempotencia,
      ja_gerada: existentes.has(chaveIdempotencia),
    });
  }
  return resultado;
}

export async function simular(dataInicio: string, dataFim: string, filtros: FiltrosGeracao = {}): Promise<ResultadoSimulacao> {
  const tratamento = await configuracao<TratamentoDiaNaoUtil>("tratamento_dia_nao_util", "gerar_na_data");
  const margemDias = await configuracao<number>("margem_seguranca_dias", 7);
  const limiteHorasDia = await configuracao<number>("limite_horas_dia_responsavel", 8);
  const feriados = new Set((await dbAll<{ data: string }>("SELECT data FROM feriado")).map((f) => f.data));

  const individuais: OcorrenciaIndividual[] = [];
  for (const plano of await planosElegiveis(filtros)) {
    const datas = calcularOcorrencias(
      {
        periodicidade: plano.periodicidade,
        intervalo_customizado_dias: plano.intervalo_customizado_dias,
        data_base: plano.data_base,
        data_inicio_vigencia: plano.data_inicio_vigencia,
        data_fim_vigencia: plano.data_fim_vigencia,
        ativo: plano.ativo,
      },
      dataInicio,
      dataFim
    );
    for (const dataPrevista of datas) {
      const dataAjustada = ajustarDiaNaoUtil(dataPrevista, tratamento, feriados);
      individuais.push({ plano, data_prevista: dataPrevista, data_ajustada: dataAjustada });
    }
  }

  const ocorrencias = await consolidarPorAtivoEData(individuais, margemDias);
  ocorrencias.sort((a, b) => a.data_ajustada.localeCompare(b.data_ajustada) || a.ativo_nome.localeCompare(b.ativo_nome));

  const cargaPorResponsavelData = new Map<
    string,
    { responsavel_id: number; responsavel_nome: string; data: string; horas: number }
  >();
  for (const o of ocorrencias) {
    if (o.ja_gerada || !o.responsavel_id) continue;
    const chave = `${o.responsavel_id}:${o.data_ajustada}`;
    const atual = cargaPorResponsavelData.get(chave) ?? {
      responsavel_id: o.responsavel_id,
      responsavel_nome: o.responsavel_nome ?? "",
      data: o.data_ajustada,
      horas: 0,
    };
    atual.horas += o.horas_estimadas;
    cargaPorResponsavelData.set(chave, atual);
  }
  const sobrecargas: AlertaSobrecarga[] = [...cargaPorResponsavelData.values()]
    .filter((c) => c.horas > limiteHorasDia)
    .map((c) => ({
      responsavel_id: c.responsavel_id,
      responsavel_nome: c.responsavel_nome,
      data: c.data,
      horas_totais: c.horas,
      limite_horas: limiteHorasDia,
    }));

  return {
    data_inicio: dataInicio,
    data_fim: dataFim,
    tratamento_dia_nao_util: tratamento,
    ocorrencias,
    total_novas: ocorrencias.filter((o) => !o.ja_gerada).length,
    total_ja_geradas: ocorrencias.filter((o) => o.ja_gerada).length,
    sobrecargas,
  };
}

const COLUNAS_LOTE = `
  l.id, l.codigo, l.data_inicio_periodo, l.data_fim_periodo, l.filtros_aplicados,
  l.quantidade_gerada, l.gerado_em, l.gerado_por, u.nome AS gerado_por_nome, l.status,
  l.revertido_em, l.revertido_por, l.erro_mensagem
`;

export async function listarLotes(): Promise<LoteGeracao[]> {
  return (await dbAll(
    `SELECT ${COLUNAS_LOTE} FROM lote_geracao l JOIN usuario u ON u.id = l.gerado_por ORDER BY l.gerado_em DESC`
  )) as unknown as LoteGeracao[];
}

export async function buscarLotePorId(id: number): Promise<LoteGeracao | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS_LOTE} FROM lote_geracao l JOIN usuario u ON u.id = l.gerado_por WHERE l.id = ?`,
    [id]
  )) as LoteGeracao | undefined;
  return row ?? null;
}

export async function codigoSugerido(): Promise<string> {
  const rows = await dbAll<{ codigo: string }>("SELECT codigo FROM lote_geracao WHERE codigo LIKE 'LOTE-%'");
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("LOTE-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `LOTE-${String(maior + 1).padStart(4, "0")}`;
}

/**
 * Salva a definição do lote (período + filtros) com status "simulado" — ainda sem criar
 * nenhuma OS. Existe para deixar rastro de auditoria de toda geração solicitada, mesmo que
 * nunca seja confirmada, e para permitir separar quem monta a geração de quem a aprova
 * (ações "criar" e "aprovar" de geracao_lote são independentes no mapa de permissões).
 */
export async function criarLote(
  codigo: string,
  dataInicio: string,
  dataFim: string,
  filtros: FiltrosGeracao,
  usuarioId: number
): Promise<LoteGeracao> {
  if (dataFim < dataInicio) {
    throw new ErroValidacaoLote("A data final do período não pode ser anterior à data inicial.");
  }
  const existente = await dbGet("SELECT id FROM lote_geracao WHERE codigo = ?", [codigo]);
  if (existente) {
    throw new ErroValidacaoLote(`Já existe um lote com o código "${codigo}".`);
  }

  const info = await dbRun(
    `INSERT INTO lote_geracao (codigo, data_inicio_periodo, data_fim_periodo, filtros_aplicados, quantidade_gerada, gerado_por, status, gerado_em)
     VALUES (?, ?, ?, ?, 0, ?, 'simulado', (now() - interval '4 hours')) RETURNING id`,
    [codigo, dataInicio, dataFim, JSON.stringify(filtros ?? {}), usuarioId]
  );

  const lote = (await buscarLotePorId(info.id!))!;
  await registrarAuditoria({ entidade: "lote_geracao", entidade_id: lote.id, acao: "criar", valor_novo: lote, usuario_id: usuarioId });
  return lote;
}

async function proximoNumeroOS(): Promise<number> {
  // MAX calculado no próprio Postgres em vez de trazer toda a tabela pra somar em JS — a versão
  // antiga escalava mal (uma consulta desnecessariamente pesada a cada confirmação de lote).
  const row = await dbGet<{ maior: number | null }>(
    "SELECT MAX((substring(codigo from 4))::int) AS maior FROM ordem_servico WHERE codigo ~ '^OS-[0-9]+$'"
  );
  return row?.maior ?? 0;
}

/** Postgres sinaliza violação de UNIQUE com o código SQLSTATE 23505 (a mensagem não é mais "UNIQUE constraint failed" como no SQLite). */
function ehErroDeDuplicidade(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function marcarProcessando(loteId: number): Promise<void> {
  await dbRun("UPDATE lote_geracao SET status = 'processando', erro_mensagem = NULL WHERE id = ?", [loteId]);
}

export async function marcarErro(loteId: number, mensagem: string): Promise<void> {
  await dbRun("UPDATE lote_geracao SET status = 'erro', erro_mensagem = ? WHERE id = ?", [mensagem, loteId]);
}

/**
 * LOTE-BG-01: dispara a confirmação numa Netlify Background Function (até 15 min de execução) em
 * vez de processar dentro da própria requisição síncrona — que tem limite de 10s e estourava em
 * lotes com muitas ocorrências novas (ex.: logo após um reset em massa de OS, quando a checagem de
 * idempotência não bloqueia mais nada). `URL`/`DEPLOY_URL` são injetadas automaticamente pelo
 * Netlify dentro de qualquer function, não precisam de configuração adicional.
 */
export async function dispararConfirmacaoBackground(loteId: number, usuarioId: number): Promise<void> {
  const base = process.env.URL ?? process.env.DEPLOY_URL;
  if (!base) {
    throw new Error("URL do site não disponível para disparar a confirmação em background.");
  }
  const resposta = await fetch(`${base}/.netlify/functions/confirmar-lote-background`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": process.env.SIGMA_INTERNAL_TOKEN ?? "",
    },
    body: JSON.stringify({ loteId, usuarioId }),
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao disparar confirmação em background (HTTP ${resposta.status}).`);
  }
}

/**
 * Confirma um lote "simulado" (ou "processando", quando chamada pela background function — ver
 * dispararConfirmacaoBackground): refaz o cálculo de ocorrências (período/filtros salvos no lote)
 * e efetivamente cria as OS, copiando checklist e peças previstas do plano. Ocorrências cuja
 * chave_idempotencia (plano+data) já corresponde a uma OS existente são somente contadas como
 * ignoradas — nunca duplicadas — regra crítica para permitir rodar a geração mais de uma vez
 * sobre períodos sobrepostos sem criar OS repetidas.
 */
export async function confirmarLote(
  loteId: number,
  usuarioId: number
): Promise<{ lote: LoteGeracao; ordens_criadas: number; ocorrencias_ignoradas: number }> {
  const lote = await buscarLotePorId(loteId);
  if (!lote) {
    throw new ErroValidacaoLote("Lote de geração não encontrado.");
  }
  if (lote.status !== "simulado" && lote.status !== "processando") {
    throw new ErroValidacaoLote('Somente lotes com status "simulado" podem ser confirmados.');
  }

  const filtros = lote.filtros_aplicados ? (JSON.parse(lote.filtros_aplicados) as FiltrosGeracao) : {};
  const simulacao = await simular(lote.data_inicio_periodo, lote.data_fim_periodo, filtros);

  const SQL_INSERIR_OS = `INSERT INTO ordem_servico (
      codigo, ativo_id, plano_id, lote_geracao_id, tipo, origem, prioridade, status,
      descricao, data_programada, data_limite, responsavel_id, horas_estimadas, exige_parada_linha, chave_idempotencia, data_abertura
    ) VALUES (?, ?, ?, ?, ?, 'plano_lote', ?, 'programada', ?, ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`;
  const SQL_INSERIR_TAREFA = `INSERT INTO os_tarefa (os_id, ordem, descricao, tipo_resposta, obrigatoria, valor_min, valor_max, unidade, regime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const SQL_INSERIR_PECA = `INSERT INTO os_peca (os_id, peca_id, quantidade_prevista, origem, obrigatoria) VALUES (?, ?, ?, ?, ?)`;
  const SQL_INSERIR_OS_PLANO = `INSERT INTO os_plano (os_id, plano_id) VALUES (?, ?)`;

  let proximoNumero = await proximoNumeroOS();
  let criadas = 0;
  let ignoradas = 0;

  // Um plano recorrente aparece em várias ocorrências do período (ex.: plano semanal ao longo de
  // um trimestre) — cachear evita repetir a mesma consulta de tarefas/peças dezenas de vezes.
  const cacheTarefasDoPlano = new Map<number, ReturnType<typeof listarTarefasDoPlano>>();
  const tarefasDoPlanoCache = (planoId: number) => {
    let p = cacheTarefasDoPlano.get(planoId);
    if (!p) {
      p = listarTarefasDoPlano(planoId);
      cacheTarefasDoPlano.set(planoId, p);
    }
    return p;
  };
  const cachePecasDoPlano = new Map<number, ReturnType<typeof listarPecasDoPlano>>();
  const pecasDoPlanoCache = (planoId: number) => {
    let p = cachePecasDoPlano.get(planoId);
    if (!p) {
      p = listarPecasDoPlano(planoId);
      cachePecasDoPlano.set(planoId, p);
    }
    return p;
  };

  const pendentes: { o: (typeof simulacao.ocorrencias)[number]; codigoOS: string }[] = [];
  for (const o of simulacao.ocorrencias) {
    if (o.ja_gerada) {
      ignoradas++;
      continue;
    }
    proximoNumero++;
    pendentes.push({ o, codigoOS: `OS-${String(proximoNumero).padStart(6, "0")}` });
  }

  // LOTE-PERF: ver processarComConcorrencia — cada ocorrência processada em série fazia de 10 a
  // 25 round-trips sequenciais ao Postgres, o que estourava o tempo limite da function serverless
  // em lotes de poucas dezenas de OS.
  const resultados = await processarComConcorrencia(pendentes, CONCORRENCIA_CONFIRMACAO, async ({ o, codigoOS }) => {
    const descricao =
      o.planos.length === 1
        ? `Manutenção ${o.tipo_manutencao} conforme plano ${o.plano_codigo} — ${o.plano_nome}`
        : `Manutenção consolidada — ${o.planos.length} atividades: ${o.planos.map((p) => `${p.codigo} (${p.nome})`).join("; ")}`;

    let osId: number;
    try {
      const info = await dbRun(SQL_INSERIR_OS, [
        codigoOS,
        o.ativo_id,
        o.plano_id,
        lote.id,
        o.tipo_os,
        o.prioridade,
        descricao,
        o.data_ajustada,
        o.data_limite,
        o.responsavel_id,
        o.horas_estimadas,
        o.exige_parada_linha,
        o.chave_idempotencia,
      ]);
      osId = info.id!;
    } catch (err) {
      if (ehErroDeDuplicidade(err)) return "ignorada" as const;
      throw err;
    }

    const [tarefasPorPlano, pecasPorPlano] = await Promise.all([
      Promise.all(o.planos.map((p) => tarefasDoPlanoCache(p.id))),
      Promise.all(o.planos.map((p) => pecasDoPlanoCache(p.id))),
    ]);

    // Duas atividades consolidadas podem prever a mesma peça (ex.: ambas usam o mesmo rolamento)
    // — sem isso, a OS ganharia 2 linhas separadas para o mesmo código em vez de 1 linha com o
    // total, que é o que a tela de peças e a reserva de estoque esperam.
    const quantidadePorPeca = new Map<number, { quantidade: number; obrigatoria: boolean }>();
    for (const pecas of pecasPorPlano) {
      for (const peca of pecas) {
        const atual = quantidadePorPeca.get(peca.peca_id) ?? { quantidade: 0, obrigatoria: false };
        atual.quantidade += peca.quantidade_prevista;
        atual.obrigatoria = atual.obrigatoria || !!peca.obrigatoria;
        quantidadePorPeca.set(peca.peca_id, atual);
      }
    }

    let ordemTarefa = 0;
    const tarefasParaInserir = tarefasPorPlano.flat().map((t) => ({ ...t, ordem: ++ordemTarefa }));

    // Nenhum dos planos consolidados tem peças previstas cadastradas: usa a lista técnica do
    // ativo (peças que ele usa de modo geral) como sugestão, já que é melhor do que a OS não
    // trazer nenhuma peça.
    const pecasDaListaTecnica = quantidadePorPeca.size === 0 ? await listarPecasDoAtivo(o.ativo_id) : null;

    await Promise.all([
      ...o.planos.map((p) => dbRun(SQL_INSERIR_OS_PLANO, [osId, p.id])),
      ...tarefasParaInserir.map((t) =>
        dbRun(SQL_INSERIR_TAREFA, [osId, t.ordem, t.descricao, t.tipo_resposta, t.obrigatoria, t.valor_min, t.valor_max, t.unidade, t.regime])
      ),
      ...(pecasDaListaTecnica
        ? pecasDaListaTecnica.map((p) =>
            dbRun(SQL_INSERIR_PECA, [osId, p.peca_id, p.quantidade_padrao, "lista_tecnica_ativo", p.troca_obrigatoria]).then(() =>
              criarReserva(osId, p.peca_id, p.quantidade_padrao)
            )
          )
        : [...quantidadePorPeca].map(([pecaId, { quantidade, obrigatoria }]) =>
            dbRun(SQL_INSERIR_PECA, [osId, pecaId, quantidade, "plano", obrigatoria ? 1 : 0]).then(() => criarReserva(osId, pecaId, quantidade))
          )),
      registrarAuditoria({
        entidade: "ordem_servico",
        entidade_id: osId,
        acao: "criar",
        valor_novo: {
          codigo: codigoOS,
          origem: "plano_lote",
          lote_geracao_id: lote.id,
          planos_id: o.planos.map((p) => p.id),
          data_programada: o.data_ajustada,
        },
        usuario_id: usuarioId,
      }),
    ]);

    return "criada" as const;
  });

  for (const r of resultados) {
    if (r === "criada") criadas++;
    else ignoradas++;
  }

  await dbRun("UPDATE lote_geracao SET quantidade_gerada = ?, status = 'confirmado' WHERE id = ?", [criadas, lote.id]);
  const atualizado = (await buscarLotePorId(lote.id))!;
  await registrarAuditoria({
    entidade: "lote_geracao",
    entidade_id: lote.id,
    acao: "status",
    valor_anterior: lote,
    valor_novo: atualizado,
    usuario_id: usuarioId,
  });
  return { lote: atualizado, ordens_criadas: criadas, ocorrencias_ignoradas: ignoradas };
}

/**
 * Reverte um lote confirmado, excluindo apenas as OS que ainda não saíram de "programada" —
 * uma OS já aberta/em execução não é desfeita por engano. As OS não revertidas ficam com o
 * vínculo ao lote intacto (para rastreabilidade) e são reportadas separadamente ao usuário.
 */
export async function reverterLote(
  loteId: number,
  usuarioId: number
): Promise<{ lote: LoteGeracao; revertidas: number; naoRevertidas: number }> {
  const lote = await buscarLotePorId(loteId);
  if (!lote) {
    throw new ErroValidacaoLote("Lote de geração não encontrado.");
  }
  if (lote.status !== "confirmado") {
    throw new ErroValidacaoLote("Somente lotes confirmados podem ser revertidos.");
  }

  const osDoLote = await dbAll<{ id: number; status: string }>(
    "SELECT id, status FROM ordem_servico WHERE lote_geracao_id = ?",
    [loteId]
  );

  let revertidas = 0;
  let naoRevertidas = 0;
  for (const os of osDoLote) {
    if (os.status !== "programada") {
      naoRevertidas++;
      continue;
    }
    await excluirReservasDaOS(os.id);
    await dbRun("DELETE FROM os_peca WHERE os_id = ?", [os.id]);
    await dbRun("DELETE FROM os_tarefa WHERE os_id = ?", [os.id]);
    await dbRun("DELETE FROM os_plano WHERE os_id = ?", [os.id]);
    await dbRun("DELETE FROM ordem_servico WHERE id = ?", [os.id]);
    revertidas++;
  }

  await dbRun(
    "UPDATE lote_geracao SET status = 'revertido', revertido_em = (now() - interval '4 hours'), revertido_por = ? WHERE id = ?",
    [usuarioId, loteId]
  );
  const atualizado = (await buscarLotePorId(loteId))!;
  await registrarAuditoria({
    entidade: "lote_geracao",
    entidade_id: loteId,
    acao: "status",
    valor_anterior: lote,
    valor_novo: atualizado,
    usuario_id: usuarioId,
  });
  return { lote: atualizado, revertidas, naoRevertidas };
}
