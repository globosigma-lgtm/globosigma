import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Ativo, AtivoDetalhe as AtivoDetalheType } from "../types";
import { AtivoFormModal, ROTULO_CRITICIDADE, ROTULO_STATUS_ATIVO, ROTULO_TIPO } from "../components/AtivoFormModal";
import { AtivoPecasTab } from "../components/AtivoPecasTab";
import { AtivoConfiabilidadeTab } from "../components/AtivoConfiabilidadeTab";
import { AtivoHistoricoTab } from "../components/AtivoHistoricoTab";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export function AtivoDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [ativo, setAtivo] = useState<AtivoDetalheType | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  type AbaAtivo = "dados" | "pecas" | "confiabilidade" | "historico";
  const ABAS_VALIDAS: AbaAtivo[] = ["dados", "pecas", "confiabilidade", "historico"];
  const abaDaUrl = searchParams.get("aba") as AbaAtivo | null;
  const [aba, setAba] = useState<AbaAtivo>(abaDaUrl && ABAS_VALIDAS.includes(abaDaUrl) ? abaDaUrl : "dados");

  function carregar() {
    api
      .get<{ ativo: AtivoDetalheType }>(`/ativos/${id}`)
      .then((r) => setAtivo(r.ativo))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o ativo."));
  }

  useEffect(carregar, [id]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar(_ativo: Ativo) {
    setModalAberto(false);
    carregar();
  }

  async function confirmarExclusao() {
    setErroExclusao(null);
    try {
      await api.del(`/ativos/${id}`);
      navigate("/ativos");
    } catch (e) {
      setErroExclusao(e instanceof ApiError ? e.message : "Não foi possível excluir o ativo.");
    }
  }

  if (erro) {
    return (
      <div className="empty-state">
        <h3>Não foi possível abrir este ativo</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!ativo) return null;

  const caminhoPartes = ativo.caminho.split(" › ");

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/ativos">Ativos</Link>
        {caminhoPartes.map((parte, i) => (
          <span key={i}> › {i === caminhoPartes.length - 1 ? <strong>{parte}</strong> : parte}</span>
        ))}
      </div>

      <div className="page-header">
        <div>
          <h1>{ativo.nome}</h1>
          <div className="page-header__desc mono">{ativo.codigo}</div>
        </div>
        <div className="row-actions">
          {pode("ativos", "editar") && (
            <button type="button" className="btn btn--secondary" onClick={() => setModalAberto(true)}>
              Editar
            </button>
          )}
          {pode("ativos", "excluir") && (
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
        <button type="button" className={`tab${aba === "pecas" ? " is-active" : ""}`} onClick={() => setAba("pecas")}>
          Peças deste equipamento
        </button>
        <button type="button" className={`tab${aba === "confiabilidade" ? " is-active" : ""}`} onClick={() => setAba("confiabilidade")}>
          Confiabilidade
        </button>
        <button type="button" className={`tab${aba === "historico" ? " is-active" : ""}`} onClick={() => setAba("historico")}>
          Histórico de manutenções
        </button>
      </div>

      {aba === "dados" && (
        <>
          <div className="card" style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "16px", color: "var(--c-n-700)" }}>Dados gerais</h2>
            <div className="modal__grid">
              <Campo rotulo="Tipo" valor={ROTULO_TIPO[ativo.tipo]} />
              <Campo
                rotulo="Criticidade"
                valor={<span className={`badge badge--prioridade-${ativo.criticidade}`}>{ROTULO_CRITICIDADE[ativo.criticidade]}</span>}
              />
              <Campo rotulo="Setor" valor={ativo.setor} />
              <Campo rotulo="Status" valor={ROTULO_STATUS_ATIVO[ativo.status]} />
              <Campo rotulo="Localização" valor={ativo.localizacao} />
              <Campo rotulo="Centro de custo" valor={ativo.centro_custo} />
              <Campo rotulo="Fabricante" valor={ativo.fabricante} />
              <Campo rotulo="Modelo" valor={ativo.modelo} />
              <Campo rotulo="Número de série" valor={ativo.numero_serie} mono />
              <Campo rotulo="Data de aquisição" valor={ativo.data_aquisicao} />
              <Campo rotulo="Data de instalação" valor={ativo.data_instalacao} />
            </div>
            {ativo.observacoes && (
              <div className="field" style={{ marginTop: "16px" }}>
                <label>Observações</label>
                <p style={{ color: "var(--c-n-700)" }}>{ativo.observacoes}</p>
              </div>
            )}
          </div>

          <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "12px", color: "var(--c-n-700)" }}>
            Ativos filhos {ativo.filhos.length > 0 && `(${ativo.filhos.length})`}
          </h2>
          {ativo.filhos.length === 0 ? (
            <p style={{ color: "var(--c-n-500)", fontSize: "var(--text-small)" }}>Este ativo não tem filhos na hierarquia.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Criticidade</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ativo.filhos.map((f) => (
                    <tr key={f.id} onClick={() => navigate(`/ativos/${f.id}`)} style={{ cursor: "pointer" }}>
                      <td className="mono">{f.codigo}</td>
                      <td>{f.nome}</td>
                      <td>{ROTULO_TIPO[f.tipo]}</td>
                      <td>
                        <span className={`badge badge--prioridade-${f.criticidade}`}>{ROTULO_CRITICIDADE[f.criticidade]}</span>
                      </td>
                      <td>{ROTULO_STATUS_ATIVO[f.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {aba === "pecas" && (
        <AtivoPecasTab ativoId={ativo.id} qtdFilhosDiretos={ativo.filhos.length} podeEditar={pode("ativos", "editar")} />
      )}

      {aba === "confiabilidade" && <AtivoConfiabilidadeTab ativoId={ativo.id} />}

      {aba === "historico" && <AtivoHistoricoTab ativoId={ativo.id} />}

      {modalAberto && <AtivoFormModal ativo={ativo} onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}

      {confirmandoExclusao && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmandoExclusao(false)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Excluir ativo</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja excluir <strong>{ativo.nome}</strong>? Este ativo sairá das listagens, mas o
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
    <div className="field">
      <label>{rotulo}</label>
      <span className={mono ? "mono" : undefined} style={{ color: valor ? "var(--c-n-800)" : "var(--c-n-400)" }}>
        {valor || "—"}
      </span>
    </div>
  );
}
