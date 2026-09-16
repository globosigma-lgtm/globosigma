import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import type { UnidadeMedida } from "./pecaService.js";
import { buscarAtivoPorId } from "./ativoService.js";
import { registrarSaida, registrarDevolucao, ErroValidacaoEstoque } from "./estoqueService.js";
import { buscarOSPorId, aguardarPecaOS, ErroValidacaoOS } from "./osService.js";
import { criarNotificacao } from "./notificacaoService.js";

export type TipoServicoExterno = "usinagem" | "solda" | "retifica" | "calibracao" | "pintura" | "outro";
export type StatusLogisticoServicoExterno = "pendente_envio" | "enviado" | "retornado" | "cancelado";
export type StatusPagamentoServicoExterno = "pendente" | "parcial" | "pago";

export class ErroValidacaoServicoExterno extends Error {}

export interface ServicoExterno {
  id: number;
  codigo: string;
  os_id: number;
  os_codigo: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  // SRVEXT-COMP-01: peca_id/peca_codigo/peca_descricao ficam só como histórico de registros
  // criados antes da mudança pra Ativo/Componente — leitura, sem novos vínculos (ver
  // criarServicoExterno). item_ativo_id é o Ativo (equipamento) ou Componente (ativo com
  // ativo_pai_id preenchido) efetivamente enviado, usado por todo registro novo.
  peca_id: number | null;
  peca_codigo: string | null;
  peca_descricao: string | null;
  unidade_medida: UnidadeMedida | null;
  item_ativo_id: number | null;
  item_ativo_codigo: string | null;
  item_ativo_nome: string | null;
  item_ativo_tipo: string | null;
  item_ativo_pai_id: number | null;
  item_ativo_pai_nome: string | null;
  descricao_item: string;
  quantidade: number;
  fornecedor_id: number;
  fornecedor_nome: string;
  tipo_servico: TipoServicoExterno;
  motivo: string | null;
  status_logistico: StatusLogisticoServicoExterno;
  status_pagamento: StatusPagamentoServicoExterno;
  data_previsao_retorno: string | null;
  data_envio: string | null;
  data_retorno: string | null;
  documento_saida: string | null;
  devolvido_ao_estoque: number;
  valor_orcado: number | null;
  valor_cobrado: number | null;
  valor_pago: number | null;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  motivo_cancelamento: string | null;
  observacoes: string | null;
  responsavel_id: number;
  responsavel_nome: string;
  criado_em: string;
  criado_por: number;
}

const COLUNAS = `
  se.id, se.codigo, se.os_id, os.codigo AS os_codigo, se.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
  se.peca_id, p.codigo AS peca_codigo, p.descricao AS peca_descricao, p.unidade_medida,
  se.item_ativo_id, ia.codigo AS item_ativo_codigo, ia.nome AS item_ativo_nome, ia.tipo AS item_ativo_tipo,
  ia.ativo_pai_id AS item_ativo_pai_id, iap.nome AS item_ativo_pai_nome,
  se.descricao_item, se.quantidade, se.fornecedor_id, f.nome AS fornecedor_nome, se.tipo_servico, se.motivo,
  se.status_logistico, se.status_pagamento, se.data_previsao_retorno, se.data_envio, se.data_retorno,
  se.documento_saida, se.devolvido_ao_estoque, se.valor_orcado, se.valor_cobrado, se.valor_pago,
  se.data_pagamento, se.forma_pagamento, se.motivo_cancelamento, se.observacoes,
  se.responsavel_id, u.nome AS responsavel_nome, se.criado_em, se.criado_por
`;

const FROM = `
  FROM servico_externo se
  JOIN ordem_servico os ON os.id = se.os_id
  JOIN ativo a ON a.id = se.ativo_id
  JOIN fornecedor f ON f.id = se.fornecedor_id
  JOIN usuario u ON u.id = se.responsavel_id
  LEFT JOIN peca p ON p.id = se.peca_id
  LEFT JOIN ativo ia ON ia.id = se.item_ativo_id
  LEFT JOIN ativo iap ON iap.id = ia.ativo_pai_id
`;

export interface FiltrosServicoExterno {
  osId?: number;
  statusLogistico?: StatusLogisticoServicoExterno;
  statusPagamento?: StatusPagamentoServicoExterno;
  texto?: string;
}

