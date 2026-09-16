import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import {
  obterBacklogSemanal,
  obterCumprimentoPorSetor,
  obterCurvaABC,
  obterCustoPorAtivo,
  obterIndicadorTempoExecucao,
  obterIndicadoresDashboard,
  obterTicketMedioPorTecnico,
} from "../services/indicadoresService.js";

export const indicadoresRouter = Router();

indicadoresRouter.use(exigirAutenticacao);

indicadoresRouter.get("/dashboard", exigirPermissao("indicadores", "ver"), asyncHandler(async (_req, res) => {
  res.json({ indicadores: await obterIndicadoresDashboard() });
}));

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

indicadoresRouter.get("/tempo-execucao", exigirPermissao("indicadores", "ver"), asyncHandler(async (req, res) => {
  const { inicio, fim } = req.query;
  const inicioValido = typeof inicio === "string" && DATA_ISO.test(inicio) ? inicio : undefined;
  const fimValido = typeof fim === "string" && DATA_ISO.test(fim) ? fim : undefined;
  res.json({ indicador: await obterIndicadorTempoExecucao(inicioValido, fimValido) });
}));

indicadoresRouter.get("/backlog-semanal", exigirPermissao("indicadores", "ver"), asyncHandler(async (req, res) => {
  const semanas = Number(req.query.semanas) || 12;
  res.json({ pontos: await obterBacklogSemanal(Math.min(semanas, 52)) });
}));

indicadoresRouter.get("/custo-por-ativo", exigirPermissao("indicadores", "ver"), asyncHandler(async (req, res) => {
  const ativoId = req.query.ativoId ? Number(req.query.ativoId) : undefined;
  res.json({ itens: await obterCustoPorAtivo(ativoId) });
}));

indicadoresRouter.get("/cumprimento-por-setor", exigirPermissao("indicadores", "ver"), asyncHandler(async (_req, res) => {
  res.json({ itens: await obterCumprimentoPorSetor() });
}));

indicadoresRouter.get("/curva-abc", exigirPermissao("indicadores", "ver"), asyncHandler(async (_req, res) => {
  res.json({ itens: await obterCurvaABC() });
}));

indicadoresRouter.get("/ticket-medio-tecnico", exigirPermissao("indicadores", "ver"), asyncHandler(async (req, res) => {
  const { inicio, fim } = req.query;
  const inicioValido = typeof inicio === "string" && DATA_ISO.test(inicio) ? inicio : undefined;
  const fimValido = typeof fim === "string" && DATA_ISO.test(fim) ? fim : undefined;
  res.json({ itens: await obterTicketMedioPorTecnico(inicioValido, fimValido) });
}));
