import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import type { Usuario } from "../types";
import type { Acao, Modulo } from "../lib/permissions";
import { temPermissao } from "../lib/permissions";

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  login: (matricula: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  pode: (modulo: Modulo, acao?: Acao) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .get<{ usuario: Usuario }>("/auth/me")
      .then((r) => setUsuario(r.usuario))
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
  }, []);

  const login = useCallback(async (matricula: string, senha: string) => {
    const r = await api.post<{ usuario: Usuario }>("/auth/login", { matricula, senha });
    setUsuario(r.usuario);
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUsuario(null);
  }, []);

  const pode = useCallback(
    (modulo: Modulo, acao: Acao = "ver") => temPermissao(usuario?.permissoes, modulo, acao),
    [usuario]
  );

  const value = useMemo(() => ({ usuario, carregando, login, logout, pode }), [usuario, carregando, login, logout, pode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}

export { ApiError };
