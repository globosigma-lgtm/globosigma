import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  adicionarItem,
  aprovar,
  atualizarItem,
  atualizarRequisicao,
  avancarCotacao,
  avancarPedidoColocado,
  buscarRequisicaoPorId,
  cancelar,
  codigoSugerido,
  criarRequisicao,
  emitir,
  ErroValidacaoRequisicao,
  gerarSugestaoPontoDePedido,
  gerarSugestaoProgramacaoPreventiva,
  listarItens,
  listarRequisicoes,
  receber,
  removerItem,
} from "../services/requisicaoCompraService.js";

export const requisicoesCompraRouter = Router();

requisicoesCompraRouter.use(exigirAutenticacao);

const STATUS = ["rascunho", "emitida", "aprovada", "em_cotacao", "pedido_colocado", "recebida", "cancelada"] as const;

function tratarErro(err: unknown, res: import("express").Response) {
  if (err instanceof ErroValidacaoRequisicao) {
    return res.status(400).json({ erro: err.message });
  }
  throw err;
}

requisicoesCompraRouter.get("/", exigirPermissao("programacao_compras", "ver"), asyncHandler(async (req, res) => {
  const { status, origem, texto } = req.query;
  const requisicoes = await listarRequisicoes({
    status: typeof status === "string" && (STATUS as readonly string[]).includes(status) ? (status as (typeof STATUS)[number]) : undefined,
    origem: typeof origem === "string" ? origem : undefined,
    texto: typeof texto === "string" ? texto : undefined,
  });
  res.json({ requisicoes });
}));

requisicoesCompraRouter.get("/codigo-sugerido", exigirPermissao("programacao_compras", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoSugerido() });
}));

requisicoesCompraRouter.get("/:id", exigirPermissao("programacao_compras", "ver"), asyncHandler(async (req, res) => {
  const requisicao = await buscarRequisicaoPorId(Number(req.params.id));
  if (!requisicao) {
    return res.status(404).json({ erro: "Requisição de compra não encontrada." });
  }
  res.json({ requisicao });
}));

requisicoesCompraRouter.get("/:id/itens", exigirPermissao("programacao_compras", "ver"), asyncHandler(async (req, res) => {
  res.json({ itens: await listarItens(Number(req.params.id)) });
}));

const dadosRequisicaoSchema = z.object({
  fornecedor: z.string().nullable().optional(),
  data_necessidade: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

requisicoesCompraRouter.post("/", exigirPermissao("programacao_compras", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosRequisicaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const requisicao = await criarRequisicao(parsed.data, req.usuario!.id);
  res.status(201).json({ requisicao });
}));

requisicoesCompraRouter.put("/:id", exigirPermissao("programacao_compras", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosRequisicaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const requisicao = await atualizarRequisicao(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ requisicao });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const sugestaoPontoDePedidoSchema = z.object({});
requisicoesCompraRouter.post("/sugestao/ponto-de-pedido", exigirPermissao("programacao_compras", "criar"), asyncHandler(async (req, res) => {
  sugestaoPontoDePedidoSchema.safeParse(req.body);
  try {
    const resultado = await gerarSugestaoPontoDePedido(req.usuario!.id);
    res.status(201).json(resultado);
  } catch (err) {
    tratarErro(err, res);
  }
}));

const sugestaoPreventivaSchema = z.object({
  data_inicio: z.string().min(1, "Informe a data inicial do período."),
  data_fim: z.string().min(1, "Informe a data final do período."),
});
requisicoesCompraRouter.post("/sugestao/programacao-preventiva", exigirPermissao("programacao_compras", "criar"), asyncHandler(async (req, res) => {
  const parsed = sugestaoPreventivaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const resultado = await gerarSugestaoProgramacaoPreventiva(parsed.data.data_inicio, parsed.data.data_fim, req.usuario!.id);
    res.status(201).json(resultado);
  } catch (err) {
    tratarErro(err, res);
  }
}));

const dadosItemSchema = z.object({
  peca_id: z.number().int(),
  quantidade: z.number().positive("Informe uma quantidade maior que zero."),
  custo_unitario_estimado: z.number().min(0).nullable().optional(),
  data_necessidade: z.string().nullable().optional(),
});

requisicoesCompraRouter.post("/:id/itens", exigirPermissao("programacao_compras", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const item = await adicionarItem(Number(req.params.id), parsed.data, req.usuario!.id);
    res.status(201).json({ item });
  } catch (err) {
    tratarErro(err, res);
  }
}));

requisicoesCompraRouter.put("/:id/itens/:itemId", exigirPermissao("programacao_compras", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const item = await atualizarItem(Number(req.params.itemId), parsed.data, req.usuario!.id);
    res.json({ item });
  } catch (err) {
    tratarErro(err, res);
  }
}));

requisicoesCompraRouter.delete("/:id/itens/:itemId", exigirPermissao("programacao_compras", "criar"), asyncHandler(async (req, res) => {
  try {
    await removerItem(Number(req.params.itemId), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    tratarErro(err, res);
  }
}));

function acaoStatus(handler: (id: number, usuarioId: number) => unknown, acao: "criar" | "aprovar") {
  return [
    exigirPermissao("programacao_compras", acao),
    asyncHandler(async (req: import("express").Request, res: import("express").Response) => {
      try {
        const requisicao = await handler(Number(req.params.id), req.usuario!.id);
        res.json({ requisicao });
      } catch (err) {
        tratarErro(err, res);
      }
    }),
  ] as const;
}

requisicoesCompraRouter.post("/:id/emitir", ...acaoStatus(emitir, "criar"));
requisicoesCompraRouter.post("/:id/aprovar", ...acaoStatus(aprovar, "aprovar"));
requisicoesCompraRouter.post("/:id/cotacao", ...acaoStatus(avancarCotacao, "criar"));
requisicoesCompraRouter.post("/:id/pedido-colocado", ...acaoStatus(avancarPedidoColocado, "criar"));
requisicoesCompraRouter.post("/:id/receber", ...acaoStatus(receber, "criar"));

const dadosCancelamentoSchema = z.object({ motivo: z.string().min(1, "Informe o motivo do cancelamento.") });
requisicoesCompraRouter.post("/:id/cancelar", exigirPermissao("programacao_compras", "aprovar"), asyncHandler(async (req, res) => {
  const parsed = dadosCancelamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const requisicao = await cancelar(Number(req.params.id), parsed.data.motivo, req.usuario!.id);
    res.json({ requisicao });
  } catch (err) {
    tratarErro(err, res);
  }
}));
