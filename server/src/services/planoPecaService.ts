import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarPecaPorId } from "./pecaService.js";
import type { UnidadeMedida } from "./pecaService.js";

export interface PlanoPeca {
  id: number;
  plano_id: number;
  peca_id: number;
  quantidade_prevista: number;
  obrigatoria: number;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
  estoque_minimo: number;
}

export class ErroValidacaoPlanoPeca extends Error {}

export async function listarPecasDoPlano(planoId: number): Promise<PlanoPeca[]> {
  return (await dbAll(
    `SELECT pp.id, pp.plano_id, pp.peca_id, pp.quantidade_prevista, pp.obrigatoria,
              p.codigo, p.descricao, p.unidade_medida, p.estoque_atual, p.estoque_minimo
       FROM plano_peca pp
       JOIN peca p ON p.id = pp.peca_id AND p.excluido_em IS NULL
       WHERE pp.plano_id = ?
       ORDER BY p.descricao`,
    [planoId]
  )) as unknown as PlanoPeca[];
}

export interface DadosPlanoPeca {
  peca_id: number;
  quantidade_prevista: number;
  obrigatoria?: boolean;
}

export async function vincularPeca(planoId: number, dados: DadosPlanoPeca, usuarioId: number): Promise<PlanoPeca> {
  if (!buscarPecaPorId(dados.peca_id)) {
    throw new ErroValidacaoPlanoPeca("Peça não encontrada.");
  }
  const existente = await dbGet("SELECT id FROM plano_peca WHERE plano_id = ? AND peca_id = ?", [planoId, dados.peca_id]);
  if (existente) {
    throw new ErroValidacaoPlanoPeca("Esta peça já está vinculada a este plano.");
  }

  const info = await dbRun(
    "INSERT INTO plano_peca (plano_id, peca_id, quantidade_prevista, obrigatoria) VALUES (?, ?, ?, ?) RETURNING id",
    [planoId, dados.peca_id, dados.quantidade_prevista, dados.obrigatoria === false ? 0 : 1]
  );

  const novo = (await listarPecasDoPlano(planoId)).find((v) => v.id === Number(info.id))!;
  await registrarAuditoria({ entidade: "plano_peca", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function atualizarVinculo(vinculoId: number, dados: DadosPlanoPeca, usuarioId: number): Promise<PlanoPeca> {
  const anterior = (await dbGet("SELECT * FROM plano_peca WHERE id = ?", [vinculoId])) as { plano_id: number } | undefined;
  if (!anterior) {
    throw new ErroValidacaoPlanoPeca("Vínculo não encontrado.");
  }
  await dbRun("UPDATE plano_peca SET quantidade_prevista = ?, obrigatoria = ? WHERE id = ?", [
    dados.quantidade_prevista,
    dados.obrigatoria === false ? 0 : 1,
    vinculoId,
  ]);
  const novo = (await listarPecasDoPlano(anterior.plano_id)).find((v) => v.id === vinculoId)!;
  await registrarAuditoria({
    entidade: "plano_peca",
    entidade_id: vinculoId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: novo,
    usuario_id: usuarioId,
  });
  return novo;
}

export async function removerVinculo(vinculoId: number, usuarioId: number): Promise<void> {
  const anterior = await dbGet("SELECT * FROM plano_peca WHERE id = ?", [vinculoId]);
  if (!anterior) {
    throw new ErroValidacaoPlanoPeca("Vínculo não encontrado.");
  }
  await dbRun("DELETE FROM plano_peca WHERE id = ?", [vinculoId]);
  await registrarAuditoria({ entidade: "plano_peca", entidade_id: vinculoId, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}
