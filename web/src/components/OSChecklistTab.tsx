import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { OSTarefa, Regime, TipoResposta } from "../types";
import { Modal } from "./Modal";

const ROTULO_TIPO_RESPOSTA: Record<TipoResposta, string> = {
  ok_nok: "Ok / Não ok",
  texto: "Texto",
  numerico: "Numérico",
  selecao: "Seleção",
};

const ROTULO_REGIME: Record<Regime, string> = {
  MP: "Máquina parada",
  MF: "Máquina funcionando",
};

interface EstadoLinha {
  resposta: string;
  valor_numerico: string;
  concluida: boolean;
}

function estadoDeTarefa(t: OSTarefa): EstadoLinha {
  return {
    resposta: t.resposta ?? "",
    valor_numerico: t.valor_numerico != null ? String(t.valor_numerico) : "",
    concluida: t.concluida === 1,
  };
}

interface FormState {
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: boolean;
  valor_min: string;
  valor_max: string;
  unidade: string;
  regime: Regime | "";
}

function estadoInicialForm(tarefa: OSTarefa | null): FormState {
  return {
    descricao: tarefa?.descricao ?? "",
    tipo_resposta: tarefa?.tipo_resposta ?? "ok_nok",
    obrigatoria: tarefa ? tarefa.obrigatoria === 1 : true,
    valor_min: tarefa?.valor_min != null ? String(tarefa.valor_min) : "",
    valor_max: tarefa?.valor_max != null ? String(tarefa.valor_max) : "",
    unidade: tarefa?.unidade ?? "",
    regime: tarefa?.regime ?? "",
  };
}

