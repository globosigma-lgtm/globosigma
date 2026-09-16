import { describe, expect, it } from "vitest";
import { dataFimDaSemana, dataInicioDaSemana, semanaDoAno } from "./semanas.js";

// TESTE-01: essas funções decidem em que semana uma manutenção cai em 3 telas desta sessão
// (Gerar OS em lote, Calendário Anual, ajuste de semana do plano) — sem teste até agora.
describe("dataInicioDaSemana / semanaDoAno", () => {
  it("semana 1 começa no primeiro domingo a partir de 1º de janeiro", () => {
    // 2026-01-01 é uma quinta-feira — semana 1 começa no domingo seguinte, 04/01.
    expect(dataInicioDaSemana(2026, 1)).toBe("2026-01-04");
  });

  it("dias antes do primeiro domingo contam como semana 1", () => {
    expect(semanaDoAno("2026-01-01")).toBe(1);
    expect(semanaDoAno("2026-01-03")).toBe(1);
  });

  it("semanaDoAno e dataInicioDaSemana são inversas dentro de uma semana", () => {
    const inicio = dataInicioDaSemana(2026, 36);
    expect(semanaDoAno(inicio)).toBe(36);
    expect(semanaDoAno(dataFimDaSemana(2026, 36))).toBe(36);
  });

  it("o fim de uma semana é a véspera do início da seguinte", () => {
    expect(dataFimDaSemana(2026, 35)).toBe("2026-09-05");
    expect(dataInicioDaSemana(2026, 36)).toBe("2026-09-06");
  });
});
