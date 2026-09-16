import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  buscarServicoExternoPorId,
  cancelarServicoExterno,
  codigoSugerido,
  criarServicoExterno,
  enviarServicoExterno,
  ErroValidacaoServicoExterno,
  listarServicosExternos,
  registrarPagamento,
  retornarServicoExterno,
} from "../services/servicoExternoService.js";

export const servicosExternosRouter = Router();

servicosExternosRouter.use(exigirAutenticacao);

const TIPOS_SERVICO = ["usinagem", "solda", "retifica", "calibracao", "pintura", "outro"] as const;
const STATUS_LOGISTICO = ["pendente_envio", "enviado", "retornado", "cancelado"] as const;
const STATUS_PAGAMENTO = ["pendente", "parcial", "pago"] as const;

function tratarErro(err: unknown, res: import("express").Response) {
  if (err instanceof ErroValidacaoServicoExterno) {
    return res.status(400).json({ erro: err.message });
  }
  throw err;
}

servicosExternosRouter.get("/", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const { osId, statusLogistico, statusPagamento, texto } = req.query;
  const servicos = await listarServicosExternos({
    osId: osId ? Number(osId) : undefined,
    statusLogistico:
      typeof statusLogistico === "string" && (STATUS_LOGISTICO as readonly string[]).includes(statusLogistico)
        ? (statusLogistico as (typeof STATUS_LOGISTICO)[number])
        : undefined,
    statusPagamento:
      typeof statusPagamento === "string" && (STATUS_PAGAMENTO as readonly string[]).includes(statusPagamento)
        ? (statusPagamento as (typeof STATUS_PAGAMENTO)[number])
        : undefined,
    texto: typeof texto === "string" ? texto : undefined,
  });
  res.json({ servicos });
}));

servicosExternosRouter.get("/codigo-sugerido", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoSugerido() });
}));

servicosExternosRouter.get("/:id", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const servico = await buscarServicoExternoPorId(Number(req.params.id));
  if (!servico) {
    return res.status(404).json({ erro: "Registro de serviço externo não encontrado." });
  }
  res.json({ servico });
}));

const dadosCriacaoSchema = z.object({
  os_id: z.number().int(),
  item_ativo_id: z.number().int(),
  descricao_item: z.string().min(1, "Descreva o item enviado."),
  quantidade: z.number().positive().optional(),
  fornecedor_id: z.number().int(),
  tipo_servico: z.enum(TIPOS_SERVICO),
  motivo: z.string().nullable().optional(),
  data_previsao_retorno: z.string().nullable().optional(),
  valor_orcado: z.number().min(0).nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

servicosExternosRouter.post("/", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosCriacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const servico = await criarServicoExterno(parsed.data, req.usuario!.id);
    res.status(201).json({ servico });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const dadosEnvioSchema = z.object({
  data_envio: z.string().nullable().optional(),
  documento_saida: z.string().nullable().optional(),
});

servicosExternosRouter.post("/:id/enviar", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosEnvioSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const servico = await enviarServicoExterno(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ servico });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const dadosRetornoSchema = z.object({
  data_retorno: z.string().nullable().optional(),
  devolver_ao_estoque: z.boolean().optional(),
});

servicosExternosRouter.post("/:id/retornar", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosRetornoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const servico = await retornarServicoExterno(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ servico });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const dadosCancelamentoSchema = z.object({ motivo: z.string().min(1, "Informe o motivo do cancelamento.") });

servicosExternosRouter.post("/:id/cancelar", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosCancelamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const servico = await cancelarServicoExterno(Number(req.params.id), parsed.data.motivo, req.usuario!.id);
    res.json({ servico });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const dadosPagamentoSchema = z.object({
  status_pagamento: z.enum(STATUS_PAGAMENTO),
  valor_cobrado: z.number().min(0).nullable().optional(),
  valor_pago: z.number().min(0).nullable().optional(),
  data_pagamento: z.string().nullable().optional(),
  forma_pagamento: z.string().nullable().optional(),
});

servicosExternosRouter.put("/:id/pagamento", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosPagamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const servico = await registrarPagamento(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ servico });
  } catch (err) {
    tratarErro(err, res);
  }
}));
