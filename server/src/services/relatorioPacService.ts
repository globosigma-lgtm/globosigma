import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { caminhoAtivo, caminhosAtivos } from "./ativoService.js";
import { calcularOcorrencias, ajustarDiaNaoUtil, type TratamentoDiaNaoUtil } from "./recorrenciaService.js";
import { calcularOcorrenciasSemanais } from "./recorrenciaSemanalService.js";
import { dataInicioDaSemana, dataFimDaSemana } from "../lib/semanas.js";

export type TipoRelatorioPac = "manutencao" | "lubrificacao";

const CODIGO_DOCUMENTO: Record<TipoRelatorioPac, string> = {
  manutencao: "FORM PAC 001_1150",
  lubrificacao: "FORM PAC 001_1149",
};

export interface FiltrosRelatorioPac {
  setor?: string;
  ativoId?: number;
  ano: number;
  semanaInicio: number;
  semanaFim: number;
}

export type SituacaoOcorrenciaPac = "normal" | "nao_realizada" | "reprogramada";

export interface ItemChecklistPac {
  descricao: string;
  regime: "MP" | "MF" | null;
  resposta: "Conforme" | "Não Conforme" | "Pendente";
}

export interface ExecucaoPac {
  situacao: SituacaoOcorrenciaPac;
  data_prevista: string;
  os_codigo: string | null;
  tipo: string | null;
  data_execucao: string | null;
  nova_data: string | null; // preenchido quando situacao === 'reprogramada'
  checklist: ItemChecklistPac[];
}

export interface SecaoEquipamentoPac {
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  setor: string;
  origem_codigo: string; // código do plano ou ponto de lubrificação de origem
  origem_descricao: string;
  execucoes: ExecucaoPac[];
}

export interface RelatorioPac {
  codigo_documento: string;
  data_emissao: string;
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  data_inicio: string;
  data_fim: string;
  filtros: FiltrosRelatorioPac;
  secoes: SecaoEquipamentoPac[];
}

async function configuracao<T>(chave: string, padrao: T): Promise<T> {
  const row = (await dbGet("SELECT valor FROM configuracao WHERE chave = ?", [chave])) as { valor: string } | undefined;
  return row ? (JSON.parse(row.valor) as T) : padrao;
}

function respostaConforme(resposta: string | null, concluida: number): "Conforme" | "Não Conforme" | "Pendente" {
  if (!concluida) return "Pendente";
  if (resposta === "ok") return "Conforme";
  if (resposta === "nok") return "Não Conforme";
  return "Pendente";
}

async function montarChecklist(osId: number): Promise<ItemChecklistPac[]> {
  const tarefas = (await dbAll(
    "SELECT descricao, regime, resposta, concluida FROM os_tarefa WHERE os_id = ? ORDER BY ordem",
    [osId]
  )) as { descricao: string; regime: "MP" | "MF" | null; resposta: string | null; concluida: number }[];
  return tarefas.map((t) => ({ descricao: t.descricao, regime: t.regime, resposta: respostaConforme(t.resposta, t.concluida) }));
}

/** Acha a OS ligada a um plano/ponto para a chave_idempotencia da ocorrência — via a tabela de
 * vínculo (os_plano / os_ponto_lubrificacao), não só pela chave, porque a chave é por ativo+data
 * (ocorrências de planos/pontos diferentes do mesmo ativo no mesmo dia viram 1 OS consolidada). */
async function buscarOSDaOcorrencia(
  tabelaVinculo: "os_plano" | "os_ponto_lubrificacao",
  colunaVinculo: "plano_id" | "ponto_lubrificacao_id",
  origemId: number,
  chaveIdempotencia: string
) {
  return (await dbGet(
    `SELECT os.id, os.codigo, os.tipo, os.status, os.data_programada, os.data_conclusao
     FROM ordem_servico os
     JOIN ${tabelaVinculo} v ON v.os_id = os.id
     WHERE v.${colunaVinculo} = ? AND os.chave_idempotencia = ?`,
    [origemId, chaveIdempotencia]
  )) as { id: number; codigo: string; tipo: string; status: string; data_programada: string; data_conclusao: string | null } | undefined;
}

/** Se a OS da ocorrência foi cancelada, procura a OS "substituta": outra OS não cancelada, ligada
 * ao mesmo plano/ponto, com data_programada posterior — é a evidência de que a atividade foi
 * reprogramada em vez de simplesmente não realizada. */
