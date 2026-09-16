import { describe, expect, it } from "vitest";
import { calcularOcorrenciasSemanais, type ParametrosRecorrenciaSemanal } from "./recorrenciaSemanalService.js";
import { dataFimDaSemana, dataInicioDaSemana, semanasNoAno } from "../lib/semanas.js";

function ponto(overrides: Partial<ParametrosRecorrenciaSemanal> = {}): ParametrosRecorrenciaSemanal {
  return {
    periodicidade: "mensal",
    semana_base: 3,
    data_inicio_vigencia: "2026-01-01",
    data_fim_vigencia: null,
    ativo: true,
    ...overrides,
  };
}

describe("calcularOcorrenciasSemanais", () => {
  it("mensal (intervalo 4 semanas) a partir da semana-base gera 13 ocorrências num ano de 52 semanas", () => {
    const ocorrencias = calcularOcorrenciasSemanais(ponto({ semana_base: 3 }), "2026-01-01", "2026-12-31");
    expect(semanasNoAno(2026)).toBe(52);
    expect(ocorrencias).toHaveLength(13);
    expect(ocorrencias[0]).toBe(dataInicioDaSemana(2026, 3));
    expect(ocorrencias[1]).toBe(dataInicioDaSemana(2026, 7));
    expect(ocorrencias.at(-1)).toBe(dataInicioDaSemana(2026, 51));
  });

  it("trimestral (intervalo 13 semanas) gera 4 ocorrências por ano", () => {
    const ocorrencias = calcularOcorrenciasSemanais(ponto({ periodicidade: "trimestral", semana_base: 9 }), "2026-01-01", "2026-12-31");
    expect(ocorrencias).toEqual([9, 22, 35, 48].map((s) => dataInicioDaSemana(2026, s)));
  });

  it("semanal gera uma ocorrência por semana do ano inteiro", () => {
    const ocorrencias = calcularOcorrenciasSemanais(ponto({ periodicidade: "semanal", semana_base: 1 }), "2026-01-01", "2026-12-31");
    expect(ocorrencias).toHaveLength(52);
  });

  it("o ciclo reinicia a cada ano — não continua a contagem do ano anterior", () => {
    // bimestral (intervalo 8) com base na semana 50: 52/8 não é inteiro, então "continuar" e
    // "reiniciar" dão resultados diferentes — a semana seguinte a 50 dentro do MESMO ano só cabe
    // se 50+8<=52, o que não cabe; o próximo ano deve recomeçar em 50, não em 50+8-52=6.
    const ocorrencias = calcularOcorrenciasSemanais(ponto({ periodicidade: "bimestral", semana_base: 50 }), "2026-01-01", "2027-12-31");
    const de2026 = ocorrencias.filter((d) => d.startsWith("2026"));
    const de2027 = ocorrencias.filter((d) => d.startsWith("2027"));
    expect(de2026).toEqual([dataInicioDaSemana(2026, 50)]);
    expect(de2027[0]).toBe(dataInicioDaSemana(2027, 50));
  });

  it("respeita data_inicio_vigencia e data_fim_vigencia mesmo com janela mais larga", () => {
    const ocorrencias = calcularOcorrenciasSemanais(
      ponto({ periodicidade: "trimestral", semana_base: 3, data_inicio_vigencia: "2026-03-01", data_fim_vigencia: "2026-09-01" }),
      "2026-01-01",
      "2026-12-31"
    );
    expect(ocorrencias).toEqual([dataInicioDaSemana(2026, 16), dataInicioDaSemana(2026, 29)]);
  });

  it("ponto inativo não gera nenhuma ocorrência", () => {
    expect(calcularOcorrenciasSemanais(ponto({ ativo: false }), "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("janela totalmente fora da vigência não gera ocorrência", () => {
    expect(calcularOcorrenciasSemanais(ponto({ data_fim_vigencia: "2026-01-10" }), "2026-06-01", "2026-06-30")).toEqual([]);
  });

  it("vigência começando no meio da semana não descarta a semana corrente (regressão)", () => {
    // 2026-09-08 é uma terça-feira dentro da semana 36 (que começa no domingo 2026-09-06) — um
    // ponto com semana_base=36 tem que aparecer na simulação da própria semana 36, mesmo com
    // data_inicio_vigencia caindo no meio dela. Bug real: comparar a data literal do domingo
    // contra data_inicio_vigencia descartava a semana inteira porque 06/09 < 08/09.
    const ocorrencias = calcularOcorrenciasSemanais(
      ponto({ periodicidade: "mensal", semana_base: 36, data_inicio_vigencia: "2026-09-08" }),
      dataInicioDaSemana(2026, 36),
      dataFimDaSemana(2026, 36)
    );
    expect(ocorrencias).toEqual([dataInicioDaSemana(2026, 36)]);
  });
});
