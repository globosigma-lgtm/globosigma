import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { VersionBanner } from "./VersionBanner";

export function AppLayout() {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar aberta={menuAberto} onFechar={() => setMenuAberto(false)} />
      <button
        className={`sidebar__overlay${menuAberto ? " is-visible" : ""}`}
        aria-label="Fechar menu"
        onClick={() => setMenuAberto(false)}
      />
      <div className="main-column">
        <VersionBanner />
        <Topbar onAbrirMenu={() => setMenuAberto(true)} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
