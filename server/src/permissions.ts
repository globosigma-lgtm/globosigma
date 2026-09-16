export const MODULOS = [
  "ativos",
  "pecas",
  "planos",
  "geracao_lote",
  "lubrificacao",
  "inspecoes",
  "ordens_servico",
  "solicitacoes",
  "almoxarifado",
  "programacao_compras",
  "usuarios",
  "equipes",
  "configuracoes",
  "auditoria",
  "indicadores",
] as const;

export type Modulo = (typeof MODULOS)[number];

export const ACOES = ["ver", "criar", "editar", "editar_completo", "reabrir", "excluir", "aprovar", "exportar"] as const;
export type Acao = (typeof ACOES)[number];

export type MapaPermissoes = Partial<Record<Modulo, Acao[]>>;

export function temPermissao(mapa: MapaPermissoes, modulo: Modulo, acao: Acao): boolean {
  return !!mapa[modulo]?.includes(acao);
}