function TarefaFormModal({
  osId,
  tarefa,
  onFechar,
  onSalvo,
}: {
  osId: number;
  tarefa: OSTarefa | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => estadoInicialForm(tarefa));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      descricao: form.descricao.trim(),
      tipo_resposta: form.tipo_resposta,
      obrigatoria: form.obrigatoria,
      valor_min: form.tipo_resposta === "numerico" && form.valor_min ? Number(form.valor_min) : null,
      valor_max: form.tipo_resposta === "numerico" && form.valor_max ? Number(form.valor_max) : null,
      unidade: form.tipo_resposta === "numerico" ? form.unidade.trim() || null : null,
      regime: form.regime || null,
    };
    try {
      if (tarefa) {
        await api.put(`/ordens-servico/${osId}/tarefas/${tarefa.id}/definicao`, payload);
      } else {
        await api.post(`/ordens-servico/${osId}/tarefas`, payload);
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o item.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={tarefa ? "Editar item do checklist" : "Novo item do checklist"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="field">
          <label htmlFor="descricao">Descrição</label>
          <input id="descricao" className="input" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="tipo_resposta">Tipo de resposta</label>
            <select id="tipo_resposta" className="input" value={form.tipo_resposta} onChange={(e) => set("tipo_resposta", e.target.value as TipoResposta)}>
              {Object.entries(ROTULO_TIPO_RESPOSTA).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)", alignSelf: "end", paddingBottom: "10px" }}>
            <input type="checkbox" checked={form.obrigatoria} onChange={(e) => set("obrigatoria", e.target.checked)} />
            Obrigatória
          </label>
        </div>

        <div className="field">
          <label htmlFor="regime">Regime (opcional)</label>
          <select id="regime" className="input" value={form.regime} onChange={(e) => set("regime", e.target.value as Regime | "")}>
            <option value="">Não classificado</option>
            {Object.entries(ROTULO_REGIME).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>

        {form.tipo_resposta === "numerico" && (
          <div className="modal__grid">
            <div className="field">
              <label htmlFor="valor_min">Valor mínimo</label>
              <input id="valor_min" type="number" step="any" className="input mono" value={form.valor_min} onChange={(e) => set("valor_min", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="valor_max">Valor máximo</label>
              <input id="valor_max" type="number" step="any" className="input mono" value={form.valor_max} onChange={(e) => set("valor_max", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="unidade">Unidade</label>
              <input id="unidade" className="input" value={form.unidade} onChange={(e) => set("unidade", e.target.value)} placeholder="Ex.: bar, °C" />
            </div>
          </div>
        )}

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LinhaTarefa({
  osId,
  tarefa,
  podeEditar,
  onSalvo,
  onEditarDefinicao,
  onRemover,
}: {
  osId: number;
  tarefa: OSTarefa;
  podeEditar: boolean;
  onSalvo: () => void;
  onEditarDefinicao: () => void;
  onRemover: () => void;
}) {
  const [estado, setEstado] = useState<EstadoLinha>(() => estadoDeTarefa(tarefa));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setEstado(estadoDeTarefa(tarefa)), [tarefa]);

  const foraDaFaixa =
    tarefa.tipo_resposta === "numerico" &&
    estado.valor_numerico !== "" &&
    ((tarefa.valor_min != null && Number(estado.valor_numerico) < tarefa.valor_min) ||
      (tarefa.valor_max != null && Number(estado.valor_numerico) > tarefa.valor_max));

  async function salvar(concluida: boolean) {
    setErro(null);
    setSalvando(true);
    try {
      await api.put(`/ordens-servico/${osId}/tarefas/${tarefa.id}`, {
        resposta: tarefa.tipo_resposta !== "numerico" ? estado.resposta.trim() || null : null,
        valor_numerico: tarefa.tipo_resposta === "numerico" && estado.valor_numerico !== "" ? Number(estado.valor_numerico) : null,
        concluida,
      });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível salvar o item.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <tr>
      <td className="mono">{tarefa.ordem}</td>
      <td>
        {tarefa.descricao}
        {tarefa.obrigatoria === 1 && <span style={{ color: "var(--c-danger-500)" }}> *</span>}
        {tarefa.regime && (
          <span style={{ marginLeft: "6px", fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>({ROTULO_REGIME[tarefa.regime]})</span>
        )}
      </td>
      <td>
        {!podeEditar ? (
          <span>
            {tarefa.tipo_resposta === "numerico" ? tarefa.valor_numerico ?? "—" : tarefa.resposta ?? "—"} {tarefa.unidade ?? ""}
          </span>
        ) : tarefa.tipo_resposta === "ok_nok" ? (
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${estado.resposta === "ok" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setEstado((s) => ({ ...s, resposta: "ok" }))}
            >
              OK
            </button>
            <button
              type="button"
              className={`btn ${estado.resposta === "nok" ? "btn--destructive" : "btn--secondary"}`}
              onClick={() => setEstado((s) => ({ ...s, resposta: "nok" }))}
            >
              NOK
            </button>
          </div>
        ) : tarefa.tipo_resposta === "numerico" ? (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="number"
              step="any"
              className="input mono"
              style={{ maxWidth: "140px" }}
              value={estado.valor_numerico}
              onChange={(e) => setEstado((s) => ({ ...s, valor_numerico: e.target.value }))}
            />
            <span style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
              {tarefa.unidade}
              {(tarefa.valor_min != null || tarefa.valor_max != null) &&
                ` (faixa: ${tarefa.valor_min ?? "—"} a ${tarefa.valor_max ?? "—"})`}
            </span>
          </div>
        ) : (
          <input
            className="input"
            value={estado.resposta}
            onChange={(e) => setEstado((s) => ({ ...s, resposta: e.target.value }))}
          />
        )}
        {foraDaFaixa && (
          <div style={{ color: "var(--c-warning-900)", fontSize: "var(--text-caption)", marginTop: "4px" }}>
            Fora da faixa esperada.
          </div>
        )}
        {erro && <div className="login-card__error" style={{ marginTop: "6px" }}>{erro}</div>}
      </td>
      <td>
        {tarefa.concluida === 1 ? (
          <span className="badge badge--status-concluida">
            <span className="badge__dot" /> Concluído
          </span>
        ) : (
          <span className="badge badge--status-aberta">
            <span className="badge__dot" /> Pendente
          </span>
        )}
      </td>
      {podeEditar && (
        <td>
          <div className="row-actions">
            <button type="button" className="btn btn--ghost" disabled={salvando} onClick={() => salvar(true)}>
              {tarefa.concluida === 1 ? "Salvar" : "Concluir"}
            </button>
            {tarefa.concluida === 1 && (
              <button type="button" className="btn btn--ghost" disabled={salvando} onClick={() => salvar(false)}>
                Reabrir
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onEditarDefinicao}>
              Editar item
            </button>
            <button type="button" className="btn btn--ghost" onClick={onRemover}>
              Remover
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

export function OSChecklistTab({ osId, podeEditar }: { osId: number; podeEditar: boolean }) {
  const [tarefas, setTarefas] = useState<OSTarefa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalTarefa, setModalTarefa] = useState<{ tarefa: OSTarefa | null } | null>(null);
  const [removendo, setRemovendo] = useState<OSTarefa | null>(null);

  function carregar() {
    api
      .get<{ tarefas: OSTarefa[] }>(`/ordens-servico/${osId}/tarefas`)
      .then((r) => setTarefas(r.tarefas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o checklist."));
  }

  useEffect(carregar, [osId]);

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await api.del(`/ordens-servico/${osId}/tarefas/${removendo.id}`);
      setRemovendo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível remover o item.");
      setRemovendo(null);
    }
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "4px", color: "var(--c-n-700)" }}>Checklist de execução</h2>
          <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)" }}>
            Todo item precisa ser respondido para concluir a OS. Itens com <span style={{ color: "var(--c-danger-500)" }}>*</span> são
            obrigatórios (a diferença hoje é só informativa).
          </p>
        </div>
        {podeEditar && (
          <button type="button" className="btn btn--primary" onClick={() => setModalTarefa({ tarefa: null })}>
            Adicionar item
          </button>
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
              <th>#</th>
              <th>Item</th>
              <th>Resposta</th>
              <th>Situação</th>
              {podeEditar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {tarefas?.map((t) => (
              <LinhaTarefa
                key={t.id}
                osId={osId}
                tarefa={t}
                podeEditar={podeEditar}
                onSalvo={carregar}
                onEditarDefinicao={() => setModalTarefa({ tarefa: t })}
                onRemover={() => setRemovendo(t)}
              />
            ))}
            {tarefas?.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 5 : 4} className="empty-state">
                  Esta OS não tem itens de checklist.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalTarefa && (
        <TarefaFormModal
          osId={osId}
          tarefa={modalTarefa.tarefa}
          onFechar={() => setModalTarefa(null)}
          onSalvo={() => {
            setModalTarefa(null);
            carregar();
          }}
        />
      )}

      {removendo && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setRemovendo(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Remover item do checklist</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Remover o item <strong>{removendo.descricao}</strong>?
            </p>
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setRemovendo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--destructive" onClick={confirmarRemocao}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
