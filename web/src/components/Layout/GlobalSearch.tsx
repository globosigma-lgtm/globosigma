import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import type { ResultadoBusca } from "../../types";

const TERMO_MINIMO = 2;
const DEBOUNCE_MS = 300;

/** BUSCA-01: busca global (peças, ativos, planos, OS, solicitações, equipes, usuários — tudo que o
 * usuário tem permissão de ver). Mesmo padrão de painel flutuante do NotificationBell.tsx: ref +
 * listener de clique-fora em vez de onBlur (blur dispara antes do click no resultado registrar). */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (termo.trim().length < TERMO_MINIMO) {
      setResultados([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    timeoutRef.current = setTimeout(() => {
      api
        .get<{ resultados: ResultadoBusca[] }>(`/busca?q=${encodeURIComponent(termo.trim())}`)
        .then((r) => setResultados(r.resultados))
        .finally(() => setCarregando(false));
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [termo]);

  function aoClicarResultado(r: ResultadoBusca) {
    setAberto(false);
    setTermo("");
    navigate(r.caminho);
  }

  const grupos: { grupo: string; itens: ResultadoBusca[] }[] = [];
  for (const r of resultados) {
    let grupo = grupos.find((g) => g.grupo === r.grupo);
    if (!grupo) {
      grupo = { grupo: r.grupo, itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push(r);
  }

  return (
    <div ref={ref} style={{ position: "relative", flex: "1 1 auto", maxWidth: "360px" }}>
      <input
        className="input"
        placeholder="Buscar peças, ativos, equipes, usuários…"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onFocus={() => setAberto(true)}
        aria-label="Busca global"
      />

      {aberto && termo.trim().length >= TERMO_MINIMO && (
        <div
          className="card"
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 8px)",
            width: "360px",
            maxHeight: "420px",
            overflowY: "auto",
            zIndex: 50,
            padding: "0",
          }}
        >
          {carregando && (
            <div className="empty-state" style={{ padding: "16px" }}>
              Buscando…
            </div>
          )}
          {!carregando && resultados.length === 0 && (
            <div className="empty-state" style={{ padding: "16px" }}>
              Nenhum resultado para "{termo.trim()}".
            </div>
          )}
          {!carregando &&
            grupos.map((g) => (
              <div key={g.grupo}>
                <div
                  style={{
                    padding: "8px 16px",
                    fontSize: "var(--text-caption)",
                    fontWeight: 700,
                    color: "var(--c-n-500)",
                    background: "var(--c-n-50)",
                  }}
                >
                  {g.grupo}
                </div>
                {g.itens.map((r, i) => (
                  <button
                    key={`${r.tipo}-${i}`}
                    type="button"
                    onClick={() => aoClicarResultado(r)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 16px",
                      border: "none",
                      borderBottom: "1px solid var(--c-n-100)",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: "var(--text-small)", color: "var(--c-n-800)" }}>{r.titulo}</div>
                    {r.subtitulo && (
                      <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)", marginTop: "2px" }}>{r.subtitulo}</div>
                    )}
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
