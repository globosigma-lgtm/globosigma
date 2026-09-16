import { Router } from "express";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { listarAuditoria, listarEntidadesAuditadas } from "../services/auditoriaService.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const auditoriaRouter = Router();

auditoriaRouter.use(exigirAutenticacao);

auditoriaRouter.get("/", exigirPermissao("auditoria", "ver"), asyncHandler(async (req, res) => {
  const { entidade, acao, usuarioId, dataInicio, dataFim } = req.query;
  const registros = await listarAuditoria({
    entidade: typeof entidade === "string" ? entidade : undefined,
    acao: typeof acao === "string" ? acao : undefined,
    usuarioId: usuarioId ? Number(usuarioId) : undefined,
    dataInicio: typeof dataInicio === "string" ? dataInicio : undefined,
    dataFim: typeof dataFim === "string" ? dataFim : undefined,
  });
  res.json({ registros });
}));

auditoriaRouter.get("/entidades", exigirPermissao("auditoria", "ver"), asyncHandler(async (_req, res) => {
  res.json({ entidades: await listarEntidadesAuditadas() });
}));
