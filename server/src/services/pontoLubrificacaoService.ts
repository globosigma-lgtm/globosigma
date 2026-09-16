import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarAtivoPorId, caminhoAtivo } from "./ativoService.js";
import type { PeriodicidadeSemanal } from "./recorrenciaSemanalService.js";

export type PrioridadePonto = "baixa" | "media" | "alta" | "critica";

export interface PontoLubrificacao {
  id: number;
  codigo: string;
  ativo_id: number;
  descricao: string;
  especificacao: string | null;
  componente: string | null;
  periodicidade: PeriodicidadeSemanal;
  semana_base: number;
  duracao_estimada_horas: number;
  responsavel_padrao_id: number | null;
  prioridade_padrao: PrioridadePonto;
  instrucoes: string | null;
  ativo: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
}

export interface PontoLubrificacaoComAtivo extends PontoLubrificacao {
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  responsavel_padrao_nome: string | null;
}

export interface FiltrosPontoLubrificacao {
  texto?: string;
  ativoId?: number;
  periodicidade?: string;
  apenasAtivos?: boolean;
}

const COLUNAS = `
  p.id, p.codigo, p.ativo_id, p.descricao, p.especificacao, p.componente, p.periodicidade,
  p.semana_base, p.duracao_estimada_horas, p.responsavel_padrao_id, p.prioridade_padrao,
  p.instrucoes, p.ativo, p.data_inicio_vigencia, p.data_fim_vigencia
`;

