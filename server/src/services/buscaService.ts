import { dbAll } from "../db/pg.js";
import { temPermissao, type MapaPermissoes } from "../permissions.js";

export interface ResultadoBusca {
  tipo: "ativo" | "peca" | "plano" | "plano_inspecao" | "os" | "solicitacao" | "equipe" | "usuario";
  grupo: string;
  titulo: string;
  subtitulo?: string;
  caminho: string;
}

/** Limite por entidade — busca global mostra uma prévia, não uma listagem completa (quem quer ver
 * tudo de um tipo só usa a busca da própria tela, que já existe pra peças/ativos/OS/etc.). */
const LIMITE_POR_ENTIDADE = 6;

/**
 * BUSCA-01: busca unificada por peças, ativos, planos, OS, solicitações, equipes e usuários — cada
 * entidade só entra no resultado se o usuário tem permissão "ver" no módulo correspondente (mesmo
 * mapa de permissões usado em toda a API, via exigirPermissao), pra não vazar dado que a tela
 * normal daquele módulo já esconderia.
 */
export async function buscaGlobal(termo: string, permissoes: MapaPermissoes): Promise<ResultadoBusca[]> {
  const t = `%${termo}%`;
  const resultados: ResultadoBusca[] = [];

  if (temPermissao(permissoes, "ativos", "ver")) {
    const rows = await dbAll<{ id: number; codigo: string; nome: string }>(
      `SELECT id, codigo, nome FROM ativo WHERE excluido_em IS NULL AND (codigo ILIKE ? OR nome ILIKE ?) ORDER BY nome LIMIT ${LIMITE_POR_ENTIDADE}`,
      [t, t]
    );
    resultados.push(...rows.map((r) => ({ tipo: "ativo" as const, grupo: "Ativos", titulo: `${r.codigo} — ${r.nome}`, caminho: `/ativos/${r.id}` })));
  }

  if (temPermissao(permissoes, "pecas", "ver")) {
    const rows = await dbAll<{ id: number; codigo: string; descricao: string }>(
      `SELECT id, codigo, descricao FROM peca WHERE excluido_em IS NULL AND (codigo ILIKE ? OR descricao ILIKE ?) ORDER BY descricao LIMIT ${LIMITE_POR_ENTIDADE}`,
      [t, t]
    );
    resultados.push(...rows.map((r) => ({ tipo: "peca" as const, grupo: "Peças", titulo: `${r.codigo} — ${r.descricao}`, caminho: `/pecas/${r.id}` })));
  }

  if (temPermissao(permissoes, "planos", "ver")) {
    const rows = await dbAll<{ id: number; codigo: string; nome: string }>(
      `SELECT id, codigo, nome FROM plano_manutencao WHERE excluido_em IS NULL AND (codigo ILIKE ? OR nome ILIKE ?) ORDER BY nome LIMIT ${LIMITE_POR_ENTIDADE}`,
      [t, t]
    );
    resultados.push(...rows.map((r) => ({ tipo: "plano" as const, grupo: "Planos de manutenção", titulo: `${r.codigo} — ${r.nome}`, caminho: `/planos/${r.id}` })));
  }

  if (temPermissao(permissoes, "inspecoes", "ver")) {
    const rows = await dbAll<{ id: number; codigo: string; tag: string; ativo_nome: string }>(
      `SELECT p.id, p.codigo, p.tag, a.nome AS ativo_nome
       FROM plano_inspecao p JOIN ativo a ON a.id = p.ativo_id
       WHERE p.excluido_em IS NULL AND (p.codigo ILIKE ? OR p.tag ILIKE ? OR a.nome ILIKE ?)
       ORDER BY p.codigo LIMIT ${LIMITE_POR_ENTIDADE}`,
      [t, t, t]
    );
    resultados.push(
      ...rows.map((r) => ({
        tipo: "plano_inspecao" as const,
        grupo: "Planos de inspeção",
        titulo: `${r.codigo} — TAG ${r.tag}`,
        subtitulo: r.ativo_nome,
        caminho: `/inspecoes/planos/${r.id}`,
      }))
    );
  }

  if (temPermissao(permissoes, "ordens_servico", "ver")) {
    const rows = await dbAll<{ id: number; codigo: string; descricao: string | null }>(
      `SELECT id, codigo, descricao FROM ordem_servico WHERE excluido_em IS NULL AND (codigo ILIKE ? OR descricao ILIKE ?) ORDER BY data_abertura DESC LIMIT ${LIMITE_POR_ENTIDADE}`,
      [t, t]
    );
    resultados.push(
      ...rows.map((r) => ({ tipo: "os" as const, grupo: "Ordens de serviço", titulo: r.codigo, subtitulo: r.descricao ?? undefined, caminho: `/ordens-servico/${r.id}` }))
    );
  }

  if (temPermissao(permissoes, "solicitacoes", "ver")) {
    const rows = await dbAll<{ id: number; codigo: string; descricao: string }>(
      `SELECT id, codigo, descricao FROM solicitacao WHERE codigo ILIKE ? OR descricao ILIKE ? ORDER BY criada_em DESC LIMIT ${LIMITE_POR_ENTIDADE}`,
      [t, t]
    );
    resultados.push(
      ...rows.map((r) => ({ tipo: "solicitacao" as const, grupo: "Solicitações", titulo: r.codigo, subtitulo: r.descricao, caminho: `/solicitacoes/${r.id}` }))
    );
  }

  if (temPermissao(permissoes, "equipes", "ver")) {
    const rows = await dbAll<{ id: number; nome: string }>(
      `SELECT id, nome FROM equipe WHERE excluido_em IS NULL AND nome ILIKE ? ORDER BY nome LIMIT ${LIMITE_POR_ENTIDADE}`,
      [t]
    );
    resultados.push(...rows.map((r) => ({ tipo: "equipe" as const, grupo: "Equipes", titulo: r.nome, caminho: "/equipes" })));
  }

  if (temPermissao(permissoes, "usuarios", "ver")) {
    const rows = await dbAll<{ id: number; nome: string; matricula: string }>(
      `SELECT id, nome, matricula FROM usuario WHERE excluido_em IS NULL AND (nome ILIKE ? OR matricula ILIKE ?) ORDER BY nome LIMIT ${LIMITE_POR_ENTIDADE}`,
      [t, t]
    );
    resultados.push(...rows.map((r) => ({ tipo: "usuario" as const, grupo: "Usuários", titulo: `${r.nome} (${r.matricula})`, caminho: "/usuarios" })));
  }

  return resultados;
}
