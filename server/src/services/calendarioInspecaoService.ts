import { dbGet, dbAll } from "../db/pg.js";
import { listarPlanosInspecao } from "./planoInspecaoService.js";
import { ajustarDiaNaoUtil, type TratamentoDiaNaoUtil } from "./recorrenciaService.js";
import { calcularOcorrenciasIntervaloSemanal } from "./recorrenciaSemanalService.js";
import { semanaDoAno } from "../lib/semanas.js";
import type { ClassePeriodicidadeInspecao } from "./planoInspecaoService.js";

export interface SemanaCalendarioInspecao {
  semana: number;
  data: string;
  gerada: boolean;
}

export interface LinhaCalendarioInspecao {
  plano_id: number;
  plano_codigo: string;
  tag: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  classe_periodicidade: ClassePeriodicidadeInspecao | null;
  prioridade_padrao: string;
  semanas: SemanaCalendarioInspecao[];
  total_ano: number;
}

async function configuracao<T>(chave: string, padrao: T): Promise<T> {
  const row = (await dbGet("SELECT valor FROM configuracao WHERE chave = ?", [chave])) as { valor: string } | undefined;
  return row ? (JSON.parse(row.valor) as T) : padrao;
}

export interface FiltrosCalendarioInspecao {
  ativoId?: number;
  classePeriodicidade?: string;
}

/**
 * Visão anual do módulo de inspeções: uma linha por plano ativo (com classe definida), uma coluna
 * por semana do ano (1 a 52/53) — mesmo padrão de calendarioLubrificacaoService.ts. Planos com
 * classe_periodicidade nula ("sem classe" na planilha de origem) não têm intervalo_semanas e não
 * aparecem aqui até serem classificados.
 *
 * PERF-01: com ~780 planos (bem mais que os pontos de lubrificação, cenário original deste
 * padrão), um dbGet de "já gerada" por OCORRÊNCIA dentro do loop vira milhares de round-trips
 * seriais para o Postgres remoto — chegava a travar a tela por completo. Busca-se todas as chaves
 * de idempotência "insp:%" já usadas de uma vez só, e o resto é lookup em memória.
 */
export async function obterCalendarioInspecao(ano: number, filtros: FiltrosCalendarioInspecao = {}): Promise<LinhaCalendarioInspecao[]> {
  const dataInicio = `${ano}-01-01`;
  const dataFim = `${ano}-12-31`;
  const tratamento = await configuracao<TratamentoDiaNaoUtil>("tratamento_dia_nao_util", "gerar_na_data");
  const feriados = new Set(((await dbAll("SELECT data FROM feriado")) as { data: string }[]).map((f) => f.data));
  const chavesGeradas = new Set(
    ((await dbAll("SELECT chave_idempotencia FROM ordem_servico WHERE chave_idempotencia LIKE 'insp:%'")) as { chave_idempotencia: string }[]).map(
      (r) => r.chave_idempotencia
    )
  );

  const linhas: LinhaCalendarioInspecao[] = [];
  for (const plano of await listarPlanosInspecao({ apenasAtivos: true, ativoId: filtros.ativoId, classePeriodicidade: filtros.classePeriodicidade })) {
    if (!plano.intervalo_semanas || !plano.semana_base) continue;

    const brutas = calcularOcorrenciasIntervaloSemanal(
      {
        intervalo_semanas: plano.intervalo_semanas,
        semana_base: plano.semana_base,
        data_inicio_vigencia: plano.data_inicio_vigencia,
        data_fim_vigencia: plano.data_fim_vigencia,
        ativo: plano.ativo,
      },
      dataInicio,
      dataFim
    );
    if (brutas.length === 0) continue;

    const semanas: SemanaCalendarioInspecao[] = brutas.map((dataPrevista) => {
      const dataAjustada = ajustarDiaNaoUtil(dataPrevista, tratamento, feriados);
      const chave = `insp:${plano.ativo_id}:${dataAjustada}`;
      return { semana: semanaDoAno(dataAjustada), data: dataAjustada, gerada: chavesGeradas.has(chave) };
    });

    linhas.push({
      plano_id: plano.id,
      plano_codigo: plano.codigo,
      tag: plano.tag,
      ativo_id: plano.ativo_id,
      ativo_codigo: plano.ativo_codigo,
      ativo_nome: plano.ativo_nome,
      ativo_caminho: plano.ativo_caminho,
      classe_periodicidade: plano.classe_periodicidade,
      prioridade_padrao: plano.prioridade_padrao,
      semanas,
      total_ano: brutas.length,
    });
  }

  linhas.sort((a, b) => a.ativo_nome.localeCompare(b.ativo_nome));
  return linhas;
}
