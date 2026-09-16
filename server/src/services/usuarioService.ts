import bcrypt from "bcryptjs";
import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import type { MapaPermissoes } from "../permissions.js";

export interface UsuarioComPerfil {
  id: number;
  nome: string;
  matricula: string;
  email: string | null;
  setor: string | null;
  cargo: string | null;
  ativo: number;
  custo_hora_padrao: number;
  perfil_id: number;
  perfil_nome: string;
  permissoes: MapaPermissoes;
  somente_leitura: number;
}

const SELECT_BASE = `
  SELECT u.id, u.nome, u.matricula, u.email, u.setor, u.cargo, u.ativo, u.custo_hora_padrao,
         p.id as perfil_id, p.nome as perfil_nome, p.permissoes as permissoes_json, p.somente_leitura
  FROM usuario u
  JOIN perfil p ON p.id = u.perfil_id
`;

function mapRow(row: any): UsuarioComPerfil {
  return {
    id: row.id,
    nome: row.nome,
    matricula: row.matricula,
    email: row.email,
    setor: row.setor,
    cargo: row.cargo,
    ativo: row.ativo,
    custo_hora_padrao: row.custo_hora_padrao,
    perfil_id: row.perfil_id,
    perfil_nome: row.perfil_nome,
    permissoes: JSON.parse(row.permissoes_json || "{}"),
    somente_leitura: row.somente_leitura,
  };
}

export async function buscarUsuarioPorId(id: number): Promise<UsuarioComPerfil | null> {
  const row = await dbGet(`${SELECT_BASE} WHERE u.id = ? AND u.excluido_em IS NULL`, [id]);
  return row ? mapRow(row) : null;
}

export async function buscarUsuarioPorMatricula(matricula: string): Promise<(UsuarioComPerfil & { senha_hash: string }) | null> {
  const row = (await dbGet(
    `SELECT u.*, p.nome as perfil_nome, p.permissoes as permissoes_json, p.somente_leitura
       FROM usuario u JOIN perfil p ON p.id = u.perfil_id
       WHERE u.matricula = ? AND u.excluido_em IS NULL`,
    [matricula]
  )) as any;
  if (!row) return null;
  return { ...mapRow(row), senha_hash: row.senha_hash };
}

export async function registrarAcesso(usuarioId: number) {
  await dbRun("UPDATE usuario SET ultimo_acesso = (now() - interval '4 hours') WHERE id = ?", [usuarioId]);
}

export async function listarUsuarios(filtros: { texto?: string } = {}): Promise<UsuarioComPerfil[]> {
  const condicoes = ["u.excluido_em IS NULL"];
  const params: unknown[] = [];
  if (filtros.texto) {
    condicoes.push("(u.nome ILIKE ? OR u.matricula ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  const rows = await dbAll(`${SELECT_BASE} WHERE ${condicoes.join(" AND ")} ORDER BY u.nome`, params);
  return rows.map(mapRow);
}

export class ErroValidacaoUsuario extends Error {}

async function validarPerfil(perfilId: number) {
  const perfil = await dbGet("SELECT id FROM perfil WHERE id = ? AND excluido_em IS NULL", [perfilId]);
  if (!perfil) {
    throw new ErroValidacaoUsuario("O perfil selecionado não existe.");
  }
}

export interface DadosUsuario {
  nome: string;
  matricula: string;
  email?: string | null;
  perfil_id: number;
  setor?: string | null;
  cargo?: string | null;
  ativo?: boolean;
  custo_hora_padrao?: number;
  /** Obrigatória na criação; na edição, informar só quando for trocar a senha. */
  senha?: string;
}

export async function criarUsuario(dados: DadosUsuario, usuarioId: number): Promise<UsuarioComPerfil> {
  if (!dados.nome.trim()) {
    throw new ErroValidacaoUsuario("Informe o nome.");
  }
  if (!dados.matricula.trim()) {
    throw new ErroValidacaoUsuario("Informe a matrícula.");
  }
  if (!dados.senha || dados.senha.length < 6) {
    throw new ErroValidacaoUsuario("Informe uma senha com pelo menos 6 caracteres.");
  }
  await validarPerfil(dados.perfil_id);
  const existente = await dbGet("SELECT id FROM usuario WHERE matricula = ?", [dados.matricula.trim()]);
  if (existente) {
    throw new ErroValidacaoUsuario(`Já existe um usuário com a matrícula "${dados.matricula}".`);
  }

  const hash = bcrypt.hashSync(dados.senha, 10);
  const info = await dbRun(
    `INSERT INTO usuario (nome, matricula, email, senha_hash, perfil_id, setor, cargo, ativo, custo_hora_padrao, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`,
    [
      dados.nome.trim(),
      dados.matricula.trim(),
      dados.email?.trim() || null,
      hash,
      dados.perfil_id,
      dados.setor?.trim() || null,
      dados.cargo?.trim() || null,
      dados.ativo === false ? 0 : 1,
      dados.custo_hora_padrao ?? 0,
    ]
  );

  const novo = (await buscarUsuarioPorId(info.id!))!;
  await registrarAuditoria({ entidade: "usuario", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function atualizarUsuario(id: number, dados: DadosUsuario, usuarioId: number): Promise<UsuarioComPerfil> {
  const anterior = await buscarUsuarioPorId(id);
  if (!anterior) {
    throw new ErroValidacaoUsuario("Usuário não encontrado.");
  }
  if (!dados.nome.trim()) {
    throw new ErroValidacaoUsuario("Informe o nome.");
  }
  if (!dados.matricula.trim()) {
    throw new ErroValidacaoUsuario("Informe a matrícula.");
  }
  await validarPerfil(dados.perfil_id);
  const emUso = await dbGet("SELECT id FROM usuario WHERE matricula = ? AND id != ?", [dados.matricula.trim(), id]);
  if (emUso) {
    throw new ErroValidacaoUsuario(`Já existe um usuário com a matrícula "${dados.matricula}".`);
  }

  if (dados.senha) {
    if (dados.senha.length < 6) {
      throw new ErroValidacaoUsuario("A senha deve ter pelo menos 6 caracteres.");
    }
    const hash = bcrypt.hashSync(dados.senha, 10);
    await dbRun("UPDATE usuario SET senha_hash = ? WHERE id = ?", [hash, id]);
  }

  await dbRun(
    `UPDATE usuario SET nome = ?, matricula = ?, email = ?, perfil_id = ?, setor = ?, cargo = ?, ativo = ?, custo_hora_padrao = ?
     WHERE id = ?`,
    [
      dados.nome.trim(),
      dados.matricula.trim(),
      dados.email?.trim() || null,
      dados.perfil_id,
      dados.setor?.trim() || null,
      dados.cargo?.trim() || null,
      dados.ativo === false ? 0 : 1,
      dados.custo_hora_padrao ?? 0,
      id,
    ]
  );

  const novo = (await buscarUsuarioPorId(id))!;
  await registrarAuditoria({ entidade: "usuario", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function excluirUsuario(id: number, usuarioId: number): Promise<void> {
  const anterior = await buscarUsuarioPorId(id);
  if (!anterior) {
    throw new ErroValidacaoUsuario("Usuário não encontrado.");
  }
  if (id === usuarioId) {
    throw new ErroValidacaoUsuario("Você não pode excluir seu próprio usuário.");
  }
  await dbRun("UPDATE usuario SET excluido_em = (now() - interval '4 hours') WHERE id = ?", [id]);
  await registrarAuditoria({ entidade: "usuario", entidade_id: id, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}
