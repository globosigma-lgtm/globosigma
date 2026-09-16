import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  atualizarConfiguracoes,
  criarFeriado,
  ErroValidacaoConfiguracao,
  listarFeriados,
  obterConfiguracoes,
  removerFeriado,
} from "../services/configuracaoService.js";

export const configuracoesRouter = Router();

configuracoesRouter.use(exigirAutenticacao);

configuracoesRouter.get("/", exigirPermissao("configuracoes", "ver"), asyncHandler(async (_req, res) => {
  res.json({ configuracoes: await obterConfiguracoes() });
}));

const dadosConfigSchema = z.object({
  tratamento_dia_nao_util: z.enum(["gerar_na_data", "antecipar", "postergar"]),
  margem_seguranca_dias: z.number().int().min(0),
  limite_horas_dia_responsavel: z.number().positive(),
});

configuracoesRouter.put("/", exigirPermissao("configuracoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const configuracoes = await atualizarConfiguracoes(parsed.data, req.usuario!.id);
    res.json({ configuracoes });
  } catch (err) {
    if (err instanceof ErroValidacaoConfiguracao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

configuracoesRouter.get("/feriados", exigirPermissao("configuracoes", "ver"), asyncHandler(async (_req, res) => {
  res.json({ feriados: await listarFeriados() });
}));

const dadosFeriadoSchema = z.object({
  data: z.string().min(1, "Informe a data do feriado."),
  descricao: z.string().min(1, "Informe a descrição do feriado."),
});

configuracoesRouter.post("/feriados", exigirPermissao("configuracoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosFeriadoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const feriado = await criarFeriado(parsed.data.data, parsed.data.descricao, req.usuario!.id);
    res.status(201).json({ feriado });
  } catch (err) {
    if (err instanceof ErroValidacaoConfiguracao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

configuracoesRouter.delete("/feriados/:id", exigirPermissao("configuracoes", "editar"), asyncHandler(async (req, res) => {
  try {
    await removerFeriado(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoConfiguracao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
