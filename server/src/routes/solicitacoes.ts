import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  buscarSolicitacaoPorId,
  codigoSugerido,
  converterEmOS,
  criarSolicitacao,
  editarSolicitacao,
  ErroValidacaoSolicitacao,
  iniciarAnalise,
  listarSolicitacoes,
  recusar,
} from "../services/solicitacaoService.js";
import { ErroValidacaoOS } from "../services/osService.js";

export const solicitacoesRouter = Router();

solicitacoesRouter.use(exigirAutenticacao);

const STATUS = ["aberta", "em_analise", "convertida_em_os", "recusada"] as const;
const PRIORIDADES = ["baixa", "media", "alta", "critica"] as const;
const TIPOS_OS = ["preventiva", "corretiva", "inspecao", "melhoria", "calibracao"] as const;

function tratarErro(err: unknown, res: import("express").Response) {
  if (err instanceof ErroValidacaoSolicitacao || err instanceof ErroValidacaoOS) {
    return res.status(400).json({ erro: err.message });
  }
  throw err;
}

solicitacoesRouter.get("/", exigirPermissao("solicitacoes", "ver"), asyncHandler(async (req, res) => {
  const { status, ativoId, solicitanteId, texto, apenasMinhas } = req.query;
  const solicitacoes = await listarSolicitacoes({
    status: typeof status === "string" && (STATUS as readonly string[]).includes(status) ? (status as (typeof STATUS)[number]) : undefined,
    ativoId: ativoId ? Number(ativoId) : undefined,
    solicitanteId: apenasMinhas === "true" ? req.usuario!.id : solicitanteId ? Number(solicitanteId) : undefined,
    texto: typeof texto === "string" ? texto : undefined,
  });
  res.json({ solicitacoes });
}));

solicitacoesRouter.get("/codigo-sugerido", exigirPermissao("solicitacoes", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoSugerido() });
}));

solicitacoesRouter.get("/:id", exigirPermissao("solicitacoes", "ver"), asyncHandler(async (req, res) => {
  const solicitacao = await buscarSolicitacaoPorId(Number(req.params.id));
  if (!solicitacao) {
    return res.status(404).json({ erro: "Solicitação não encontrada." });
  }
  res.json({ solicitacao });
}));

const dadosSolicitacaoSchema = z.object({
  ativo_id: z.number().int().nullable().optional(),
  descricao: z.string().min(1, "Descreva o problema ou serviço solicitado."),
  prioridade_sugerida: z.enum(PRIORIDADES),
  setor_solicitante: z.string().nullable().optional(),
});

solicitacoesRouter.post("/", exigirPermissao("solicitacoes", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosSolicitacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const solicitacao = await criarSolicitacao(parsed.data, req.usuario!.id);
    res.status(201).json({ solicitacao });
  } catch (err) {
    tratarErro(err, res);
  }
}));

solicitacoesRouter.put("/:id", exigirPermissao("solicitacoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosSolicitacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const solicitacao = await editarSolicitacao(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ solicitacao });
  } catch (err) {
    tratarErro(err, res);
  }
}));

solicitacoesRouter.post("/:id/iniciar-analise", exigirPermissao("solicitacoes", "editar"), asyncHandler(async (req, res) => {
  try {
    const solicitacao = await iniciarAnalise(Number(req.params.id), req.usuario!.id);
    res.json({ solicitacao });
  } catch (err) {
    tratarErro(err, res);
  }
}));

const TIPOS_RESPOSTA_TAREFA = ["ok_nok", "texto", "numerico", "selecao"] as const;
const REGIMES_TAREFA = ["MP", "MF"] as const;

const itemChecklistConversaoSchema = z.object({
  descricao: z.string().min(1, "Todo item do checklist precisa ter uma descrição."),
  tipo_resposta: z.enum(TIPOS_RESPOSTA_TAREFA),
  obrigatoria: z.boolean().optional(),
  valor_min: z.number().nullable().optional(),
  valor_max: z.number().nullable().optional(),
  unidade: z.string().nullable().optional(),
  regime: z.enum(REGIMES_TAREFA).nullable().optional(),
});

const dadosConversaoSchema = z.object({
  tipo: z.enum(TIPOS_OS),
  prioridade: z.enum(PRIORIDADES).nullable().optional(),
  descricao: z.string().min(1, "Descreva o serviço que será realizado."),
  checklist: z.array(itemChecklistConversaoSchema).min(1, "Adicione ao menos um item de serviço/checklist a ser realizado."),
  data_programada: z.string().min(1, "Informe a data programada."),
  data_limite: z.string().min(1, "Informe a data limite."),
  responsavel_id: z.number().int().nullable().optional(),
  horas_estimadas: z.number().min(0).optional(),
  exige_parada_linha: z.boolean().optional(),
});

solicitacoesRouter.post("/:id/converter", exigirPermissao("solicitacoes", "aprovar"), asyncHandler(async (req, res) => {
  const parsed = dadosConversaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const resultado = await converterEmOS(
      Number(req.params.id),
      { ...parsed.data, prioridade: parsed.data.prioridade ?? undefined },
      req.usuario!.id
    );
    res.json(resultado);
  } catch (err) {
    tratarErro(err, res);
  }
}));

const dadosRecusaSchema = z.object({ motivo: z.string().min(1, "Informe o motivo da recusa.") });

solicitacoesRouter.post("/:id/recusar", exigirPermissao("solicitacoes", "aprovar"), asyncHandler(async (req, res) => {
  const parsed = dadosRecusaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const solicitacao = await recusar(Number(req.params.id), parsed.data.motivo, req.usuario!.id);
    res.json({ solicitacao });
  } catch (err) {
    tratarErro(err, res);
  }
}));
