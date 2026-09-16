import { describe, expect, it } from "vitest";
import { calcularHashSha256, montarTSQ } from "./assinaturaService.js";

// ASSIN-01: o hash precisa ser reproduzível a qualquer momento a partir do mesmo conteúdo,
// independente da ordem em que os campos foram montados no objeto — é o que permite recalcular e
// comparar (verificarAssinaturaDaOS) sem depender de como o objeto foi originalmente serializado.
describe("calcularHashSha256", () => {
  it("produz o mesmo hash para o mesmo conteúdo, mesmo com chaves em ordem diferente", () => {
    const a = calcularHashSha256({ codigo: "OS-000001", tipo: "corretiva", checklist: [{ descricao: "x", ok: true }] });
    const b = calcularHashSha256({ checklist: [{ ok: true, descricao: "x" }], tipo: "corretiva", codigo: "OS-000001" });
    expect(a.hash).toBe(b.hash);
  });

  it("produz hashes diferentes para conteúdos diferentes", () => {
    const a = calcularHashSha256({ codigo: "OS-000001" });
    const b = calcularHashSha256({ codigo: "OS-000002" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("gera um digest SHA-256 hexadecimal de 64 caracteres", () => {
    const { hash } = calcularHashSha256({ codigo: "OS-000001" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// Estrutura DER/ASN.1 do TimeStampReq (RFC 3161 §2.4.1) montada na mão — mesmo byte a byte usado
// em produção na Edge Function do GloboPac. Fixa o formato aqui pra qualquer alteração acidental
// (ex.: trocar o OID do SHA-256, mudar o tamanho do campo) quebrar o teste antes de quebrar a
// Free TSA em produção.
describe("montarTSQ", () => {
  it("monta uma TimeStampReq de 59 bytes contendo o hash informado", () => {
    const hash = "aa".repeat(32);
    const tsq = montarTSQ(hash);
    expect(tsq.length).toBe(59);
    expect(tsq.subarray(24, 56).toString("hex")).toBe(hash);
  });

  it("rejeita um hash que não seja SHA-256 (32 bytes)", () => {
    expect(() => montarTSQ("aa".repeat(20))).toThrow();
  });
});
