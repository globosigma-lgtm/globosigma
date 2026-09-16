import { describe, expect, it } from "vitest";
import { temPermissao, type MapaPermissoes } from "./permissions.js";

// TESTE-01: temPermissao é o portão de segurança usado por exigirPermissao em toda rota da API —
// sem teste algum até agora, apesar de ser o ponto único que decide se uma requisição passa ou
// leva 403.
describe("temPermissao", () => {
  it("permite quando o módulo tem a ação listada", () => {
    const mapa: MapaPermissoes = { ordens_servico: ["ver", "criar"] };
    expect(temPermissao(mapa, "ordens_servico", "ver")).toBe(true);
    expect(temPermissao(mapa, "ordens_servico", "criar")).toBe(true);
  });

  it("bloqueia quando o módulo existe mas não tem a ação listada", () => {
    const mapa: MapaPermissoes = { ordens_servico: ["ver"] };
    expect(temPermissao(mapa, "ordens_servico", "excluir")).toBe(false);
  });

  it("bloqueia quando o módulo nem aparece no mapa", () => {
    const mapa: MapaPermissoes = { ordens_servico: ["ver"] };
    expect(temPermissao(mapa, "usuarios", "ver")).toBe(false);
  });

  it("bloqueia com mapa vazio", () => {
    expect(temPermissao({}, "ordens_servico", "ver")).toBe(false);
  });
});
