import { dataInicioDaSemana, semanaDoAno, semanasNoAno } from "../lib/semanas.js";

export type PeriodicidadeSemanal = "semanal" | "quinzenal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

/**
 * Intervalo dominante observado na planilha de lubrificação para cada periodicidade nominal —
 * a planilha original tem espaçamento levemente irregular em algumas linhas (ex.: bimestral com
 * 8 ou 9 semanas), mas um motor de recorrência precisa de uma regra única e previsível daqui pra
 * frente. mensal=4 e trimestral=13 batem exatamente com 52/13 e 52/4 — não é "uma vez por mês
 * civil" (isso é o que recorrenciaService.ts já faz para os planos por data), é "a cada N semanas".
 */
const INTERVALO_SEMANAS: Record<PeriodicidadeSemanal, number> = {
  semanal: 1,
  quinzenal: 2,
  mensal: 4,
  bimestral: 8,
  trimestral: 13,
  semestral: 26,
  anual: 52,
};

export interface ParametrosRecorrenciaSemanal {
  periodicidade: PeriodicidadeSemanal;
  semana_base: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
  ativo: boolean | number;
}

/**
 * Versão genérica de ParametrosRecorrenciaSemanal que recebe o intervalo em semanas diretamente,
 * em vez de uma periodicidade nominal fixa — usada pelos planos de inspeção, cuja periodicidade
 * (classes A/B/C da planilha = 2/4/6 semanas) não cabe na enum fechada de PeriodicidadeSemanal
 * (não existe "a cada 6 semanas" nominal para lubrificação).
 */
export interface ParametrosRecorrenciaIntervaloSemanal {
  intervalo_semanas: number;
  semana_base: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
  ativo: boolean | number;
}

function anoDeIso(iso: string): number {
  return Number(iso.slice(0, 4));
}

/**
 * Núcleo genérico de calcularOcorrenciasSemanais: calcula as ocorrências de um item com
 * recorrência "a cada N semanas, reiniciando todo ano-calendário" dentro de
 * [janelaInicio, janelaFim] (ISO, inclusive nas duas pontas). Diferente de calcularOcorrencias
 * (recorrenciaService.ts, que soma dias/meses indefinidamente a partir de data_base), aqui o ciclo
 * REINICIA a cada ano-calendário: as semanas-alvo de cada ano são semana_base,
 * semana_base+intervalo, ... enquanto ≤ o número de semanas daquele ano (semanasNoAno, 52 ou 53) —
 * é assim que a planilha original é organizada (uma grade fixa de 1 a 52/53 repetida ano a ano).
 *
 * O corte pelas janelas (vigência do item + período pedido) é feito em NÚMERO DE SEMANA, não
 * comparando a data literal do início da semana (domingo) — se comparasse por data, uma vigência
 * que começa no meio de uma semana (ex.: terça) descartaria a semana inteira mesmo contendo a
 * própria data de vigência, porque o domingo daquela semana é anterior a ela. Isso é exatamente o
 * que acontecia com pontos importados com data_inicio_vigencia = data do import (raramente um
 * domingo): a semana corrente ficava sempre vazia na simulação.
 */
export function calcularOcorrenciasIntervaloSemanal(
  item: ParametrosRecorrenciaIntervaloSemanal,
  janelaInicio: string,
  janelaFim: string
): string[] {
  if (!item.ativo) return [];

  const limiteInferior = item.data_inicio_vigencia > janelaInicio ? item.data_inicio_vigencia : janelaInicio;
  const limiteSuperiorVigencia = item.data_fim_vigencia && item.data_fim_vigencia < janelaFim ? item.data_fim_vigencia : janelaFim;
  if (limiteInferior > limiteSuperiorVigencia) return [];

  const intervalo = item.intervalo_semanas;
  const resultado: string[] = [];

  const anoInicio = anoDeIso(limiteInferior);
  const anoFim = anoDeIso(limiteSuperiorVigencia);

  for (let ano = anoInicio; ano <= anoFim; ano++) {
    const totalSemanas = semanasNoAno(ano);
    const semanaMin = ano === anoInicio ? semanaDoAno(limiteInferior) : 1;
    const semanaMax = ano === anoFim ? Math.min(semanaDoAno(limiteSuperiorVigencia), totalSemanas) : totalSemanas;
    for (let semana = item.semana_base; semana <= totalSemanas; semana += intervalo) {
      if (semana >= semanaMin && semana <= semanaMax) {
        resultado.push(dataInicioDaSemana(ano, semana));
      }
    }
  }

  return resultado;
}

export function calcularOcorrenciasSemanais(ponto: ParametrosRecorrenciaSemanal, janelaInicio: string, janelaFim: string): string[] {
  return calcularOcorrenciasIntervaloSemanal(
    {
      intervalo_semanas: INTERVALO_SEMANAS[ponto.periodicidade],
      semana_base: ponto.semana_base,
      data_inicio_vigencia: ponto.data_inicio_vigencia,
      data_fim_vigencia: ponto.data_fim_vigencia,
      ativo: ponto.ativo,
    },
    janelaInicio,
    janelaFim
  );
}
