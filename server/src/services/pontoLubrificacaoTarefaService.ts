import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import type { Regime, TipoResposta } from "./planoTarefaService.js";

export interface PontoLubrificacaoTarefa {
  id: number;
  ponto_lubrificacao_id: number;
  ordem: number;
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: number;
  valor_min: number | null;
  valor_max: number | null;
  unidade: string | null;
  regime: Regime | null;
}

export class ErroValidacaoTarefaLubrificacao extends Error {}

export async function listarTarefasDoPontoLubrificacao(pontoId: number): Promise<PontoLubrificacaoTarefa[]> {
  return (await dbAll(
    "SELECT * FROM ponto_lubrificacao_tarefa WHERE ponto_lubrificacao_id = ? ORDER BY ordem",
    [pontoId]
  )) as unknown as PontoLubrificacaoTarefa[];
}

export interface DadosTarefaLubrificacao {
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria?: boolean;
  valor_min?: number | null;
  valor_max?: number | null;
  unidade?: string | null;
  regime?: Regime | null;
}

export async function criarTarefaLubrificacao(
  pontoId: number,
  dados: DadosTarefaLubrificacao,
  usuarioId: number
): Promise<PontoLubrificacaoTarefa> {
  const maxOrdem = (await dbGet(
    "SELECT COALESCE(MAX(ordem), 0) as maximo FROM ponto_lubrificacao_tarefa WHERE ponto_lubrificacao_id = ?",
    [pontoId]
  )) as { maximo: number };
  const info = await dbRun(
    `INSERT INTO ponto_lubrificacao_tarefa (ponto_lubrificacao_id, ordem, descricao, tipo_resposta, obrigatoria, valor_min, valor_max, unidade, regime)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      pontoId,
      maxOrdem.maximo + 1,
      dados.descricao,
      dados.tipo_resposta,
      dados.obrigatoria === false ? 0 : 1,
      dados.valor_min ?? null,
      dados.valor_max ?? null,
      dados.unidade ?? null,
      dados.regime ?? null,
    ]
  );
  const nova = (await dbGet("SELECT * FROM ponto_lubrificacao_tarefa WHERE id = ?", [Number(info.id)])) as unknown as PontoLubrificacaoTarefa;
  await registrarAuditoria({ entidade: "ponto_lubrificacao_tarefa", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export async function atualizarTarefaLubrificacao(
  tarefaId: number,
  dados: DadosTarefaLubrificacao,
  usuarioId: number
): Promise<PontoLubrificacaoTarefa> {
  const anterior = await dbGet("SELECT * FROM ponto_lubrificacao_tarefa WHERE id = ?", [tarefaId]);
  if (!anterior) {
    throw new ErroValidacaoTarefaLubrificacao("Tarefa do checklist não encontrada.");
  }
  await dbRun(
    `UPDATE ponto_lubrificacao_tarefa SET descricao = ?, tipo_resposta = ?, obrigatoria = ?, valor_min = ?, valor_max = ?, unidade = ?, regime = ?
     WHERE id = ?`,
    [
      dados.descricao,
      dados.tipo_resposta,
      dados.obrigatoria === false ? 0 : 1,
      dados.valor_min ?? null,
      dados.valor_max ?? null,
      dados.unidade ?? null,
      dados.regime ?? null,
      tarefaId,
    ]
  );
  const nova = (await dbGet("SELECT * FROM ponto_lubrificacao_tarefa WHERE id = ?", [tarefaId])) as unknown as PontoLubrificacaoTarefa;
  await registrarAuditoria({
    entidade: "ponto_lubrificacao_tarefa",
    entidade_id: tarefaId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: nova,
    usuario_id: usuarioId,
  });
  return nova;
}

export async function removerTarefaLubrificacao(tarefaId: number, usuarioId: number): Promise<void> {
  const anterior = await dbGet("SELECT * FROM ponto_lubrificacao_tarefa WHERE id = ?", [tarefaId]);
  if (!anterior) {
    throw new ErroValidacaoTarefaLubrificacao("Tarefa do checklist não encontrada.");
  }
  await dbRun("DELETE FROM ponto_lubrificacao_tarefa WHERE id = ?", [tarefaId]);
  await registrarAuditoria({ entidade: "ponto_lubrificacao_tarefa", entidade_id: tarefaId, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}

export async function moverTarefaLubrificacao(tarefaId: number, direcao: "cima" | "baixo"): Promise<void> {
  const atual = (await dbGet("SELECT * FROM ponto_lubrificacao_tarefa WHERE id = ?", [tarefaId])) as PontoLubrificacaoTarefa | undefined;
  if (!atual) {
    throw new ErroValidacaoTarefaLubrificacao("Tarefa do checklist não encontrada.");
  }
  const vizinha = (await dbGet(
    direcao === "cima"
      ? "SELECT * FROM ponto_lubrificacao_tarefa WHERE ponto_lubrificacao_id = ? AND ordem < ? ORDER BY ordem DESC LIMIT 1"
      : "SELECT * FROM ponto_lubrificacao_tarefa WHERE ponto_lubrificacao_id = ? AND ordem > ? ORDER BY ordem ASC LIMIT 1",
    [atual.ponto_lubrificacao_id, atual.ordem]
  )) as PontoLubrificacaoTarefa | undefined;
  if (!vizinha) return;

  await dbRun("UPDATE ponto_lubrificacao_tarefa SET ordem = ? WHERE id = ?", [vizinha.ordem, atual.id]);
  await dbRun("UPDATE ponto_lubrificacao_tarefa SET ordem = ? WHERE id = ?", [atual.ordem, vizinha.id]);
}
