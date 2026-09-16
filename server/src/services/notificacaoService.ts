import { dbGet, dbAll, dbRun } from "../db/pg.js";

export interface Notificacao {
  id: number;
  usuario_id: number;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  entidade: string | null;
  entidade_id: number | null;
  lida: number;
  criada_em: string;
}

/**
 * CAMPO-01/NOVO-04: mecanismo interno de notificação — cobre os quatro gatilhos que hoje exigem
 * o usuário abrir o sistema pra descobrir (atribuição de OS, atraso, ruptura crítica de peça,
 * solicitação recusada/convertida). Envio por e-mail/WhatsApp de verdade exige credenciais de
 * SMTP/API que não estão configuradas neste ambiente — quando existirem, um worker de envio pode
 * ler as linhas não lidas desta tabela em vez de duplicar cada gatilho num segundo lugar.
 */
export async function criarNotificacao(dados: {
  usuario_id: number;
  tipo: string;
  titulo: string;
  mensagem?: string | null;
  entidade?: string | null;
  entidade_id?: number | null;
}): Promise<void> {
  await dbRun(
    `INSERT INTO notificacao (usuario_id, tipo, titulo, mensagem, entidade, entidade_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.usuario_id, dados.tipo, dados.titulo, dados.mensagem ?? null, dados.entidade ?? null, dados.entidade_id ?? null]
  );
}

export async function listarNotificacoes(usuarioId: number, apenasNaoLidas: boolean): Promise<Notificacao[]> {
  const condicao = apenasNaoLidas ? "AND lida = 0" : "";
  return (await dbAll(
    `SELECT * FROM notificacao WHERE usuario_id = ? ${condicao} ORDER BY criada_em DESC LIMIT 50`,
    [usuarioId]
  )) as unknown as Notificacao[];
}

export async function contarNaoLidas(usuarioId: number): Promise<number> {
  const row = (await dbGet(`SELECT COUNT(*) AS n FROM notificacao WHERE usuario_id = ? AND lida = 0`, [usuarioId])) as { n: number };
  return row.n;
}

export async function marcarComoLida(id: number, usuarioId: number): Promise<void> {
  await dbRun(`UPDATE notificacao SET lida = 1 WHERE id = ? AND usuario_id = ?`, [id, usuarioId]);
}

export async function marcarTodasComoLidas(usuarioId: number): Promise<void> {
  await dbRun(`UPDATE notificacao SET lida = 1 WHERE usuario_id = ? AND lida = 0`, [usuarioId]);
}

/** Ids dos usuários ativos cujo perfil (nome) está entre os informados — usado pra avisar por cargo (ex.: Administrador, Coordenador de PCM), quando o gatilho não é uma permissão de módulo mas um papel específico. */
export async function usuariosPorPerfis(nomesPerfis: string[]): Promise<number[]> {
  if (nomesPerfis.length === 0) return [];
  const placeholders = nomesPerfis.map(() => "?").join(",");
  const linhas = (await dbAll(
    `SELECT u.id FROM usuario u JOIN perfil p ON p.id = u.perfil_id WHERE u.ativo = 1 AND p.nome IN (${placeholders})`,
    nomesPerfis
  )) as { id: number }[];
  return linhas.map((l) => l.id);
}

/** Ids dos usuários ativos cujo perfil tem a permissão indicada — usado para avisar "quem cuida do almoxarifado" sem hard-code de matrícula. */
export async function usuariosComPermissao(modulo: string, acao: string): Promise<number[]> {
  const linhas = (await dbAll(
    `SELECT u.id, p.permissoes AS permissoes_json FROM usuario u JOIN perfil p ON p.id = u.perfil_id WHERE u.ativo = 1`
  )) as { id: number; permissoes_json: string }[];
  return linhas
    .filter((l) => {
      try {
        const permissoes = JSON.parse(l.permissoes_json) as Record<string, string[]>;
        return !!permissoes[modulo]?.includes(acao);
      } catch {
        return false;
      }
    })
    .map((l) => l.id);
}
