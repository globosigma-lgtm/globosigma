import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarAtivoPorId, caminhoAtivo, filhosDiretos } from "./ativoService.js";
import { buscarPecaPorId } from "./pecaService.js";
import type { UnidadeMedida } from "./pecaService.js";

export interface PecaDoAtivo {
  id: number;
  peca_id: number;
  quantidade_padrao: number;
  aplicacao: string | null;
  posicao: string;
  troca_obrigatoria: number;
  observacao: string | null;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
  estoque_minimo: number;
}

export interface AtivoDaPeca {
  id: number;
  ativo_id: number;
  quantidade_padrao: number;
  aplicacao: string | null;
  posicao: string;
  troca_obrigatoria: number;
  codigo: string;
  nome: string;
  criticidade: string;
  caminho: string;
}

export async function listarPecasDoAtivo(ativoId: number): Promise<PecaDoAtivo[]> {
  return (await dbAll(
    `SELECT ap.id, ap.peca_id, ap.quantidade_padrao, ap.aplicacao, ap.posicao, ap.troca_obrigatoria, ap.observacao,
              p.codigo, p.descricao, p.unidade_medida, p.estoque_atual, p.estoque_minimo
       FROM ativo_peca ap
       JOIN peca p ON p.id = ap.peca_id AND p.excluido_em IS NULL
       WHERE ap.ativo_id = ?
       ORDER BY p.descricao`,
    [ativoId]
  )) as unknown as PecaDoAtivo[];
}

export async function listarAtivosDaPeca(pecaId: number): Promise<AtivoDaPeca[]> {
  const rows = (await dbAll(
    `SELECT ap.id, ap.ativo_id, ap.quantidade_padrao, ap.aplicacao, ap.posicao, ap.troca_obrigatoria,
              a.codigo, a.nome, a.criticidade
       FROM ativo_peca ap
       JOIN ativo a ON a.id = ap.ativo_id AND a.excluido_em IS NULL
       WHERE ap.peca_id = ?
       ORDER BY a.nome`,
    [pecaId]
  )) as unknown as Omit<AtivoDaPeca, "caminho">[];
  return Promise.all(rows.map(async (r) => ({ ...r, caminho: await caminhoAtivo(r.ativo_id) })));
}

export interface DadosVinculo {
  peca_id: number;
  quantidade_padrao: number;
  aplicacao?: string | null;
  posicao?: string;
  troca_obrigatoria?: boolean;
  observacao?: string | null;
}

export class ErroValidacaoVinculo extends Error {}

