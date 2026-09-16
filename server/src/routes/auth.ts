import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { assinarToken, COOKIE_NAME } from "../auth.js";
import { buscarUsuarioPorMatricula, registrarAcesso } from "../services/usuarioService.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { dbRun } from "../db/pg.js";

export const authRouter = Router();

// SEG-01: sem isso, matrícula/senha podia ser tentada indefinidamente. 10 tentativas por matrícula
// a cada 15 min é generoso para erro de digitação e ainda assim inviabiliza força bruta.
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.matricula ? `matricula:${req.body.matricula}` : ipKeyGenerator(req.ip ?? "")),
  handler: asyncHandler(async (req, res) => {
    await dbRun(
      `INSERT INTO log_auditoria (entidade, entidade_id, acao, valor_novo, usuario_id, ip)
       VALUES ('usuario', NULL, 'status', ?, NULL, ?)`,
      [
        JSON.stringify({ evento: "login_bloqueado_por_excesso_de_tentativas", matricula: req.body?.matricula ?? null }),
        req.ip ?? null,
      ]
    );
    res.status(429).json({ erro: "Muitas tentativas de login. Tente novamente em alguns minutos." });
  }),
});

const loginSchema = z.object({
  matricula: z.string().min(1, "Informe a matrícula."),
  senha: z.string().min(1, "Informe a senha."),
});

authRouter.post("/login", limitadorLogin, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { matricula, senha } = parsed.data;
  const usuario = await buscarUsuarioPorMatricula(matricula);
  if (!usuario || !usuario.ativo || !bcrypt.compareSync(senha, usuario.senha_hash)) {
    return res.status(401).json({ erro: "Matrícula ou senha incorretas." });
  }
  await registrarAcesso(usuario.id);
  const token = assinarToken({ usuarioId: usuario.id });
  // SEG-02: em produção (atrás de HTTPS) isso precisa ser true, ou o cookie de sessão trafega em
  // texto claro. Condicionado a NODE_ENV em vez de fixo para não quebrar o dev local sobre HTTP.
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
  });
  const { senha_hash, ...usuarioSemSenha } = usuario;
  res.json({ usuario: usuarioSemSenha });
}));

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

authRouter.get("/me", exigirAutenticacao, (req, res) => {
  res.json({ usuario: req.usuario });
});
