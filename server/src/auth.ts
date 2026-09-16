import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.SIGMA_JWT_SECRET || "sigma-dev-secret-troque-em-producao";
export const COOKIE_NAME = "sigma_token";

export interface TokenPayload {
  usuarioId: number;
}

export function assinarToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function verificarToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
