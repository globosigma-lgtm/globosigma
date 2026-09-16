import { dbGet, dbAll } from "../db/pg.js";
import { caminhoAtivo } from "./ativoService.js";
import { listarPlanos } from "./planoService.js";
import { ajustarDiaNaoUtil, calcularOcorrencias, type TratamentoDiaNaoUtil } from "./recorrenciaService.js";

export interface DiaCalendario {
  data: string;
  gerada: boolean;
}

export interface MesCalendario {
  mes: number;
  dias: DiaCalendario[];
}

export interface LinhaCalendarioAnual {
  plano_id: number;
  plano_codigo: string;
  plano_nome: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  tipo_manutencao: string;
  periodicidade: string;
  prioridade_padrao: string;
  meses: MesCalendario[];
  total_ano: number;
}

async function configuracao<T>(chave: string, padrao: T): Promise<T> {
  const row = (await dbGet("SELECT valor FROM configuracao WHERE chave = ?", [chave])) as { valor: string } | undefined;
  return row ? (JSON.parse(row.valor) as T) : padrao;
}

export interface FiltrosCalendario {
  ativoId?: number;
  tipoManutencao?: string;
}

/**
 * Visão anual clássica de PCM: uma linha por plano preventivo ativo, uma coluna por mês, célula
 * com os dias do mês em que o plano tem ocorrência. Reaproveita o mesmo motor de recorrência da
 * Fase 5 (calcularOcorrencias + ajustarDiaNaoUtil) — a diferença é que aqui a janela é sempre o
 * ano inteiro e o resultado é agrupado por mês em vez de uma lista plana. Cada dia marca se já
 * existe uma OS gerada para aquela ocorrência (mesma chave_idempotencia da geração em lote), só
 * para dar uma pista visual do que já está confirmado — a tela não cria nem altera nada.
 */
export async function obterCalendarioAnual(ano: number, filtros: FiltrosCalendario = {}): Promise<LinhaCalendarioAnual[]> {
  const dataInicio = `${ano}-01-01`;
  const dataFim = `${ano}-12-31`;
  const tratamento = await configuracao<TratamentoDiaNaoUtil>("tratamento_dia_nao_util", "gerar_na_data");
  const feriados = new Set(((await dbAll("SELECT data FROM feriado")) as { data: string }[]).map((f) => f.data));

  const linhas: LinhaCalendarioAnual[] = [];
  for (const plano of await listarPlanos({ apenasAtivos: true, ativoId: filtros.ativoId, tipoManutencao: filtros.tipoManutencao })) {
    const brutas = calcularOcorrencias(
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
    if (brutas.length === 0) continue;

    const meses: MesCalendario[] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, dias: [] }));
    for (const dataPrevista of brutas) {
      const dataAjustada = ajustarDiaNaoUtil(dataPrevista, tratamento, feriados);
      const mesIndex = Number(dataAjustada.slice(5, 7)) - 1;
      const chave = `plano:${plano.id}:${dataAjustada}`;
      const existente = await dbGet("SELECT id FROM ordem_servico WHERE chave_idempotencia = ?", [chave]);
      meses[mesIndex].dias.push({ data: dataAjustada, gerada: !!existente });
    }

    linhas.push({
      plano_id: plano.id,
      plano_codigo: plano.codigo,
      plano_nome: plano.nome,
      ativo_id: plano.ativo_id,
      ativo_codigo: plano.ativo_codigo,
      ativo_nome: plano.ativo_nome,
      ativo_caminho: await caminhoAtivo(plano.ativo_id),
      tipo_manutencao: plano.tipo_manutencao,
      periodicidade: plano.periodicidade,
      prioridade_padrao: plano.prioridade_padrao,
      meses,
      total_ano: brutas.length,
    });
  }

  linhas.sort((a, b) => a.ativo_nome.localeCompare(b.ativo_nome) || a.plano_nome.localeCompare(b.plano_nome));
  return linhas;
}