export async function listarPontosLubrificacao(filtros: FiltrosPontoLubrificacao = {}): Promise<PontoLubrificacaoComAtivo[]> {
  const condicoes: string[] = ["p.excluido_em IS NULL", "a.excluido_em IS NULL"];
  const params: unknown[] = [];

  if (filtros.texto) {
    condicoes.push("(p.codigo ILIKE ? OR p.descricao ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  if (filtros.ativoId) {
    condicoes.push("p.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.periodicidade) {
    condicoes.push("p.periodicidade = ?");
    params.push(filtros.periodicidade);
  }
  if (filtros.apenasAtivos) {
    condicoes.push("p.ativo = 1");
  }

  const sql = `
    SELECT ${COLUNAS}, a.codigo AS ativo_codigo, a.nome AS ativo_nome, u.nome AS responsavel_padrao_nome
    FROM ponto_lubrificacao p
    JOIN ativo a ON a.id = p.ativo_id
    LEFT JOIN usuario u ON u.id = p.responsavel_padrao_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY a.nome, p.descricao
  `;
  const rows = (await dbAll(sql, params)) as unknown as (PontoLubrificacaoComAtivo & { ativo_caminho?: string })[];
  return Promise.all(rows.map(async (r) => ({ ...r, ativo_caminho: await caminhoAtivo(r.ativo_id) })));
}

export async function buscarPontoLubrificacaoPorId(id: number): Promise<PontoLubrificacaoComAtivo | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS}, a.codigo AS ativo_codigo, a.nome AS ativo_nome, u.nome AS responsavel_padrao_nome
       FROM ponto_lubrificacao p
       JOIN ativo a ON a.id = p.ativo_id
       LEFT JOIN usuario u ON u.id = p.responsavel_padrao_id
       WHERE p.id = ? AND p.excluido_em IS NULL`,
    [id]
  )) as (PontoLubrificacaoComAtivo & { ativo_caminho?: string }) | undefined;
  if (!row) return null;
  return { ...row, ativo_caminho: await caminhoAtivo(row.ativo_id) };
}

export async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM ponto_lubrificacao WHERE codigo LIKE 'LUB-%'")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("LUB-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `LUB-${String(maior + 1).padStart(4, "0")}`;
}

export interface DadosPontoLubrificacao {
  codigo: string;
  ativo_id: number;
  descricao: string;
  especificacao?: string | null;
  componente?: string | null;
  periodicidade: PeriodicidadeSemanal;
  semana_base: number;
  duracao_estimada_horas?: number;
  responsavel_padrao_id?: number | null;
  prioridade_padrao?: PrioridadePonto;
  instrucoes?: string | null;
  ativo?: boolean;
  data_inicio_vigencia: string;
  data_fim_vigencia?: string | null;
}

export class ErroValidacaoPontoLubrificacao extends Error {}

async function validarDados(dados: DadosPontoLubrificacao) {
  if (dados.semana_base < 1 || dados.semana_base > 53) {
    throw new ErroValidacaoPontoLubrificacao("A semana-base deve estar entre 1 e 53.");
  }
  if (dados.data_fim_vigencia && dados.data_fim_vigencia < dados.data_inicio_vigencia) {
    throw new ErroValidacaoPontoLubrificacao("A data de fim de vigência não pode ser anterior à data de início.");
  }
  if (!buscarAtivoPorId(dados.ativo_id)) {
    throw new ErroValidacaoPontoLubrificacao("O ativo selecionado não existe.");
  }
  if (dados.responsavel_padrao_id != null) {
    const usuario = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [dados.responsavel_padrao_id]);
    if (!usuario) {
      throw new ErroValidacaoPontoLubrificacao("O responsável padrão selecionado não existe.");
    }
  }
}

export async function criarPontoLubrificacao(dados: DadosPontoLubrificacao, usuarioId: number): Promise<PontoLubrificacaoComAtivo> {
  await validarDados(dados);
  const existente = await dbGet("SELECT id FROM ponto_lubrificacao WHERE codigo = ?", [dados.codigo]);
  if (existente) {
    throw new ErroValidacaoPontoLubrificacao(`Já existe um ponto de lubrificação com o código "${dados.codigo}".`);
  }

  const info = await dbRun(
    `INSERT INTO ponto_lubrificacao (
        codigo, ativo_id, descricao, especificacao, componente, periodicidade, semana_base,
        duracao_estimada_horas, responsavel_padrao_id, prioridade_padrao, instrucoes, ativo,
        data_inicio_vigencia, data_fim_vigencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      dados.codigo,
      dados.ativo_id,
      dados.descricao,
      dados.especificacao ?? null,
      dados.componente ?? null,
      dados.periodicidade,
      dados.semana_base,
      dados.duracao_estimada_horas ?? 0,
      dados.responsavel_padrao_id ?? null,
      dados.prioridade_padrao ?? "media",
      dados.instrucoes ?? null,
      dados.ativo === false ? 0 : 1,
      dados.data_inicio_vigencia,
      dados.data_fim_vigencia ?? null,
    ]
  );

  const novo = (await buscarPontoLubrificacaoPorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "ponto_lubrificacao", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function atualizarPontoLubrificacao(
  id: number,
  dados: DadosPontoLubrificacao,
  usuarioId: number
): Promise<PontoLubrificacaoComAtivo> {
  const anterior = await buscarPontoLubrificacaoPorId(id);
  if (!anterior) {
    throw new ErroValidacaoPontoLubrificacao("Ponto de lubrificação não encontrado.");
  }
  await validarDados(dados);
  const codigoEmUso = await dbGet("SELECT id FROM ponto_lubrificacao WHERE codigo = ? AND id != ?", [dados.codigo, id]);
  if (codigoEmUso) {
    throw new ErroValidacaoPontoLubrificacao(`Já existe um ponto de lubrificação com o código "${dados.codigo}".`);
  }

  await dbRun(
    `UPDATE ponto_lubrificacao SET
      codigo = ?, ativo_id = ?, descricao = ?, especificacao = ?, componente = ?, periodicidade = ?,
      semana_base = ?, duracao_estimada_horas = ?, responsavel_padrao_id = ?, prioridade_padrao = ?,
      instrucoes = ?, ativo = ?, data_inicio_vigencia = ?, data_fim_vigencia = ?
    WHERE id = ?`,
    [
      dados.codigo,
      dados.ativo_id,
      dados.descricao,
      dados.especificacao ?? null,
      dados.componente ?? null,
      dados.periodicidade,
      dados.semana_base,
      dados.duracao_estimada_horas ?? 0,
      dados.responsavel_padrao_id ?? null,
      dados.prioridade_padrao ?? "media",
      dados.instrucoes ?? null,
      dados.ativo === false ? 0 : 1,
      dados.data_inicio_vigencia,
      dados.data_fim_vigencia ?? null,
      id,
    ]
  );

  const novo = (await buscarPontoLubrificacaoPorId(id))!;
  await registrarAuditoria({
    entidade: "ponto_lubrificacao",
    entidade_id: id,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: novo,
    usuario_id: usuarioId,
  });
  return novo;
}

export async function excluirPontoLubrificacao(id: number, usuarioId: number): Promise<void> {
  const ponto = await buscarPontoLubrificacaoPorId(id);
  if (!ponto) {
    throw new ErroValidacaoPontoLubrificacao("Ponto de lubrificação não encontrado.");
  }
  await dbRun("UPDATE ponto_lubrificacao SET excluido_em = (now() - interval '4 hours') WHERE id = ?", [id]);
  await registrarAuditoria({ entidade: "ponto_lubrificacao", entidade_id: id, acao: "excluir", valor_anterior: ponto, usuario_id: usuarioId });
}

export interface ResultadoAtribuicaoLotePontos {
  atualizados: number;
  falhas: { id: number; codigo: string | null; erro: string }[];
}

/** Atribuição em lote do responsável padrão — mesmo padrão de atribuirResponsavelPadraoEmLote (planoInspecaoService.ts). */
export async function atribuirResponsavelPadraoEmLote(
  ids: number[],
  responsavelId: number | null,
  usuarioId: number
): Promise<ResultadoAtribuicaoLotePontos> {
  if (responsavelId != null) {
    const usuario = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [responsavelId]);
    if (!usuario) {
      throw new ErroValidacaoPontoLubrificacao("O responsável selecionado não existe.");
    }
  }

  const falhas: ResultadoAtribuicaoLotePontos["falhas"] = [];
  let atualizados = 0;

  for (const id of ids) {
    const anterior = await buscarPontoLubrificacaoPorId(id);
    if (!anterior) {
      falhas.push({ id, codigo: null, erro: "Ponto de lubrificação não encontrado." });
      continue;
    }
    await dbRun("UPDATE ponto_lubrificacao SET responsavel_padrao_id = ? WHERE id = ?", [responsavelId, id]);
    const novo = (await buscarPontoLubrificacaoPorId(id))!;
    await registrarAuditoria({ entidade: "ponto_lubrificacao", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: novo, usuario_id: usuarioId });
    atualizados++;
  }

  return { atualizados, falhas };
}
