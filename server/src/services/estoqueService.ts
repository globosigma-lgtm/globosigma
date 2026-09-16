import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarPecaPorId } from "./pecaService.js";
import type { UnidadeMedida } from "./pecaService.js";
import { criarNotificacao, usuariosComPermissao } from "./notificacaoService.js";

export type TipoMovimento = "entrada" | "saida" | "ajuste" | "transferencia" | "devolucao";
export type StatusReserva = "reservada" | "consumida" | "liberada";

export class ErroValidacaoEstoque extends Error {}

/**
 * `quantidade` em movimento_estoque é sempre o delta assinado realmente aplicado ao saldo
 * (positivo = entrou, negativo = saiu, zero = transferência, que só muda localização). Isso
 * mantém a invariante SUM(quantidade) até uma data = saldo naquela data, sem precisar olhar o
 * campo `tipo` para saber o sinal.
 */
export interface MovimentoEstoque {
  id: number;
  peca_id: number;
  tipo: TipoMovimento;
  quantidade: number;
  saldo_apos: number;
  custo_unitario: number | null;
  os_id: number | null;
  os_codigo: string | null;
  requisicao_compra_id: number | null;
  motivo: string | null;
  data: string;
  usuario_id: number;
  usuario_nome: string;
  peca_codigo: string;
  peca_descricao: string;
  unidade_medida: UnidadeMedida;
}

const COLUNAS_MOVIMENTO = `
  m.id, m.peca_id, m.tipo, m.quantidade, m.saldo_apos, m.custo_unitario, m.os_id, os.codigo AS os_codigo,
  m.requisicao_compra_id, m.motivo, m.data, m.usuario_id, u.nome AS usuario_nome,
  p.codigo AS peca_codigo, p.descricao AS peca_descricao, p.unidade_medida
`;

async function buscarMovimentoPorId(id: number): Promise<MovimentoEstoque> {
  return (await dbGet(
    `SELECT ${COLUNAS_MOVIMENTO}
       FROM movimento_estoque m
       JOIN peca p ON p.id = m.peca_id
       JOIN usuario u ON u.id = m.usuario_id
       LEFT JOIN ordem_servico os ON os.id = m.os_id
       WHERE m.id = ?`,
    [id]
  )) as unknown as MovimentoEstoque;
}

export interface FiltrosMovimento {
  pecaId?: number;
  tipo?: string;
  dataInicio?: string;
  dataFim?: string;
}

export async function listarMovimentos(filtros: FiltrosMovimento = {}): Promise<MovimentoEstoque[]> {
  const condicoes: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filtros.pecaId) {
    condicoes.push("m.peca_id = ?");
    params.push(filtros.pecaId);
  }
  if (filtros.tipo) {
    condicoes.push("m.tipo = ?");
    params.push(filtros.tipo);
  }
  if (filtros.dataInicio) {
    condicoes.push("m.data >= ?");
    params.push(filtros.dataInicio);
  }
  if (filtros.dataFim) {
    condicoes.push("m.data <= ?");
    params.push(`${filtros.dataFim} 23:59:59`);
  }
  const sql = `
    SELECT ${COLUNAS_MOVIMENTO}
    FROM movimento_estoque m
    JOIN peca p ON p.id = m.peca_id
    JOIN usuario u ON u.id = m.usuario_id
    LEFT JOIN ordem_servico os ON os.id = m.os_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY m.data DESC, m.id DESC
    LIMIT 300
  `;
  return (await dbAll(sql, params)) as unknown as MovimentoEstoque[];
}

interface ParametrosMovimento {
  pecaId: number;
  tipo: TipoMovimento;
  delta: number;
  custoUnitario: number | null;
  motivo: string | null;
  usuarioId: number;
  osId?: number | null;
}