function ehErroDeDuplicidade(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

async function inserirVinculo(ativoId: number, dados: DadosVinculo): Promise<number> {
  const info = await dbRun(
    `INSERT INTO ativo_peca (ativo_id, peca_id, quantidade_padrao, aplicacao, posicao, troca_obrigatoria, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      ativoId,
      dados.peca_id,
      dados.quantidade_padrao,
      dados.aplicacao ?? null,
      dados.posicao ?? "",
      dados.troca_obrigatoria ? 1 : 0,
      dados.observacao ?? null,
    ]
  );
  return info.id!;
}

export async function vincularPeca(
  ativoId: number,
  dados: DadosVinculo,
  usuarioId: number,
  propagarParaFilhos = false
): Promise<{ vinculo: PecaDoAtivo; propagadosParaFilhos: number }> {
  const ativo = await buscarAtivoPorId(ativoId);
  if (!ativo) {
    throw new ErroValidacaoVinculo("Ativo não encontrado.");
  }
  const peca = buscarPecaPorId(dados.peca_id);
  if (!peca) {
    throw new ErroValidacaoVinculo("Peça não encontrada.");
  }

  let novoId: number;
  try {
    novoId = await inserirVinculo(ativoId, dados);
  } catch (err) {
    if (ehErroDeDuplicidade(err)) {
      throw new ErroValidacaoVinculo("Esta peça já está vinculada a este ativo nesta posição.");
    }
    throw err;
  }

  let propagadosParaFilhos = 0;
  if (propagarParaFilhos) {
    for (const filho of await filhosDiretos(ativoId)) {
      try {
        await inserirVinculo(filho.id, dados);
        propagadosParaFilhos++;
      } catch (err) {
        if (!ehErroDeDuplicidade(err)) throw err;
      }
    }
  }

  const vinculo = (await listarPecasDoAtivo(ativoId)).find((v) => v.id === novoId)!;
  await registrarAuditoria({ entidade: "ativo_peca", entidade_id: novoId, acao: "criar", valor_novo: vinculo, usuario_id: usuarioId });
  return { vinculo, propagadosParaFilhos };
}

export async function atualizarVinculo(vinculoId: number, dados: DadosVinculo, usuarioId: number): Promise<PecaDoAtivo> {
  const anterior = (await dbGet("SELECT * FROM ativo_peca WHERE id = ?", [vinculoId])) as
    | { ativo_id: number }
    | undefined;
  if (!anterior) {
    throw new ErroValidacaoVinculo("Vínculo não encontrado.");
  }

  try {
    await dbRun(
      `UPDATE ativo_peca SET quantidade_padrao = ?, aplicacao = ?, posicao = ?, troca_obrigatoria = ?, observacao = ?
       WHERE id = ?`,
      [
        dados.quantidade_padrao,
        dados.aplicacao ?? null,
        dados.posicao ?? "",
        dados.troca_obrigatoria ? 1 : 0,
        dados.observacao ?? null,
        vinculoId,
      ]
    );
  } catch (err) {
    if (ehErroDeDuplicidade(err)) {
      throw new ErroValidacaoVinculo("Já existe um vínculo desta peça com este ativo nesta posição.");
    }
    throw err;
  }

  const vinculo = (await listarPecasDoAtivo(anterior.ativo_id)).find((v) => v.id === vinculoId)!;
  await registrarAuditoria({
    entidade: "ativo_peca",
    entidade_id: vinculoId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: vinculo,
    usuario_id: usuarioId,
  });
  return vinculo;
}

export async function removerVinculo(vinculoId: number, usuarioId: number): Promise<void> {
  const anterior = await dbGet("SELECT * FROM ativo_peca WHERE id = ?", [vinculoId]);
  if (!anterior) {
    throw new ErroValidacaoVinculo("Vínculo não encontrado.");
  }
  await dbRun("DELETE FROM ativo_peca WHERE id = ?", [vinculoId]);
  await registrarAuditoria({ entidade: "ativo_peca", entidade_id: vinculoId, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}

export async function copiarListaTecnica(
  ativoDestinoId: number,
  ativoOrigemId: number,
  pecaIds: number[],
  usuarioId: number
): Promise<{ copiados: number; pulados: number }> {
  if (ativoDestinoId === ativoOrigemId) {
    throw new ErroValidacaoVinculo("Escolha um ativo de origem diferente do ativo atual.");
  }
  if (!(await buscarAtivoPorId(ativoDestinoId)) || !(await buscarAtivoPorId(ativoOrigemId))) {
    throw new ErroValidacaoVinculo("Ativo de origem ou destino não encontrado.");
  }

  const vinculosOrigem = (await listarPecasDoAtivo(ativoOrigemId)).filter((v) => pecaIds.includes(v.peca_id));
  let copiados = 0;
  let pulados = 0;
  for (const v of vinculosOrigem) {
    try {
      const novoId = await inserirVinculo(ativoDestinoId, {
        peca_id: v.peca_id,
        quantidade_padrao: v.quantidade_padrao,
        aplicacao: v.aplicacao,
        posicao: v.posicao,
        troca_obrigatoria: !!v.troca_obrigatoria,
        observacao: v.observacao,
      });
      await registrarAuditoria({
        entidade: "ativo_peca",
        entidade_id: novoId,
        acao: "criar",
        valor_novo: { ...v, ativo_id: ativoDestinoId, copiado_de_ativo_id: ativoOrigemId },
        usuario_id: usuarioId,
      });
      copiados++;
    } catch (err) {
      if (ehErroDeDuplicidade(err)) {
        pulados++;
      } else {
        throw err;
      }
    }
  }
  return { copiados, pulados };
}
