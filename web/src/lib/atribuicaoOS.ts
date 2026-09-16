/**
 * EQUIPE-01: atribuição de OS por pessoa OU equipe, mutuamente exclusiva — em vez de um toggle com
 * dois campos, um único <select> com valor codificado ("pessoa:5" / "equipe:2" / "") alimenta as
 * duas listas num optgroup só. Usado em OSFormModal, OrdemServicoDetalhe e no atribuir-em-lote de
 * OrdensServico — mantém a decodificação consistente nos três lugares.
 */
export function codificarAtribuicao(responsavelId: number | null | undefined, equipeId: number | null | undefined): string {
  if (responsavelId != null) return `pessoa:${responsavelId}`;
  if (equipeId != null) return `equipe:${equipeId}`;
  return "";
}

export function decodificarAtribuicao(valor: string): { responsavel_id: number | null; equipe_id: number | null } {
  if (valor.startsWith("pessoa:")) return { responsavel_id: Number(valor.slice(7)), equipe_id: null };
  if (valor.startsWith("equipe:")) return { responsavel_id: null, equipe_id: Number(valor.slice(7)) };
  return { responsavel_id: null, equipe_id: null };
}