async function inserirMovimento(params: ParametrosMovimento): Promise<MovimentoEstoque> {
  const peca = await buscarPecaPorId(params.pecaId);
  if (!peca) {
    throw new ErroValidacaoEstoque("Peça não encontrada.");
  }
  const novoSaldo = peca.estoque_atual + params.delta;
  if (novoSaldo < 0) {
    throw new ErroValidacaoEstoque(
      `Estoque insuficiente para esta baixa: saldo atual é ${peca.estoque_atual} ${peca.unidade_medida}.`
    );
  }

  await dbRun("UPDATE peca SET estoque_atual = ? WHERE id = ?", [novoSaldo, params.pecaId]);
  const info = await dbRun(
    `INSERT INTO movimento_estoque (peca_id, tipo, quantidade, saldo_apos, custo_unitario, os_id, motivo, usuario_id, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`,
    [params.pecaId, params.tipo, params.delta, novoSaldo, params.custoUnitario, params.osId ?? null, params.motivo ?? null, params.usuarioId]
  );

  const novo = await buscarMovimentoPorId(info.id!);
  await registrarAuditoria({ entidade: "movimento_estoque", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: params.usuarioId });

  // CAMPO-01: avisa quem cuida do almoxarifado só no instante em que o saldo cruza para "crítico"
  // (não a cada movimento abaixo dele), pra não virar spam de notificação repetida.
  if (params.delta < 0 && peca.estoque_atual > peca.estoque_minimo && novoSaldo <= peca.estoque_minimo) {
    for (const usuarioId of await usuariosComPermissao("almoxarifado", "ver")) {
      await criarNotificacao({
        usuario_id: usuarioId,
        tipo: "ruptura_critica",
        titulo: `${peca.codigo} — ${peca.descricao} entrou em ruptura crítica`,
        mensagem: `Saldo atual: ${novoSaldo} ${peca.unidade_medida} (mínimo: ${peca.estoque_minimo}).`,
        entidade: "peca",
        entidade_id: peca.id,
      });
    }
  }
  return novo;
}

/**
 * Entrada com custo unitário informado recalcula o custo médio ponderado da peça — a única
 * operação que move `custo_unitario_medio` (saída/ajuste/devolução usam o custo médio vigente
 * só como fotografia, sem alterá-lo).
 */
export async function registrarEntrada(
  pecaId: number,
  quantidade: number,
  custoUnitario: number | null,
  motivo: string | null,
  usuarioId: number
): Promise<MovimentoEstoque> {
  if (quantidade <= 0) {
    throw new ErroValidacaoEstoque("Informe uma quantidade de entrada maior que zero.");
  }
  const peca = await buscarPecaPorId(pecaId);
  if (!peca) {
    throw new ErroValidacaoEstoque("Peça não encontrada.");
  }

  const custoRegistrado = custoUnitario ?? peca.custo_unitario_medio;
  const movimento = await inserirMovimento({ pecaId, tipo: "entrada", delta: quantidade, custoUnitario: custoRegistrado, motivo, usuarioId });

  if (custoUnitario != null && custoUnitario >= 0) {
    const valorAnterior = peca.estoque_atual * peca.custo_unitario_medio;
    const valorEntrada = quantidade * custoUnitario;
    const novoTotal = peca.estoque_atual + quantidade;
    const novoCustoMedio = novoTotal > 0 ? (valorAnterior + valorEntrada) / novoTotal : custoUnitario;
    await dbRun("UPDATE peca SET custo_unitario_medio = ? WHERE id = ?", [novoCustoMedio, pecaId]);
  }
  return movimento;
}

export async function registrarSaida(pecaId: number, quantidade: number, motivo: string | null, usuarioId: number, osId?: number | null): Promise<MovimentoEstoque> {
  if (quantidade <= 0) {
    throw new ErroValidacaoEstoque("Informe uma quantidade de saída maior que zero.");
  }
  const peca = await buscarPecaPorId(pecaId);
  return inserirMovimento({ pecaId, tipo: "saida", delta: -quantidade, custoUnitario: peca?.custo_unitario_medio ?? null, motivo, usuarioId, osId });
}

export async function registrarDevolucao(
  pecaId: number,
  quantidade: number,
  motivo: string | null,
  usuarioId: number,
  osId?: number | null
): Promise<MovimentoEstoque> {
  if (quantidade <= 0) {
    throw new ErroValidacaoEstoque("Informe uma quantidade de devolução maior que zero.");
  }
  const peca = await buscarPecaPorId(pecaId);
  return inserirMovimento({ pecaId, tipo: "devolucao", delta: quantidade, custoUnitario: peca?.custo_unitario_medio ?? null, motivo, usuarioId, osId });
}

