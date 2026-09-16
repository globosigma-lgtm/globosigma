export type Periodicidade =
  | "diaria"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "bimestral"
  | "trimestral"
  | "quadrimestral"
  | "semestral"
  | "anual"
  | "bienal"
  | "trienal"
  | "personalizada";

export type TratamentoDiaNaoUtil = "gerar_na_data" | "antecipar" | "postergar";

const INTERVALO_DIAS: Partial<Record<Periodicidade, number>> = {
  diaria: 1,
  semanal: 7,
  quinzenal: 15,
};

const INTERVALO_MESES: Partial<Record<Periodicidade, number>> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  quadrimestral: 4,
  semestral: 6,
  anual: 12,
  bienal: 24,
  trienal: 36,
};

export interface ParametrosRecorrencia {
  periodicidade: Periodicidade;
  intervalo_customizado_dias: number | null;
  data_base: string;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
  ativo: boolean | number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function partesIso(iso: string): [number, number, number] {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return [ano, mes, dia];
}

function diasDesdeEpoch(iso: string): number {
  const [ano, mes, dia] = partesIso(iso);
  return Date.UTC(ano, mes - 1, dia) / 86400000;
}

function isoDeDiasDesdeEpoch(dias: number): string {
  const data = new Date(dias * 86400000);
  return `${data.getUTCFullYear()}-${pad(data.getUTCMonth() + 1)}-${pad(data.getUTCDate())}`;
}

function somarDias(iso: string, n: number): string {
  return isoDeDiasDesdeEpoch(diasDesdeEpoch(iso) + n);
}

/**
 * Soma meses a uma data usando aritmética de calendário. Se o dia não existir no mês de
 * destino (ex.: 31 em fevereiro), cai no último dia do mês — regra da Seção 7.1 da spec.
 * Implementado sem depender de bibliotecas de data, cujo comportamento de overflow de mês
 * (ex.: `.add(1,'month')` em 31/jan) não é confiável entre implementações.
 */
function somarMesesComClamp(iso: string, totalMeses: number): string {
  const [anoBase, mesBase, diaBase] = partesIso(iso);
  const totalMesesAbsoluto = mesBase - 1 + totalMeses;
  const anoAlvo = anoBase + Math.floor(totalMesesAbsoluto / 12);
  const mesAlvo = ((totalMesesAbsoluto % 12) + 12) % 12; // 0-11
  const diasNoMesAlvo = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();
  const diaAlvo = Math.min(diaBase, diasNoMesAlvo);
  return `${anoAlvo}-${pad(mesAlvo + 1)}-${pad(diaAlvo)}`;
}

function mesesEntre(de: string, ate: string): number {
  const [anoDe, mesDe] = partesIso(de);
  const [anoAte, mesAte] = partesIso(ate);
  return (anoAte - anoDe) * 12 + (mesAte - mesDe);
}

/**
 * Calcula as ocorrências de um plano dentro de uma janela [janelaInicio, janelaFim] (ISO,
 * inclusive nas duas pontas). Toda ocorrência é derivada de `data_base` + n×intervalo — nunca
 * da última OS gerada — para que atrasos de execução não desloquem o calendário (regra crítica
 * #2). Função pura, sem acesso a banco: é reaproveitada, sem alteração, pela geração em lote
 * (Fase 5) e pela projeção de compras (Fase 9).
 */
export function calcularOcorrencias(
  plano: ParametrosRecorrencia,
  janelaInicio: string,
  janelaFim: string
): string[] {
  if (!plano.ativo) return [];

  const limiteInferior = plano.data_inicio_vigencia > janelaInicio ? plano.data_inicio_vigencia : janelaInicio;
  const limiteSuperiorVigencia =
    plano.data_fim_vigencia && plano.data_fim_vigencia < janelaFim ? plano.data_fim_vigencia : janelaFim;
  if (limiteInferior > limiteSuperiorVigencia) return [];

  const resultado: string[] = [];

  if (plano.periodicidade === "personalizada" || plano.periodicidade in INTERVALO_DIAS) {
    const intervalo =
      plano.periodicidade === "personalizada" ? plano.intervalo_customizado_dias ?? 0 : INTERVALO_DIAS[plano.periodicidade]!;
    if (intervalo <= 0) return [];

    const diasDesdeBase = diasDesdeEpoch(limiteInferior) - diasDesdeEpoch(plano.data_base);
    let n = diasDesdeBase > 0 ? Math.floor(diasDesdeBase / intervalo) : 0;

    while (true) {
      const data = somarDias(plano.data_base, n * intervalo);
      if (data > limiteSuperiorVigencia) break;
      if (data >= limiteInferior) resultado.push(data);
      n++;
    }
  } else {
    const meses = INTERVALO_MESES[plano.periodicidade]!;
    const mesesDesdeBase = mesesEntre(plano.data_base, limiteInferior);
    let n = mesesDesdeBase > 0 ? Math.floor(mesesDesdeBase / meses) : 0;

    while (true) {
      const data = somarMesesComClamp(plano.data_base, n * meses);
      if (data > limiteSuperiorVigencia) break;
      if (data >= limiteInferior) resultado.push(data);
      n++;
    }
  }

  return resultado;
}

/**
 * Aplica o tratamento de dia não útil (Seção 7.1): a planta opera continuamente, então "dia não
 * útil" aqui é um feriado cadastrado — não fim de semana.
 */
export function ajustarDiaNaoUtil(
  dataIso: string,
  tratamento: TratamentoDiaNaoUtil,
  feriados: Set<string>
): string {
  if (tratamento === "gerar_na_data" || !feriados.has(dataIso)) return dataIso;
  const passo = tratamento === "antecipar" ? -1 : 1;
  let atual = dataIso;
  while (feriados.has(atual)) {
    atual = somarDias(atual, passo);
  }
  return atual;
}
