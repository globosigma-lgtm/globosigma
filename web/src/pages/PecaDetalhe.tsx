import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { MovimentoEstoque, Peca } from "../types";
import { PecaFormModal, ROTULO_UNIDADE } from "../components/PecaFormModal";
import { PecaAtivosTab } from "../components/PecaAtivosTab";
import { MovimentoEstoqueModal, ROTULO_TIPO_MOVIMENTO } from "../components/MovimentoEstoqueModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function formatarMoeda(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarNumero(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function PecaDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [peca, setPeca] = useState<Peca | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [aba, setAba] = useState<"dados" | "ativos" | "movimentacoes">("dados");
  const [movimentos, setMovimentos] = useState<MovimentoEstoque[] | null>(null);
  const [modalMovimento, setModalMovimento] = useState(false);

  function carregar() {
    api
      .get<{ peca: Peca }>(`/pecas/${id}`)
      .then((r) => setPeca(r.peca))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a peça."));
  }

  useEffect(carregar, [id]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function carregarMovimentos() {
    api
      .get<{ movimentos: MovimentoEstoque[] }>(`/almoxarifado/movimentos?pecaId=${id}`)
      .then((r) => setMovimentos(r.movimentos))
      .catch(() => setMovimentos([]));
  }

  useEffect(() => {
    if (aba === "movimentacoes" && pode("almoxarifado", "ver")) carregarMovimentos();
  }, [aba, id]);

  function aoSalvar(_peca: Peca) {
    setModalAberto(false);
    carregar();
  }

  async function confirmarExclusao() {
    setErroExclusao(null);
    try {
      await api.del(`/pecas/${id}`);
      navigate("/pecas");
    } catch (e) {
      setErroExclusao(e instanceof ApiError ? e.message : "Não foi possível excluir a peça.");
    }
  }

  if (erro) {
    return (
      <div className="empty-state">
        <h3>Não foi possível abrir esta peça</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!peca) return null;

  const abaixo = peca.estoque_atual < peca.estoque_minimo;

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/pecas">Peças</Link> › <strong>{peca.descricao}</strong>
      </div>

      <div className="page-header">
        <div>
          <h1>{peca.descricao}</h1>
          <div className="page-header__desc mono">{peca.codigo}</div>
        </div>
        <div className="row-actions">
          {pode("pecas", "editar") && (
            <button type="button" className="btn btn--secondary" onClick={() => setModalAberto(true)}>
              Editar
            </button>
          )}
          {pode("pecas", "excluir") && (
            <button type="button" className="btn btn--destructive" onClick={() => setConfirmandoExclusao(true)}>
              Excluir
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={`tab${aba === "dados" ? " is-active" : ""}`} onClick={() => setAba("dados")}>
          Dados gerais
        </button>
        <button type="button" className={`tab${aba === "ativos" ? " is-active" : ""}`} onClick={() => setAba("ativos")}>
          Equipamentos que usam esta peça
        </button>
        {pode("almoxarifado", "ver") && (
          <button type="button" className={`tab${aba === "movimentacoes" ? " is-active" : ""}`} onClick={() => setAba("movimentacoes")}>
            Movimentações
          </button>
        )}
      </div>

      {aba === "dados" && (
        <>
          <div className="card-grid" style={{ marginBottom: "24px" }}>
            <div className="card">
              <div className="stat-card__label">Estoque atual</div>
              <div className="stat-card__value">
                {formatarNumero(peca.estoque_atual)} <span style={{ fontSize: "var(--text-small)" }}>{peca.unidade_medida}</span>
              </div>
            </div>
            <div className="card">
              <div className="stat-card__label">Situação</div>
              <div style={{ marginTop: "8px" }}>
                <span className={`badge ${abaixo ? "badge--estoque-baixo" : "badge--estoque-ok"}`}>
                  <span className="badge__dot" /> {abaixo ? "Abaixo do mínimo" : "Adequado"}
                </span>
              </div>
            </div>
            <div className="card">
              <div className="stat-card__label">Lead time</div>
              <div className="stat-card__value">{peca.lead_time_dias}d</div>
            </div>
            <div className="card">
              <div className="stat-card__label">Custo unitário médio</div>
              <div className="stat-card__value" style={{ fontSize: "var(--text-h2)" }}>
                {formatarMoeda(peca.custo_unitario_medio)}
              </div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "16px", color: "var(--c-n-700)" }}>Dados gerais</h2>
            <div className="info-grid">
              <Campo rotulo="Unidade de medida" valor={ROTULO_UNIDADE[peca.unidade_medida]} />
              <Campo rotulo="Categoria" valor={peca.categoria} />
              <Campo rotulo="Fabricante" valor={peca.fabricante} />
              <Campo rotulo="Código do fabricante" valor={peca.codigo_fabricante} mono />
              <Campo rotulo="Estoque mínimo" valor={`${formatarNumero(peca.estoque_minimo)} ${peca.unidade_medida}`} />
              <Campo rotulo="Ponto de pedido" valor={`${formatarNumero(peca.ponto_de_pedido)} ${peca.unidade_medida}`} />
              <Campo rotulo="Fornecedor preferencial" valor={peca.fornecedor_preferencial} />
              <Campo rotulo="Localização no almoxarifado" valor={peca.localizacao_almoxarifado} />
              <Campo rotulo="Ativa" valor={peca.ativa ? "Sim" : "Não"} />
            </div>
          </div>
        </>
      )}

      {aba === "ativos" && <PecaAtivosTab pecaId={peca.id} />}

      {aba === "movimentacoes" && (
        <div className="card">
          <div className="page-header">
            <div>
              <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Movimentações de estoque</h2>
              <div className="page-header__desc">Entradas, saídas, ajustes, transferências e devoluções desta peça</div>
            </div>
            {pode("almoxarifado", "criar") && (
              <button type="button" className="btn btn--primary" onClick={() => setModalMovimento(true)}>
                Registrar movimento
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Saldo após</th>
                  <th>OS</th>
                  <th>Motivo</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                {movimentos?.map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{m.data}</td>
                    <td>{ROTULO_TIPO_MOVIMENTO[m.tipo]}</td>
                    <td
                      className="mono"
                      style={{ color: m.quantidade > 0 ? "var(--c-success-700)" : m.quantidade < 0 ? "var(--c-n-700)" : undefined }}
                    >
                      {m.quantidade > 0 ? "+" : ""}
                      {m.quantidade} {m.unidade_medida}
                    </td>
                    <td className="mono">
                      {m.saldo_apos} {m.unidade_medida}
                    </td>
                    <td className="mono">{m.os_codigo ?? "—"}</td>
                    <td>{m.motivo ?? "—"}</td>
                    <td>{m.usuario_nome}</td>
                  </tr>
                ))}
                {movimentos?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      Nenhuma movimentação registrada para esta peça ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalMovimento && peca && (
        <MovimentoEstoqueModal
          pecaFixa={peca}
          onFechar={() => setModalMovimento(false)}
          onSalvo={() => {
            setModalMovimento(false);
            carregar();
            carregarMovimentos();
          }}
        />
      )}

      {modalAberto && <PecaFormModal peca={peca} onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}

      {confirmandoExclusao && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmandoExclusao(false)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Excluir peça</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja excluir <strong>{peca.descricao}</strong>? Ela sairá do catálogo, mas o
              histórico é preservado.
            </p>
            {erroExclusao && (
              <div className="login-card__error" role="alert" style={{ marginTop: "12px" }}>
                {erroExclusao}
              </div>
            )}
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirmandoExclusao(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--destructive" onClick={confirmarExclusao}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: React.ReactNode; mono?: boolean }) {
  return (
    <div className="info-field">
      <label>{rotulo}</label>
      <span className={mono ? "mono" : undefined} style={{ color: valor ? "var(--c-n-800)" : "var(--c-n-400)" }}>
        {valor || "—"}
      </span>
    </div>
  );
}
