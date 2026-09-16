import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { tocarSom } from "../../lib/sons";
import { usePolling } from "../../lib/usePolling";
import type { Notificacao } from "../../types";

const TIPOS_CRITICOS = new Set(["ruptura_critica", "os_atrasada"]);

const CAMINHO_POR_ENTIDADE: Record<string, (id: number) => string> = {
  ordem_servico: (id) => `/ordens-servico/${id}`,
  solicitacao: (id) => `/solicitacoes/${id}`,
  peca: (id) => `/pecas/${id}`,
  ativo: (id) => `/ativos/${id}?aba=historico`,
};

function tempoRelativo(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 60000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min atrás`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas}h atrás`;
  return `${Math.round(horas / 24)}d atrás`;
}

/** CAMPO-01/NOVO-04: sino de notificação in-app — atribuição de OS, atraso, ruptura crítica de peça e solicitação recusada/convertida. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const idsVistosRef = useRef<Set<number> | null>(null);

  function carregar() {
    api.get<{ notificacoes: Notificacao[]; naoLidas: number }>("/notificacoes").then((r) => {
      if (idsVistosRef.current) {
        const novas = r.notificacoes.filter((n) => !n.lida && !idsVistosRef.current!.has(n.id));
        if (novas.length > 0) {
          tocarSom(novas.some((n) => TIPOS_CRITICOS.has(n.tipo)) ? "alerta_critico" : "notificacao");
        }
      }
      idsVistosRef.current = new Set(r.notificacoes.map((n) => n.id));
      setNotificacoes(r.notificacoes);
      setNaoLidas(r.naoLidas);
    });
  }

  useEffect(carregar, []);
  usePolling(carregar, 60000);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function aoClicarNotificacao(n: Notificacao) {
    if (!n.lida) {
      await api.post(`/notificacoes/${n.id}/lida`);
      carregar();
    }
    setAberto(false);
    if (n.entidade && n.entidade_id && CAMINHO_POR_ENTIDADE[n.entidade]) {
      navigate(CAMINHO_POR_ENTIDADE[n.entidade](n.entidade_id));
    }
  }

  async function marcarTodasLidas() {
    await api.post("/notificacoes/marcar-todas-lidas");
    carregar();
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setAberto((a) => !a)}
        aria-label="Notificações"
        style={{ position: "relative", fontSize: "18px" }}
      >
        🔔
        {naoLidas > 0 && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              background: "var(--c-danger-500)",
              color: "var(--c-n-0)",
              borderRadius: "var(--radius-full)",
              fontSize: "10px",
              fontWeight: 700,
              minWidth: "16px",
              height: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "340px",
            maxHeight: "420px",
            overflowY: "auto",
            zIndex: 50,
            padding: "0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--c-n-200)" }}>
            <strong style={{ fontSize: "var(--text-small)" }}>Notificações</strong>
            {naoLidas > 0 && (
              <button type="button" className="btn btn--ghost" style={{ fontSize: "var(--text-caption)", padding: "2px 6px" }} onClick={marcarTodasLidas}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          {notificacoes.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px 16px" }}>
              Nenhuma notificação.
            </div>
          ) : (
            notificacoes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => aoClicarNotificacao(n)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 16px",
                  border: "none",
                  borderBottom: "1px solid var(--c-n-100)",
                  background: n.lida ? "transparent" : "var(--c-primary-50)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: "var(--text-small)", fontWeight: n.lida ? 400 : 600, color: "var(--c-n-800)" }}>{n.titulo}</div>
                {n.mensagem && (
                  <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)", marginTop: "2px" }}>{n.mensagem}</div>
                )}
                <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-400)", marginTop: "2px" }}>{tempoRelativo(n.criada_em)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
