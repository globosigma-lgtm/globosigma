import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Plano } from "../types";
import { PlanoFormModal, ROTULO_PERIODICIDADE, ROTULO_TIPO_MANUTENCAO } from "../components/PlanoFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { PlanoTarefasTab } from "../components/PlanoTarefasTab";
import { PlanoPecasTab } from "../components/PlanoPecasTab";
import { OcorrenciasTab } from "../components/OcorrenciasTab";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";
import { semanaDoAno } from "../lib/semanas";

type Aba = "dados" | "checklist" | "pecas" | "ocorrencias";

export function PlanoDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [plano, setPlano] = useState<Plano | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("dados");
  const podeEditar = pode("planos", "editar");

  function carregar() {
    api
      .get<{ plano: Plano }>(`/planos/${id}`)
      .then((r) => setPlano(r.plano))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o plano."));
  }

  useEffect(carregar, [id]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar(_plano: Plano) {
    setModalAberto(false);
    carregar();
  }

  async function confirmarExclusao() {
    setErroExclusao(null);
    try {
      await api.del(`/planos/${id}`);
      navigate("/planos");
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
        <Link to="/planos">Planos de manutenção</Link> › <strong>{plano.nome}</strong>
      </div>

      <div className="page-header">
        <div>
          <h1>{plano.nome}</h1>
          <div className="page-header__desc mono">{plano.codigo}</div>
        </div>
        <div className="row-actions">
          {podeEditar && (
            <button type="button" className="btn btn--secondary" onClick={() => setModalAberto(true)}>
              Editar
            </button>
          )}
          {pode("planos", "excluir") && (
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
        <button type="button" className={`tab${aba === "pecas" ? " is-active" : ""}`} onClick={() => setAba("pecas")}>
          Peças
        </button>
        <button type="button" className={`tab${aba === "ocorrencias" ? " is-active" : ""}`} onClick={() => setAba("ocorrencias")}>
          Próximas ocorrências
        </button>
      </div>

      {aba === "dados" && (
        <div className="card">
          <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "16px", color: "var(--c-n-700)" }}>Dados gerais</h2>
          <div className="info-grid">
            <Campo rotulo="Ativo" valor={<Link to={`/ativos/${plano.ativo_id}`}>{plano.ativo_caminho}</Link>} />
            <Campo rotulo="Tipo de manutenção" valor={ROTULO_TIPO_MANUTENCAO[plano.tipo_manutencao]} />
            <Campo
              rotulo="Periodicidade"
              valor={
                plano.periodicidade === "personalizada"
                  ? `Personalizada — a cada ${plano.intervalo_customizado_dias} dias`
                  : ROTULO_PERIODICIDADE[plano.periodicidade]
              }
            />
            <Campo rotulo="Data-base" valor={plano.data_base} mono />
            <Campo
              rotulo="Semana planejada"
              valor={plano.data_base ? `Semana ${semanaDoAno(plano.data_base)} de ${plano.data_base.slice(0, 4)}` : null}
            />
            <Campo
              rotulo="Prioridade padrão"
              valor={<span className={`badge badge--prioridade-${plano.prioridade_padrao}`}>{ROTULO_CRITICIDADE[plano.prioridade_padrao]}</span>}
            />
            <Campo rotulo="Duração estimada" valor={`${plano.duracao_estimada_horas}h`} />
            <Campo rotulo="Equipe padrão" valor={plano.equipe_padrao} />
            <Campo rotulo="Exige parada de linha" valor={plano.exige_parada_linha ? "Sim" : "Não"} />
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

      {aba === "checklist" && <PlanoTarefasTab planoId={plano.id} podeEditar={podeEditar} />}
      {aba === "pecas" && <PlanoPecasTab planoId={plano.id} podeEditar={podeEditar} />}
      {aba === "ocorrencias" && <OcorrenciasTab planoId={plano.id} />}

      {modalAberto && <PlanoFormModal plano={plano} onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}

      {confirmandoExclusao && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmandoExclusao(false)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Excluir plano</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja excluir <strong>{plano.nome}</strong>? Este plano sairá das listagens, mas o
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
