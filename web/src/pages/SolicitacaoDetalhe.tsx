import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { OrdemServico, Solicitacao } from "../types";
import { SolicitacaoFormModal } from "../components/SolicitacaoFormModal";
import { ConverterSolicitacaoModal } from "../components/ConverterSolicitacaoModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { Modal } from "../components/Modal";
import { BADGE_STATUS_SOLICITACAO, ROTULO_ORIGEM_SOLICITACAO, ROTULO_STATUS_SOLICITACAO } from "./Solicitacoes";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function RecusarModal({ onFechar, onConfirmar }: { onFechar: () => void; onConfirmar: (motivo: string) => Promise<void> }) {
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
      setErro(err instanceof ApiError ? err.message : "Não foi possível recusar a solicitação.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Recusar solicitação" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="motivo">Motivo da recusa</label>
          <textarea id="motivo" className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Voltar
          </button>
          <button type="submit" className="btn btn--destructive" disabled={enviando || !motivo.trim()}>
            {enviando ? "Recusando…" : "Recusar solicitação"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="field">
      <label>{rotulo}</label>
      <span className={mono ? "mono" : undefined} style={{ color: valor ? "var(--c-n-800)" : "var(--c-n-400)" }}>
        {valor || "—"}
      </span>
    </div>
  );
}

export function SolicitacaoDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalConverter, setModalConverter] = useState(false);
  const [modalRecusar, setModalRecusar] = useState(false);

  function carregar() {
    api
      .get<{ solicitacao: Solicitacao }>(`/solicitacoes/${id}`)
      .then((r) => setSolicitacao(r.solicitacao))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a solicitação."));
  }

  useEffect(carregar, [id]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  async function iniciarAnalise() {
    if (!solicitacao) return;
    setErroAcao(null);
    setProcessando(true);
    try {
      const r = await api.post<{ solicitacao: Solicitacao }>(`/solicitacoes/${solicitacao.id}/iniciar-analise`);
      setSolicitacao(r.solicitacao);
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : "Não foi possível iniciar a análise.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarRecusa(motivo: string) {
    if (!solicitacao) return;
    const r = await api.post<{ solicitacao: Solicitacao }>(`/solicitacoes/${solicitacao.id}/recusar`, { motivo });
    setSolicitacao(r.solicitacao);
    setModalRecusar(false);
  }

  function aoConverter(resultado: { solicitacao: Solicitacao; os: OrdemServico }) {
    setModalConverter(false);
    navigate(`/ordens-servico/${resultado.os.id}`);
  }

  if (erro) {
    return (
      <div className="empty-state">
        <h3>Não foi possível abrir esta solicitação</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!solicitacao) return null;

  const podeEditar = pode("solicitacoes", "editar");
  const podeAprovar = pode("solicitacoes", "aprovar");
  const emAberto = solicitacao.status === "aberta" || solicitacao.status === "em_analise";

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/solicitacoes">Solicitações de manutenção</Link> › <strong>{solicitacao.codigo}</strong>
      </div>

      <div className="page-header">
        <div>
          <h1>{solicitacao.codigo}</h1>
          <div className="page-header__desc">
            {solicitacao.ativo_id != null ? (
              <Link to={`/ativos/${solicitacao.ativo_id}`}>{solicitacao.ativo_caminho}</Link>
            ) : (
              <span style={{ color: "var(--c-n-400)" }}>Ativo ainda não definido</span>
            )}
          </div>
        </div>
        <div className="row-actions" style={{ flexWrap: "wrap" }}>
          {podeEditar && solicitacao.status === "aberta" && (
            <button type="button" className="btn btn--secondary" disabled={processando} onClick={iniciarAnalise}>
              Iniciar análise
            </button>
          )}
          {podeEditar && emAberto && (
            <button type="button" className="btn btn--secondary" onClick={() => setModalEditar(true)}>
              Editar
            </button>
          )}
          {podeAprovar && emAberto && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={solicitacao.ativo_id == null}
              title={solicitacao.ativo_id == null ? "Defina o ativo (em Editar) antes de converter em OS" : undefined}
              onClick={() => setModalConverter(true)}
            >
              Converter em OS
            </button>
          )}
          {podeAprovar && emAberto && (
            <button type="button" className="btn btn--destructive" onClick={() => setModalRecusar(true)}>
              Recusar
            </button>
          )}
        </div>
      </div>

      <div className="row-actions" style={{ marginBottom: "16px" }}>
        <span className={`badge ${BADGE_STATUS_SOLICITACAO[solicitacao.status]}`}>
          <span className="badge__dot" /> {ROTULO_STATUS_SOLICITACAO[solicitacao.status]}
        </span>
        <span className={`badge badge--prioridade-${solicitacao.prioridade_sugerida}`}>
          {ROTULO_CRITICIDADE[solicitacao.prioridade_sugerida]}
        </span>
      </div>

      {erroAcao && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erroAcao}
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "16px", color: "var(--c-n-700)" }}>Dados gerais</h2>
        <div className="modal__grid">
          <Campo rotulo="Origem" valor={ROTULO_ORIGEM_SOLICITACAO[solicitacao.origem]} />
          <Campo
            rotulo="Solicitante"
            valor={solicitacao.origem === "globopac" ? (solicitacao.solicitante_externo_nome ?? "—") : solicitacao.solicitante_nome}
          />
          <Campo rotulo="Setor solicitante" valor={solicitacao.setor_solicitante} />
          {solicitacao.origem === "globopac" && (
            <Campo rotulo="Código no GloboPac" valor={solicitacao.origem_externa_codigo} mono />
          )}
          <Campo rotulo="Criada em" valor={solicitacao.criada_em} mono />
          <Campo rotulo="Analisada em" valor={solicitacao.analisada_em} mono />
          <Campo rotulo="Analisada por" valor={solicitacao.analisada_por_nome} />
          <Campo
            rotulo="OS gerada"
            valor={solicitacao.os_codigo ? <Link to={`/ordens-servico/${solicitacao.os_id}`}>{solicitacao.os_codigo}</Link> : null}
            mono
          />
        </div>
        <div className="field" style={{ marginTop: "16px" }}>
          <label>Descrição</label>
          <p style={{ color: "var(--c-n-700)", whiteSpace: "pre-wrap" }}>{solicitacao.descricao}</p>
        </div>
        {solicitacao.motivo_recusa && (
          <div className="field" style={{ marginTop: "16px" }}>
            <label>Motivo da recusa</label>
            <p style={{ color: "var(--c-n-700)" }}>{solicitacao.motivo_recusa}</p>
          </div>
        )}
      </div>

      {modalEditar && (
        <SolicitacaoFormModal
          solicitacao={solicitacao}
          onFechar={() => setModalEditar(false)}
          onSalvo={(s) => {
            setSolicitacao(s);
            setModalEditar(false);
          }}
        />
      )}

      {modalConverter && <ConverterSolicitacaoModal solicitacao={solicitacao} onFechar={() => setModalConverter(false)} onSalvo={aoConverter} />}

      {modalRecusar && <RecusarModal onFechar={() => setModalRecusar(false)} onConfirmar={confirmarRecusa} />}
    </div>
  );
}