async function buscarSubstituta(
  tabelaVinculo: "os_plano" | "os_ponto_lubrificacao",
  colunaVinculo: "plano_id" | "ponto_lubrificacao_id",
  origemId: number,
  dataOriginal: string
) {
  return (await dbGet(
    `SELECT os.codigo, os.data_programada
     FROM ordem_servico os
     JOIN ${tabelaVinculo} v ON v.os_id = os.id
     WHERE v.${colunaVinculo} = ? AND os.status != 'cancelada' AND os.data_programada > ?
     ORDER BY os.data_programada ASC
     LIMIT 1`,
    [origemId, dataOriginal]
  )) as { codigo: string; data_programada: string } | undefined;
}

const ROTULO_TIPO_OS: Record<string, string> = {
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  inspecao: "Inspeção",
  melhoria: "Melhoria",
  calibracao: "Calibração",
  lubrificacao: "Lubrificação",
};

export async function gerarRelatorioPac(tipo: TipoRelatorioPac, filtros: FiltrosRelatorioPac): Promise<RelatorioPac> {
  const dataInicio = dataInicioDaSemana(filtros.ano, filtros.semanaInicio);
  const dataFim = dataFimDaSemana(filtros.ano, filtros.semanaFim);
  const tratamento = await configuracao<TratamentoDiaNaoUtil>("tratamento_dia_nao_util", "gerar_na_data");
  const feriados = new Set(((await dbAll("SELECT data FROM feriado")) as { data: string }[]).map((f) => f.data));

  const secoes: SecaoEquipamentoPac[] = [];

  if (tipo === "manutencao") {
    const condicoes = ["p.excluido_em IS NULL", "p.ativo = 1", "a.excluido_em IS NULL"];
    const params: unknown[] = [];
    if (filtros.setor) {
      condicoes.push("a.setor = ?");
      params.push(filtros.setor);
    }
    if (filtros.ativoId) {
      condicoes.push("p.ativo_id = ?");
      params.push(filtros.ativoId);
    }
    const planos = (await dbAll(
      `SELECT p.id, p.codigo, p.nome, p.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome, a.setor,
              p.periodicidade, p.intervalo_customizado_dias, p.data_base, p.data_inicio_vigencia, p.data_fim_vigencia, p.ativo
       FROM plano_manutencao p JOIN ativo a ON a.id = p.ativo_id
       WHERE ${condicoes.join(" AND ")}
       ORDER BY a.nome, p.nome`,
      params
    )) as {
      id: number;
      codigo: string;
      nome: string;
      ativo_id: number;
      ativo_codigo: string;
      ativo_nome: string;
      setor: string | null;
      periodicidade: string;
      intervalo_customizado_dias: number | null;
      data_base: string;
      data_inicio_vigencia: string;
      data_fim_vigencia: string | null;
      ativo: number;
    }[];

    for (const plano of planos) {
      const ocorrencias = calcularOcorrencias(
        {
          periodicidade: plano.periodicidade as never,
          intervalo_customizado_dias: plano.intervalo_customizado_dias,
          data_base: plano.data_base,
          data_inicio_vigencia: plano.data_inicio_vigencia,
          data_fim_vigencia: plano.data_fim_vigencia,
          ativo: plano.ativo,
        },
        dataInicio,
        dataFim
      );
      if (ocorrencias.length === 0) continue;

      const execucoes: ExecucaoPac[] = await Promise.all(
        ocorrencias.map(async (dataPrevista) => {
          const dataAjustada = ajustarDiaNaoUtil(dataPrevista, tratamento, feriados);
          const chave = `ativo:${plano.ativo_id}:${dataAjustada}`;
          const os = await buscarOSDaOcorrencia("os_plano", "plano_id", plano.id, chave);

          if (os && os.status !== "cancelada") {
            return {
              situacao: "normal" as const,
              data_prevista: dataAjustada,
              os_codigo: os.codigo,
              tipo: ROTULO_TIPO_OS[os.tipo] ?? os.tipo,
              data_execucao: os.data_conclusao ?? os.data_programada,
              nova_data: null,
              checklist: await montarChecklist(os.id),
            };
          }
          if (os && os.status === "cancelada") {
            const substituta = await buscarSubstituta("os_plano", "plano_id", plano.id, os.data_programada);
            if (substituta) {
              return {
                situacao: "reprogramada" as const,
                data_prevista: dataAjustada,
                os_codigo: substituta.codigo,
                tipo: null,
                data_execucao: null,
                nova_data: substituta.data_programada,
                checklist: [],
              };
            }
          }
          return {
            situacao: "nao_realizada" as const,
            data_prevista: dataAjustada,
            os_codigo: null,
            tipo: null,
            data_execucao: null,
            nova_data: null,
            checklist: [],
          };
        })
      );

      secoes.push({
        ativo_id: plano.ativo_id,
        ativo_codigo: plano.ativo_codigo,
        ativo_nome: plano.ativo_nome,
        ativo_caminho: await caminhoAtivo(plano.ativo_id),
        setor: plano.setor ?? "—",
        origem_codigo: plano.codigo,
        origem_descricao: plano.nome,
        execucoes: execucoes.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista)),
      });
    }
  } else {
    const condicoes = ["p.excluido_em IS NULL", "p.ativo = 1", "a.excluido_em IS NULL"];
    const params: unknown[] = [];
    if (filtros.setor) {
      condicoes.push("a.setor = ?");
      params.push(filtros.setor);
    }
    if (filtros.ativoId) {
      condicoes.push("p.ativo_id = ?");
      params.push(filtros.ativoId);
    }
    const pontos = (await dbAll(
      `SELECT p.id, p.codigo, p.descricao, p.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome, a.setor,
              p.periodicidade, p.semana_base, p.data_inicio_vigencia, p.data_fim_vigencia, p.ativo
       FROM ponto_lubrificacao p JOIN ativo a ON a.id = p.ativo_id
       WHERE ${condicoes.join(" AND ")}
       ORDER BY a.nome, p.descricao`,
      params
    )) as {
      id: number;
      codigo: string;
      descricao: string;
      ativo_id: number;
      ativo_codigo: string;
      ativo_nome: string;
      setor: string | null;
      periodicidade: string;
      semana_base: number;
      data_inicio_vigencia: string;
      data_fim_vigencia: string | null;
      ativo: number;
    }[];

    for (const ponto of pontos) {
      const ocorrencias = calcularOcorrenciasSemanais(
        {
          periodicidade: ponto.periodicidade as never,
          semana_base: ponto.semana_base,
          data_inicio_vigencia: ponto.data_inicio_vigencia,
          data_fim_vigencia: ponto.data_fim_vigencia,
          ativo: ponto.ativo,
        },
        dataInicio,
        dataFim
      );
      if (ocorrencias.length === 0) continue;

      const execucoes: ExecucaoPac[] = await Promise.all(
        ocorrencias.map(async (dataPrevista) => {
          const dataAjustada = ajustarDiaNaoUtil(dataPrevista, tratamento, feriados);
          const chave = `lub:${ponto.ativo_id}:${dataAjustada}`;
          const os = await buscarOSDaOcorrencia("os_ponto_lubrificacao", "ponto_lubrificacao_id", ponto.id, chave);

          if (os && os.status !== "cancelada") {
            return {
              situacao: "normal" as const,
              data_prevista: dataAjustada,
              os_codigo: os.codigo,
              tipo: ROTULO_TIPO_OS[os.tipo] ?? os.tipo,
              data_execucao: os.data_conclusao ?? os.data_programada,
              nova_data: null,
              checklist: await montarChecklist(os.id),
            };
          }
          if (os && os.status === "cancelada") {
            const substituta = await buscarSubstituta("os_ponto_lubrificacao", "ponto_lubrificacao_id", ponto.id, os.data_programada);
            if (substituta) {
              return {
                situacao: "reprogramada" as const,
                data_prevista: dataAjustada,
                os_codigo: substituta.codigo,
                tipo: null,
                data_execucao: null,
                nova_data: substituta.data_programada,
                checklist: [],
              };
            }
          }
          return {
            situacao: "nao_realizada" as const,
            data_prevista: dataAjustada,
            os_codigo: null,
            tipo: null,
            data_execucao: null,
            nova_data: null,
            checklist: [],
          };
        })
      );

      secoes.push({
        ativo_id: ponto.ativo_id,
        ativo_codigo: ponto.ativo_codigo,
        ativo_nome: ponto.ativo_nome,
        ativo_caminho: await caminhoAtivo(ponto.ativo_id),
        setor: ponto.setor ?? "—",
        origem_codigo: ponto.codigo,
        origem_descricao: ponto.descricao,
        execucoes: execucoes.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista)),
      });
    }
  }

  secoes.sort((a, b) => a.ativo_nome.localeCompare(b.ativo_nome) || a.origem_descricao.localeCompare(b.origem_descricao));

  return {
    codigo_documento: CODIGO_DOCUMENTO[tipo],
    data_emissao: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10),
    ano: filtros.ano,
    semana_inicio: filtros.semanaInicio,
    semana_fim: filtros.semanaFim,
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtros,
    secoes,
  };
}

