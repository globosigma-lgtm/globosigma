import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="login-screen">
        <div style={{ color: "var(--c-n-300)" }}>Carregando…</div>
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" state={{ de: location.pathname }} replace />;
  }

  return <>{children}</>;
}
