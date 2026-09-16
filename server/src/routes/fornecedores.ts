import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { atualizarFornecedor, buscarFornecedorPorId, criarFornecedor, ErroValidacaoFornecedor, listarFornecedores } from "../services/fornecedorService.js";

export const fornecedoresRouter = Router();

fornecedoresRouter.use(exigirAutenticacao);

function tratarErro(err: unknown, res: import("express").Response) {
  if (err instanceof ErroValidacaoFornecedor) {
    return res.status(400).json({ erro: err.message });
  }
  throw err;
}

// SERV-EXT-04: sem um módulo próprio de permissões para fornecedor/serviço externo (criar um novo
// exigiria reprocessar os perfis já semeados no banco), o acesso segue a mesma trava de
// "ordens_servico" — faz sentido porque hoje o único consumidor de fornecedor é o registro de
// saída para serviço externo, sempre feito a partir de uma OS.
fornecedoresRouter.get("/", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const { texto } = req.query;
  const fornecedores = await listarFornecedores({ texto: typeof texto === "string" ? texto : undefined, apenasAtivos: true });
  res.json({ fornecedores });
}));

fornecedoresRouter.get("/:id", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const fornecedor = await buscarFornecedorPorId(Number(req.params.id));
  if (!fornecedor) {
    return res.status(404).json({ erro: "Fornecedor não encontrado." });
  }
  res.json({ fornecedor });
}));

const dadosFornecedorSchema = z.object({
  nome: z.string().min(1, "Informe o nome do fornecedor."),
  cnpj: z.string().nullable().optional(),
  contato: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  especialidade: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

fornecedoresRouter.post("/", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosFornecedorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const fornecedor = await criarFornecedor(parsed.data, req.usuario!.id);
    res.status(201).json({ fornecedor });
  } catch (err) {
    tratarErro(err, res);
  }
}));

fornecedoresRouter.put("/:id", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosFornecedorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const fornecedor = await atualizarFornecedor(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ fornecedor });
  } catch (err) {
    tratarErro(err, res);
  }
}));
