import type { Request, Response, NextFunction } from "express";
import { COOKIE_NAME, verificarToken } from "../auth.js";
import { buscarUsuarioPorId, type UsuarioComPerfil } from "../services/usuarioService.js";
import { temPermissao, type Acao, type Modulo } from "../permissions.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioComPerfil;
    }
  }
}

export async function exigirAutenticacao(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    const payload = token ? verificarToken(token) : null;
    if (!payload) {
      return res.status(401).json({ erro: "Sessão inválida ou expirada. Faça login novamente." });
    }
    const usuario = await buscarUsuarioPorId(payload.usuarioId);
    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ erro: "Usuário inativo ou não encontrado." });
    }
    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

export function exigirPermissao(modulo: Modulo, acao: Acao) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !temPermissao(req.usuario.permissoes, modulo, acao)) {
      return res.status(403).json({
        erro: `Acesso negado: seu perfil (${req.usuario?.perfil_nome ?? "desconhecido"}) não tem permissão de "${acao}" em "${modulo}".`,
      });
    }
    next();
  };
}
