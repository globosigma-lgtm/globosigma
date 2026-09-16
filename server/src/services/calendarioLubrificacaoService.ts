import { dbGet, dbAll } from "../db/pg.js";
import { caminhoAtivo } from "./ativoService.js";
import { listarPontosLubrificacao } from "./pontoLubrificacaoService.js";
import { ajustarDiaNaoUtil, type TratamentoDiaNaoUtil } from "./recorrenciaService.js";
import { calcularOcorrenciasSemanais } from "./recorrenciaSemanalService.js";
import { semanaDoAno } from "../lib/semanas.js";

export interface SemanaCalendarioLubrificacao {
  semana: number;
  data: string;
  gerada: boolean;
}

export interface LinhaCalendarioLubrificacao {
  ponto_id: number;
  ponto_codigo: string;
  ponto_descricao: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  periodicidade: string;
  prioridade_padrao: string;
  semanas: SemanaCalendarioLubrificacao[];
  total_ano: number;
}

async function configuracao<T>(chave: string, padrao: T): Promise<T> {
  const row = (await dbGet("SELECT valor FROM configuracao WHERE chave = ?", [chave])) as { valor: string } | undefined;
  return row ? (JSON.parse(row.valor) as T) : padrao;
}

export interface FiltrosCalendarioLubrificacao {
  ativoId?: number;
  periodicidade?: string;
}

/**
 * Visão anual do módulo de lubrificação: uma linha por ponto ativo, uma coluna por semana do ano
 * (1 a 52/53, mesma convenção de web/src/lib/semanas.ts) — deliberadamente separada do Calendário
 * Anual de planos (que é por mês). Reaproveita calcularOcorrenciasSemanais; a tela é só leitura.
 */
export async function obterCalendarioLubrificacao(ano: number, filtros: FiltrosCalendarioLubrificacao = {}): Promise<LinhaCalendarioLubrificacao[]> {
  const dataInicio = `${ano}-01-01`;
  const dataFim = `${ano}-12-31`;
  const tratamento = await configuracao<TratamentoDiaNaoUtil>("tratamento_dia_nao_util", "gerar_na_data");
  const feriados = new Set(((await dbAll("SELECT data FROM feriado")) as { data: string }[]).map((f) => f.data));

  const linhas: LinhaCalendarioLubrificacao[] = [];
  for (const ponto of await listarPontosLubrificacao({ apenasAtivos: true, ativoId: filtros.ativoId, periodicidade: filtros.periodicidade })) {
    const brutas = calcularOcorrenciasSemanais(
      {
        periodicidade: ponto.periodicidade,
        semana_base: ponto.semana_base,
        data_inicio_vigencia: ponto.data_inicio_vigencia,
        data_fim_vigencia: ponto.data_fim_vigencia,
        ativo: ponto.ativo,
      },
      dataInicio,
      dataFim
    );
    if (brutas.length === 0) continue;

    const semanas: SemanaCalendarioLubrificacao[] = [];
    for (const dataPrevista of brutas) {
      const dataAjustada = ajustarDiaNaoUtil(dataPrevista, tratamento, feriados);
      const chave = `lub:${ponto.ativo_id}:${dataAjustada}`;
      const existente = await dbGet("SELECT id FROM ordem_servico WHERE chave_idempotencia = ?", [chave]);
      semanas.push({ semana: semanaDoAno(dataAjustada), data: dataAjustada, gerada: !!existente });
    }

    linhas.push({
      ponto_id: ponto.id,
      ponto_codigo: ponto.codigo,
      ponto_descricao: ponto.descricao,
      ativo_id: ponto.ativo_id,
      ativo_codigo: ponto.ativo_codigo,
      ativo_nome: ponto.ativo_nome,
      ativo_caminho: await caminhoAtivo(ponto.ativo_id),
      periodicidade: ponto.periodicidade,
      prioridade_padrao: ponto.prioridade_padrao,
      semanas,
      total_ano: brutas.length,
    });
  }

  linhas.sort((a, b) => a.ativo_nome.localeCompare(b.ativo_nome) || a.ponto_descricao.localeCompare(b.ponto_descricao));
  return linhas;
}
