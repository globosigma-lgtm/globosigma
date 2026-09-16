import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import {
  atualizarAtivo,
  buscarAtivoPorId,
  codigoSugerido,
  criarAtivo,
  ErroValidacaoAtivo,
  excluirAtivo,
  listarAtivos,
  listarOcorrenciasDoAtivo,
} from "../services/ativoService.js";
import {
  atualizarVinculo,
  copiarListaTecnica,
  ErroValidacaoVinculo,
  listarPecasDoAtivo,
  removerVinculo,
  vincularPeca,
} from "../services/ativoPecaService.js";

export const ativosRouter = Router();

ativosRouter.use(exigirAutenticacao);

const dadosAtivoSchema = z.object({
  codigo: z.string().min(1, "Informe o código do ativo."),
  nome: z.string().min(1, "Informe o nome do ativo."),
  ativo_pai_id: z.number().int().nullable().optional(),
  tipo: z.enum(["equipamento", "componente", "instalacao", "veiculo", "ferramenta"]),
  setor: z.string().nullable().optional(),
  localizacao: z.string().nullable().optional(),
  fabricante: z.string().nullable().optional(),
  modelo: z.string().nullable().optional(),
  numero_serie: z.string().nullable().optional(),
  data_aquisicao: z.string().nullable().optional(),
  data_instalacao: z.string().nullable().optional(),
  criticidade: z.enum(["baixa", "media", "alta", "critica"]),
  status: z.enum(["operando", "parado", "em_manutencao", "desativado"]),
  centro_custo: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

ativosRouter.get("/", exigirPermissao("ativos", "ver"), asyncHandler(async (req, res) => {
  const { texto, setor, tipo, criticidade, status } = req.query;
  const ativos = await listarAtivos({
    texto: typeof texto === "string" ? texto : undefined,
    setor: typeof setor === "string" ? setor : undefined,
    tipo: typeof tipo === "string" ? tipo : undefined,
    criticidade: typeof criticidade === "string" ? criticidade : undefined,
    status: typeof status === "string" ? status : undefined,
  });
  res.json({ ativos });
}));

ativosRouter.get("/codigo-sugerido", exigirPermissao("ativos", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoSugerido() });
}));

ativosRouter.get("/:id", exigirPermissao("ativos", "ver"), asyncHandler(async (req, res) => {
  const ativo = await buscarAtivoPorId(Number(req.params.id));
  if (!ativo) {
    return res.status(404).json({ erro: "Ativo não encontrado." });
  }
  res.json({ ativo });
}));

ativosRouter.get("/:id/ocorrencias", exigirPermissao("ativos", "ver"), asyncHandler(async (req, res) => {
  res.json({ ocorrencias: await listarOcorrenciasDoAtivo(Number(req.params.id)) });
}));

ativosRouter.post("/", exigirPermissao("ativos", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosAtivoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const ativo = await criarAtivo({ ...parsed.data, ativo_pai_id: parsed.data.ativo_pai_id ?? null }, req.usuario!.id);
    res.status(201).json({ ativo });
  } catch (err) {
    if (err instanceof ErroValidacaoAtivo) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ativosRouter.put("/:id", exigirPermissao("ativos", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosAtivoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const ativo = await atualizarAtivo(
      Number(req.params.id),
      { ...parsed.data, ativo_pai_id: parsed.data.ativo_pai_id ?? null },
      req.usuario!.id
    );
    res.json({ ativo });
  } catch (err) {
    if (err instanceof ErroValidacaoAtivo) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ativosRouter.delete("/:id", exigirPermissao("ativos", "excluir"), asyncHandler(async (req, res) => {
  try {
    await excluirAtivo(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoAtivo) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosVinculoSchema = z.object({
  peca_id: z.number().int(),
  quantidade_padrao: z.number().positive("Informe uma quantidade padrão maior que zero."),
  aplicacao: z.string().nullable().optional(),
  posicao: z.string().optional(),
  troca_obrigatoria: z.boolean().optional(),
  observacao: z.string().nullable().optional(),
  propagarParaFilhos: z.boolean().optional(),
});

ativosRouter.get("/:id/pecas", exigirPermissao("ativos", "ver"), asyncHandler(async (req, res) => {
  res.json({ pecas: await listarPecasDoAtivo(Number(req.params.id)) });
}));

ativosRouter.post("/:id/pecas", exigirPermissao("ativos", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosVinculoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const { propagarParaFilhos, ...dados } = parsed.data;
    const resultado = await vincularPeca(Number(req.params.id), dados, req.usuario!.id, propagarParaFilhos);
    res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoVinculo) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ativosRouter.put("/:id/pecas/:vinculoId", exigirPermissao("ativos", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosVinculoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const { propagarParaFilhos: _ignorar, ...dados } = parsed.data;
    const vinculo = await atualizarVinculo(Number(req.params.vinculoId), dados, req.usuario!.id);
    res.json({ vinculo });
  } catch (err) {
    if (err instanceof ErroValidacaoVinculo) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ativosRouter.delete("/:id/pecas/:vinculoId", exigirPermissao("ativos", "editar"), asyncHandler(async (req, res) => {
  try {
    await removerVinculo(Number(req.params.vinculoId), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoVinculo) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const copiarListaTecnicaSchema = z.object({
  ativoOrigemId: z.number().int(),
  pecaIds: z.array(z.number().int()).min(1, "Selecione ao menos uma peça para copiar."),
});

ativosRouter.post("/:id/pecas/copiar", exigirPermissao("ativos", "editar"), asyncHandler(async (req, res) => {
  const parsed = copiarListaTecnicaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const resultado = await copiarListaTecnica(
      Number(req.params.id),
      parsed.data.ativoOrigemId,
      parsed.data.pecaIds,
      req.usuario!.id
    );
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoVinculo) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
