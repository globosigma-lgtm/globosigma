import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  atualizarPeca,
  buscarPecaPorId,
  codigoSugerido,
  criarPeca,
  ErroValidacaoPeca,
  excluirPeca,
  listarPecas,
} from "../services/pecaService.js";
import { listarAtivosDaPeca } from "../services/ativoPecaService.js";

export const pecasRouter = Router();

pecasRouter.use(exigirAutenticacao);

const dadosPecaSchema = z.object({
  codigo: z.string().min(1, "Informe o código da peça."),
  descricao: z.string().min(1, "Informe a descrição da peça."),
  unidade_medida: z.enum(["un", "m", "kg", "l", "cx", "par", "rolo"]),
  categoria: z.string().nullable().optional(),
  fabricante: z.string().nullable().optional(),
  codigo_fabricante: z.string().nullable().optional(),
  estoque_atual: z.number().min(0).optional(),
  estoque_minimo: z.number().min(0).optional(),
  ponto_de_pedido: z.number().min(0).optional(),
  lead_time_dias: z.number().int().min(0).optional(),
  custo_unitario_medio: z.number().min(0).optional(),
  fornecedor_preferencial: z.string().nullable().optional(),
  localizacao_almoxarifado: z.string().nullable().optional(),
  ativa: z.boolean().optional(),
});

pecasRouter.get("/", exigirPermissao("pecas", "ver"), asyncHandler(async (req, res) => {
  const { texto, categoria, fabricante, apenasAbaixoDoMinimo } = req.query;
  const pecas = await listarPecas({
    texto: typeof texto === "string" ? texto : undefined,
    categoria: typeof categoria === "string" ? categoria : undefined,
    fabricante: typeof fabricante === "string" ? fabricante : undefined,
    apenasAbaixoDoMinimo: apenasAbaixoDoMinimo === "true",
  });
  res.json({ pecas });
}));

pecasRouter.get("/codigo-sugerido", exigirPermissao("pecas", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoSugerido() });
}));

pecasRouter.get("/:id", exigirPermissao("pecas", "ver"), asyncHandler(async (req, res) => {
  const peca = await buscarPecaPorId(Number(req.params.id));
  if (!peca) {
    return res.status(404).json({ erro: "Peça não encontrada." });
  }
  res.json({ peca });
}));

pecasRouter.get("/:id/ativos", exigirPermissao("pecas", "ver"), asyncHandler(async (req, res) => {
  res.json({ ativos: await listarAtivosDaPeca(Number(req.params.id)) });
}));

pecasRouter.post("/", exigirPermissao("pecas", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosPecaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const peca = await criarPeca(parsed.data, req.usuario!.id);
    res.status(201).json({ peca });
  } catch (err) {
    if (err instanceof ErroValidacaoPeca) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

pecasRouter.put("/:id", exigirPermissao("pecas", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosPecaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const peca = await atualizarPeca(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ peca });
  } catch (err) {
    if (err instanceof ErroValidacaoPeca) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

pecasRouter.delete("/:id", exigirPermissao("pecas", "excluir"), asyncHandler(async (req, res) => {
  try {
    await excluirPeca(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoPeca) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
