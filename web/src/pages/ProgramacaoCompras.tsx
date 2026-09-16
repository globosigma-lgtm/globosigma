import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { RequisicaoCompra, StatusRequisicao } from "../types";
import { RequisicaoFormModal } from "../components/RequisicaoFormModal";
import { SugestaoPreventivaModal } from "../components/SugestaoPreventivaModal";
import { exportarCSV } from "../lib/csv";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export const ROTULO_STATUS_REQUISICAO: Record<StatusRequisicao, string> = {
  rascunho: "Rascunho",
  emitida: "Emitida",
  aprovada: "Aprovada",
  em_cotacao: "Em cotação",
  pedido_colocado: "Pedido colocado",
  recebida: "Recebida",
  cancelada: "Cancelada",
};

export const BADGE_STATUS_REQUISICAO: Record<StatusRequisicao, string> = {
  rascunho: "badge--status-programada",
  emitida: "badge--status-aberta",
  aprovada: "badge--estoque-ok",
  em_cotacao: "badge--status-em_execucao",
  pedido_colocado: "badge--status-aguardando_peca",
  recebida: "badge--status-concluida",
  cancelada: "badge--status-cancelada",
};

export const ROTULO_ORIGEM_REQUISICAO: Record<string, string> = {
  programacao_preventiva: "Programação preventiva",
  ponto_de_pedido: "Ponto de pedido",
  manual: "Manual",
};

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

export function ProgramacaoCompras() {
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [requisicoes, setRequisicoes] = useState<RequisicaoCompra[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [origem, setOrigem] = useState("");
  const [texto, setTexto] = useState("");
  const [modalNova, setModalNova] = useState(false);
  const [modalPreventiva, setModalPreventiva] = useState(false);
  const [gerandoPontoDePedido, setGerandoPontoDePedido] = useState(false);

  function carregar() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (origem) params.set("origem", origem);
    if (texto) params.set("texto", texto);
    api
      .get<{ requisicoes: RequisicaoCompra[] }>(`/requisicoes-compra?${params.toString()}`)
      .then((r) => setRequisicoes(r.requisicoes))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as requisições de compra."));
  }

  useEffect(carregar, [status, origem, texto]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvarNova(r: RequisicaoCompra) {
    setModalNova(false);
    navigate(`/programacao-compras/${r.id}`);
  }

  function aoSalvarPreventiva(r: RequisicaoCompra) {
    setModalPreventiva(false);
    navigate(`/programacao-compras/${r.id}`);
  }

  async function gerarSugestaoPontoDePedido() {
    setErroSugestao(null);
    setGerandoPontoDePedido(true);
    try {
      const r = await api.post<{ requisicao: RequisicaoCompra }>("/requisicoes-compra/sugestao/ponto-de-pedido");
      navigate(`/programacao-compras/${r.requisicao.id}`);
    } catch (e) {
      setErroSugestao(e instanceof ApiError ? e.message : "Não foi possível gerar a sugestão.");
    } finally {
      setGerandoPontoDePedido(false);
    }
  }

  const podeCriar = pode("programacao_compras", "criar");

  function exportar() {
    if (!requisicoes) return;
    exportarCSV(
      "requisicoes-de-compra",
      [
        { titulo: "Código", valor: (r: RequisicaoCompra) => r.codigo },
        { titulo: "Origem", valor: (r: RequisicaoCompra) => ROTULO_ORIGEM_REQUISICAO[r.origem] ?? r.origem },
        { titulo: "Fornecedor", valor: (r: RequisicaoCompra) => r.fornecedor },
        { titulo: "Necessidade", valor: (r: RequisicaoCompra) => formatarData(r.data_necessidade) },
        { titulo: "Limite do pedido", valor: (r: RequisicaoCompra) => formatarData(r.data_limite_pedido) },
        { titulo: "Status", valor: (r: RequisicaoCompra) => ROTULO_STATUS_REQUISICAO[r.status] },
      ],
      requisicoes
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Programação de compras</h1>
          <div className="page-header__desc">Requisições de compra manuais e geradas a partir do estoque e dos planos</div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn--secondary" disabled={!requisicoes?.length} onClick={exportar}>
            Exportar CSV
          </button>
          {podeCriar && (
            <>
              <button type="button" className="btn btn--secondary" onClick={() => setModalPreventiva(true)}>
                Sugestão por programação preventiva
              </button>
              <button type="button" className="btn btn--secondary" onClick={gerarSugestaoPontoDePedido} disabled={gerandoPontoDePedido}>
                {gerandoPontoDePedido ? "Gerando…" : "Sugestão por ponto de pedido"}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setModalNova(true)}>
                Nova requisição
              </button>
            </>
          )}
        </div>
      </div>

      {erroSugestao && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erroSugestao}
        </div>
      )}

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código ou fornecedor" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_STATUS_REQUISICAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-origem">Origem</label>
          <select id="f-origem" className="input" value={origem} onChange={(e) => setOrigem(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_ORIGEM_REQUISICAO).map(([valor, rotulo]) => (
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
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Origem</th>
              <th>Fornecedor</th>
              <th>Necessidade</th>
              <th>Limite do pedido</th>
              <th>Status</th>
              <th>Criada por</th>
            </tr>
          </thead>
          <tbody>
            {requisicoes?.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/programacao-compras/${r.id}`)} style={{ cursor: "pointer" }}>
                <td className="mono">{r.codigo}</td>
                <td>{ROTULO_ORIGEM_REQUISICAO[r.origem]}</td>
                <td>{r.fornecedor ?? "—"}</td>
                <td className="mono">{formatarData(r.data_necessidade)}</td>
                <td className="mono">{formatarData(r.data_limite_pedido)}</td>
                <td>
                  <span className={`badge ${BADGE_STATUS_REQUISICAO[r.status]}`}>
                    <span className="badge__dot" /> {ROTULO_STATUS_REQUISICAO[r.status]}
                  </span>
                </td>
                <td>{r.criada_por_nome}</td>
              </tr>
            ))}
            {requisicoes?.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">
                  Nenhuma requisição de compra encontrada com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalNova && <RequisicaoFormModal requisicao={null} onFechar={() => setModalNova(false)} onSalvo={aoSalvarNova} />}
      {modalPreventiva && <SugestaoPreventivaModal onFechar={() => setModalPreventiva(false)} onSalvo={aoSalvarPreventiva} />}
    </div>
  );
}
