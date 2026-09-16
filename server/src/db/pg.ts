import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Traduz os placeholders posicionais `?` (estilo node:sqlite) usados em todo o código
 * para `$1, $2, ...` (estilo Postgres), na ordem em que aparecem. Nenhuma query do SIGMA
 * usa `?` dentro de string literal, então essa tradução é segura.
 */
function toPgSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function dbGet<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const { rows } = await pool.query(toPgSql(sql), params);
  return rows[0] as T | undefined;
}

export async function dbAll<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query(toPgSql(sql), params);
  return rows as T[];
}

/**
 * Para INSERTs que precisam do id gerado, a query deve terminar em `RETURNING id`
 * (não existe equivalente a lastInsertRowid em Postgres).
 */
export async function dbRun(sql: string, params: unknown[] = []): Promise<{ id?: number; changes: number }> {
  const res = await pool.query(toPgSql(sql), params);
  return { id: res.rows[0]?.id, changes: res.rowCount ?? 0 };
}