export async function registrarAjuste(pecaId: number, quantidadeContada: number, motivo: string, usuarioId: number): Promise<MovimentoEstoque> {
  if (quantidadeContada < 0) {
    throw new ErroValidacaoEstoque("A quantidade contada não pode ser negativa.");
  }
  if (!motivo.trim()) {
    throw new ErroValidacaoEstoque("Informe o motivo do ajuste (ex.: resultado de contagem física).");
  }
  const peca = await buscarPecaPorId(pecaId);
  if (!peca) {
    throw new ErroValidacaoEstoque("Peça não encontrada.");
  }
  const delta = quantidadeContada - peca.estoque_atual;
  if (delta === 0) {
    throw new ErroValidacaoEstoque("A quantidade contada é igual ao saldo atual — não há diferença a ajustar.");
  }
  return inserirMovimento({ pecaId, tipo: "ajuste", delta, custoUnitario: peca.custo_unitario_medio, motivo, usuarioId });
}

/**
 * Sem modelagem de múltiplos depósitos no schema — "transferência" aqui não move quantidade
 * (delta 0), só atualiza `peca.localizacao_almoxarifado` e fica registrada no ledger para
 * auditoria de onde a peça estava e para onde foi.
 */
export async function registrarTransferencia(pecaId: number, novaLocalizacao: string, motivo: string | null, usuarioId: number): Promise<MovimentoEstoque> {
  const peca = await buscarPecaPorId(pecaId);
  if (!peca) {
    throw new ErroValidacaoEstoque("Peça não encontrada.");
  }
  if (!novaLocalizacao.trim()) {
    throw new ErroValidacaoEstoque("Informe a localização de destino.");
  }
  const motivoCompleto = `De "${peca.localizacao_almoxarifado ?? "—"}" para "${novaLocalizacao.trim()}"${motivo ? ` — ${motivo}` : ""}`;
  const movimento = await inserirMovimento({ pecaId, tipo: "transferencia", delta: 0, custoUnitario: peca.custo_unitario_medio, motivo: motivoCompleto, usuarioId });
  await dbRun("UPDATE peca SET localizacao_almoxarifado = ? WHERE id = ?", [novaLocalizacao.trim(), pecaId]);
  return movimento;
}

/**
 * Baixa de consumo de uma OS (chamada pelo osService quando a peça é dada como usada). Recebe o
 * delta entre a nova quantidade e a que já estava consumida antes (0 na primeira vez) — permite
 * corrigir um valor já registrado sem duplicar o efeito no estoque: aumentar o consumo gera uma
 * saída adicional; reduzir gera uma devolução da diferença.
 */
export async function baixarConsumoOS(pecaId: number, deltaQuantidade: number, osId: number, usuarioId: number): Promise<void> {
  if (deltaQuantidade === 0) return;
  if (deltaQuantidade > 0) {
    await registrarSaida(pecaId, deltaQuantidade, "Consumo registrado em OS", usuarioId, osId);
  } else {
    await registrarDevolucao(pecaId, -deltaQuantidade, "Correção de consumo registrado em OS", usuarioId, osId);
  }
}

/**
 * Reserva não mexe em peca.estoque_atual — é só um compromisso lógico (Fase 7) que reduz o que
 * está "disponível" para outras OS sem tocar o físico. Espelha o total ativo em
 * os_peca.quantidade_reservada só como cache de leitura para essa linha específica.
 */
export async function criarReserva(osId: number, pecaId: number, quantidade: number): Promise<void> {
  await dbRun(
    "INSERT INTO reserva_peca (peca_id, os_id, quantidade, status, criada_em) VALUES (?, ?, ?, 'reservada', (now() - interval '4 hours'))",
    [pecaId, osId, quantidade]
  );
  await dbRun("UPDATE os_peca SET quantidade_reservada = ? WHERE os_id = ? AND peca_id = ?", [quantidade, osId, pecaId]);
}

export async function consumirReserva(osId: number, pecaId: number): Promise<void> {
  await dbRun(
    `UPDATE reserva_peca SET status = 'consumida', atualizada_em = (now() - interval '4 hours') WHERE os_id = ? AND peca_id = ? AND status = 'reservada'`,
    [osId, pecaId]
  );
  await dbRun("UPDATE os_peca SET quantidade_reservada = 0 WHERE os_id = ? AND peca_id = ?", [osId, pecaId]);
}

