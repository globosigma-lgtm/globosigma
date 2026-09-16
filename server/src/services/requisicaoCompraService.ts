import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarPecaPorId } from "./pecaService.js";
import type { UnidadeMedida } from "./pecaService.js";
import { listarAlertasReposicao, registrarEntrada } from "./estoqueService.js";
import { listarPlanos } from "./planoService.js";
import { listarPecasDoPlano } from "./planoPecaService.js";
import { calcularOcorrencias } from "./recorrenciaService.js";
import { hojeSistema } from "../lib/horarioSistema.js";

export type OrigemRequisicao = "programacao_preventiva" | "ponto_de_pedido" | "manual";
export type StatusRequisicao = "rascunho" | "emitida" | "aprovada" | "em_cotacao" | "pedido_colocado" | "recebida" | "cancelada";

export class ErroValidacaoRequisicao extends Error {}

export interface RequisicaoCompra {
  id: number;
  codigo: string;
  origem: OrigemRequisicao;
  fornecedor: string | null;
  data_necessidade: string | null;
  data_limite_pedido: string | null;
  status: StatusRequisicao;
  observacoes: string | null;
  criada_em: string;
  criada_por: number;
  criada_por_nome: string;
}

export interface ItemRequisicao {
  id: number;
  requisicao_id: number;
  peca_id: number;
  quantidade: number;
  custo_unitario_estimado: number | null;
  data_necessidade: string | null;
  os_vinculadas: string[];
  peca_codigo: string;
  peca_descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
}

const hoje = hojeSistema;

function somarDiasIso(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

const COLUNAS_REQUISICAO = `
  r.id, r.codigo, r.origem, r.fornecedor, r.data_necessidade, r.data_limite_pedido, r.status,
  r.observacoes, r.criada_em, r.criada_por, u.nome AS criada_por_nome
`;

export interface FiltrosRequisicao {
  status?: StatusRequisicao;
  origem?: string;
  texto?: string;
}

export async function listarRequisicoes(filtros: FiltrosRequisicao = {}): Promise<RequisicaoCompra[]> {
  const condicoes: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filtros.status) {
    condicoes.push("r.status = ?");
    params.push(filtros.status);
  }
  if (filtros.origem) {
    condicoes.push("r.origem = ?");
    params.push(filtros.origem);
  }
  if (filtros.texto) {
    condicoes.push("(r.codigo ILIKE ? OR r.fornecedor ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  const sql = `
    SELECT ${COLUNAS_REQUISICAO}
    FROM requisicao_compra r
    JOIN usuario u ON u.id = r.criada_por
    WHERE ${condicoes.join(" AND ")}
    ORDER BY r.criada_em DESC
  `;
  return (await dbAll(sql, params)) as unknown as RequisicaoCompra[];
}

export async function buscarRequisicaoPorId(id: number): Promise<RequisicaoCompra | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS_REQUISICAO} FROM requisicao_compra r JOIN usuario u ON u.id = r.criada_por WHERE r.id = ?`,
    [id]
  )) as RequisicaoCompra | undefined;
  return row ?? null;
}

export async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM requisicao_compra WHERE codigo LIKE 'RC-%'")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("RC-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `RC-${String(maior + 1).padStart(4, "0")}`;
}

function linhaParaItem(row: {
  id: number;
  requisicao_id: number;
  peca_id: number;
  quantidade: number;
  custo_unitario_estimado: number | null;
  data_necessidade: string | null;
  os_vinculadas: string | null;
  peca_codigo: string;
  peca_descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
}): ItemRequisicao {
  return { ...row, os_vinculadas: row.os_vinculadas ? (JSON.parse(row.os_vinculadas) as string[]) : [] };
}

export async function listarItens(requisicaoId: number): Promise<ItemRequisicao[]> {
  const rows = (await dbAll(
    `SELECT ri.id, ri.requisicao_id, ri.peca_id, ri.quantidade, ri.custo_unitario_estimado, ri.data_necessidade, ri.os_vinculadas,
            p.codigo AS peca_codigo, p.descricao AS peca_descricao, p.unidade_medida, p.estoque_atual
     FROM requisicao_compra_item ri
     JOIN peca p ON p.id = ri.peca_id
     WHERE ri.requisicao_id = ?
     ORDER BY p.descricao`,
    [requisicaoId]
  )) as unknown as Parameters<typeof linhaParaItem>[0][];
  return rows.map(linhaParaItem);
}

