import { Router } from "express";
import { z } from "zod";
import { dbAll } from "../db/pg.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { atualizarUsuario, criarUsuario, ErroValidacaoUsuario, excluirUsuario, listarUsuarios } from "../services/usuarioService.js";

export const usuariosRouter = Router();

usuariosRouter.use(exigirAutenticacao);

usuariosRouter.get("/simples", asyncHandler(async (req, res) => {
  const { perfil } = req.query;
  const usuarios =
    typeof perfil === "string" && perfil
      ? await dbAll(
          `SELECT u.id, u.nome, u.matricula, u.setor
           FROM usuario u JOIN perfil p ON p.id = u.perfil_id
           WHERE u.ativo = 1 AND u.excluido_em IS NULL AND p.nome = ?
           ORDER BY u.nome`,
          [perfil]
        )
      : await dbAll("SELECT id, nome, matricula, setor FROM usuario WHERE ativo = 1 AND excluido_em IS NULL ORDER BY nome");
  res.json({ usuarios });
}));

usuariosRouter.get("/", exigirPermissao("usuarios", "ver"), asyncHandler(async (req, res) => {
  const { texto } = req.query;
  res.json({ usuarios: await listarUsuarios({ texto: typeof texto === "string" ? texto : undefined }) });
}));

usuariosRouter.get("/perfis", exigirPermissao("usuarios", "ver"), asyncHandler(async (_req, res) => {
  const perfis = await dbAll("SELECT id, nome, descricao, permissoes, somente_leitura FROM perfil WHERE excluido_em IS NULL ORDER BY nome");
  res.json({ perfis: perfis.map((p: any) => ({ ...p, permissoes: JSON.parse(p.permissoes) })) });
}));

const dadosUsuarioSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  matricula: z.string().min(1, "Informe a matrícula."),
  email: z.string().nullable().optional(),
  perfil_id: z.number().int(),
  setor: z.string().nullable().optional(),
  cargo: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  custo_hora_padrao: z.number().min(0).optional(),
  senha: z.string().nullable().optional(),
});

usuariosRouter.post("/", exigirPermissao("usuarios", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const usuario = await criarUsuario({ ...parsed.data, senha: parsed.data.senha ?? undefined }, req.usuario!.id);
    res.status(201).json({ usuario });
  } catch (err) {
    if (err instanceof ErroValidacaoUsuario) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

usuariosRouter.put("/:id", exigirPermissao("usuarios", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const usuario = await atualizarUsuario(Number(req.params.id), { ...parsed.data, senha: parsed.data.senha ?? undefined }, req.usuario!.id);
    res.json({ usuario });
  } catch (err) {
    if (err instanceof ErroValidacaoUsuario) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

usuariosRouter.delete("/:id", exigirPermissao("usuarios", "excluir"), asyncHandler(async (req, res) => {
  try {
    await excluirUsuario(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoUsuario) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
