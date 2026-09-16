import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { ItemAuditoria, OrdemServico, ResultadoInspecao } from "../types";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { Modal } from "../components/Modal";
import { agoraSistemaDatetimeLocal } from "../lib/horarioSistema";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

const ROTULO_RESULTADO_INSPECAO: Record<ResultadoInspecao, string> = {
  ok: "OK",
  atencao: "Atenção",
  critico: "Crítico",
};

function LinhaItem({ item, podeEditar, osId, onSalvo }: { item: ItemAuditoria; podeEditar: boolean; osId: number; onSalvo: () => void }) {
  const [observacao, setObservacao] = useState(item.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function marcar(conformidade: "conforme" | "divergente") {
    setSalvando(true);
    setErro(null);
    try {
      await api.put(`/inspecoes/auditorias/${osId}/itens/${item.id}`, { conformidade, observacao: observacao.trim() || null });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível salvar a conferência.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <tr>
      <td>
        {item.descricao}
        <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
          Resposta original do técnico: {item.tipo_resposta === "numerico" ? item.valor_numerico ?? "—" : item.resposta ?? "—"}
          {item.concluida === 1 ? " (concluído)" : " (não concluído)"}
        </div>
      </td>
      <td>
        {podeEditar ? (
          <div>
            <div className="row-actions">
              <button
                type="button"
                className={`btn ${item.conformidade === "conforme" ? "btn--primary" : "btn--secondary"}`}
                disabled={salvando}
                onClick={() => marcar("conforme")}
              >
                Conforme
              </button>
              <button
                type="button"
                className={`btn ${item.conformidade === "divergente" ? "btn--destructive" : "btn--secondary"}`}
                disabled={salvando}
                onClick={() => marcar("divergente")}
              >
                Divergente
              </button>
            </div>
            <input
              className="input"
              style={{ marginTop: "6px" }}
              placeholder="Observação (opcional)"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              onBlur={() => item.conformidade && marcar(item.conformidade)}
            />
            {erro && <div className="login-card__error" style={{ marginTop: "6px" }}>{erro}</div>}
          </div>
        ) : item.conformidade ? (
          <span className={`badge badge--auditoria-${item.conformidade}`}>
            <span className="badge__dot" /> {item.conformidade === "conforme" ? "Conforme" : "Divergente"}
          </span>
        ) : (
          <span className="badge badge--auditoria-nao_auditada">
            <span className="badge__dot" /> Pendente
          </span>
        )}
      </td>
    </tr>
  );
}

function ConcluirAuditoriaModal({ os, onFechar, onSalvo }: { os: OrdemServico; onFechar: () => void; onSalvo: (os: OrdemServico) => void }) {
  const [resultado, setResultado] = useState<ResultadoInspecao | "">("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<{ os: OrdemServico }>(`/inspecoes/auditorias/${os.id}/concluir`, {
        resultado_inspecao: resultado,
        observacoes_execucao: observacoes.trim() || null,
        data_conclusao: `${agoraSistemaDatetimeLocal().replace("T", " ")}:00`,
      });
      onSalvo(r.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível concluir a conferência.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Concluir conferência" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="resultado">Resultado geral</label>
          <select id="resultado" className="input" value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoInspecao | "")} required>
            <option value="">Selecione…</option>
            {Object.entries(ROTULO_RESULTADO_INSPECAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="observacoes">Observações</label>
          <textarea id="observacoes" className="input" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando || !resultado}>
            {enviando ? "Concluindo…" : "Concluir conferência"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AuditoriaOSDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [os, setOs] = useState<OrdemServico | null>(null);
  const [itens, setItens] = useState<ItemAuditoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [modalConcluir, setModalConcluir] = useState(false);
  const podeEditar = pode("inspecoes", "editar") && os?.status !== "concluida" && os?.status !== "cancelada";

  function carregar() {
    api
      .get<{ os: OrdemServico }>(`/ordens-servico/${id}`)
      .then((r) => setOs(r.os))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a conferência."));
    api
      .get<{ itens: ItemAuditoria[] }>(`/inspecoes/auditorias/${id}/itens`)
      .then((r) => setItens(r.itens))
      .catch(() => undefined);
  }

  useEffect(carregar, [id]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  async function iniciar() {
    setErroAcao(null);
    setProcessando(true);
    try {
      await api.post(`/ordens-servico/${id}/iniciar`, {});
      carregar();
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : "Não foi possível iniciar a conferência.");
    } finally {
      setProcessando(false);
    }
  }

  if (erro) {
    return (
      <div className="empty-state">
        <h3>Não foi possível abrir esta conferência</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!os || !itens) return null;

  const todosConferidos = itens.length === 0 || itens.every((i) => !!i.conformidade);

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/inspecoes/auditorias">Conferência de OS</Link> › <strong>{os.codigo}</strong>
      </div>

      <div className="page-header">
        <div>
          <h1>Conferência de {os.codigo}</h1>
          <div className="page-header__desc">
            Verificando a execução de{" "}
            {os.os_auditada_id ? <Link to={`/ordens-servico/${os.os_auditada_id}`}>a OS auditada</Link> : "uma OS concluída"} em{" "}
            {os.ativo_nome}
          </div>
        </div>
        <div className="row-actions">
          <span className={`badge badge--status-${os.status}`}>
            <span className="badge__dot" /> {os.status}
          </span>
          {os.resultado_inspecao && (
            <span className={`badge badge--resultado-${os.resultado_inspecao}`}>
              <span className="badge__dot" /> {ROTULO_RESULTADO_INSPECAO[os.resultado_inspecao]}
            </span>
          )}
        </div>
      </div>

      <div className="modal__grid card" style={{ marginBottom: "16px" }}>
        <div className="field">
          <label>Prioridade</label>
          <span className={`badge badge--prioridade-${os.prioridade}`}>{ROTULO_CRITICIDADE[os.prioridade]}</span>
        </div>
        <div className="field">
          <label>Inspetor</label>
          <span>{os.responsavel_nome ?? "—"}</span>
        </div>
        <div className="field">
          <label>Data programada</label>
          <span className="mono">{os.data_programada}</span>
        </div>
        <div className="field">
          <label>Data limite</label>
          <span className="mono">{os.data_limite}</span>
        </div>
      </div>

      {erroAcao && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erroAcao}
        </div>
      )}

      {os.status === "aberta" && podeEditar && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <p style={{ marginBottom: "12px" }}>Inicie a conferência para começar a marcar os itens do checklist original.</p>
          <button type="button" className="btn btn--primary" disabled={processando} onClick={iniciar}>
            {processando ? "Iniciando…" : "Iniciar conferência"}
          </button>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: "12px" }}>Checklist original — conferência item a item</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Conferência</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <LinhaItem key={item.id} item={item} osId={os.id} podeEditar={podeEditar && os.status === "em_execucao"} onSalvo={carregar} />
              ))}
              {itens.length === 0 && (
                <tr>
                  <td colSpan={2} className="empty-state">
                    A OS auditada não tinha itens de checklist — conclua registrando apenas o resultado geral.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {os.status === "em_execucao" && podeEditar && (
          <div style={{ marginTop: "16px" }}>
            <button type="button" className="btn btn--primary" disabled={!todosConferidos} onClick={() => setModalConcluir(true)}>
              Concluir conferência
            </button>
            {!todosConferidos && (
              <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginTop: "8px" }}>
                Marque conforme/divergente em todos os itens para concluir.
              </p>
            )}
          </div>
        )}
      </div>

      {modalConcluir && (
        <ConcluirAuditoriaModal
          os={os}
          onFechar={() => setModalConcluir(false)}
          onSalvo={() => {
            setModalConcluir(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}
