import { Router } from "express";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { gerarRelatorioPac, listarOSRealizadas, listarSetores } from "../services/relatorioPacService.js";

export const relatoriosPacRouter = Router();

relatoriosPacRouter.use(exigirAutenticacao);

relatoriosPacRouter.get("/setores", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (_req, res) => {
  res.json({ setores: await listarSetores() });
}));

function lerFiltros(req: import("express").Request) {
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const semanaInicio = Number(req.query.semanaInicio) || 1;
  const semanaFim = Number(req.query.semanaFim) || semanaInicio;
  const setor = typeof req.query.setor === "string" && req.query.setor ? req.query.setor : undefined;
  const ativoId = req.query.ativoId ? Number(req.query.ativoId) : undefined;
  return { ano, semanaInicio, semanaFim, setor, ativoId };
}

relatoriosPacRouter.get("/pac-1150", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const filtros = lerFiltros(req);
  if (filtros.semanaFim < filtros.semanaInicio) {
    return res.status(400).json({ erro: "A semana final não pode ser anterior à semana inicial." });
  }
  res.json(await gerarRelatorioPac("manutencao", filtros));
}));

relatoriosPacRouter.get("/pac-1149", exigirPermissao("lubrificacao", "ver"), asyncHandler(async (req, res) => {
  const filtros = lerFiltros(req);
  if (filtros.semanaFim < filtros.semanaInicio) {
    return res.status(400).json({ erro: "A semana final não pode ser anterior à semana inicial." });
  }
  res.json(await gerarRelatorioPac("lubrificacao", filtros));
}));

relatoriosPacRouter.get("/os-realizadas", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const { inicio, fim, tipo, ativoId, responsavelId } = req.query;
  if (typeof inicio !== "string" || typeof fim !== "string" || !inicio || !fim) {
    return res.status(400).json({ erro: "Informe o período (início e fim)." });
  }
  const responsavelForcado =
    ["Técnico", "Inspetor"].includes(req.usuario?.perfil_nome ?? "")
      ? req.usuario!.id
      : responsavelId
        ? Number(responsavelId)
        : undefined;
  const ordens = await listarOSRealizadas({
    inicio,
    fim,
    tipo: typeof tipo === "string" && tipo ? tipo : undefined,
    ativoId: ativoId ? Number(ativoId) : undefined,
    responsavelId: responsavelForcado,
  });
  res.json({ ordens });
}));