export interface ItemChecklistOSRealizada {
  descricao: string;
  tipo_resposta: string;
  resposta: string | null;
  valor_numerico: number | null;
  unidade: string | null;
  concluida: number;
  obrigatoria: number;
  regime: "MP" | "MF" | null;
}

export interface OSRealizada {
  id: number;
  codigo: string;
  tipo: string;
  origem: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  responsavel_nome: string | null;
  data_programada: string;
  data_conclusao: string | null;
  horas_reais: number | null;
  custo_mao_obra: number | null;
  custo_pecas: number | null;
  observacoes_execucao: string | null;
  resultado_inspecao: string | null;
  causa_falha: string | null;
  checklist: ItemChecklistOSRealizada[];
}

export interface FiltrosOSRealizadas {
  inicio: string;
  fim: string;
  tipo?: string;
  ativoId?: number;
  responsavelId?: number;
}

/**
 * REL-01: relatório direto de OS concluídas com o checklist completo embutido — diferente de
 * gerarRelatorioPac (que reconcilia ocorrências ESPERADAS de um plano contra o que foi executado),
 * este é só "o que foi feito", cobrindo qualquer tipo de OS (manutenção, lubrificação, inspeção).
 * Busca o checklist de todas as OS do período numa única query (WHERE os_id = ANY(...)) em vez de
 * uma consulta por OS — mesma lição de performance de calendarioInspecaoService.ts.
 */
