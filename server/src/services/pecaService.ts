import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";

export type UnidadeMedida = "un" | "m" | "kg" | "l" | "cx" | "par" | "rolo";

export interface Peca {
  id: number;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  categoria: string | null;
  fabricante: string | null;
  codigo_fabricante: string | null;
  estoque_atual: number;
  estoque_minimo: number;
  ponto_de_pedido: number;
  lead_time_dias: number;
  custo_unitario_medio: number;
  fornecedor_preferencial: string | null;
  localizacao_almoxarifado: string | null;
  ativa: number;
}

export interface FiltrosPeca {
  texto?: string;
  categoria?: string;
  fabricante?: string;
  apenasAbaixoDoMinimo?: boolean;
}

const COLUNAS = `
  id, codigo, descricao, unidade_medida, categoria, fabricante, codigo_fabricante,
  estoque_atual, estoque_minimo, ponto_de_pedido, lead_time_dias, custo_unitario_medio,
  fornecedor_preferencial, localizacao_almoxarifado, ativa
`;

export async function listarPecas(filtros: FiltrosPeca = {}): Promise<Peca[]> {
  const condicoes: string[] = ["excluido_em IS NULL"];
  const params: unknown[] = [];

  if (filtros.texto) {
    condicoes.push("(codigo ILIKE ? OR descricao ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  if (filtros.categoria) {
    condicoes.push("categoria = ?");
    params.push(filtros.categoria);
  }
  if (filtros.fabricante) {
    condicoes.push("fabricante = ?");
    params.push(filtros.fabricante);
  }
  if (filtros.apenasAbaixoDoMinimo) {
    condicoes.push("estoque_atual < estoque_minimo");
  }

  const sql = `SELECT ${COLUNAS} FROM peca WHERE ${condicoes.join(" AND ")} ORDER BY descricao`;
  return (await dbAll(sql, params)) as unknown as Peca[];
}

export async function buscarPecaPorId(id: number): Promise<Peca | null> {
  const row = (await dbGet(`SELECT ${COLUNAS} FROM peca WHERE id = ? AND excluido_em IS NULL`, [id])) as
    | Peca
    | undefined;
  return row ?? null;
}

export async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM peca WHERE codigo LIKE 'PC-%'")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("PC-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `PC-${String(maior + 1).padStart(5, "0")}`;
}

export interface DadosPeca {
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  categoria?: string | null;
  fabricante?: string | null;
  codigo_fabricante?: string | null;
  estoque_atual?: number;
  estoque_minimo?: number;
  ponto_de_pedido?: number;
  lead_time_dias?: number;
  custo_unitario_medio?: number;
  fornecedor_preferencial?: string | null;
  localizacao_almoxarifado?: string | null;
  ativa?: boolean;
}

export class ErroValidacaoPeca extends Error {}

export async function criarPeca(dados: DadosPeca, usuarioId: number): Promise<Peca> {
  const existente = await dbGet("SELECT id FROM peca WHERE codigo = ?", [dados.codigo]);
  if (existente) {
    throw new ErroValidacaoPeca(`Já existe uma peça com o código "${dados.codigo}".`);
  }

  const info = await dbRun(
    `INSERT INTO peca (
        codigo, descricao, unidade_medida, categoria, fabricante, codigo_fabricante,
        estoque_atual, estoque_minimo, ponto_de_pedido, lead_time_dias, custo_unitario_medio,
        fornecedor_preferencial, localizacao_almoxarifado, ativa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      dados.codigo,
      dados.descricao,
      dados.unidade_medida,
      dados.categoria ?? null,
      dados.fabricante ?? null,
      dados.codigo_fabricante ?? null,
      dados.estoque_atual ?? 0,
      dados.estoque_minimo ?? 0,
      dados.ponto_de_pedido ?? 0,
      dados.lead_time_dias ?? 0,
      dados.custo_unitario_medio ?? 0,
      dados.fornecedor_preferencial ?? null,
      dados.localizacao_almoxarifado ?? null,
      dados.ativa === false ? 0 : 1,
    ]
  );

  const nova = (await buscarPecaPorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "peca", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export async function atualizarPeca(id: number, dados: DadosPeca, usuarioId: number): Promise<Peca> {
  const anterior = await buscarPecaPorId(id);
  if (!anterior) {
    throw new ErroValidacaoPeca("Peça não encontrada.");
  }

  const codigoEmUso = await dbGet("SELECT id FROM peca WHERE codigo = ? AND id != ?", [dados.codigo, id]);
  if (codigoEmUso) {
    throw new ErroValidacaoPeca(`Já existe uma peça com o código "${dados.codigo}".`);
  }

  await dbRun(
    `UPDATE peca SET
      codigo = ?, descricao = ?, unidade_medida = ?, categoria = ?, fabricante = ?, codigo_fabricante = ?,
      estoque_atual = ?, estoque_minimo = ?, ponto_de_pedido = ?, lead_time_dias = ?, custo_unitario_medio = ?,
      fornecedor_preferencial = ?, localizacao_almoxarifado = ?, ativa = ?
    WHERE id = ?`,
    [
      dados.codigo,
      dados.descricao,
      dados.unidade_medida,
      dados.categoria ?? null,
      dados.fabricante ?? null,
      dados.codigo_fabricante ?? null,
      dados.estoque_atual ?? 0,
      dados.estoque_minimo ?? 0,
      dados.ponto_de_pedido ?? 0,
      dados.lead_time_dias ?? 0,
      dados.custo_unitario_medio ?? 0,
      dados.fornecedor_preferencial ?? null,
      dados.localizacao_almoxarifado ?? null,
      dados.ativa === false ? 0 : 1,
      id,
    ]
  );

  const nova = (await buscarPecaPorId(id))!;
  await registrarAuditoria({
    entidade: "peca",
    entidade_id: id,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: nova,
    usuario_id: usuarioId,
  });
  return nova;
}

export async function excluirPeca(id: number, usuarioId: number): Promise<void> {
  const peca = await buscarPecaPorId(id);
  if (!peca) {
    throw new ErroValidacaoPeca("Peça não encontrada.");
  }
  await dbRun("UPDATE peca SET excluido_em = (now() - interval '4 hours') WHERE id = ?", [id]);
  await registrarAuditoria({ entidade: "peca", entidade_id: id, acao: "excluir", valor_anterior: peca, usuario_id: usuarioId });
}
