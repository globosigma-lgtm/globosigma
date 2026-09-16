import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Plano } from "../types";
import { PlanoFormModal, ROTULO_PERIODICIDADE, ROTULO_TIPO_MANUTENCAO } from "../components/PlanoFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export function Planos() {
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [tipoManutencao, setTipoManutencao] = useState("");
  const [periodicidade, setPeriodicidade] = useState("");
  const [apenasAtivos, setApenasAtivos] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  function carregar() {
    const params = new URLSearchParams();
    if (texto) params.set("texto", texto);
    if (tipoManutencao) params.set("tipoManutencao", tipoManutencao);
    if (periodicidade) params.set("periodicidade", periodicidade);
    if (apenasAtivos) params.set("apenasAtivos", "true");
    api
      .get<{ planos: Plano[] }>(`/planos?${params.toString()}`)
      .then((r) => setPlanos(r.planos))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os planos."));
  }

  useEffect(carregar, [texto, tipoManutencao, periodicidade, apenasAtivos]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar(_plano: Plano) {
    setModalAberto(false);
    carregar();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Planos de manutenção</h1>
          <div className="page-header__desc">Periodicidade, checklist e peças previstas para cada plano preventivo</div>
        </div>
        {pode("planos", "criar") && (
          <button type="button" className="btn btn--primary" onClick={() => setModalAberto(true)}>
            Novo plano
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código ou nome" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-tipo">Tipo de manutenção</label>
          <select id="f-tipo" className="input" value={tipoManutencao} onChange={(e) => setTipoManutencao(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_TIPO_MANUTENCAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-periodicidade">Periodicidade</label>
          <select id="f-periodicidade" className="input" value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_PERIODICIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)", paddingBottom: "8px" }}>
          <input type="checkbox" checked={apenasAtivos} onChange={(e) => setApenasAtivos(e.target.checked)} />
          Apenas ativos
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
              <th>Nome</th>
              <th>Ativo</th>
              <th>Tipo</th>
              <th>Periodicidade</th>
              <th>Prioridade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {planos?.map((p) => (
              <tr key={p.id} onClick={() => navigate(`/planos/${p.id}`)} style={{ cursor: "pointer" }}>
                <td className="mono">
                  {p.codigo}
                  {!!p.tem_pecas && (
                    <span title="Possui peças vinculadas" style={{ marginLeft: "6px" }}>
                      🧩
                    </span>
                  )}
                </td>
                <td>{p.nome}</td>
                <td>{p.ativo_nome}</td>
                <td>{ROTULO_TIPO_MANUTENCAO[p.tipo_manutencao]}</td>
                <td>{ROTULO_PERIODICIDADE[p.periodicidade]}</td>
                <td>
                  <span className={`badge badge--prioridade-${p.prioridade_padrao}`}>{ROTULO_CRITICIDADE[p.prioridade_padrao]}</span>
                </td>
                <td>
                  <span className={`badge ${p.ativo ? "badge--estoque-ok" : "badge--status-cancelada"}`}>
                    <span className="badge__dot" /> {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {planos?.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">
                  Nenhum plano encontrado com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && <PlanoFormModal plano={null} onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}
    </div>
  );
}