export async function listarServicosExternos(filtros: FiltrosServicoExterno = {}): Promise<ServicoExterno[]> {
  const condicoes: string[] = ["se.excluido_em IS NULL"];
  const params: unknown[] = [];
  if (filtros.osId) {
    condicoes.push("se.os_id = ?");
    params.push(filtros.osId);
  }
  if (filtros.statusLogistico) {
    condicoes.push("se.status_logistico = ?");
    params.push(filtros.statusLogistico);
  }
  if (filtros.statusPagamento) {
    condicoes.push("se.status_pagamento = ?");
    params.push(filtros.statusPagamento);
  }
  if (filtros.texto) {
    condicoes.push("(se.codigo ILIKE ? OR se.descricao_item ILIKE ? OR f.nome ILIKE ? OR os.codigo ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`, `%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  const sql = `SELECT ${COLUNAS} ${FROM} WHERE ${condicoes.join(" AND ")} ORDER BY se.criado_em DESC`;
  return (await dbAll(sql, params)) as unknown as ServicoExterno[];
}

export async function buscarServicoExternoPorId(id: number): Promise<ServicoExterno | null> {
  const row = (await dbGet(`SELECT ${COLUNAS} ${FROM} WHERE se.id = ? AND se.excluido_em IS NULL`, [id])) as ServicoExterno | undefined;
  return row ?? null;
}

export async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM servico_externo WHERE codigo LIKE 'SE-%'")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("SE-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `SE-${String(maior + 1).padStart(4, "0")}`;
}

/**
 * O estoque tem sua própria validação (ex.: saldo insuficiente para dar baixa) que lança
 * ErroValidacaoEstoque — sem traduzir para ErroValidacaoServicoExterno aqui, a rota não reconhece
 * o erro (só trata ErroValidacaoServicoExterno) e ele vira "erro interno do servidor" (500) em vez
 * de uma mensagem de validação (400) pro usuário.
 */
async function comTraducaoDeErroDeEstoque<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ErroValidacaoEstoque) {
      throw new ErroValidacaoServicoExterno(err.message);
    }
    throw err;
  }
}

async function exigirServicoExterno(id: number): Promise<ServicoExterno> {
  const s = await buscarServicoExternoPorId(id);
  if (!s) throw new ErroValidacaoServicoExterno("Registro de serviço externo não encontrado.");
  return s;
}

export interface DadosServicoExterno {
  os_id: number;
  // SRVEXT-COMP-01: todo registro novo aponta pra um Ativo (equipamento) ou Componente de Ativo
  // (ativo com ativo_pai_id preenchido) — peca_id não é mais aceito na criação, só existe em
  // registros antigos (ver ServicoExterno.peca_id).
  item_ativo_id: number;
  descricao_item: string;
  quantidade?: number;
  fornecedor_id: number;
  tipo_servico: TipoServicoExterno;
  motivo?: string | null;
  data_previsao_retorno?: string | null;
  valor_orcado?: number | null;
  observacoes?: string | null;
}

