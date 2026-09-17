import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { ItemRequisicao, RequisicaoCompra } from "../types";
import { RequisicaoFormModal } from "../components/RequisicaoFormModal";
import { ItemRequisicaoFormModal } from "../components/ItemRequisicaoFormModal";
import { Modal } from "../components/Modal";
import { BADGE_STATUS_REQUISICAO, ROTULO_ORIGEM_REQUISICAO, ROTULO_STATUS_REQUISICAO } from "./ProgramacaoCompras";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CancelarModal({ onFechar, onConfirmar }: { onFechar: () => void; onConfirmar: (motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await onConfirmar(motivo.trim());
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível cancelar a requisição.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Cancelar requisição" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="motivo">Motivo do cancelamento</label>
          <textarea id="motivo" className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Voltar
          </button>
          <button type="submit" className="btn btn--destructive" disabled={enviando || !motivo.trim()}>
            {enviando ? "Cancelando…" : "Cancelar requisição"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="info-field">
      <label>{rotulo}</label>
      <span className={mono ? "mono" : undefined} style={{ color: valor ? "var(--c-n-800)" : "var(--c-n-400)" }}>
        {valor || "—"}
      </span>
    </div>
  );
}

export function RequisicaoCompraDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [requisicao, setRequisicao] = useState<RequisicaoCompra | null>(null);
  const [itens, setItens] = useState<ItemRequisicao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalItem, setModalItem] = useState<{ item: ItemRequisicao | null } | null>(null);
  const [removendo, setRemovendo] = useState<ItemRequisicao | null>(null);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [confirmandoRecebimento, setConfirmandoRecebimento] = useState(false);

  function carregar() {
    api
      .get<{ requisicao: RequisicaoCompra }>(`/requisicoes-compra/${id}`)
      .then((r) => setRequisicao(r.requisicao))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a requisição."));
  }

  function carregarItens() {
    api
      .get<{ itens: ItemRequisicao[] }>(`/requisicoes-compra/${id}/itens`)
      .then((r) => setItens(r.itens))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os itens."));
  }

  useEffect(carregar, [id]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);
  useEffect(carregarItens, [id]);
  usePolling(carregarItens, INTERVALO_POLLING_PADRAO);

  async function executarAcao(caminho: string) {
    if (!requisicao) return;
    setErroAcao(null);
    setProcessando(true);
    try {
      const r = await api.post<{ requisicao: RequisicaoCompra }>(`/requisicoes-compra/${requisicao.id}/${caminho}`);
      setRequisicao(r.requisicao);
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : "Não foi possível executar a ação.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarRecebimento() {
    if (!requisicao) return;
    setErroAcao(null);
    setProcessando(true);
    try {
      const r = await api.post<{ requisicao: RequisicaoCompra }>(`/requisicoes-compra/${requisicao.id}/receber`);
      setRequisicao(r.requisicao);
      setConfirmandoRecebimento(false);
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : "Não foi possível confirmar o recebimento.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarCancelamento(motivo: string) {
    if (!requisicao) return;
    const r = await api.post<{ requisicao: RequisicaoCompra }>(`/requisicoes-compra/${requisicao.id}/cancelar`, { motivo });
    setRequisicao(r.requisicao);
    setModalCancelar(false);
  }

  async function confirmarRemocaoItem() {
    if (!removendo) return;
    try {
      await api.del(`/requisicoes-compra/${id}/itens/${removendo.id}`);
      setRemovendo(null);
      carregarItens();
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : "Não foi possível remover o item.");
      setRemovendo(null);
    }
  }

  if (erro) {
    return (
      <div className="empty-state">
        <h3>Não foi possível abrir esta requisição</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!requisicao) return null;

  const podeCriar = pode("programacao_compras", "criar");
  const podeAprovar = pode("programacao_compras", "aprovar");
  const emRascunho = requisicao.status === "rascunho";
  const bloqueada = requisicao.status === "recebida" || requisicao.status === "cancelada";
  const custoTotalEstimado = (itens ?? []).reduce((soma, i) => soma + i.quantidade * (i.custo_unitario_estimado ?? 0), 0);

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/programacao-compras">Programação de compras</Link> › <strong>{requisicao.codigo}</strong>
      </div>

      <div className="page-header">
        <div>
          <h1>{requisicao.codigo}</h1>
          <div className="page-header__desc">{ROTULO_ORIGEM_REQUISICAO[requisicao.origem]}</div>
        </div>
        <div className="row-actions" style={{ flexWrap: "wrap" }}>
          {podeCriar && emRascunho && (
            <button type="button" className="btn btn--secondary" onClick={() => setModalEditar(true)}>
              Editar
            </button>
          )}
          {podeCriar && emRascunho && (
            <button type="button" className="btn btn--primary" disabled={processando} onClick={() => executarAcao("emitir")}>
              Emitir
            </button>
          )}
          {podeAprovar && requisicao.status === "emitida" && (
            <button type="button" className="btn btn--primary" disabled={processando} onClick={() => executarAcao("aprovar")}>
              Aprovar
            </button>
          )}
          {podeCriar && requisicao.status === "aprovada" && (
            <button type="button" className="btn btn--secondary" disabled={processando} onClick={() => executarAcao("cotacao")}>
              Marcar em cotação
            </button>
          )}
          {podeCriar && requisicao.status === "em_cotacao" && (
            <button type="button" className="btn btn--secondary" disabled={processando} onClick={() => executarAcao("pedido-colocado")}>
              Marcar pedido colocado
            </button>
          )}
          {podeCriar && requisicao.status === "pedido_colocado" && (
            <button type="button" className="btn btn--primary" onClick={() => setConfirmandoRecebimento(true)}>
              Confirmar recebimento
            </button>
          )}
          {podeAprovar && !bloqueada && (
            <button type="button" className="btn btn--destructive" onClick={() => setModalCancelar(true)}>
              Cancelar requisição
            </button>
          )}
        </div>
      </div>

      <div className="row-actions" style={{ marginBottom: "16px" }}>
        <span className={`badge ${BADGE_STATUS_REQUISICAO[requisicao.status]}`}>
          <span className="badge__dot" /> {ROTULO_STATUS_REQUISICAO[requisicao.status]}
        </span>
      </div>

      {erroAcao && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erroAcao}
        </div>
      )}

      <div className="card" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "16px", color: "var(--c-n-700)" }}>Dados gerais</h2>
        <div className="info-grid">
          <Campo rotulo="Fornecedor" valor={requisicao.fornecedor} />
          <Campo rotulo="Criada por" valor={requisicao.criada_por_nome} />
          <Campo rotulo="Data de necessidade" valor={formatarData(requisicao.data_necessidade)} mono />
          <Campo rotulo="Limite para colocar o pedido" valor={formatarData(requisicao.data_limite_pedido)} mono />
          <Campo rotulo="Criada em" valor={requisicao.criada_em} mono />
          <Campo rotulo="Custo total estimado" valor={formatarMoeda(custoTotalEstimado)} />
        </div>
        {requisicao.observacoes && (
          <div className="field" style={{ marginTop: "16px" }}>
            <label>Observações</label>
            <p style={{ color: "var(--c-n-700)", whiteSpace: "pre-wrap" }}>{requisicao.observacoes}</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Itens</h2>
            <div className="page-header__desc">Peças a comprar nesta requisição</div>
          </div>
          {podeCriar && emRascunho && (
            <button type="button" className="btn btn--primary" onClick={() => setModalItem({ item: null })}>
              Adicionar item
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Quantidade</th>
                <th>Custo unit. estimado</th>
                <th>Necessidade</th>
                <th>Origem</th>
                {podeCriar && emRascunho && <th></th>}
              </tr>
            </thead>
            <tbody>
              {itens?.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.peca_codigo}</td>
                  <td>{i.peca_descricao}</td>
                  <td className="mono">
                    {i.quantidade} {i.unidade_medida}
                  </td>
                  <td className="mono">{formatarMoeda(i.custo_unitario_estimado)}</td>
                  <td className="mono">{formatarData(i.data_necessidade)}</td>
                  <td>{i.os_vinculadas.length > 0 ? i.os_vinculadas.join(", ") : "—"}</td>
                  {podeCriar && emRascunho && (
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn--ghost" onClick={() => setModalItem({ item: i })}>
                          Editar
                        </button>
                        <button type="button" className="btn btn--ghost" onClick={() => setRemovendo(i)}>
                          Remover
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {itens?.length === 0 && (
                <tr>
                  <td colSpan={podeCriar && emRascunho ? 7 : 6} className="empty-state">
                    Nenhum item adicionado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalEditar && (
        <RequisicaoFormModal
          requisicao={requisicao}
          onFechar={() => setModalEditar(false)}
          onSalvo={(r) => {
            setRequisicao(r);
            setModalEditar(false);
          }}
        />
      )}

      {modalItem && (
        <ItemRequisicaoFormModal
          requisicaoId={requisicao.id}
          item={modalItem.item}
          onFechar={() => setModalItem(null)}
          onSalvo={() => {
            setModalItem(null);
            carregarItens();
          }}
        />
      )}

      {removendo && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setRemovendo(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Remover item</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Remover <strong>{removendo.peca_descricao}</strong> desta requisição?
            </p>
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setRemovendo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--destructive" onClick={confirmarRemocaoItem}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCancelar && <CancelarModal onFechar={() => setModalCancelar(false)} onConfirmar={confirmarCancelamento} />}

      {confirmandoRecebimento && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmandoRecebimento(false)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Confirmar recebimento</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Confirmar o recebimento de <strong>{requisicao.codigo}</strong>? Isso lança uma entrada de estoque para
              cada item da requisição, atualizando o saldo e o custo médio das peças.
            </p>
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirmandoRecebimento(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--primary" onClick={confirmarRecebimento} disabled={processando}>
                {processando ? "Confirmando…" : "Confirmar recebimento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
