import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Solicitacao, StatusSolicitacao } from "../types";
import { SolicitacaoFormModal } from "../components/SolicitacaoFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export const ROTULO_STATUS_SOLICITACAO: Record<StatusSolicitacao, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  convertida_em_os: "Convertida em OS",
  recusada: "Recusada",
};

export const BADGE_STATUS_SOLICITACAO: Record<StatusSolicitacao, string> = {
  aberta: "badge--status-aberta",
  em_analise: "badge--status-em_execucao",
  convertida_em_os: "badge--status-concluida",
  recusada: "badge--status-cancelada",
};

export const ROTULO_ORIGEM_SOLICITACAO: Record<Solicitacao["origem"], string> = {
  interna: "Interna",
  globopac: "GloboPac",
};

export function Solicitacoes() {
  const { pode, usuario } = useAuth();
  const navigate = useNavigate();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [texto, setTexto] = useState("");
  const [apenasMinhas, setApenasMinhas] = useState(false);
  const [modalNova, setModalNova] = useState(false);

  function carregar() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (texto) params.set("texto", texto);
    if (apenasMinhas) params.set("apenasMinhas", "true");
    api
      .get<{ solicitacoes: Solicitacao[] }>(`/solicitacoes?${params.toString()}`)
      .then((r) => setSolicitacoes(r.solicitacoes))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as solicitações."));
  }

  useEffect(carregar, [status, texto, apenasMinhas]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar(s: Solicitacao) {
    setModalNova(false);
    navigate(`/solicitacoes/${s.id}`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Solicitações de manutenção</h1>
          <div className="page-header__desc">Pedidos abertos por qualquer setor, analisados e convertidos em OS</div>
        </div>
        {pode("solicitacoes", "criar") && (
          <button type="button" className="btn btn--primary" onClick={() => setModalNova(true)}>
            Nova solicitação
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código ou descrição" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_STATUS_SOLICITACAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        {usuario && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)", paddingBottom: "8px" }}>
            <input type="checkbox" checked={apenasMinhas} onChange={(e) => setApenasMinhas(e.target.checked)} />
            Somente minhas solicitações
          </label>
        )}
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
              <th>Origem</th>
              <th>Ativo</th>
              <th>Descrição</th>
              <th>Prioridade sugerida</th>
              <th>Solicitante</th>
              <th>Criada em</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {solicitacoes?.map((s) => (
              <tr key={s.id} onClick={() => navigate(`/solicitacoes/${s.id}`)} style={{ cursor: "pointer" }}>
                <td className="mono">{s.codigo}</td>
                <td>
                  {s.origem === "globopac" ? (
                    <span className="badge badge--origem-globopac">
                      <span className="badge__dot" /> GloboPac
                    </span>
                  ) : (
                    ROTULO_ORIGEM_SOLICITACAO[s.origem]
                  )}
                </td>
                <td>{s.ativo_nome ?? <span style={{ color: "var(--c-text-muted)" }}>Defina o ativo</span>}</td>
                <td>{s.descricao}</td>
                <td>
                  <span className={`badge badge--prioridade-${s.prioridade_sugerida}`}>{ROTULO_CRITICIDADE[s.prioridade_sugerida]}</span>
                </td>
                <td>{s.origem === "globopac" ? (s.solicitante_externo_nome ?? "—") : s.solicitante_nome}</td>
                <td className="mono">{s.criada_em}</td>
                <td>
                  <span className={`badge ${BADGE_STATUS_SOLICITACAO[s.status]}`}>
                    <span className="badge__dot" /> {ROTULO_STATUS_SOLICITACAO[s.status]}
                  </span>
                </td>
              </tr>
            ))}
            {solicitacoes?.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  Nenhuma solicitação encontrada com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalNova && <SolicitacaoFormModal solicitacao={null} onFechar={() => setModalNova(false)} onSalvo={aoSalvar} />}
    </div>
  );
}
