import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  buscarLotePorId,
  codigoSugerido,
  criarLote,
  dispararConfirmacaoBackground,
  ErroValidacaoLote,
  listarLotes,
  marcarErro,
  marcarProcessando,
  reverterLote,
  simular,
} from "../services/loteGeracaoService.js";

export const loteGeracaoRouter = Router();

loteGeracaoRouter.use(exigirAutenticacao);

const filtrosSchema = z.object({
  ativoId: z.number().int().optional(),
  tipoManutencao: z.string().optional(),
  texto: z.string().optional(),
});

const simularSchema = z.object({
  data_inicio: z.string().min(1, "Informe a data inicial do período."),
  data_fim: z.string().min(1, "Informe a data final do período."),
  filtros: filtrosSchema.optional(),
});

loteGeracaoRouter.get("/", exigirPermissao("geracao_lote", "ver"), asyncHandler(async (_req, res) => {
  res.json({ lotes: await listarLotes() });
}));

loteGeracaoRouter.get("/codigo-sugerido", exigirPermissao("geracao_lote", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoSugerido() });
}));

loteGeracaoRouter.get("/:id", exigirPermissao("geracao_lote", "ver"), asyncHandler(async (req, res) => {
  const lote = await buscarLotePorId(Number(req.params.id));
  if (!lote) {
    return res.status(404).json({ erro: "Lote de geração não encontrado." });
  }
  res.json({ lote });
}));

loteGeracaoRouter.post("/simular", exigirPermissao("geracao_lote", "criar"), asyncHandler(async (req, res) => {
  const parsed = simularSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  if (parsed.data.data_fim < parsed.data.data_inicio) {
    return res.status(400).json({ erro: "A data final do período não pode ser anterior à data inicial." });
  }
  const resultado = await simular(parsed.data.data_inicio, parsed.data.data_fim, parsed.data.filtros ?? {});
  res.json(resultado);
}));

const criarLoteSchema = simularSchema.extend({
  codigo: z.string().min(1, "Informe o código do lote."),
});

loteGeracaoRouter.post("/", exigirPermissao("geracao_lote", "criar"), asyncHandler(async (req, res) => {
  const parsed = criarLoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const lote = await criarLote(
      parsed.data.codigo,
      parsed.data.data_inicio,
      parsed.data.data_fim,
      parsed.data.filtros ?? {},
      req.usuario!.id
    );
    res.status(201).json({ lote });
  } catch (err) {
    if (err instanceof ErroValidacaoLote) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

// LOTE-BG-01: a confirmação em si roda numa Background Function (até 15min) — esta rota só
// valida, marca o lote como "processando" e dispara a function, sem esperar o resultado. O
// front acompanha via polling em GET /:id (status muda pra "confirmado" ou "erro" no final).
loteGeracaoRouter.post("/:id/confirmar", exigirPermissao("geracao_lote", "aprovar"), asyncHandler(async (req, res) => {
  const loteId = Number(req.params.id);
  const lote = await buscarLotePorId(loteId);
  if (!lote) {
    return res.status(404).json({ erro: "Lote de geração não encontrado." });
  }
  if (lote.status !== "simulado") {
    return res.status(400).json({ erro: 'Somente lotes com status "simulado" podem ser confirmados.' });
  }

  await marcarProcessando(loteId);
  try {
    await dispararConfirmacaoBackground(loteId, req.usuario!.id);
  } catch (err) {
    await marcarErro(loteId, err instanceof Error ? err.message : "Falha ao disparar a confirmação.");
    return res.status(502).json({ erro: "Não foi possível iniciar a confirmação do lote. Tente novamente." });
  }

  res.status(202).json({ lote: await buscarLotePorId(loteId) });
}));

loteGeracaoRouter.post("/:id/reverter", exigirPermissao("geracao_lote", "aprovar"), asyncHandler(async (req, res) => {
  try {
    const resultado = await reverterLote(Number(req.params.id), req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoLote) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
