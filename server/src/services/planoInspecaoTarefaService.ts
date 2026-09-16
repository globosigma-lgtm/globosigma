import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import type { TipoResposta } from "./planoTarefaService.js";

export interface PlanoInspecaoTarefa {
  id: number;
  plano_inspecao_id: number;
  ordem: number;
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: number;
  valor_min: number | null;
  valor_max: number | null;
  unidade: string | null;
}

export class ErroValidacaoTarefaInspecao extends Error {}

export async function listarTarefasDoPlanoInspecao(planoInspecaoId: number): Promise<PlanoInspecaoTarefa[]> {
  return (await dbAll(
    "SELECT * FROM plano_inspecao_tarefa WHERE plano_inspecao_id = ? ORDER BY ordem",
    [planoInspecaoId]
  )) as unknown as PlanoInspecaoTarefa[];
}

export interface DadosTarefaInspecao {
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria?: boolean;
  valor_min?: number | null;
  valor_max?: number | null;
  unidade?: string | null;
}

export async function criarTarefaInspecao(
  planoInspecaoId: number,
  dados: DadosTarefaInspecao,
  usuarioId: number
): Promise<PlanoInspecaoTarefa> {
  const maxOrdem = (await dbGet(
    "SELECT COALESCE(MAX(ordem), 0) as maximo FROM plano_inspecao_tarefa WHERE plano_inspecao_id = ?",
    [planoInspecaoId]
  )) as { maximo: number };
  const info = await dbRun(
    `INSERT INTO plano_inspecao_tarefa (plano_inspecao_id, ordem, descricao, tipo_resposta, obrigatoria, valor_min, valor_max, unidade)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      planoInspecaoId,
      maxOrdem.maximo + 1,
      dados.descricao,
      dados.tipo_resposta,
      dados.obrigatoria === false ? 0 : 1,
      dados.valor_min ?? null,
      dados.valor_max ?? null,
      dados.unidade ?? null,
    ]
  );
  const nova = (await dbGet("SELECT * FROM plano_inspecao_tarefa WHERE id = ?", [Number(info.id)])) as unknown as PlanoInspecaoTarefa;
  await registrarAuditoria({ entidade: "plano_inspecao_tarefa", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export async function atualizarTarefaInspecao(
  tarefaId: number,
  dados: DadosTarefaInspecao,
  usuarioId: number
): Promise<PlanoInspecaoTarefa> {
  const anterior = await dbGet("SELECT * FROM plano_inspecao_tarefa WHERE id = ?", [tarefaId]);
  if (!anterior) {
    throw new ErroValidacaoTarefaInspecao("Tarefa do checklist não encontrada.");
  }
  await dbRun(
    `UPDATE plano_inspecao_tarefa SET descricao = ?, tipo_resposta = ?, obrigatoria = ?, valor_min = ?, valor_max = ?, unidade = ?
     WHERE id = ?`,
    [
      dados.descricao,
      dados.tipo_resposta,
      dados.obrigatoria === false ? 0 : 1,
      dados.valor_min ?? null,
      dados.valor_max ?? null,
      dados.unidade ?? null,
      tarefaId,
    ]
  );
  const nova = (await dbGet("SELECT * FROM plano_inspecao_tarefa WHERE id = ?", [tarefaId])) as unknown as PlanoInspecaoTarefa;
  await registrarAuditoria({
    entidade: "plano_inspecao_tarefa",
    entidade_id: tarefaId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: nova,
    usuario_id: usuarioId,
  });
  return nova;
}

export async function removerTarefaInspecao(tarefaId: number, usuarioId: number): Promise<void> {
  const anterior = await dbGet("SELECT * FROM plano_inspecao_tarefa WHERE id = ?", [tarefaId]);
  if (!anterior) {
    throw new ErroValidacaoTarefaInspecao("Tarefa do checklist não encontrada.");
  }
  await dbRun("DELETE FROM plano_inspecao_tarefa WHERE id = ?", [tarefaId]);
  await registrarAuditoria({ entidade: "plano_inspecao_tarefa", entidade_id: tarefaId, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}

export async function moverTarefaInspecao(tarefaId: number, direcao: "cima" | "baixo"): Promise<void> {
  const atual = (await dbGet("SELECT * FROM plano_inspecao_tarefa WHERE id = ?", [tarefaId])) as PlanoInspecaoTarefa | undefined;
  if (!atual) {
    throw new ErroValidacaoTarefaInspecao("Tarefa do checklist não encontrada.");
  }
  const vizinha = (await dbGet(
    direcao === "cima"
      ? "SELECT * FROM plano_inspecao_tarefa WHERE plano_inspecao_id = ? AND ordem < ? ORDER BY ordem DESC LIMIT 1"
      : "SELECT * FROM plano_inspecao_tarefa WHERE plano_inspecao_id = ? AND ordem > ? ORDER BY ordem ASC LIMIT 1",
    [atual.plano_inspecao_id, atual.ordem]
  )) as PlanoInspecaoTarefa | undefined;
  if (!vizinha) return;

  await dbRun("UPDATE plano_inspecao_tarefa SET ordem = ? WHERE id = ?", [vizinha.ordem, atual.id]);
  await dbRun("UPDATE plano_inspecao_tarefa SET ordem = ? WHERE id = ?", [atual.ordem, vizinha.id]);
}
