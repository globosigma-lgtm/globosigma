import { useEffect, useState } from "react";
import { usePolling } from "../../lib/usePolling";

const INTERVALO_CHECAGEM_MS = 10 * 60 * 1000;

/** VERSAO-01: compara a versão embutida no JS rodando agora (__BUILD_VERSION__, injetada por
 * vite.config.ts) com a versão publicada em /version.json. Diferentes = essa aba está rodando uma
 * build antiga (comum em app de página única: navegar entre telas não recarrega o JS sozinho). */
export function VersionBanner() {
  const [versaoDesatualizada, setVersaoDesatualizada] = useState(false);

  function checar() {
    fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { version?: string } | null) => {
        if (r?.version && r.version !== __BUILD_VERSION__) setVersaoDesatualizada(true);
      })
      .catch(() => {
        // Falha de rede na checagem não é motivo pra avisar nada — só tenta de novo no próximo ciclo.
      });
  }

  useEffect(checar, []);
  usePolling(checar, INTERVALO_CHECAGEM_MS);

  if (!versaoDesatualizada) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        padding: "8px 16px",
        background: "var(--c-primary-600)",
        color: "var(--c-n-0)",
        fontSize: "var(--text-small)",
      }}
    >
      <span>Uma nova versão do sistema está disponível.</span>
      <button
        type="button"
        className="btn btn--secondary"
        style={{ padding: "2px 12px" }}
        onClick={() => window.location.reload()}
      >
        Recarregar
      </button>
    </div>
  );
}
