import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { PlanoTarefa, Regime, TipoResposta } from "../types";
import { Modal } from "./Modal";

const ROTULO_TIPO_RESPOSTA: Record<TipoResposta, string> = {
  ok_nok: "Ok / Não ok",
  texto: "Texto",
  numerico: "Numérico",
  selecao: "Seleção",
};

export const ROTULO_REGIME: Record<Regime, string> = {
  MP: "Máquina parada",
  MF: "Máquina funcionando",
};

interface FormState {
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: boolean;
  valor_min: string;
  valor_max: string;
  unidade: string;
  regime: Regime | "";
}

function estadoInicial(tarefa: PlanoTarefa | null): FormState {
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
  planoId,
  tarefa,
  onFechar,
  onSalvo,
}: {
  planoId: number;
  tarefa: PlanoTarefa | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(tarefa));
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
        await api.put(`/planos/${planoId}/tarefas/${tarefa.id}`, payload);
      } else {
        await api.post(`/planos/${planoId}/tarefas`, payload);
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar a tarefa.");
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

export function PlanoTarefasTab({ planoId, podeEditar }: { planoId: number; podeEditar: boolean }) {
  const [tarefas, setTarefas] = useState<PlanoTarefa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalTarefa, setModalTarefa] = useState<{ tarefa: PlanoTarefa | null } | null>(null);
  const [removendo, setRemovendo] = useState<PlanoTarefa | null>(null);

  function carregar() {
    api
      .get<{ tarefas: PlanoTarefa[] }>(`/planos/${planoId}/tarefas`)
      .then((r) => setTarefas(r.tarefas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o checklist."));
  }

  useEffect(carregar, [planoId]);

  async function mover(tarefaId: number, direcao: "cima" | "baixo") {
    try {
      await api.post(`/planos/${planoId}/tarefas/${tarefaId}/mover`, { direcao });
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível reordenar o checklist.");
    }
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await api.del(`/planos/${planoId}/tarefas/${removendo.id}`);
      setRemovendo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível remover a tarefa.");
      setRemovendo(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Checklist</h2>
          <div className="page-header__desc">Itens copiados para a OS no momento da geração (snapshot)</div>
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
              <th>Descrição</th>
              <th>Regime</th>
              <th>Tipo de resposta</th>
              <th>Faixa</th>
              <th>Obrigatória</th>
              {podeEditar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {tarefas?.map((t, i) => (
              <tr key={t.id}>
                <td className="mono">{t.ordem}</td>
                <td>{t.descricao}</td>
                <td>{t.regime ? ROTULO_REGIME[t.regime] : "—"}</td>
                <td>{ROTULO_TIPO_RESPOSTA[t.tipo_resposta]}</td>
                <td className="mono">
                  {t.tipo_resposta === "numerico" && (t.valor_min != null || t.valor_max != null)
                    ? `${t.valor_min ?? "—"} a ${t.valor_max ?? "—"} ${t.unidade ?? ""}`
                    : ""}
                </td>
                <td>{t.obrigatoria ? "Sim" : "Não"}</td>
                {podeEditar && (
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn--ghost" disabled={i === 0} onClick={() => mover(t.id, "cima")}>
                        ↑
                      </button>
                      <button type="button" className="btn btn--ghost" disabled={i === tarefas.length - 1} onClick={() => mover(t.id, "baixo")}>
                        ↓
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={() => setModalTarefa({ tarefa: t })}>
                        Editar
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={() => setRemovendo(t)}>
                        Remover
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {tarefas?.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 7 : 6} className="empty-state">
                  Nenhum item no checklist ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalTarefa && (
        <TarefaFormModal
          planoId={planoId}
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
