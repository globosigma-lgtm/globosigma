import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarAtivoPorId, caminhoAtivo, caminhosAtivos } from "./ativoService.js";

export type ClassePeriodicidadeInspecao = "A" | "B" | "C";
export type PrioridadePlanoInspecao = "baixa" | "media" | "alta" | "critica";

/** Semanas equivalentes às classes da planilha de origem: A = a cada 15 dias, B = 30 dias, C = 45 dias. */
export const INTERVALO_SEMANAS_POR_CLASSE: Record<ClassePeriodicidadeInspecao, number> = {
  A: 2,
  B: 4,
  C: 6,
};

export interface PlanoInspecao {
  id: number;
  codigo: string;
  ativo_id: number;
  tag: string;
  setor: string | null;
  classe_periodicidade: ClassePeriodicidadeInspecao | null;
  intervalo_semanas: number | null;
  semana_base: number | null;
  duracao_estimada_horas: number;
  responsavel_padrao_id: number | null;
  prioridade_padrao: PrioridadePlanoInspecao;
  instrucoes: string | null;
  ativo: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
}

export interface PlanoInspecaoComAtivo extends PlanoInspecao {
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  responsavel_padrao_nome: string | null;
}

export interface FiltrosPlanoInspecao {
  texto?: string;
  ativoId?: number;
  classePeriodicidade?: string;
  apenasAtivos?: boolean;
  apenasSemClasse?: boolean;
}

const COLUNAS = `
  p.id, p.codigo, p.ativo_id, p.tag, p.setor, p.classe_periodicidade, p.intervalo_semanas,
  p.semana_base, p.duracao_estimada_horas, p.responsavel_padrao_id, p.prioridade_padrao,
  p.instrucoes, p.ativo, p.data_inicio_vigencia, p.data_fim_vigencia
`;

