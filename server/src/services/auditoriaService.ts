import { dbGet, dbAll, dbRun } from "../db/pg.js";

export interface RegistroAuditoria {
  entidade: string;
  entidade_id: number | null;
  acao: "criar" | "editar" | "excluir" | "status" | "negado";
  valor_anterior?: unknown;
  valor_novo?: unknown;
  usuario_id: number;
  ip?: string | null;
}

export async function registrarAuditoria(registro: RegistroAuditoria) {
  // Coluna `data` é escrita explicitamente (em vez de confiar no DEFAULT da tabela) porque bancos
  // já existentes antes desta mudança de fuso ficaram com o DEFAULT antigo gravado — SQLite não
  // suporta ALTER COLUMN ... SET DEFAULT, então só INSERT explícito garante GMT-04:00 em qualquer
  // banco, novo ou já existente.
  await dbRun(
    `INSERT INTO log_auditoria (entidade, entidade_id, acao, valor_anterior, valor_novo, usuario_id, ip, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, (now() - interval '4 hours'))`,
    [
      registro.entidade,
      registro.entidade_id,
      registro.acao,
      registro.valor_anterior !== undefined ? JSON.stringify(registro.valor_anterior) : null,
      registro.valor_novo !== undefined ? JSON.stringify(registro.valor_novo) : null,
      registro.usuario_id,
      registro.ip ?? null,
    ]
  );
}

export interface RegistroAuditoriaCompleto {
  id: number;
  entidade: string;
  entidade_id: number | null;
  acao: "criar" | "editar" | "excluir" | "status" | "negado";
  valor_anterior: unknown;
  valor_novo: unknown;
  usuario_id: number | null;
  usuario_nome: string | null;
  data: string;
  ip: string | null;
}

export interface FiltrosAuditoria {
  entidade?: string;
  acao?: string;
  usuarioId?: number;
  dataInicio?: string;
  dataFim?: string;
}

/** Tela de auditoria (Fase 11) — leitura do log que todos os módulos já vêm escrevendo desde a Fase 1. */
export async function listarAuditoria(filtros: FiltrosAuditoria = {}): Promise<RegistroAuditoriaCompleto[]> {
  const condicoes: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filtros.entidade) {
    condicoes.push("l.entidade = ?");
    params.push(filtros.entidade);
  }
  if (filtros.acao) {
    condicoes.push("l.acao = ?");
    params.push(filtros.acao);
  }
  if (filtros.usuarioId) {
    condicoes.push("l.usuario_id = ?");
    params.push(filtros.usuarioId);
  }
  if (filtros.dataInicio) {
    condicoes.push("l.data >= ?");
    params.push(filtros.dataInicio);
  }
  if (filtros.dataFim) {
    condicoes.push("l.data <= ?");
    params.push(`${filtros.dataFim} 23:59:59`);
  }

  const sql = `
    SELECT l.id, l.entidade, l.entidade_id, l.acao, l.valor_anterior, l.valor_novo, l.usuario_id, u.nome AS usuario_nome, l.data, l.ip
    FROM log_auditoria l
    LEFT JOIN usuario u ON u.id = l.usuario_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY l.data DESC, l.id DESC
    LIMIT 500
  `;
  const rows = (await dbAll(sql, params)) as unknown as (Omit<
    RegistroAuditoriaCompleto,
    "valor_anterior" | "valor_novo"
  > & { valor_anterior: string | null; valor_novo: string | null })[];
  return rows.map((r) => ({
    ...r,
    valor_anterior: r.valor_anterior ? JSON.parse(r.valor_anterior) : null,
    valor_novo: r.valor_novo ? JSON.parse(r.valor_novo) : null,
  }));
}

export async function listarEntidadesAuditadas(): Promise<string[]> {
  const rows = (await dbAll("SELECT DISTINCT entidade FROM log_auditoria ORDER BY entidade")) as { entidade: string }[];
  return rows.map((r) => r.entidade);
}