async function inserirItem(
  requisicaoId: number,
  pecaId: number,
  quantidade: number,
  custoUnitarioEstimado: number | null,
  dataNecessidade: string | null,
  osVinculadas: string[]
): Promise<number> {
  const info = await dbRun(
    `INSERT INTO requisicao_compra_item (requisicao_id, peca_id, quantidade, custo_unitario_estimado, data_necessidade, os_vinculadas)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [requisicaoId, pecaId, quantidade, custoUnitarioEstimado, dataNecessidade, osVinculadas.length ? JSON.stringify(osVinculadas) : null]
  );
  return Number(info.id);
}

export interface DadosRequisicao {
  fornecedor?: string | null;
  data_necessidade?: string | null;
  observacoes?: string | null;
}

export async function criarRequisicao(dados: DadosRequisicao, usuarioId: number): Promise<RequisicaoCompra> {
  const codigo = await codigoSugerido();
  const info = await dbRun(
    `INSERT INTO requisicao_compra (codigo, origem, fornecedor, data_necessidade, status, observacoes, criada_por, criada_em)
     VALUES (?, 'manual', ?, ?, 'rascunho', ?, ?, (now() - interval '4 hours'))
     RETURNING id`,
    [codigo, dados.fornecedor?.trim() || null, dados.data_necessidade || null, dados.observacoes?.trim() || null, usuarioId]
  );

  const nova = (await buscarRequisicaoPorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "requisicao_compra", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export async function atualizarRequisicao(id: number, dados: DadosRequisicao, usuarioId: number): Promise<RequisicaoCompra> {
  const anterior = await exigirRequisicao(id);
  exigirRascunho(anterior);
  await dbRun("UPDATE requisicao_compra SET fornecedor = ?, data_necessidade = ?, observacoes = ? WHERE id = ?", [
    dados.fornecedor?.trim() || null,
    dados.data_necessidade || null,
    dados.observacoes?.trim() || null,
    id,
  ]);
  const nova = (await buscarRequisicaoPorId(id))!;
  await registrarAuditoria({ entidade: "requisicao_compra", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

async function exigirRequisicao(id: number): Promise<RequisicaoCompra> {
  const r = await buscarRequisicaoPorId(id);
  if (!r) throw new ErroValidacaoRequisicao("Requisição de compra não encontrada.");
  return r;
}

function exigirRascunho(r: RequisicaoCompra) {
  if (r.status !== "rascunho") {
    throw new ErroValidacaoRequisicao('Só é possível alterar itens enquanto a requisição está em "rascunho".');
  }
}

export interface DadosItemRequisicao {
  peca_id: number;
  quantidade: number;
  custo_unitario_estimado?: number | null;
  data_necessidade?: string | null;
}

export async function adicionarItem(requisicaoId: number, dados: DadosItemRequisicao, usuarioId: number): Promise<ItemRequisicao> {
  const requisicao = await exigirRequisicao(requisicaoId);
  exigirRascunho(requisicao);
  if (!(await buscarPecaPorId(dados.peca_id))) {
    throw new ErroValidacaoRequisicao("Peça não encontrada.");
  }
  if (dados.quantidade <= 0) {
    throw new ErroValidacaoRequisicao("Informe uma quantidade maior que zero.");
  }
  const itemId = await inserirItem(requisicaoId, dados.peca_id, dados.quantidade, dados.custo_unitario_estimado ?? null, dados.data_necessidade ?? null, []);
  const itens = await listarItens(requisicaoId);
  const novo = itens.find((i) => i.id === itemId)!;
  await registrarAuditoria({ entidade: "requisicao_compra_item", entidade_id: itemId, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function atualizarItem(itemId: number, dados: DadosItemRequisicao, usuarioId: number): Promise<ItemRequisicao> {
  const anterior = (await dbGet("SELECT * FROM requisicao_compra_item WHERE id = ?", [itemId])) as { requisicao_id: number } | undefined;
  if (!anterior) {
    throw new ErroValidacaoRequisicao("Item não encontrado.");
  }
  exigirRascunho(await exigirRequisicao(anterior.requisicao_id));
  if (dados.quantidade <= 0) {
    throw new ErroValidacaoRequisicao("Informe uma quantidade maior que zero.");
  }
  await dbRun("UPDATE requisicao_compra_item SET quantidade = ?, custo_unitario_estimado = ?, data_necessidade = ? WHERE id = ?", [
    dados.quantidade,
    dados.custo_unitario_estimado ?? null,
    dados.data_necessidade ?? null,
    itemId,
  ]);
  const itens = await listarItens(anterior.requisicao_id);
  const novo = itens.find((i) => i.id === itemId)!;
  await registrarAuditoria({
    entidade: "requisicao_compra_item",
    entidade_id: itemId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: novo,
    usuario_id: usuarioId,
  });
  return novo;
}

export async function removerItem(itemId: number, usuarioId: number): Promise<void> {
  const anterior = (await dbGet("SELECT * FROM requisicao_compra_item WHERE id = ?", [itemId])) as { requisicao_id: number } | undefined;
  if (!anterior) {
    throw new ErroValidacaoRequisicao("Item não encontrado.");
  }
  exigirRascunho(await exigirRequisicao(anterior.requisicao_id));
  await dbRun("DELETE FROM requisicao_compra_item WHERE id = ?", [itemId]);
  await registrarAuditoria({ entidade: "requisicao_compra_item", entidade_id: itemId, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}

async function mudarStatus(r: RequisicaoCompra, novoStatus: StatusRequisicao, usuarioId: number, camposExtra?: Record<string, unknown>): Promise<RequisicaoCompra> {
  await dbRun("UPDATE requisicao_compra SET status = ? WHERE id = ?", [novoStatus, r.id]);
  const atualizada = (await buscarRequisicaoPorId(r.id))!;
  await registrarAuditoria({
    entidade: "requisicao_compra",
    entidade_id: r.id,
    acao: "status",
    valor_anterior: { ...r, ...camposExtra },
    valor_novo: atualizada,
    usuario_id: usuarioId,
  });
  return atualizada;
}

export async function emitir(id: number, usuarioId: number): Promise<RequisicaoCompra> {
  const r = await exigirRequisicao(id);
  if (r.status !== "rascunho") {
    throw new ErroValidacaoRequisicao('Somente uma requisição em "rascunho" pode ser emitida.');
  }
  const itens = await listarItens(id);
  if (itens.length === 0) {
    throw new ErroValidacaoRequisicao("Adicione ao menos um item antes de emitir a requisição.");
  }
  return mudarStatus(r, "emitida", usuarioId);
}

export async function aprovar(id: number, usuarioId: number): Promise<RequisicaoCompra> {
  const r = await exigirRequisicao(id);
  if (r.status !== "emitida") {
    throw new ErroValidacaoRequisicao('Somente uma requisição "emitida" pode ser aprovada.');
  }
  return mudarStatus(r, "aprovada", usuarioId);
}

export async function avancarCotacao(id: number, usuarioId: number): Promise<RequisicaoCompra> {
  const r = await exigirRequisicao(id);
  if (r.status !== "aprovada") {
    throw new ErroValidacaoRequisicao('Somente uma requisição "aprovada" pode entrar em cotação.');
  }
  return mudarStatus(r, "em_cotacao", usuarioId);
}

export async function avancarPedidoColocado(id: number, usuarioId: number): Promise<RequisicaoCompra> {
  const r = await exigirRequisicao(id);
  if (r.status !== "em_cotacao") {
    throw new ErroValidacaoRequisicao('Somente uma requisição "em cotação" pode ter o pedido colocado.');
  }
  return mudarStatus(r, "pedido_colocado", usuarioId);
}

/**
 * Receber uma requisição é o fechamento do ciclo: para cada item, gera uma entrada de verdade
 * no estoque (Fase 7), usando o custo estimado do item como custo da entrada — o que também
 * recalcula o custo médio ponderado da peça. Só depois disso a requisição vira "recebida".
 */
export async function receber(id: number, usuarioId: number): Promise<RequisicaoCompra> {
  const r = await exigirRequisicao(id);
  if (r.status !== "pedido_colocado") {
    throw new ErroValidacaoRequisicao('Somente uma requisição com "pedido colocado" pode ser recebida.');
  }
  const itens = await listarItens(id);
  for (const item of itens) {
    await registrarEntrada(item.peca_id, item.quantidade, item.custo_unitario_estimado, `Recebimento da requisição ${r.codigo}`, usuarioId);
  }
  return mudarStatus(r, "recebida", usuarioId);
}

export async function cancelar(id: number, motivo: string, usuarioId: number): Promise<RequisicaoCompra> {
  const r = await exigirRequisicao(id);
  if (r.status === "recebida" || r.status === "cancelada") {
    throw new ErroValidacaoRequisicao("Esta requisição já está recebida ou cancelada.");
  }
  if (!motivo.trim()) {
    throw new ErroValidacaoRequisicao("Informe o motivo do cancelamento.");
  }
  const observacoes = r.observacoes ? `${r.observacoes}\n\nCancelada: ${motivo.trim()}` : `Cancelada: ${motivo.trim()}`;
  await dbRun("UPDATE requisicao_compra SET observacoes = ? WHERE id = ?", [observacoes, id]);
  return mudarStatus(r, "cancelada", usuarioId);
}

async function definirCabecalhoPorItens(requisicaoId: number): Promise<void> {
  const itens = await listarItens(requisicaoId);
  let dataNecessidade: string | null = null;
  let dataLimitePedido: string | null = null;
  for (const item of itens) {
    if (!item.data_necessidade) continue;
    if (!dataNecessidade || item.data_necessidade < dataNecessidade) dataNecessidade = item.data_necessidade;
    const peca = await buscarPecaPorId(item.peca_id);
    const limite = somarDiasIso(item.data_necessidade, -(peca?.lead_time_dias ?? 0));
    if (!dataLimitePedido || limite < dataLimitePedido) dataLimitePedido = limite;
  }
  await dbRun("UPDATE requisicao_compra SET data_necessidade = ?, data_limite_pedido = ? WHERE id = ?", [
    dataNecessidade,
    dataLimitePedido,
    requisicaoId,
  ]);
}

/**
 * Gera um rascunho a partir dos alertas de reposição (Fase 7): uma peça abaixo do mínimo ou do
 * ponto de pedido entra com a quantidade sugerida para trazer o disponível de volta ao maior
 * dos dois limiares (heurística simples — não há campo de "lote econômico de compra" no
 * schema). Fornecedor do cabeçalho só é preenchido quando todas as peças compartilham o mesmo
 * fornecedor preferencial.
 */
export async function gerarSugestaoPontoDePedido(usuarioId: number): Promise<{ requisicao: RequisicaoCompra; itens: ItemRequisicao[] }> {
  const alertas = await listarAlertasReposicao();
  if (alertas.length === 0) {
    throw new ErroValidacaoRequisicao("Não há peças abaixo do ponto de reposição no momento.");
  }

  const codigo = await codigoSugerido();
  const info = await dbRun(
    `INSERT INTO requisicao_compra (codigo, origem, status, observacoes, criada_por, criada_em)
     VALUES (?, 'ponto_de_pedido', 'rascunho', 'Gerada automaticamente a partir dos alertas de reposição do almoxarifado.', ?, (now() - interval '4 hours'))
     RETURNING id`,
    [codigo, usuarioId]
  );
  const requisicaoId = Number(info.id);

  const dataNecessidade = hoje();
  for (const alerta of alertas) {
    const limiar = Math.max(alerta.estoque_minimo, alerta.ponto_de_pedido);
    const quantidadeSugerida = Math.max(limiar - alerta.estoque_disponivel, 1);
    const peca = (await buscarPecaPorId(alerta.id))!;
    await inserirItem(requisicaoId, alerta.id, quantidadeSugerida, peca.custo_unitario_medio, dataNecessidade, []);
  }

  const fornecedores = new Set(
    (await Promise.all(alertas.map((a) => buscarPecaPorId(a.id)))).map((p) => p?.fornecedor_preferencial).filter((f): f is string => !!f)
  );
  if (fornecedores.size === 1) {
    await dbRun("UPDATE requisicao_compra SET fornecedor = ? WHERE id = ?", [[...fornecedores][0], requisicaoId]);
  }
  await definirCabecalhoPorItens(requisicaoId);

  const requisicao = (await buscarRequisicaoPorId(requisicaoId))!;
  await registrarAuditoria({ entidade: "requisicao_compra", entidade_id: requisicaoId, acao: "criar", valor_novo: requisicao, usuario_id: usuarioId });
  return { requisicao, itens: await listarItens(requisicaoId) };
}

/**
 * Gera um rascunho projetando a demanda de peças dos planos de manutenção ativos dentro de um
 * período (reaproveita o mesmo motor de recorrência da Fase 5, sem ajuste de dia não útil — é
 * uma estimativa de planejamento, não uma data de OS). Só entram peças cuja demanda projetada
 * supere o estoque disponível; a quantidade sugerida é exatamente o que falta.
 * Não considera OS já geradas e ainda não consumidas (só a demanda futura dos planos) — ver
 * observação no README.
 */
export async function gerarSugestaoProgramacaoPreventiva(
  dataInicio: string,
  dataFim: string,
  usuarioId: number
): Promise<{ requisicao: RequisicaoCompra; itens: ItemRequisicao[] }> {
  if (dataFim < dataInicio) {
    throw new ErroValidacaoRequisicao("A data final do período não pode ser anterior à data inicial.");
  }

  const demandaPorPeca = new Map<number, { quantidade: number; origens: Set<string> }>();
  for (const plano of await listarPlanos({ apenasAtivos: true })) {
    const datas = calcularOcorrencias(
      {
        periodicidade: plano.periodicidade,
        intervalo_customizado_dias: plano.intervalo_customizado_dias,
        data_base: plano.data_base,
        data_inicio_vigencia: plano.data_inicio_vigencia,
        data_fim_vigencia: plano.data_fim_vigencia,
        ativo: plano.ativo,
      },
      dataInicio,
      dataFim
    );
    if (datas.length === 0) continue;
    for (const pp of await listarPecasDoPlano(plano.id)) {
      const atual = demandaPorPeca.get(pp.peca_id) ?? { quantidade: 0, origens: new Set<string>() };
      atual.quantidade += pp.quantidade_prevista * datas.length;
      atual.origens.add(plano.codigo);
      demandaPorPeca.set(pp.peca_id, atual);
    }
  }

  const itensParaGerar: { pecaId: number; quantidade: number; origens: string[] }[] = [];
  for (const [pecaId, demanda] of demandaPorPeca) {
    const peca = await buscarPecaPorId(pecaId);
    if (!peca) continue;
    const reservado = (await dbGet(
      "SELECT COALESCE(SUM(quantidade), 0) AS total FROM reserva_peca WHERE peca_id = ? AND status = 'reservada'",
      [pecaId]
    )) as { total: number };
    const disponivel = peca.estoque_atual - reservado.total;
    const faltante = demanda.quantidade - disponivel;
    if (faltante > 0) {
      itensParaGerar.push({ pecaId, quantidade: faltante, origens: [...demanda.origens] });
    }
  }

  if (itensParaGerar.length === 0) {
    throw new ErroValidacaoRequisicao("O estoque disponível já cobre a demanda projetada dos planos ativos nesse período — nenhum item a comprar.");
  }

  const codigo = await codigoSugerido();
  const info = await dbRun(
    `INSERT INTO requisicao_compra (codigo, origem, status, observacoes, criada_por, criada_em)
     VALUES (?, 'programacao_preventiva', 'rascunho', ?, ?, (now() - interval '4 hours'))
     RETURNING id`,
    [codigo, `Projeção de demanda dos planos de manutenção ativos entre ${dataInicio} e ${dataFim}.`, usuarioId]
  );
  const requisicaoId = Number(info.id);

  for (const item of itensParaGerar) {
    const peca = (await buscarPecaPorId(item.pecaId))!;
    await inserirItem(requisicaoId, item.pecaId, item.quantidade, peca.custo_unitario_medio, dataInicio, item.origens);
  }
  await definirCabecalhoPorItens(requisicaoId);

  const requisicao = (await buscarRequisicaoPorId(requisicaoId))!;
  await registrarAuditoria({ entidade: "requisicao_compra", entidade_id: requisicaoId, acao: "criar", valor_novo: requisicao, usuario_id: usuarioId });
  return { requisicao, itens: await listarItens(requisicaoId) };
}
