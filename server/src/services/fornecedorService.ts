import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";

export class ErroValidacaoFornecedor extends Error {}

export interface Fornecedor {
  id: number;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  especialidade: string | null;
  observacoes: string | null;
  ativo: number;
  criado_em: string;
}

const COLUNAS_FORNECEDOR = "id, nome, cnpj, contato, telefone, email, especialidade, observacoes, ativo, criado_em";

export async function listarFornecedores(filtros: { texto?: string; apenasAtivos?: boolean } = {}): Promise<Fornecedor[]> {
  const condicoes: string[] = ["excluido_em IS NULL"];
  const params: unknown[] = [];
  if (filtros.apenasAtivos) {
    condicoes.push("ativo = 1");
  }
  if (filtros.texto) {
    condicoes.push("(nome ILIKE ? OR cnpj ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  return (await dbAll(
    `SELECT ${COLUNAS_FORNECEDOR} FROM fornecedor WHERE ${condicoes.join(" AND ")} ORDER BY nome`,
    params
  )) as unknown as Fornecedor[];
}

export async function buscarFornecedorPorId(id: number): Promise<Fornecedor | null> {
  const row = (await dbGet(`SELECT ${COLUNAS_FORNECEDOR} FROM fornecedor WHERE id = ? AND excluido_em IS NULL`, [id])) as Fornecedor | undefined;
  return row ?? null;
}

export interface DadosFornecedor {
  nome: string;
  cnpj?: string | null;
  contato?: string | null;
  telefone?: string | null;
  email?: string | null;
  especialidade?: string | null;
  observacoes?: string | null;
}

export async function criarFornecedor(dados: DadosFornecedor, usuarioId: number): Promise<Fornecedor> {
  if (!dados.nome.trim()) {
    throw new ErroValidacaoFornecedor("Informe o nome do fornecedor.");
  }
  const info = await dbRun(
    `INSERT INTO fornecedor (nome, cnpj, contato, telefone, email, especialidade, observacoes, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`,
    [
      dados.nome.trim(),
      dados.cnpj?.trim() || null,
      dados.contato?.trim() || null,
      dados.telefone?.trim() || null,
      dados.email?.trim() || null,
      dados.especialidade?.trim() || null,
      dados.observacoes?.trim() || null,
    ]
  );
  const novo = (await buscarFornecedorPorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "fornecedor", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function atualizarFornecedor(id: number, dados: DadosFornecedor, usuarioId: number): Promise<Fornecedor> {
  const anterior = await buscarFornecedorPorId(id);
  if (!anterior) {
    throw new ErroValidacaoFornecedor("Fornecedor não encontrado.");
  }
  if (!dados.nome.trim()) {
    throw new ErroValidacaoFornecedor("Informe o nome do fornecedor.");
  }
  await dbRun(
    `UPDATE fornecedor SET nome = ?, cnpj = ?, contato = ?, telefone = ?, email = ?, especialidade = ?, observacoes = ? WHERE id = ?`,
    [
      dados.nome.trim(),
      dados.cnpj?.trim() || null,
      dados.contato?.trim() || null,
      dados.telefone?.trim() || null,
      dados.email?.trim() || null,
      dados.especialidade?.trim() || null,
      dados.observacoes?.trim() || null,
      id,
    ]
  );
  const novo = (await buscarFornecedorPorId(id))!;
  await registrarAuditoria({ entidade: "fornecedor", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: novo, usuario_id: usuarioId });
  return novo;
}