export async function listarPlanosInspecao(filtros: FiltrosPlanoInspecao = {}): Promise<PlanoInspecaoComAtivo[]> {
  const condicoes: string[] = ["p.excluido_em IS NULL", "a.excluido_em IS NULL"];
  const params: unknown[] = [];

  if (filtros.texto) {
    condicoes.push("(p.codigo ILIKE ? OR p.tag ILIKE ? OR a.nome ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  if (filtros.ativoId) {
    condicoes.push("p.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.classePeriodicidade) {
    condicoes.push("p.classe_periodicidade = ?");
    params.push(filtros.classePeriodicidade);
  }
  if (filtros.apenasAtivos) {
    condicoes.push("p.ativo = 1");
  }
  if (filtros.apenasSemClasse) {
    condicoes.push("p.classe_periodicidade IS NULL");
  }

  const sql = `
    SELECT ${COLUNAS}, a.codigo AS ativo_codigo, a.nome AS ativo_nome, u.nome AS responsavel_padrao_nome
    FROM plano_inspecao p
    JOIN ativo a ON a.id = p.ativo_id
    LEFT JOIN usuario u ON u.id = p.responsavel_padrao_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY a.nome
  `;
  const rows = (await dbAll(sql, params)) as unknown as (PlanoInspecaoComAtivo & { ativo_caminho?: string })[];
  const caminhos = await caminhosAtivos(rows.map((r) => r.ativo_id));
  return rows.map((r) => ({ ...r, ativo_caminho: caminhos.get(r.ativo_id) ?? r.ativo_nome }));
}

export async function buscarPlanoInspecaoPorId(id: number): Promise<PlanoInspecaoComAtivo | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS}, a.codigo AS ativo_codigo, a.nome AS ativo_nome, u.nome AS responsavel_padrao_nome
       FROM plano_inspecao p
       JOIN ativo a ON a.id = p.ativo_id
       LEFT JOIN usuario u ON u.id = p.responsavel_padrao_id
       WHERE p.id = ? AND p.excluido_em IS NULL`,
    [id]
  )) as (PlanoInspecaoComAtivo & { ativo_caminho?: string }) | undefined;
  if (!row) return null;
  return { ...row, ativo_caminho: await caminhoAtivo(row.ativo_id) };
}

export async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM plano_inspecao WHERE codigo LIKE 'INS-%'")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("INS-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `INS-${String(maior + 1).padStart(4, "0")}`;
}

export interface DadosPlanoInspecao {
  codigo: string;
  ativo_id: number;
  tag: string;
  setor?: string | null;
  classe_periodicidade?: ClassePeriodicidadeInspecao | null;
  semana_base?: number | null;
  duracao_estimada_horas?: number;
  responsavel_padrao_id?: number | null;
  prioridade_padrao?: PrioridadePlanoInspecao;
  instrucoes?: string | null;
  ativo?: boolean;
  data_inicio_vigencia: string;
  data_fim_vigencia?: string | null;
}

export class ErroValidacaoPlanoInspecao extends Error {}

async function validarDados(dados: DadosPlanoInspecao) {
  if (dados.classe_periodicidade != null && (dados.semana_base == null || dados.semana_base < 1 || dados.semana_base > 53)) {
    throw new ErroValidacaoPlanoInspecao("Informe uma semana-base entre 1 e 53 para planos com classe de periodicidade definida.");
  }
  if (dados.data_fim_vigencia && dados.data_fim_vigencia < dados.data_inicio_vigencia) {
    throw new ErroValidacaoPlanoInspecao("A data de fim de vigência não pode ser anterior à data de início.");
  }
  if (!(await buscarAtivoPorId(dados.ativo_id))) {
    throw new ErroValidacaoPlanoInspecao("O ativo selecionado não existe.");
  }
  if (dados.responsavel_padrao_id != null) {
    const usuario = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [dados.responsavel_padrao_id]);
    if (!usuario) {
      throw new ErroValidacaoPlanoInspecao("O responsável padrão selecionado não existe.");
    }
  }
}

export async function criarPlanoInspecao(dados: DadosPlanoInspecao, usuarioId: number): Promise<PlanoInspecaoComAtivo> {
  await validarDados(dados);
  const existente = await dbGet("SELECT id FROM plano_inspecao WHERE codigo = ?", [dados.codigo]);
  if (existente) {
    throw new ErroValidacaoPlanoInspecao(`Já existe um plano de inspeção com o código "${dados.codigo}".`);
  }

  const intervaloSemanas = dados.classe_periodicidade ? INTERVALO_SEMANAS_POR_CLASSE[dados.classe_periodicidade] : null;

  const info = await dbRun(
    `INSERT INTO plano_inspecao (
        codigo, ativo_id, tag, setor, classe_periodicidade, intervalo_semanas, semana_base,
        duracao_estimada_horas, responsavel_padrao_id, prioridade_padrao, instrucoes, ativo,
        data_inicio_vigencia, data_fim_vigencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      dados.codigo,
      dados.ativo_id,
      dados.tag,
      dados.setor ?? null,
      dados.classe_periodicidade ?? null,
      intervaloSemanas,
      dados.classe_periodicidade ? dados.semana_base : null,
      dados.duracao_estimada_horas ?? 0,
      dados.responsavel_padrao_id ?? null,
      dados.prioridade_padrao ?? "media",
      dados.instrucoes ?? null,
      dados.ativo === false ? 0 : 1,
      dados.data_inicio_vigencia,
      dados.data_fim_vigencia ?? null,
    ]
  );

  const novo = (await buscarPlanoInspecaoPorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "plano_inspecao", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function atualizarPlanoInspecao(
  id: number,
  dados: DadosPlanoInspecao,
  usuarioId: number
): Promise<PlanoInspecaoComAtivo> {
  const anterior = await buscarPlanoInspecaoPorId(id);
  if (!anterior) {
    throw new ErroValidacaoPlanoInspecao("Plano de inspeção não encontrado.");
  }
  await validarDados(dados);
  const codigoEmUso = await dbGet("SELECT id FROM plano_inspecao WHERE codigo = ? AND id != ?", [dados.codigo, id]);
  if (codigoEmUso) {
    throw new ErroValidacaoPlanoInspecao(`Já existe um plano de inspeção com o código "${dados.codigo}".`);
  }

  const intervaloSemanas = dados.classe_periodicidade ? INTERVALO_SEMANAS_POR_CLASSE[dados.classe_periodicidade] : null;

  await dbRun(
    `UPDATE plano_inspecao SET
      codigo = ?, ativo_id = ?, tag = ?, setor = ?, classe_periodicidade = ?, intervalo_semanas = ?,
      semana_base = ?, duracao_estimada_horas = ?, responsavel_padrao_id = ?, prioridade_padrao = ?,
      instrucoes = ?, ativo = ?, data_inicio_vigencia = ?, data_fim_vigencia = ?
    WHERE id = ?`,
    [
      dados.codigo,
      dados.ativo_id,
      dados.tag,
      dados.setor ?? null,
      dados.classe_periodicidade ?? null,
      intervaloSemanas,
      dados.classe_periodicidade ? dados.semana_base : null,
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

  const novo = (await buscarPlanoInspecaoPorId(id))!;
  await registrarAuditoria({
    entidade: "plano_inspecao",
    entidade_id: id,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: novo,
    usuario_id: usuarioId,
  });
  return novo;
}

export async function excluirPlanoInspecao(id: number, usuarioId: number): Promise<void> {
  const plano = await buscarPlanoInspecaoPorId(id);
  if (!plano) {
    throw new ErroValidacaoPlanoInspecao("Plano de inspeção não encontrado.");
  }
  await dbRun("UPDATE plano_inspecao SET excluido_em = (now() - interval '4 hours') WHERE id = ?", [id]);
  await registrarAuditoria({ entidade: "plano_inspecao", entidade_id: id, acao: "excluir", valor_anterior: plano, usuario_id: usuarioId });
}

export interface ResultadoAtribuicaoLotePlanos {
  atualizados: number;
  falhas: { id: number; codigo: string | null; erro: string }[];
}

/**
 * Atribuição em lote do inspetor padrão (Planejador/Coordenador/Supervisor/Administrador
 * selecionam vários planos de uma vez, mesmo padrão de atribuirResponsavelEmLote em osService.ts
 * — mas aqui é o inspetor PADRÃO do plano, não o responsável de uma OS já gerada).
 */
export async function atribuirResponsavelPadraoEmLote(
  ids: number[],
  responsavelId: number | null,
  usuarioId: number
): Promise<ResultadoAtribuicaoLotePlanos> {
  if (responsavelId != null) {
    const usuario = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [responsavelId]);
    if (!usuario) {
      throw new ErroValidacaoPlanoInspecao("O inspetor selecionado não existe.");
    }
  }

  const falhas: ResultadoAtribuicaoLotePlanos["falhas"] = [];
  let atualizados = 0;

  for (const id of ids) {
    const anterior = await buscarPlanoInspecaoPorId(id);
    if (!anterior) {
      falhas.push({ id, codigo: null, erro: "Plano de inspeção não encontrado." });
      continue;
    }
    await dbRun("UPDATE plano_inspecao SET responsavel_padrao_id = ? WHERE id = ?", [responsavelId, id]);
    const novo = (await buscarPlanoInspecaoPorId(id))!;
    await registrarAuditoria({ entidade: "plano_inspecao", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: novo, usuario_id: usuarioId });
    atualizados++;
  }

  return { atualizados, falhas };
}
