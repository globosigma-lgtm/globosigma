import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Peca } from "../types";
import { PecaFormModal } from "../components/PecaFormModal";
import { exportarCSV } from "../lib/csv";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function formatarNumero(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function Pecas() {
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [pecas, setPecas] = useState<Peca[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [apenasAbaixoDoMinimo, setApenasAbaixoDoMinimo] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  function carregar() {
    const params = new URLSearchParams();
    if (texto) params.set("texto", texto);
    if (categoria) params.set("categoria", categoria);
    if (apenasAbaixoDoMinimo) params.set("apenasAbaixoDoMinimo", "true");
    api
      .get<{ pecas: Peca[] }>(`/pecas?${params.toString()}`)
      .then((r) => setPecas(r.pecas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as peças."));
  }

  useEffect(carregar, [texto, categoria, apenasAbaixoDoMinimo]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar(_peca: Peca) {
    setModalAberto(false);
    carregar();
  }

  function exportar() {
    if (!pecas) return;
    exportarCSV(
      "pecas",
      [
        { titulo: "Código", valor: (p: Peca) => p.codigo },
        { titulo: "Descrição", valor: (p: Peca) => p.descricao },
        { titulo: "Categoria", valor: (p: Peca) => p.categoria },
        { titulo: "Estoque atual", valor: (p: Peca) => p.estoque_atual },
        { titulo: "Estoque mínimo", valor: (p: Peca) => p.estoque_minimo },
        { titulo: "Situação", valor: (p: Peca) => (p.estoque_atual < p.estoque_minimo ? "Abaixo do mínimo" : "Adequado") },
        { titulo: "Lead time (dias)", valor: (p: Peca) => p.lead_time_dias },
        { titulo: "Fabricante", valor: (p: Peca) => p.fabricante },
      ],
      pecas
    );
  }

  const categorias = Array.from(new Set((pecas ?? []).map((p) => p.categoria).filter(Boolean))) as string[];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Peças</h1>
          <div className="page-header__desc">Catálogo de peças e materiais de manutenção</div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn--secondary" disabled={!pecas?.length} onClick={exportar}>
            Exportar CSV
          </button>
          {pode("pecas", "criar") && (
            <button type="button" className="btn btn--primary" onClick={() => setModalAberto(true)}>
              Nova peça
            </button>
          )}
        </div>
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código ou descrição" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-categoria">Categoria</label>
          <select id="f-categoria" className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)", paddingBottom: "8px" }}>
          <input type="checkbox" checked={apenasAbaixoDoMinimo} onChange={(e) => setApenasAbaixoDoMinimo(e.target.checked)} />
          Apenas abaixo do mínimo
        </label>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Estoque atual</th>
              <th>Estoque mínimo</th>
              <th>Situação</th>
              <th>Lead time</th>
              <th>Fabricante</th>
            </tr>
          </thead>
          <tbody>
            {pecas?.map((p) => {
              const abaixo = p.estoque_atual < p.estoque_minimo;
              return (
                <tr key={p.id} onClick={() => navigate(`/pecas/${p.id}`)} style={{ cursor: "pointer" }}>
                  <td className="mono">{p.codigo}</td>
                  <td>{p.descricao}</td>
                  <td>{p.categoria}</td>
                  <td className="mono">
                    {formatarNumero(p.estoque_atual)} {p.unidade_medida}
                  </td>
                  <td className="mono">
                    {formatarNumero(p.estoque_minimo)} {p.unidade_medida}
                  </td>
                  <td>
                    <span className={`badge ${abaixo ? "badge--estoque-baixo" : "badge--estoque-ok"}`}>
                      <span className="badge__dot" /> {abaixo ? "Abaixo do mínimo" : "Adequado"}
                    </span>
                  </td>
                  <td className="mono">{p.lead_time_dias}d</td>
                  <td>{p.fabricante}</td>
                </tr>
              );
            })}
            {pecas?.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  Nenhuma peça encontrada com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && <PecaFormModal peca={null} onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}
    </div>
  );
}
