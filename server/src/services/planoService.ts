import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarAtivoPorId, caminhoAtivo } from "./ativoService.js";

export type TipoManutencao = "preventiva" | "preditiva_manual" | "inspecao" | "calibracao" | "lubrificacao" | "limpeza_tecnica";
export type Periodicidade =
  | "diaria"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "bimestral"
  | "trimestral"
  | "quadrimestral"
  | "semestral"
  | "anual"
  | "bienal"
  | "trienal"
  | "personalizada";
export type PrioridadePlano = "baixa" | "media" | "alta" | "critica";

export interface Plano {
  id: number;
  codigo: string;
  nome: string;
  ativo_id: number;
  tipo_manutencao: TipoManutencao;
  periodicidade: Periodicidade;
  intervalo_customizado_dias: number | null;
  data_base: string;
  duracao_estimada_horas: number;
  responsavel_padrao_id: number | null;
  equipe_padrao: string | null;
  prioridade_padrao: PrioridadePlano;
  exige_parada_linha: number;
  instrucoes: string | null;
  ativo: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
}

export interface PlanoComAtivo extends Plano {
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  tem_pecas: number;
}

export interface FiltrosPlano {
  texto?: string;
  ativoId?: number;
  tipoManutencao?: string;
  periodicidade?: string;
  apenasAtivos?: boolean;
}

const COLUNAS = `
  p.id, p.codigo, p.nome, p.ativo_id, p.tipo_manutencao, p.periodicidade, p.intervalo_customizado_dias,
  p.data_base, p.duracao_estimada_horas, p.responsavel_padrao_id, p.equipe_padrao, p.prioridade_padrao,
  p.exige_parada_linha, p.instrucoes, p.ativo, p.data_inicio_vigencia, p.data_fim_vigencia
`;

