import { useLocation } from "react-router-dom";
import { NAVEGACAO } from "../../nav";
import { useAuth } from "../../context/AuthContext";
import { NotificationBell } from "./NotificationBell";
import { GlobalSearch } from "./GlobalSearch";

function tituloDaRota(pathname: string): string {
  for (const grupo of NAVEGACAO) {
    for (const item of grupo.itens) {
      if (item.caminho === pathname) return item.rotulo;
    }
  }
  return "Globosigma";
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export function Topbar({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const location = useLocation();
  const { usuario, logout } = useAuth();

  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          className="btn btn--ghost"
          id="botao-menu-mobile"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
        >
          ☰
        </button>
        <h1 className="topbar__title">{tituloDaRota(location.pathname)}</h1>
      </div>

      {usuario && <GlobalSearch />}

      {usuario && (
        <div className="topbar__user">
          <NotificationBell />
          <div className="topbar__user-info">
            <div className="topbar__user-name">{usuario.nome}</div>
            <div className="topbar__user-role">{usuario.perfil_nome}</div>
          </div>
          <div className="avatar" title={usuario.nome}>{iniciais(usuario.nome)}</div>
          <button className="btn btn--secondary" onClick={() => logout()}>
            Sair
          </button>
        </div>
      )}
    </header>
  );
}
