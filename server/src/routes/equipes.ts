import { Router } from "express";
import { z } from "zod";
import { dbAll } from "../db/pg.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import {
  atualizarEquipe,
  buscarEquipePorId,
  criarEquipe,
  ErroValidacaoEquipe,
  excluirEquipe,
  listarEquipes,
} from "../services/equipeService.js";

export const equipesRouter = Router();

equipesRouter.use(exigirAutenticacao);

// Sem gate de módulo — qualquer usuário autenticado precisa listar equipes pra popular o dropdown
// de atribuição de OS (mesmo padrão de GET /usuarios/simples em usuarios.ts).
equipesRouter.get("/simples", asyncHandler(async (_req, res) => {
  const equipes = await dbAll("SELECT id, nome FROM equipe WHERE ativo = 1 AND excluido_em IS NULL ORDER BY nome");
  res.json({ equipes });
}));

equipesRouter.get("/", exigirPermissao("equipes", "ver"), asyncHandler(async (req, res) => {
  const { texto } = req.query;
  const equipes = await listarEquipes({ texto: typeof texto === "string" ? texto : undefined });
  res.json({ equipes });
}));

equipesRouter.get("/:id", exigirPermissao("equipes", "ver"), asyncHandler(async (req, res) => {
  const equipe = await buscarEquipePorId(Number(req.params.id));
  if (!equipe) return res.status(404).json({ erro: "Equipe não encontrada." });
  res.json({ equipe });
}));

const dadosEquipeSchema = z.object({
  nome: z.string().min(1, "Informe o nome da equipe."),
  descricao: z.string().nullable().optional(),
  membroIds: z.array(z.number().int()).default([]),
});

equipesRouter.post("/", exigirPermissao("equipes", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosEquipeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    const equipe = await criarEquipe(parsed.data, req.usuario!.id);
    res.status(201).json({ equipe });
  } catch (err) {
    if (err instanceof ErroValidacaoEquipe) return res.status(400).json({ erro: err.message });
    throw err;
  }
}));

equipesRouter.put("/:id", exigirPermissao("equipes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosEquipeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  try {
    const equipe = await atualizarEquipe(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ equipe });
  } catch (err) {
    if (err instanceof ErroValidacaoEquipe) return res.status(400).json({ erro: err.message });
    throw err;
  }
}));

equipesRouter.delete("/:id", exigirPermissao("equipes", "excluir"), asyncHandler(async (req, res) => {
  try {
    await excluirEquipe(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoEquipe) return res.status(400).json({ erro: err.message });
    throw err;
  }
}));
