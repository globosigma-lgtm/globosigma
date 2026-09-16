import { describe, expect, it } from "vitest";
import { ehOSVencida, podeExcluirOS } from "./osService.js";

// REPROG-01: mesma regra usada por sincronizarAtrasos (SQL) pra promover uma OS pro status
// "atrasada" — os casos abaixo fixam essa regra fora do banco, já que reprogramarOS depende dela
// pra decidir se uma OS pode ser reprogramada.
describe("ehOSVencida", () => {
  it("está vencida quando a data limite já passou e o status não é terminal", () => {
    expect(ehOSVencida("2026-01-10", "aberta", "2026-01-11")).toBe(true);
    expect(ehOSVencida("2026-01-10", "em_execucao", "2026-01-11")).toBe(true);
    expect(ehOSVencida("2026-01-10", "atrasada", "2026-01-11")).toBe(true);
  });

  it("não está vencida quando a data limite ainda não chegou ou é hoje", () => {
    expect(ehOSVencida("2026-01-11", "aberta", "2026-01-11")).toBe(false);
    expect(ehOSVencida("2026-01-12", "aberta", "2026-01-11")).toBe(false);
  });

  it("nunca considera vencida uma OS concluída ou cancelada, mesmo com data limite no passado", () => {
    expect(ehOSVencida("2026-01-01", "concluida", "2026-02-01")).toBe(false);
    expect(ehOSVencida("2026-01-01", "cancelada", "2026-02-01")).toBe(false);
  });

  it("ignora a parte de horário, comparando só a data (YYYY-MM-DD)", () => {
    expect(ehOSVencida("2026-01-10 23:59:00", "aberta", "2026-01-11 00:00:00")).toBe(true);
    expect(ehOSVencida("2026-01-11 08:00:00", "aberta", "2026-01-11 20:00:00")).toBe(false);
  });
});

// EXCL-ADM-01: exclusão de OS é decisão exclusiva do Administrador — trava tanto a UI (esconder o
// botão) quanto o próprio endpoint DELETE (routes/ordensServico.ts), pra uma chamada direta à API
// não conseguir contornar a permissão configurável do perfil.
describe("podeExcluirOS", () => {
  it("permite apenas o perfil Administrador", () => {
    expect(podeExcluirOS("Administrador")).toBe(true);
  });

  it("bloqueia qualquer outro perfil, incluindo papéis de gestão de manutenção", () => {
    expect(podeExcluirOS("Coordenador de PCM")).toBe(false);
    expect(podeExcluirOS("Planejador")).toBe(false);
    expect(podeExcluirOS("Supervisor de manutenção")).toBe(false);
    expect(podeExcluirOS("Técnico")).toBe(false);
  });

  it("bloqueia quando não há perfil (usuário não autenticado ou dado ausente)", () => {
    expect(podeExcluirOS(null)).toBe(false);
    expect(podeExcluirOS(undefined)).toBe(false);
    expect(podeExcluirOS("")).toBe(false);
  });
});
