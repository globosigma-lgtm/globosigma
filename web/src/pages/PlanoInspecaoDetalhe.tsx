import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { PlanoInspecao } from "../types";
import { PlanoInspecaoFormModal, ROTULO_CLASSE_PERIODICIDADE } from "../components/PlanoInspecaoFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { PlanoInspecaoTarefasTab } from "../components/PlanoInspecaoTarefasTab";
import { OcorrenciasInspecaoTab } from "../components/OcorrenciasInspecaoTab";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

type Aba = "dados" | "checklist" | "ocorrencias";

export function PlanoInspecaoDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [plano, setPlano] = useState<PlanoInspecao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("dados");
  const podeEditar = pode("inspecoes", "editar");

  function carregar() {
    api
      .get<{ plano: PlanoInspecao }>(`/inspecoes/planos/${id}`)
      .then((r) => setPlano(r.plano))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o plano de inspeção."));
  }

  useEffect(carregar, [id]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar(_plano: PlanoInspecao) {
    setModalAberto(false);
    carregar();
  }

  async function confirmarExclusao() {
    setErroExclusao(null);
    try {
      await api.del(`/inspecoes/planos/${id}`);
      navigate("/inspecoes/planos");
    } catch (e) {
      setErroExclusao(e instanceof ApiError ? e.message : "Não foi possível excluir o plano.");
    }
  }

  if (erro) {
    return (
      <div className="empty-state">
        <h3>Não foi possível abrir este plano</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!plano) return null;

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/inspecoes/planos">Planos de inspeção</Link> › <strong>{plano.tag}</strong>
      </div>

      <div className="page-header">
        <div>
          <h1>{plano.ativo_nome}</h1>
          <div className="page-header__desc mono">
            {plano.codigo} · {plano.tag}
          </div>
        </div>
        <div className="row-actions">
          {podeEditar && (
            <button type="button" className="btn btn--secondary" onClick={() => setModalAberto(true)}>
              Editar
            </button>
          )}
          {pode("inspecoes", "excluir") && (
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
        <button type="button" className={`tab${aba === "checklist" ? " is-active" : ""}`} onClick={() => setAba("checklist")}>
          Checklist
        </button>
        <button type="button" className={`tab${aba === "ocorrencias" ? " is-active" : ""}`} onClick={() => setAba("ocorrencias")}>
          Próximas ocorrências
        </button>
      </div>

      {aba === "dados" && (
        <div className="card">
          <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "16px", color: "var(--c-n-700)" }}>Dados gerais</h2>
          <div className="info-grid">
            <Campo rotulo="Equipamento" valor={<Link to={`/ativos/${plano.ativo_id}`}>{plano.ativo_caminho}</Link>} />
            <Campo rotulo="Setor" valor={plano.setor} />
            <Campo
              rotulo="Classe de periodicidade"
              valor={plano.classe_periodicidade ? ROTULO_CLASSE_PERIODICIDADE[plano.classe_periodicidade] : "Sem classe — a definir"}
            />
            <Campo rotulo="Semana-base" valor={plano.semana_base ? String(plano.semana_base) : null} mono />
            <Campo
              rotulo="Prioridade padrão"
              valor={<span className={`badge badge--prioridade-${plano.prioridade_padrao}`}>{ROTULO_CRITICIDADE[plano.prioridade_padrao]}</span>}
            />
            <Campo rotulo="Duração estimada" valor={`${plano.duracao_estimada_horas}h`} />
            <Campo rotulo="Inspetor padrão" valor={plano.responsavel_padrao_nome} />
            <Campo rotulo="Início de vigência" valor={plano.data_inicio_vigencia} mono />
            <Campo rotulo="Fim de vigência" valor={plano.data_fim_vigencia} mono />
            <Campo rotulo="Status" valor={plano.ativo ? "Ativo" : "Inativo"} />
          </div>
          {plano.instrucoes && (
            <div className="field" style={{ marginTop: "16px" }}>
              <label>Instruções</label>
              <p style={{ color: "var(--c-n-700)" }}>{plano.instrucoes}</p>
            </div>
          )}
        </div>
      )}

      {aba === "checklist" && <PlanoInspecaoTarefasTab planoId={plano.id} podeEditar={podeEditar} />}
      {aba === "ocorrencias" && <OcorrenciasInspecaoTab planoId={plano.id} />}

      {modalAberto && <PlanoInspecaoFormModal plano={plano} onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}

      {confirmandoExclusao && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmandoExclusao(false)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Excluir plano de inspeção</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja excluir o plano de <strong>{plano.ativo_nome}</strong>? Este plano sairá das
              listagens, mas o histórico é preservado.
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
