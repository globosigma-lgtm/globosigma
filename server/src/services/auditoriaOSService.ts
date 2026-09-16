import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { caminhoAtivo } from "./ativoService.js";
import { criarNotificacao } from "./notificacaoService.js";
import {
  buscarOSPorId,
  codigoSugerido,
  concluirOS,
  type OrdemServico,
  type PrioridadeOS,
  type ResultadoInspecao,
} from "./osService.js";

export interface OSPendenteAuditoria {
  id: number;
  codigo: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  tipo: string;
  descricao: string | null;
  responsavel_nome: string | null;
  data_conclusao: string | null;
}

export interface FiltrosOSPendenteAuditoria {
  ativoId?: number;
  texto?: string;
}

/**
 * Lista OS concluídas ainda não conferidas em campo — candidatas a receber uma inspeção de
 * auditoria. Exclui as próprias OS de auditoria (subtipo_inspecao = 'auditoria_os'), já que
 * conferir uma conferência não faz sentido no fluxo pedido pelo usuário.
 */
export async function listarOSPendentesAuditoria(filtros: FiltrosOSPendenteAuditoria = {}): Promise<OSPendenteAuditoria[]> {
  const condicoes = [
    "os.status = 'concluida'",
    "os.auditoria_status = 'nao_auditada'",
    "(os.subtipo_inspecao IS NULL OR os.subtipo_inspecao != 'auditoria_os')",
    "os.excluido_em IS NULL",
  ];
  const params: unknown[] = [];
  if (filtros.ativoId) {
    condicoes.push("os.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.texto) {
    condicoes.push("(os.codigo ILIKE ? OR os.descricao ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  const sql = `
    SELECT os.id, os.codigo, os.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
           os.tipo, os.descricao, u.nome AS responsavel_nome, os.data_conclusao
    FROM ordem_servico os
    JOIN ativo a ON a.id = os.ativo_id
    LEFT JOIN usuario u ON u.id = os.responsavel_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY os.data_conclusao DESC
  `;
  const rows = (await dbAll(sql, params)) as unknown as OSPendenteAuditoria[];
  return Promise.all(rows.map(async (r) => ({ ...r, ativo_caminho: await caminhoAtivo(r.ativo_id) })));
}

export interface DadosAtribuirAuditoria {
  data_programada: string;
  data_limite: string;
  prioridade: PrioridadeOS;
}

export class ErroValidacaoAuditoria extends Error {}

/**
 * Cria a OS de conferência (tipo 'inspecao', subtipo 'auditoria_os') a partir de uma OS já
 * concluída, atribuída de cara a um inspetor, e copia o checklist original para
 * os_tarefa_auditoria — cada linha é a conferência do inspetor sobre um item já respondido pelo
 * técnico, sem mexer no os_tarefa original.
 */
export async function atribuirAuditoria(
  osAuditadaId: number,
  inspetorId: number,
  dados: DadosAtribuirAuditoria,
  usuarioId: number
): Promise<OrdemServico> {
  const osAuditada = await buscarOSPorId(osAuditadaId);
  if (!osAuditada) {
    throw new ErroValidacaoAuditoria("OS a auditar não encontrada.");
  }
  if (osAuditada.status !== "concluida") {
    throw new ErroValidacaoAuditoria("Só é possível auditar uma OS concluída.");
  }
  if (osAuditada.subtipo_inspecao === "auditoria_os") {
    throw new ErroValidacaoAuditoria("Não é possível auditar uma OS que já é, ela mesma, uma auditoria.");
  }
  const inspetor = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [inspetorId]);
  if (!inspetor) {
    throw new ErroValidacaoAuditoria("O inspetor selecionado não existe.");
  }
  if (dados.data_limite < dados.data_programada) {
    throw new ErroValidacaoAuditoria("A data limite não pode ser anterior à data programada.");
  }

  const codigo = await codigoSugerido();
  const info = await dbRun(
    `INSERT INTO ordem_servico (
        codigo, ativo_id, os_auditada_id, tipo, subtipo_inspecao, origem, prioridade, status,
        descricao, data_programada, data_limite, responsavel_id, horas_estimadas, data_abertura
      ) VALUES (?, ?, ?, 'inspecao', 'auditoria_os', 'avulsa', ?, 'aberta', ?, ?, ?, ?, 0, (now() - interval '4 hours')) RETURNING id`,
    [
      codigo,
      osAuditada.ativo_id,
      osAuditadaId,
      dados.prioridade,
      `Conferência em campo da execução de ${osAuditada.codigo}`,
      dados.data_programada,
      dados.data_limite,
      inspetorId,
    ]
  );
  const osAuditoriaId = info.id!;

  const itensOriginais = await dbAll<{ id: number }>("SELECT id FROM os_tarefa WHERE os_id = ? ORDER BY ordem", [osAuditadaId]);
  for (const item of itensOriginais) {
    await dbRun(
      "INSERT INTO os_tarefa_auditoria (os_auditoria_id, os_tarefa_original_id) VALUES (?, ?)",
      [osAuditoriaId, item.id]
    );
  }

  const nova = (await buscarOSPorId(osAuditoriaId))!;
  await registrarAuditoria({ entidade: "ordem_servico", entidade_id: osAuditoriaId, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  await criarNotificacao({
    usuario_id: inspetorId,
    tipo: "os_atribuida",
    titulo: `Você foi atribuído à conferência ${nova.codigo}`,
    mensagem: nova.descricao,
    entidade: "ordem_servico",
    entidade_id: osAuditoriaId,
  });
  return nova;
}

export interface ItemAuditoria {
  id: number;
  os_auditoria_id: number;
  os_tarefa_original_id: number;
  conformidade: "conforme" | "divergente" | null;
  observacao: string | null;
  descricao: string;
  tipo_resposta: string;
  resposta: string | null;
  valor_numerico: number | null;
  concluida: number;
}

export async function listarItensAuditoria(osAuditoriaId: number): Promise<ItemAuditoria[]> {
  return (await dbAll(
    `SELECT ta.id, ta.os_auditoria_id, ta.os_tarefa_original_id, ta.conformidade, ta.observacao,
            ot.descricao, ot.tipo_resposta, ot.resposta, ot.valor_numerico, ot.concluida
     FROM os_tarefa_auditoria ta
     JOIN os_tarefa ot ON ot.id = ta.os_tarefa_original_id
     WHERE ta.os_auditoria_id = ?
     ORDER BY ot.ordem`,
    [osAuditoriaId]
  )) as unknown as ItemAuditoria[];
}

export interface DadosRespostaAuditoria {
  conformidade: "conforme" | "divergente";
  observacao?: string | null;
}

export async function responderItemAuditoria(
  osAuditoriaId: number,
  itemId: number,
  dados: DadosRespostaAuditoria,
  usuarioId: number
): Promise<ItemAuditoria> {
  const os = await buscarOSPorId(osAuditoriaId);
  if (!os) {
    throw new ErroValidacaoAuditoria("OS de auditoria não encontrada.");
  }
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoAuditoria("Não é possível alterar a conferência de uma auditoria concluída ou cancelada.");
  }
  const anterior = await dbGet("SELECT * FROM os_tarefa_auditoria WHERE id = ? AND os_auditoria_id = ?", [itemId, osAuditoriaId]);
  if (!anterior) {
    throw new ErroValidacaoAuditoria("Item de conferência não encontrado.");
  }
  await dbRun("UPDATE os_tarefa_auditoria SET conformidade = ?, observacao = ? WHERE id = ?", [
    dados.conformidade,
    dados.observacao?.trim() || null,
    itemId,
  ]);
  const [novo] = (await listarItensAuditoria(osAuditoriaId)).filter((i) => i.id === itemId);
  await registrarAuditoria({
    entidade: "os_tarefa_auditoria",
    entidade_id: itemId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: novo,
    usuario_id: usuarioId,
  });
  return novo;
}

export interface DadosConclusaoAuditoria {
  resultado_inspecao: ResultadoInspecao;
  observacoes_execucao?: string | null;
  data_conclusao?: string | null;
}

/**
 * Reaproveita o gate de conclusão de concluirOS (osService.ts) — a OS de auditoria não tem
 * checklist/peças próprios (só os_tarefa_auditoria, que não é o que concluirOS verifica), então
 * a validação específica deste fluxo (todo item conferido) é feita aqui antes de delegar.
 */
export async function concluirAuditoria(osAuditoriaId: number, dados: DadosConclusaoAuditoria, usuarioId: number): Promise<OrdemServico> {
  const os = await buscarOSPorId(osAuditoriaId);
  if (!os || os.subtipo_inspecao !== "auditoria_os") {
    throw new ErroValidacaoAuditoria("OS de auditoria não encontrada.");
  }
  const itens = await listarItensAuditoria(osAuditoriaId);
  const pendentes = itens.filter((i) => !i.conformidade);
  if (pendentes.length > 0) {
    throw new ErroValidacaoAuditoria(`Existem ${pendentes.length} item(ns) do checklist original ainda não conferido(s).`);
  }

  const concluida = await concluirOS(
    osAuditoriaId,
    { observacoes_execucao: dados.observacoes_execucao, data_conclusao: dados.data_conclusao },
    usuarioId
  );
  await dbRun("UPDATE ordem_servico SET resultado_inspecao = ? WHERE id = ?", [dados.resultado_inspecao, osAuditoriaId]);

  if (os.os_auditada_id) {
    const statusFinal = itens.every((i) => i.conformidade === "conforme") ? "conforme" : "divergente";
    await dbRun("UPDATE ordem_servico SET auditoria_status = ? WHERE id = ?", [statusFinal, os.os_auditada_id]);
    await registrarAuditoria({
      entidade: "ordem_servico",
      entidade_id: os.os_auditada_id,
      acao: "editar",
      valor_anterior: { auditoria_status: "nao_auditada" },
      valor_novo: { auditoria_status: statusFinal },
      usuario_id: usuarioId,
    });
  }

  return (await buscarOSPorId(osAuditoriaId))! ?? concluida;
}
