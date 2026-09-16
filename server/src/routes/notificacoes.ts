import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { contarNaoLidas, listarNotificacoes, marcarComoLida, marcarTodasComoLidas } from "../services/notificacaoService.js";

export const notificacoesRouter = Router();

notificacoesRouter.use(exigirAutenticacao);

notificacoesRouter.get("/", asyncHandler(async (req, res) => {
  const apenasNaoLidas = req.query.apenasNaoLidas === "true";
  res.json({
    notificacoes: await listarNotificacoes(req.usuario!.id, apenasNaoLidas),
    naoLidas: await contarNaoLidas(req.usuario!.id),
  });
}));

notificacoesRouter.post("/:id/lida", asyncHandler(async (req, res) => {
  await marcarComoLida(Number(req.params.id), req.usuario!.id);
  res.json({ ok: true });
}));

notificacoesRouter.post("/marcar-todas-lidas", asyncHandler(async (req, res) => {
  await marcarTodasComoLidas(req.usuario!.id);
  res.json({ ok: true });
}));
