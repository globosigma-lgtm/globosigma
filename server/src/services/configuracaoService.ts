import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import type { TratamentoDiaNaoUtil } from "./recorrenciaService.js";

export class ErroValidacaoConfiguracao extends Error {}

export interface Configuracoes {
  tratamento_dia_nao_util: TratamentoDiaNaoUtil;
  margem_seguranca_dias: number;
  limite_horas_dia_responsavel: number;
}

/**
 * Config chave/valor com defaults embutidos aqui — se uma chave nunca foi seedada/gravada, o
 * sistema não quebra, só assume o valor padrão (os mesmos usados no seed.ts original).
 */
export async function obterConfiguracoes(): Promise<Configuracoes> {
  const rows = (await dbAll("SELECT chave, valor FROM configuracao")) as { chave: string; valor: string }[];
  const mapa = new Map(rows.map((r) => [r.chave, JSON.parse(r.valor) as unknown]));
  return {
    tratamento_dia_nao_util: (mapa.get("tratamento_dia_nao_util") as TratamentoDiaNaoUtil) ?? "gerar_na_data",
    margem_seguranca_dias: (mapa.get("margem_seguranca_dias") as number) ?? 7,
    limite_horas_dia_responsavel: (mapa.get("limite_horas_dia_responsavel") as number) ?? 8,
  };
}

export async function atualizarConfiguracoes(dados: Configuracoes, usuarioId: number): Promise<Configuracoes> {
  if (!["gerar_na_data", "antecipar", "postergar"].includes(dados.tratamento_dia_nao_util)) {
    throw new ErroValidacaoConfiguracao("Tratamento de dia não útil inválido.");
  }
  if (dados.margem_seguranca_dias < 0) {
    throw new ErroValidacaoConfiguracao("A margem de segurança não pode ser negativa.");
  }
  if (dados.limite_horas_dia_responsavel <= 0) {
    throw new ErroValidacaoConfiguracao("Informe um limite de horas por dia maior que zero.");
  }

  const anterior = await obterConfiguracoes();
  const upsertSql = "INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor";
  await dbRun(upsertSql, ["tratamento_dia_nao_util", JSON.stringify(dados.tratamento_dia_nao_util)]);
  await dbRun(upsertSql, ["margem_seguranca_dias", JSON.stringify(dados.margem_seguranca_dias)]);
  await dbRun(upsertSql, ["limite_horas_dia_responsavel", JSON.stringify(dados.limite_horas_dia_responsavel)]);

  const nova = await obterConfiguracoes();
  await registrarAuditoria({ entidade: "configuracao", entidade_id: null, acao: "editar", valor_anterior: anterior, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export interface Feriado {
  id: number;
  data: string;
  descricao: string;
}

export async function listarFeriados(): Promise<Feriado[]> {
  return (await dbAll("SELECT id, data, descricao FROM feriado ORDER BY data")) as unknown as Feriado[];
}

export async function criarFeriado(data: string, descricao: string, usuarioId: number): Promise<Feriado> {
  if (!data.trim()) {
    throw new ErroValidacaoConfiguracao("Informe a data do feriado.");
  }
  if (!descricao.trim()) {
    throw new ErroValidacaoConfiguracao("Informe a descrição do feriado.");
  }
  const existente = await dbGet("SELECT id FROM feriado WHERE data = ?", [data]);
  if (existente) {
    throw new ErroValidacaoConfiguracao("Já existe um feriado cadastrado nesta data.");
  }
  const info = await dbRun("INSERT INTO feriado (data, descricao) VALUES (?, ?) RETURNING id", [data, descricao.trim()]);
  const novo: Feriado = { id: Number(info.id), data, descricao: descricao.trim() };
  await registrarAuditoria({ entidade: "feriado", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function removerFeriado(id: number, usuarioId: number): Promise<void> {
  const anterior = (await dbGet("SELECT id, data, descricao FROM feriado WHERE id = ?", [id])) as Feriado | undefined;
  if (!anterior) {
    throw new ErroValidacaoConfiguracao("Feriado não encontrado.");
  }
  await dbRun("DELETE FROM feriado WHERE id = ?", [id]);
  await registrarAuditoria({ entidade: "feriado", entidade_id: id, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}
