import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import type { Modulo } from "../lib/permissions";

export function RequirePermissao({ modulo, children }: { modulo: Modulo; children: ReactNode }) {
  const { pode, usuario } = useAuth();

  if (!pode(modulo, "ver")) {
    return (
      <div className="empty-state">
        <h3>Acesso não permitido</h3>
        <p>
          Seu perfil ({usuario?.perfil_nome}) não tem acesso a este módulo. Fale com o administrador do
          sistema se você acredita que deveria ter essa permissão.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
