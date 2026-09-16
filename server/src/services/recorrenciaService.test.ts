import { describe, expect, it } from "vitest";
import { ajustarDiaNaoUtil, calcularOcorrencias, type ParametrosRecorrencia } from "./recorrenciaService.js";

// TEC-02: recorrenciaService é a lógica de maior risco no sistema — se ela quebrar numa
// refatoração, o efeito é silencioso (OS deixam de ser geradas na data certa) e só aparece dias
// depois, quando um plano preventivo perde a janela. Os casos abaixo fixam o comportamento que os
// próprios comentários do serviço documentam como regra crítica.

function plano(overrides: Partial<ParametrosRecorrencia> = {}): ParametrosRecorrencia {
  return {
    periodicidade: "mensal",
    intervalo_customizado_dias: null,
    data_base: "2026-01-15",
    data_inicio_vigencia: "2026-01-01",
    data_fim_vigencia: null,
    ativo: true,
    ...overrides,
  };
}

describe("calcularOcorrencias", () => {
  it("gera ocorrências mensais na mesma data-base todo mês, dentro da janela", () => {
    const ocorrencias = calcularOcorrencias(plano({ periodicidade: "mensal" }), "2026-01-01", "2026-04-30");
    expect(ocorrencias).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("periodicidade diária soma dias corridos a partir da data-base", () => {
    const ocorrencias = calcularOcorrencias(
      plano({ periodicidade: "diaria", data_base: "2026-03-01" }),
      "2026-03-01",
      "2026-03-05"
    );
    expect(ocorrencias).toEqual(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]);
  });

  it("periodicidade personalizada usa intervalo_customizado_dias", () => {
    const ocorrencias = calcularOcorrencias(
      plano({ periodicidade: "personalizada", intervalo_customizado_dias: 10, data_base: "2026-01-01" }),
      "2026-01-01",
      "2026-01-31"
    );
    expect(ocorrencias).toEqual(["2026-01-01", "2026-01-11", "2026-01-21", "2026-01-31"]);
  });

  it("intervalo personalizado zero ou ausente não gera nenhuma ocorrência (não trava em loop)", () => {
    expect(calcularOcorrencias(plano({ periodicidade: "personalizada", intervalo_customizado_dias: 0 }), "2026-01-01", "2026-12-31")).toEqual([]);
    expect(calcularOcorrencias(plano({ periodicidade: "personalizada", intervalo_customizado_dias: null }), "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("data-base 31 cai no último dia do mês quando o mês de destino é mais curto (clamp)", () => {
    // base em 31/jan, mensal: fev/2026 só tem 28 dias, abril só tem 30.
    const ocorrencias = calcularOcorrencias(plano({ periodicidade: "mensal", data_base: "2026-01-31" }), "2026-01-01", "2026-04-30");
    expect(ocorrencias).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("atraso na execução não desloca o calendário — ocorrências continuam ancoradas na data-base", () => {
    // Mesma data-base, duas janelas diferentes: a ocorrência de fevereiro é sempre dia 15,
    // nunca "15 dias depois de quando a de janeiro foi concluída".
    const jan = calcularOcorrencias(plano(), "2026-01-01", "2026-01-31");
    const fev = calcularOcorrencias(plano(), "2026-02-01", "2026-02-28");
    expect(jan).toEqual(["2026-01-15"]);
    expect(fev).toEqual(["2026-02-15"]);
  });

  it("respeita data_inicio_vigencia e data_fim_vigencia mesmo quando a janela pedida é mais larga", () => {
    const ocorrencias = calcularOcorrencias(
      plano({ data_inicio_vigencia: "2026-02-01", data_fim_vigencia: "2026-03-01" }),
      "2026-01-01",
      "2026-12-31"
    );
    expect(ocorrencias).toEqual(["2026-02-15"]);
  });

  it("plano inativo não gera nenhuma ocorrência", () => {
    expect(calcularOcorrencias(plano({ ativo: false }), "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("janela totalmente fora da vigência não gera ocorrência", () => {
    const ocorrencias = calcularOcorrencias(plano({ data_fim_vigencia: "2026-01-20" }), "2026-06-01", "2026-06-30");
    expect(ocorrencias).toEqual([]);
  });
});

describe("ajustarDiaNaoUtil", () => {
  const feriados = new Set(["2026-01-01", "2026-01-02"]);

  it("gerar_na_data ignora feriados e devolve a data original", () => {
    expect(ajustarDiaNaoUtil("2026-01-01", "gerar_na_data", feriados)).toBe("2026-01-01");
  });

  it("data que não é feriado não muda, em qualquer tratamento", () => {
    expect(ajustarDiaNaoUtil("2026-01-05", "antecipar", feriados)).toBe("2026-01-05");
    expect(ajustarDiaNaoUtil("2026-01-05", "postergar", feriados)).toBe("2026-01-05");
  });

  it("antecipar volta dia a dia até sair de uma sequência de feriados", () => {
    expect(ajustarDiaNaoUtil("2026-01-02", "antecipar", feriados)).toBe("2025-12-31");
  });

  it("postergar avança dia a dia até sair de uma sequência de feriados", () => {
    expect(ajustarDiaNaoUtil("2026-01-01", "postergar", feriados)).toBe("2026-01-03");
  });
});