export async function listarPlanos(filtros: FiltrosPlano = {}): Promise<PlanoComAtivo[]> {
  const condicoes: string[] = ["p.excluido_em IS NULL", "a.excluido_em IS NULL"];
  const params: unknown[] = [];

  if (filtros.texto) {
    condicoes.push("(p.codigo ILIKE ? OR p.nome ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  if (filtros.ativoId) {
    condicoes.push("p.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.tipoManutencao) {
    condicoes.push("p.tipo_manutencao = ?");
    params.push(filtros.tipoManutencao);
  }
  if (filtros.periodicidade) {
    condicoes.push("p.periodicidade = ?");
    params.push(filtros.periodicidade);
  }
  if (filtros.apenasAtivos) {
    condicoes.push("p.ativo = 1");
  }

  const sql = `
    SELECT ${COLUNAS}, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
      EXISTS(SELECT 1 FROM plano_peca pp WHERE pp.plano_id = p.id) AS tem_pecas
    FROM plano_manutencao p
    JOIN ativo a ON a.id = p.ativo_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY p.nome
  `;
  const rows = (await dbAll(sql, params)) as unknown as (PlanoComAtivo & { ativo_caminho?: string })[];
  return Promise.all(rows.map(async (r) => ({ ...r, ativo_caminho: await caminhoAtivo(r.ativo_id) })));
}

export async function buscarPlanoPorId(id: number): Promise<PlanoComAtivo | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS}, a.codigo AS ativo_codigo, a.nome AS ativo_nome
       FROM plano_manutencao p
       JOIN ativo a ON a.id = p.ativo_id
       WHERE p.id = ? AND p.excluido_em IS NULL`,
    [id]
  )) as (PlanoComAtivo & { ativo_caminho?: string }) | undefined;
  if (!row) return null;
  return { ...row, ativo_caminho: await caminhoAtivo(row.ativo_id) };
}

export async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM plano_manutencao WHERE codigo LIKE 'PLN-%'")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("PLN-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `PLN-${String(maior + 1).padStart(4, "0")}`;
}

export interface DadosPlano {
  codigo: string;
  nome: string;
  ativo_id: number;
  tipo_manutencao: TipoManutencao;
  periodicidade: Periodicidade;
  intervalo_customizado_dias?: number | null;
  data_base: string;
  duracao_estimada_horas?: number;
  responsavel_padrao_id?: number | null;
  equipe_padrao?: string | null;
  prioridade_padrao: PrioridadePlano;
  exige_parada_linha?: boolean;
  instrucoes?: string | null;
  ativo?: boolean;
  data_inicio_vigencia: string;
  data_fim_vigencia?: string | null;
}

export class ErroValidacaoPlano extends Error {}

async function validarDados(dados: DadosPlano) {
  if (dados.periodicidade === "personalizada" && !(dados.intervalo_customizado_dias && dados.intervalo_customizado_dias > 0)) {
    throw new ErroValidacaoPlano('Informe um intervalo em dias maior que zero para periodicidade "Personalizada".');
  }
  if (dados.data_fim_vigencia && dados.data_fim_vigencia < dados.data_inicio_vigencia) {
    throw new ErroValidacaoPlano("A data de fim de vigência não pode ser anterior à data de início.");
  }
  if (!buscarAtivoPorId(dados.ativo_id)) {
    throw new ErroValidacaoPlano("O ativo selecionado não existe.");
  }
  if (dados.responsavel_padrao_id != null) {
    const usuario = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [dados.responsavel_padrao_id]);
    if (!usuario) {
      throw new ErroValidacaoPlano("O responsável padrão selecionado não existe.");
    }
  }
}

export async function criarPlano(dados: DadosPlano, usuarioId: number): Promise<PlanoComAtivo> {
  await validarDados(dados);
  const existente = await dbGet("SELECT id FROM plano_manutencao WHERE codigo = ?", [dados.codigo]);
  if (existente) {
    throw new ErroValidacaoPlano(`Já existe um plano com o código "${dados.codigo}".`);
  }

  const info = await dbRun(
    `INSERT INTO plano_manutencao (
        codigo, nome, ativo_id, tipo_manutencao, periodicidade, intervalo_customizado_dias, data_base,
        duracao_estimada_horas, responsavel_padrao_id, equipe_padrao, prioridade_padrao, exige_parada_linha,
        instrucoes, ativo, data_inicio_vigencia, data_fim_vigencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      dados.codigo,
      dados.nome,
      dados.ativo_id,
      dados.tipo_manutencao,
      dados.periodicidade,
      dados.periodicidade === "personalizada" ? dados.intervalo_customizado_dias ?? null : null,
      dados.data_base,
      dados.duracao_estimada_horas ?? 0,
      dados.responsavel_padrao_id ?? null,
      dados.equipe_padrao ?? null,
      dados.prioridade_padrao,
      dados.exige_parada_linha ? 1 : 0,
      dados.instrucoes ?? null,
      dados.ativo === false ? 0 : 1,
      dados.data_inicio_vigencia,
      dados.data_fim_vigencia ?? null,
    ]
  );

  const novo = (await buscarPlanoPorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "plano_manutencao", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function atualizarPlano(id: number, dados: DadosPlano, usuarioId: number): Promise<PlanoComAtivo> {
  const anterior = await buscarPlanoPorId(id);
  if (!anterior) {
    throw new ErroValidacaoPlano("Plano não encontrado.");
  }
  await validarDados(dados);
  const codigoEmUso = await dbGet("SELECT id FROM plano_manutencao WHERE codigo = ? AND id != ?", [dados.codigo, id]);
  if (codigoEmUso) {
    throw new ErroValidacaoPlano(`Já existe um plano com o código "${dados.codigo}".`);
  }

  await dbRun(
    `UPDATE plano_manutencao SET
      codigo = ?, nome = ?, ativo_id = ?, tipo_manutencao = ?, periodicidade = ?, intervalo_customizado_dias = ?,
      data_base = ?, duracao_estimada_horas = ?, responsavel_padrao_id = ?, equipe_padrao = ?, prioridade_padrao = ?,
      exige_parada_linha = ?, instrucoes = ?, ativo = ?, data_inicio_vigencia = ?, data_fim_vigencia = ?
    WHERE id = ?`,
    [
      dados.codigo,
      dados.nome,
      dados.ativo_id,
      dados.tipo_manutencao,
      dados.periodicidade,
      dados.periodicidade === "personalizada" ? dados.intervalo_customizado_dias ?? null : null,
      dados.data_base,
      dados.duracao_estimada_horas ?? 0,
      dados.responsavel_padrao_id ?? null,
      dados.equipe_padrao ?? null,
      dados.prioridade_padrao,
      dados.exige_parada_linha ? 1 : 0,
      dados.instrucoes ?? null,
      dados.ativo === false ? 0 : 1,
      dados.data_inicio_vigencia,
      dados.data_fim_vigencia ?? null,
      id,
    ]
  );

  const novo = (await buscarPlanoPorId(id))!;
  await registrarAuditoria({
    entidade: "plano_manutencao",
    entidade_id: id,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: novo,
    usuario_id: usuarioId,
  });
  return novo;
}

export async function excluirPlano(id: number, usuarioId: number): Promise<void> {
  const plano = await buscarPlanoPorId(id);
  if (!plano) {
    throw new ErroValidacaoPlano("Plano não encontrado.");
  }
  await dbRun("UPDATE plano_manutencao SET excluido_em = (now() - interval '4 hours') WHERE id = ?", [id]);
  await registrarAuditoria({ entidade: "plano_manutencao", entidade_id: id, acao: "excluir", valor_anterior: plano, usuario_id: usuarioId });
}