export async function liberarReservasDaOS(osId: number): Promise<void> {
  await dbRun(`UPDATE reserva_peca SET status = 'liberada', atualizada_em = (now() - interval '4 hours') WHERE os_id = ? AND status = 'reservada'`, [osId]);
  await dbRun("UPDATE os_peca SET quantidade_reservada = 0 WHERE os_id = ?", [osId]);
}

export async function removerReservaDaLinha(osId: number, pecaId: number): Promise<void> {
  await dbRun("DELETE FROM reserva_peca WHERE os_id = ? AND peca_id = ? AND status = 'reservada'", [osId, pecaId]);
}

/** Usada só na reversão de lote (Fase 5): a OS inteira está sendo excluída, então a reserva não faz mais sentido. */
export async function excluirReservasDaOS(osId: number): Promise<void> {
  await dbRun("DELETE FROM reserva_peca WHERE os_id = ?", [osId]);
}

export interface ReservaPeca {
  id: number;
  peca_id: number;
  os_id: number;
  os_codigo: string;
  quantidade: number;
  status: StatusReserva;
  criada_em: string;
  atualizada_em: string | null;
  peca_codigo: string;
  peca_descricao: string;
  unidade_medida: UnidadeMedida;
}

export async function listarReservas(filtros: { pecaId?: number; status?: StatusReserva } = {}): Promise<ReservaPeca[]> {
  const condicoes: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filtros.pecaId) {
    condicoes.push("r.peca_id = ?");
    params.push(filtros.pecaId);
  }
  if (filtros.status) {
    condicoes.push("r.status = ?");
    params.push(filtros.status);
  }
  const sql = `
    SELECT r.id, r.peca_id, r.os_id, os.codigo AS os_codigo, r.quantidade, r.status, r.criada_em, r.atualizada_em,
           p.codigo AS peca_codigo, p.descricao AS peca_descricao, p.unidade_medida
    FROM reserva_peca r
    JOIN peca p ON p.id = r.peca_id
    JOIN ordem_servico os ON os.id = r.os_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY r.criada_em DESC
  `;
  return (await dbAll(sql, params)) as unknown as ReservaPeca[];
}

export interface AlertaReposicao {
  id: number;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
  estoque_minimo: number;
  ponto_de_pedido: number;
  lead_time_dias: number;
  quantidade_reservada_total: number;
  estoque_disponivel: number;
  nivel: "critico" | "atencao";
}

/**
 * `ponto_de_pedido` só entra na comparação quando está configurado (> 0) — muitas peças no
 * catálogo nunca tiveram esse campo preenchido (fica 0 por padrão), e nesse caso um alerta só
 * faz sentido pelo critério de estoque_minimo. Peças abaixo do mínimo sempre aparecem aqui,
 * independente do ponto de pedido.
 */
export async function listarAlertasReposicao(): Promise<AlertaReposicao[]> {
  const pecas = (await dbAll(
    `SELECT id, codigo, descricao, unidade_medida, estoque_atual, estoque_minimo, ponto_de_pedido, lead_time_dias
       FROM peca
       WHERE ativa = 1 AND excluido_em IS NULL
         AND (estoque_atual <= estoque_minimo OR (ponto_de_pedido > 0 AND estoque_atual <= ponto_de_pedido))
       ORDER BY (estoque_atual - estoque_minimo) ASC`
  )) as (Omit<AlertaReposicao, "quantidade_reservada_total" | "estoque_disponivel" | "nivel">)[];

  return Promise.all(
    pecas.map(async (p) => {
      const reservado = (await dbGet(
        "SELECT COALESCE(SUM(quantidade), 0) AS total FROM reserva_peca WHERE peca_id = ? AND status = 'reservada'",
        [p.id]
      )) as { total: number };
      return {
        ...p,
        quantidade_reservada_total: reservado.total,
        estoque_disponivel: p.estoque_atual - reservado.total,
        nivel: p.estoque_atual <= p.estoque_minimo ? "critico" : "atencao",
      } as AlertaReposicao;
    })
  );
}
