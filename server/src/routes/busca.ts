import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { buscaGlobal } from "../services/buscaService.js";

export const buscaRouter = Router();

buscaRouter.use(exigirAutenticacao);

// BUSCA-01: sem gate de módulo — cada entidade já se filtra sozinha dentro de buscaGlobal
// conforme a permissão "ver" do usuário logado.
buscaRouter.get("/", asyncHandler(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    return res.json({ resultados: [] });
  }
  res.json({ resultados: await buscaGlobal(q, req.usuario!.permissoes) });
}));