export async function criarServicoExterno(dados: DadosServicoExterno, usuarioId: number): Promise<ServicoExterno> {
  const os = await buscarOSPorId(dados.os_id);
  if (!os) {
    throw new ErroValidacaoServicoExterno("OS não encontrada.");
  }
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoServicoExterno("Não é possível registrar saída para serviço externo numa OS concluída ou cancelada.");
  }
  if (!dados.descricao_item.trim()) {
    throw new ErroValidacaoServicoExterno("Descreva o item que vai para o serviço externo.");
  }
  if (!(await buscarAtivoPorId(dados.item_ativo_id))) {
    throw new ErroValidacaoServicoExterno("Ativo ou componente não encontrado.");
  }
  const quantidade = dados.quantidade ?? 1;
  if (quantidade <= 0) {
    throw new ErroValidacaoServicoExterno("Informe uma quantidade maior que zero.");
  }

  const codigo = await codigoSugerido();
  const info = await dbRun(
    `INSERT INTO servico_externo
         (codigo, os_id, ativo_id, item_ativo_id, descricao_item, quantidade, fornecedor_id, tipo_servico, motivo,
          data_previsao_retorno, valor_orcado, observacoes, responsavel_id, criado_por, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`,
    [
      codigo,
      dados.os_id,
      os.ativo_id,
      dados.item_ativo_id,
      dados.descricao_item.trim(),
      quantidade,
      dados.fornecedor_id,
      dados.tipo_servico,
      dados.motivo?.trim() || null,
      dados.data_previsao_retorno || null,
      dados.valor_orcado ?? null,
      dados.observacoes?.trim() || null,
      usuarioId,
      usuarioId,
    ]
  );

  const novo = (await buscarServicoExternoPorId(info.id!))!;
  await registrarAuditoria({ entidade: "servico_externo", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

async function mudarStatusLogistico(
  s: ServicoExterno,
  novoStatus: StatusLogisticoServicoExterno,
  usuarioId: number,
  camposExtra: Record<string, unknown> = {}
): Promise<ServicoExterno> {
  const colunas = Object.keys(camposExtra);
  const sets = ["status_logistico = ?", ...colunas.map((c) => `${c} = ?`)];
  const valores: unknown[] = [novoStatus, ...colunas.map((c) => camposExtra[c]), s.id];
  await dbRun(`UPDATE servico_externo SET ${sets.join(", ")} WHERE id = ?`, valores);
  const atualizado = (await buscarServicoExternoPorId(s.id))!;
  await registrarAuditoria({
    entidade: "servico_externo",
    entidade_id: s.id,
    acao: "status",
    valor_anterior: s,
    valor_novo: atualizado,
    usuario_id: usuarioId,
  });
  return atualizado;
}

export interface DadosEnvio {
  data_envio?: string | null;
  documento_saida?: string | null;
}

/**
 * Só dá baixa de verdade no estoque quando o item enviado é uma peça catalogada (peca_id
 * presente) — um componente do próprio ativo (sem peca_id) não tem saldo de estoque para
 * movimentar, só o rastro no próprio registro de serviço externo.
 * Tenta colocar a OS em "aguardando peça" (best-effort: se a OS não estiver em execução, a
 * transição simplesmente não é aplicada — o controle do serviço externo não deve travar por
 * causa do status da OS).
 */
export async function enviarServicoExterno(id: number, dados: DadosEnvio, usuarioId: number): Promise<ServicoExterno> {
  const s = await exigirServicoExterno(id);
  if (s.status_logistico !== "pendente_envio") {
    throw new ErroValidacaoServicoExterno('Somente um item "pendente de envio" pode ser marcado como enviado.');
  }
  const dataEnvio = dados.data_envio || new Date().toISOString();
  if (s.peca_id) {
    await comTraducaoDeErroDeEstoque(() =>
      registrarSaida(s.peca_id!, s.quantidade, `Saída para serviço externo ${s.codigo} (${s.tipo_servico})`, usuarioId, s.os_id)
    );
  }
  const atualizado = await mudarStatusLogistico(s, "enviado", usuarioId, {
    data_envio: dataEnvio,
    documento_saida: dados.documento_saida?.trim() || null,
  });

  try {
    await aguardarPecaOS(s.os_id, usuarioId);
  } catch (err) {
    if (!(err instanceof ErroValidacaoOS)) throw err;
  }

  return atualizado;
}

export interface DadosRetorno {
  data_retorno?: string | null;
  devolver_ao_estoque?: boolean;
}

/**
 * A devolução ao estoque geral é opcional e explícita: o normal é a peça reinstalada de volta
 * no próprio ativo (fora do controle do almoxarifado), não recolocada na prateleira. Só quando o
 * usuário marca `devolver_ao_estoque` é que uma entrada real é lançada no kardex.
 */
export async function retornarServicoExterno(id: number, dados: DadosRetorno, usuarioId: number): Promise<ServicoExterno> {
  const s = await exigirServicoExterno(id);
  if (s.status_logistico !== "enviado") {
    throw new ErroValidacaoServicoExterno('Somente um item "enviado" pode ser marcado como retornado.');
  }
  const dataRetorno = dados.data_retorno || new Date().toISOString();
  const devolverAoEstoque = !!dados.devolver_ao_estoque && !!s.peca_id;
  if (devolverAoEstoque) {
    await comTraducaoDeErroDeEstoque(() => registrarDevolucao(s.peca_id!, s.quantidade, `Retorno de serviço externo ${s.codigo}`, usuarioId, s.os_id));
  }
  const atualizado = await mudarStatusLogistico(s, "retornado", usuarioId, {
    data_retorno: dataRetorno,
    devolvido_ao_estoque: devolverAoEstoque ? 1 : 0,
  });

  criarNotificacao({
    usuario_id: s.responsavel_id,
    tipo: "servico_externo_retornado",
    titulo: `${s.descricao_item} voltou do serviço externo (${s.codigo})`,
    mensagem: `OS ${s.os_codigo} pode prosseguir.`,
    entidade: "ordem_servico",
    entidade_id: s.os_id,
  });

  return atualizado;
}

export async function cancelarServicoExterno(id: number, motivo: string, usuarioId: number): Promise<ServicoExterno> {
  const s = await exigirServicoExterno(id);
  if (s.status_logistico === "retornado" || s.status_logistico === "cancelado") {
    throw new ErroValidacaoServicoExterno("Este registro já está retornado ou cancelado.");
  }
  if (!motivo.trim()) {
    throw new ErroValidacaoServicoExterno("Informe o motivo do cancelamento.");
  }
  if (s.status_logistico === "enviado" && s.peca_id) {
    await comTraducaoDeErroDeEstoque(() =>
      registrarDevolucao(s.peca_id!, s.quantidade, `Cancelamento do serviço externo ${s.codigo} — estorno da saída`, usuarioId, s.os_id)
    );
  }
  return mudarStatusLogistico(s, "cancelado", usuarioId, { motivo_cancelamento: motivo.trim() });
}

export interface DadosPagamento {
  status_pagamento: StatusPagamentoServicoExterno;
  valor_cobrado?: number | null;
  valor_pago?: number | null;
  data_pagamento?: string | null;
  forma_pagamento?: string | null;
}

/**
 * SERV-EXT-06: pagamento trava junto com o encerramento da OS (concluída ou cancelada) — a
 * exigência é que tudo esteja quitado ANTES de concluir (ver concluirOS em osService.ts); depois
 * disso, reabrir a OS é o caminho para corrigir um pagamento, não editar por aqui.
 */
export async function registrarPagamento(id: number, dados: DadosPagamento, usuarioId: number): Promise<ServicoExterno> {
  const s = await exigirServicoExterno(id);
  if (s.status_logistico === "cancelado") {
    throw new ErroValidacaoServicoExterno("Este registro foi cancelado — não há pagamento a controlar.");
  }
  const os = await buscarOSPorId(s.os_id);
  if (os && (os.status === "concluida" || os.status === "cancelada")) {
    throw new ErroValidacaoServicoExterno(`A OS ${os.codigo} já está encerrada — reabra a OS para corrigir o pagamento.`);
  }
  await dbRun(
    `UPDATE servico_externo SET status_pagamento = ?, valor_cobrado = ?, valor_pago = ?, data_pagamento = ?, forma_pagamento = ? WHERE id = ?`,
    [
      dados.status_pagamento,
      dados.valor_cobrado ?? s.valor_cobrado,
      dados.valor_pago ?? s.valor_pago,
      dados.data_pagamento || s.data_pagamento,
      dados.forma_pagamento?.trim() || s.forma_pagamento,
      id,
    ]
  );
  const atualizado = (await buscarServicoExternoPorId(id))!;
  await registrarAuditoria({
    entidade: "servico_externo",
    entidade_id: id,
    acao: "editar",
    valor_anterior: s,
    valor_novo: atualizado,
    usuario_id: usuarioId,
  });
  return atualizado;
}

/** Usada pelo osService: uma OS não deveria concluir enquanto ainda há peça fora da empresa. */
export async function existeServicoExternoPendente(osId: number): Promise<boolean> {
  const row = (await dbGet(
    `SELECT COUNT(*) AS n FROM servico_externo WHERE os_id = ? AND status_logistico IN ('pendente_envio','enviado') AND excluido_em IS NULL`,
    [osId]
  )) as { n: number };
  return row.n > 0;
}
