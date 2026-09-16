import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AtivoComArvore, Ativo, CriticidadeAtivo, StatusAtivo, TipoAtivo } from "../types";
import { AtivoFormModal, ROTULO_CRITICIDADE, ROTULO_STATUS_ATIVO, ROTULO_TIPO } from "../components/AtivoFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export function Ativos() {
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [ativos, setAtivos] = useState<AtivoComArvore[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [criticidade, setCriticidade] = useState("");
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [modalAberto, setModalAberto] = useState(false);

  function carregar() {
    const params = new URLSearchParams();
    if (texto) params.set("texto", texto);
    if (criticidade) params.set("criticidade", criticidade);
    if (status) params.set("status", status);
    if (tipo) params.set("tipo", tipo);
    api
      .get<{ ativos: AtivoComArvore[] }>(`/ativos?${params.toString()}`)
      .then((r) => setAtivos(r.ativos))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os ativos."));
  }

  useEffect(carregar, [texto, criticidade, status, tipo]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar(_ativo: Ativo) {
    setModalAberto(false);
    carregar();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ativos</h1>
          <div className="page-header__desc">Cadastro e hierarquia de equipamentos, instalações e componentes</div>
        </div>
        {pode("ativos", "criar") && (
          <button type="button" className="btn btn--primary" onClick={() => setModalAberto(true)}>
            Novo ativo
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código ou nome" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-tipo">Tipo</label>
          <select id="f-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-criticidade">Criticidade</label>
          <select id="f-criticidade" className="input" value={criticidade} onChange={(e) => setCriticidade(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_CRITICIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_STATUS_ATIVO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table data-table--cards-mobile">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Setor</th>
              <th>Criticidade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ativos?.map((a) => (
              <tr key={a.id} onClick={() => navigate(`/ativos/${a.id}`)} style={{ cursor: "pointer" }}>
                <td className="mono data-table__td--principal">{a.codigo}</td>
                <td data-label="Nome">
                  <span style={{ paddingLeft: `${a.nivel * 20}px` }}>
                    {a.nivel > 0 && "› "}
                    {a.nome}
                  </span>
                </td>
                <td data-label="Tipo">{ROTULO_TIPO[a.tipo as TipoAtivo]}</td>
                <td data-label="Setor">{a.setor}</td>
                <td data-label="Criticidade">
                  <span className={`badge badge--prioridade-${a.criticidade}`}>{ROTULO_CRITICIDADE[a.criticidade as CriticidadeAtivo]}</span>
                </td>
                <td data-label="Status">{ROTULO_STATUS_ATIVO[a.status as StatusAtivo]}</td>
              </tr>
            ))}
            {ativos?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  Nenhum ativo encontrado com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && <AtivoFormModal ativo={null} onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}
    </div>
  );
}
