import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import {
  ErroValidacaoEstoque,
  listarAlertasReposicao,
  listarMovimentos,
  listarReservas,
  registrarAjuste,
  registrarDevolucao,
  registrarEntrada,
  registrarSaida,
  registrarTransferencia,
} from "../services/estoqueService.js";
import {
  confirmarImportacao,
  ErroValidacaoImportacao,
  listarImportacoes,
  simularImportacao,
} from "../services/importacaoEstoqueService.js";

export const almoxarifadoRouter = Router();

almoxarifadoRouter.use(exigirAutenticacao);

// A planilha nunca precisa ficar salva em disco — só o conteúdo, pra parsear e descartar.
const EXTENSOES_PLANILHA = /\.(csv|xlsx|xls|xlsb|ods)$/i;
const uploadPlanilha = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!EXTENSOES_PLANILHA.test(file.originalname)) {
      return cb(new Error("Formato não suportado. Envie um arquivo .csv, .xlsx, .xls, .xlsb ou .ods."));
    }
    cb(null, true);
  },
});

almoxarifadoRouter.get("/alertas", exigirPermissao("almoxarifado", "ver"), asyncHandler(async (_req, res) => {
  res.json({ alertas: await listarAlertasReposicao() });
}));

almoxarifadoRouter.get("/movimentos", exigirPermissao("almoxarifado", "ver"), asyncHandler(async (req, res) => {
  const { pecaId, tipo, dataInicio, dataFim } = req.query;
  const movimentos = await listarMovimentos({
    pecaId: pecaId ? Number(pecaId) : undefined,
    tipo: typeof tipo === "string" ? tipo : undefined,
    dataInicio: typeof dataInicio === "string" ? dataInicio : undefined,
    dataFim: typeof dataFim === "string" ? dataFim : undefined,
  });
  res.json({ movimentos });
}));

almoxarifadoRouter.get("/reservas", exigirPermissao("almoxarifado", "ver"), asyncHandler(async (req, res) => {
  const { pecaId, status } = req.query;
  const reservas = await listarReservas({
    pecaId: pecaId ? Number(pecaId) : undefined,
    status: typeof status === "string" ? (status as "reservada" | "consumida" | "liberada") : undefined,
  });
  res.json({ reservas });
}));

function tratarErro(err: unknown, res: import("express").Response) {
  if (err instanceof ErroValidacaoEstoque) {
    return res.status(400).json({ erro: err.message });
  }
  throw err;
}

const entradaSchema = z.object({
  peca_id: z.number().int(),
  quantidade: z.number().positive(),
  custo_unitario: z.number().min(0).nullable().optional(),
  motivo: z.string().nullable().optional(),
});

almoxarifadoRouter.post("/movimentos/entrada", exigirPermissao("almoxarifado", "criar"), asyncHandler(async (req, res) => {
  const parsed = entradaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const movimento = await registrarEntrada(
      parsed.data.peca_id,
      parsed.data.quantidade,
      parsed.data.custo_unitario ?? null,
      parsed.data.motivo ?? null,
      req.usuario!.id
    );
    res.status(201).json({ movimento });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const saidaSchema = z.object({
  peca_id: z.number().int(),
  quantidade: z.number().positive(),
  motivo: z.string().nullable().optional(),
});

almoxarifadoRouter.post("/movimentos/saida", exigirPermissao("almoxarifado", "criar"), asyncHandler(async (req, res) => {
  const parsed = saidaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const movimento = await registrarSaida(parsed.data.peca_id, parsed.data.quantidade, parsed.data.motivo ?? null, req.usuario!.id);
    res.status(201).json({ movimento });
  } catch (err) {
    tratarErro(err, res);
  }
}));

almoxarifadoRouter.post("/movimentos/devolucao", exigirPermissao("almoxarifado", "criar"), asyncHandler(async (req, res) => {
  const parsed = saidaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const movimento = await registrarDevolucao(parsed.data.peca_id, parsed.data.quantidade, parsed.data.motivo ?? null, req.usuario!.id);
    res.status(201).json({ movimento });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const ajusteSchema = z.object({
  peca_id: z.number().int(),
  quantidade_contada: z.number().min(0),
  motivo: z.string().min(1, "Informe o motivo do ajuste."),
});

almoxarifadoRouter.post("/movimentos/ajuste", exigirPermissao("almoxarifado", "criar"), asyncHandler(async (req, res) => {
  const parsed = ajusteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const movimento = await registrarAjuste(parsed.data.peca_id, parsed.data.quantidade_contada, parsed.data.motivo, req.usuario!.id);
    res.status(201).json({ movimento });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const transferenciaSchema = z.object({
  peca_id: z.number().int(),
  nova_localizacao: z.string().min(1, "Informe a localização de destino."),
  motivo: z.string().nullable().optional(),
});

almoxarifadoRouter.post("/movimentos/transferencia", exigirPermissao("almoxarifado", "criar"), asyncHandler(async (req, res) => {
  const parsed = transferenciaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const movimento = await registrarTransferencia(parsed.data.peca_id, parsed.data.nova_localizacao, parsed.data.motivo ?? null, req.usuario!.id);
    res.status(201).json({ movimento });
  } catch (err) {
    tratarErro(err, res);
  }
}));

// NOVO-08: importação diária da planilha de estoque — mesma permissão que já cobre o ajuste
// manual de estoque (é a mesma ação em lote), não uma trava nova.
almoxarifadoRouter.get("/importacoes", exigirPermissao("almoxarifado", "ver"), asyncHandler(async (_req, res) => {
  res.json({ importacoes: await listarImportacoes() });
}));

// O handler de erro global (index.ts) responde tudo com "Erro interno do servidor" — sem isto
// aqui, um erro do multer (ex.: extensão rejeitada pelo fileFilter) perderia a mensagem útil.
function receberPlanilha(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  uploadPlanilha.single("arquivo")(req, res, (err: unknown) => {
    if (err) {
      return res.status(400).json({ erro: err instanceof Error ? err.message : "Não foi possível processar o arquivo enviado." });
    }
    next();
  });
}

almoxarifadoRouter.post("/importacoes/simular", exigirPermissao("almoxarifado", "criar"), receberPlanilha, asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: "Envie uma planilha (.csv, .xlsx, .xls ou .xlsb) com as colunas de código e quantidade." });
  }
  try {
    const resultado = await simularImportacao(req.file.buffer, req.file.originalname);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoImportacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const confirmarImportacaoSchema = z.object({
  nome_arquivo: z.string().min(1),
  itens: z.array(z.object({ peca_id: z.number().int(), quantidade: z.number().min(0) })),
  nao_encontradas: z.number().int().min(0),
  invalidas: z.number().int().min(0),
});

almoxarifadoRouter.post("/importacoes/confirmar", exigirPermissao("almoxarifado", "criar"), asyncHandler(async (req, res) => {
  const parsed = confirmarImportacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  if (parsed.data.itens.length === 0) {
    return res.status(400).json({ erro: "Nenhuma linha para atualizar — todas as linhas selecionadas já estão sem alteração." });
  }
  try {
    const importacao = await confirmarImportacao(
      parsed.data.nome_arquivo,
      parsed.data.itens.map((i) => ({ pecaId: i.peca_id, quantidade: i.quantidade })),
      { naoEncontradas: parsed.data.nao_encontradas, invalidas: parsed.data.invalidas },
      req.usuario!.id
    );
    res.status(201).json({ importacao });
  } catch (err) {
    tratarErro(err, res);
  }
}));
