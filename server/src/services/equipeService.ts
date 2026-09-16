import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";

export class ErroValidacaoEquipe extends Error {}

export interface MembroEquipe {
  id: number;
  nome: string;
  matricula: string;
}

export interface Equipe {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: number;
  criado_em: string;
  membros: MembroEquipe[];
}

async function membrosDaEquipe(equipeId: number): Promise<MembroEquipe[]> {
  return (await dbAll(
    `SELECT u.id, u.nome, u.matricula
     FROM equipe_membro em JOIN usuario u ON u.id = em.usuario_id
     WHERE em.equipe_id = ? ORDER BY u.nome`,
    [equipeId]
  )) as unknown as MembroEquipe[];
}

export async function listarEquipes(filtros: { texto?: string; apenasAtivas?: boolean } = {}): Promise<Equipe[]> {
  const condicoes: string[] = ["excluido_em IS NULL"];
  const params: unknown[] = [];
  if (filtros.apenasAtivas) {
    condicoes.push("ativo = 1");
  }
  if (filtros.texto) {
    condicoes.push("nome ILIKE ?");
    params.push(`%${filtros.texto}%`);
  }
  const equipes = (await dbAll(
    `SELECT id, nome, descricao, ativo, criado_em FROM equipe WHERE ${condicoes.join(" AND ")} ORDER BY nome`,
    params
  )) as unknown as Omit<Equipe, "membros">[];
  return Promise.all(equipes.map(async (e) => ({ ...e, membros: await membrosDaEquipe(e.id) })));
}

export async function buscarEquipePorId(id: number): Promise<Equipe | null> {
  const row = (await dbGet(
    "SELECT id, nome, descricao, ativo, criado_em FROM equipe WHERE id = ? AND excluido_em IS NULL",
    [id]
  )) as Omit<Equipe, "membros"> | undefined;
  if (!row) return null;
  return { ...row, membros: await membrosDaEquipe(id) };
}

/** Usada pelo gate de visibilidade de OS por equipe (ver ordensServico.ts, PERFIS_RESTRITOS_A_PROPRIA_OS). */
export async function usuarioPertenceEquipe(usuarioId: number, equipeId: number | null): Promise<boolean> {
  if (equipeId == null) return false;
  const row = await dbGet("SELECT 1 FROM equipe_membro WHERE equipe_id = ? AND usuario_id = ?", [equipeId, usuarioId]);
  return !!row;
}

export interface DadosEquipe {
  nome: string;
  descricao?: string | null;
  membroIds: number[];
}

async function validarMembros(membroIds: number[]) {
  if (membroIds.length === 0) return;
  const encontrados = await dbAll<{ id: number }>(
    "SELECT id FROM usuario WHERE id = ANY(?) AND excluido_em IS NULL",
    [membroIds]
  );
  if (encontrados.length !== new Set(membroIds).size) {
    throw new ErroValidacaoEquipe("Um ou mais membros selecionados não existem.");
  }
}

async function definirMembros(equipeId: number, membroIds: number[]) {
  await dbRun("DELETE FROM equipe_membro WHERE equipe_id = ?", [equipeId]);
  for (const usuarioId of new Set(membroIds)) {
    await dbRun("INSERT INTO equipe_membro (equipe_id, usuario_id) VALUES (?, ?)", [equipeId, usuarioId]);
  }
}

export async function criarEquipe(dados: DadosEquipe, usuarioId: number): Promise<Equipe> {
  if (!dados.nome.trim()) {
    throw new ErroValidacaoEquipe("Informe o nome da equipe.");
  }
  const existente = await dbGet("SELECT id FROM equipe WHERE nome = ? AND excluido_em IS NULL", [dados.nome.trim()]);
  if (existente) {
    throw new ErroValidacaoEquipe(`Já existe uma equipe com o nome "${dados.nome.trim()}".`);
  }
  await validarMembros(dados.membroIds);

  const info = await dbRun(
    `INSERT INTO equipe (nome, descricao, criado_em) VALUES (?, ?, (now() - interval '4 hours')) RETURNING id`,
    [dados.nome.trim(), dados.descricao?.trim() || null]
  );
  await definirMembros(Number(info.id), dados.membroIds);
  const nova = (await buscarEquipePorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "equipe", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export async function atualizarEquipe(id: number, dados: DadosEquipe, usuarioId: number): Promise<Equipe> {
  const anterior = await buscarEquipePorId(id);
  if (!anterior) {
    throw new ErroValidacaoEquipe("Equipe não encontrada.");
  }
  if (!dados.nome.trim()) {
    throw new ErroValidacaoEquipe("Informe o nome da equipe.");
  }
  const existente = await dbGet("SELECT id FROM equipe WHERE nome = ? AND excluido_em IS NULL AND id <> ?", [dados.nome.trim(), id]);
  if (existente) {
    throw new ErroValidacaoEquipe(`Já existe uma equipe com o nome "${dados.nome.trim()}".`);
  }
  await validarMembros(dados.membroIds);

  await dbRun("UPDATE equipe SET nome = ?, descricao = ? WHERE id = ?", [dados.nome.trim(), dados.descricao?.trim() || null, id]);
  await definirMembros(id, dados.membroIds);
  const nova = (await buscarEquipePorId(id))!;
  await registrarAuditoria({ entidade: "equipe", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export async function excluirEquipe(id: number, usuarioId: number): Promise<void> {
  const anterior = await buscarEquipePorId(id);
  if (!anterior) {
    throw new ErroValidacaoEquipe("Equipe não encontrada.");
  }
  const osVinculadas = await dbGet<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM ordem_servico WHERE equipe_id = ? AND status NOT IN ('concluida','cancelada') AND excluido_em IS NULL",
    [id]
  );
  if (osVinculadas && osVinculadas.n > 0) {
    throw new ErroValidacaoEquipe(
      `Não é possível excluir: ${osVinculadas.n} ordem(ns) de serviço em aberto ainda vinculada(s) a esta equipe.`
    );
  }
  await dbRun("UPDATE equipe SET excluido_em = (now() - interval '4 hours') WHERE id = ?", [id]);
  await registrarAuditoria({ entidade: "equipe", entidade_id: id, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}
