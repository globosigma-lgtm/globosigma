import { describe, expect, it } from "vitest";
import { codificarAtribuicao, decodificarAtribuicao } from "./atribuicaoOS.js";

// TESTE-01: garante a exclusividade mútua pessoa/equipe (EQUIPE-01) no ponto único de
// codificação/decodificação usado por OSFormModal, OrdemServicoDetalhe e o atribuir-em-lote de
// OrdensServico.
describe("codificarAtribuicao", () => {
  it("codifica responsável individual", () => {
    expect(codificarAtribuicao(5, null)).toBe("pessoa:5");
  });

  it("codifica equipe", () => {
    expect(codificarAtribuicao(null, 2)).toBe("equipe:2");
  });

  it("responsável tem prioridade se os dois vierem preenchidos (não deveria acontecer, mas não quebra)", () => {
    expect(codificarAtribuicao(5, 2)).toBe("pessoa:5");
  });

  it("nenhum dos dois vira string vazia", () => {
    expect(codificarAtribuicao(null, null)).toBe("");
    expect(codificarAtribuicao(undefined, undefined)).toBe("");
  });
});

describe("decodificarAtribuicao", () => {
  it("decodifica pessoa", () => {
    expect(decodificarAtribuicao("pessoa:5")).toEqual({ responsavel_id: 5, equipe_id: null });
  });

  it("decodifica equipe", () => {
    expect(decodificarAtribuicao("equipe:2")).toEqual({ responsavel_id: null, equipe_id: 2 });
  });

  it("string vazia decodifica pra nenhum dos dois", () => {
    expect(decodificarAtribuicao("")).toEqual({ responsavel_id: null, equipe_id: null });
  });

  it("é o inverso exato de codificarAtribuicao pros dois casos válidos", () => {
    expect(decodificarAtribuicao(codificarAtribuicao(7, null))).toEqual({ responsavel_id: 7, equipe_id: null });
    expect(decodificarAtribuicao(codificarAtribuicao(null, 3))).toEqual({ responsavel_id: null, equipe_id: 3 });
  });
});
