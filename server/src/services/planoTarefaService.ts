import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";

export type TipoResposta = "ok_nok" | "texto" | "numerico" | "selecao";
export type Regime = "MP" | "MF";

export interface PlanoTarefa {
  id: number;
  plano_id: number;
  ordem: number;
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: number;
  valor_min: number | null;
  valor_max: number | null;
  unidade: string | null;
  regime: Regime | null;
}

export class ErroValidacaoTarefa extends Error {}

export async function listarTarefasDoPlano(planoId: number): Promise<PlanoTarefa[]> {
  return (await dbAll("SELECT * FROM plano_tarefa WHERE plano_id = ? ORDER BY ordem", [planoId])) as unknown as PlanoTarefa[];
}

export interface DadosTarefa {
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria?: boolean;
  valor_min?: number | null;
  valor_max?: number | null;
  unidade?: string | null;
  regime?: Regime | null;
}

export async function criarTarefa(planoId: number, dados: DadosTarefa, usuarioId: number): Promise<PlanoTarefa> {
  const maxOrdem = (await dbGet("SELECT COALESCE(MAX(ordem), 0) as maximo FROM plano_tarefa WHERE plano_id = ?", [planoId])) as {
    maximo: number;
  };
  const info = await dbRun(
    `INSERT INTO plano_tarefa (plano_id, ordem, descricao, tipo_resposta, obrigatoria, valor_min, valor_max, unidade, regime)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      planoId,
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
  const nova = (await dbGet("SELECT * FROM plano_tarefa WHERE id = ?", [Number(info.id)])) as unknown as PlanoTarefa;
  await registrarAuditoria({ entidade: "plano_tarefa", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export async function atualizarTarefa(tarefaId: number, dados: DadosTarefa, usuarioId: number): Promise<PlanoTarefa> {
  const anterior = await dbGet("SELECT * FROM plano_tarefa WHERE id = ?", [tarefaId]);
  if (!anterior) {
    throw new ErroValidacaoTarefa("Tarefa do checklist não encontrada.");
  }
  await dbRun(
    `UPDATE plano_tarefa SET descricao = ?, tipo_resposta = ?, obrigatoria = ?, valor_min = ?, valor_max = ?, unidade = ?, regime = ?
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
  const nova = (await dbGet("SELECT * FROM plano_tarefa WHERE id = ?", [tarefaId])) as unknown as PlanoTarefa;
  await registrarAuditoria({
    entidade: "plano_tarefa",
    entidade_id: tarefaId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: nova,
    usuario_id: usuarioId,
  });
  return nova;
}

export async function removerTarefa(tarefaId: number, usuarioId: number): Promise<void> {
  const anterior = await dbGet("SELECT * FROM plano_tarefa WHERE id = ?", [tarefaId]);
  if (!anterior) {
    throw new ErroValidacaoTarefa("Tarefa do checklist não encontrada.");
  }
  await dbRun("DELETE FROM plano_tarefa WHERE id = ?", [tarefaId]);
  await registrarAuditoria({ entidade: "plano_tarefa", entidade_id: tarefaId, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}

export async function moverTarefa(tarefaId: number, direcao: "cima" | "baixo"): Promise<void> {
  const atual = (await dbGet("SELECT * FROM plano_tarefa WHERE id = ?", [tarefaId])) as PlanoTarefa | undefined;
  if (!atual) {
    throw new ErroValidacaoTarefa("Tarefa do checklist não encontrada.");
  }
  const vizinha = (await dbGet(
    direcao === "cima"
      ? "SELECT * FROM plano_tarefa WHERE plano_id = ? AND ordem < ? ORDER BY ordem DESC LIMIT 1"
      : "SELECT * FROM plano_tarefa WHERE plano_id = ? AND ordem > ? ORDER BY ordem ASC LIMIT 1",
    [atual.plano_id, atual.ordem]
  )) as PlanoTarefa | undefined;
  if (!vizinha) return;

  await dbRun("UPDATE plano_tarefa SET ordem = ? WHERE id = ?", [vizinha.ordem, atual.id]);
  await dbRun("UPDATE plano_tarefa SET ordem = ? WHERE id = ?", [atual.ordem, vizinha.id]);
}