export async function listarOSRealizadas(filtros: FiltrosOSRealizadas): Promise<OSRealizada[]> {
  const condicoes = ["os.status = 'concluida'", "os.excluido_em IS NULL", "os.data_conclusao IS NOT NULL"];
  const params: unknown[] = [];
  condicoes.push("os.data_conclusao::date >= ?::date", "os.data_conclusao::date <= ?::date");
  params.push(filtros.inicio, filtros.fim);
  if (filtros.tipo) {
    condicoes.push("os.tipo = ?");
    params.push(filtros.tipo);
  }
  if (filtros.ativoId) {
    condicoes.push("os.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.responsavelId) {
    condicoes.push("os.responsavel_id = ?");
    params.push(filtros.responsavelId);
  }

  const rows = (await dbAll(
    `SELECT os.id, os.codigo, os.tipo, os.origem, os.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
            u.nome AS responsavel_nome, os.data_programada, os.data_conclusao, os.horas_reais,
            os.custo_mao_obra, os.custo_pecas, os.observacoes_execucao, os.resultado_inspecao, os.causa_falha
     FROM ordem_servico os
     JOIN ativo a ON a.id = os.ativo_id
     LEFT JOIN usuario u ON u.id = os.responsavel_id
     WHERE ${condicoes.join(" AND ")}
     ORDER BY os.data_conclusao DESC`,
    params
  )) as Omit<OSRealizada, "ativo_caminho" | "checklist">[];

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const tarefas = (await dbAll(
    `SELECT os_id, descricao, tipo_resposta, resposta, valor_numerico, unidade, concluida, obrigatoria, regime
     FROM os_tarefa WHERE os_id = ANY(?) ORDER BY os_id, ordem`,
    [ids]
  )) as (ItemChecklistOSRealizada & { os_id: number })[];
  const checklistPorOS = new Map<number, ItemChecklistOSRealizada[]>();
  for (const t of tarefas) {
    const { os_id, ...item } = t;
    if (!checklistPorOS.has(os_id)) checklistPorOS.set(os_id, []);
    checklistPorOS.get(os_id)!.push(item);
  }

  const caminhos = await caminhosAtivos(rows.map((r) => r.ativo_id));

  return rows.map((r) => ({
    ...r,
    ativo_caminho: caminhos.get(r.ativo_id) ?? r.ativo_nome,
    checklist: checklistPorOS.get(r.id) ?? [],
  }));
}

export async function listarSetores(): Promise<string[]> {
  return ((await dbAll("SELECT DISTINCT setor FROM ativo WHERE setor IS NOT NULL AND excluido_em IS NULL ORDER BY setor")) as { setor: string }[]).map(
    (r) => r.setor
  );
}
