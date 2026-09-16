import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Peca, PlanoPeca } from "../types";
import { Modal } from "./Modal";

interface FormState {
  peca_id: string;
  quantidade_prevista: string;
  obrigatoria: boolean;
}

function VincularPecaPlanoModal({
  planoId,
  vinculo,
  onFechar,
  onSalvo,
}: {
  planoId: number;
  vinculo: PlanoPeca | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    peca_id: vinculo ? String(vinculo.peca_id) : "",
    quantidade_prevista: vinculo ? String(vinculo.quantidade_prevista) : "1",
    obrigatoria: vinculo ? vinculo.obrigatoria === 1 : true,
  });
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!vinculo) {
      api.get<{ pecas: Peca[] }>("/pecas").then((r) => setPecas(r.pecas));
    }
  }, [vinculo]);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      peca_id: Number(form.peca_id),
      quantidade_prevista: Number(form.quantidade_prevista) || 0,
      obrigatoria: form.obrigatoria,
    };
    try {
      if (vinculo) {
        await api.put(`/planos/${planoId}/pecas/${vinculo.id}`, payload);
      } else {
        await api.post(`/planos/${planoId}/pecas`, payload);
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o vínculo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={vinculo ? "Editar peça do plano" : "Vincular peça ao plano"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="field">
          <label htmlFor="peca_id">Peça</label>
          {vinculo ? (
            <input className="input" value={`${vinculo.codigo} — ${vinculo.descricao}`} disabled />
          ) : (
            <select id="peca_id" className="input" value={form.peca_id} onChange={(e) => set("peca_id", e.target.value)} required>
              <option value="">Selecione…</option>
              {pecas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.descricao}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="field">
          <label htmlFor="quantidade_prevista">Quantidade prevista</label>
          <input
            id="quantidade_prevista"
            type="number"
            step="0.01"
            min="0.01"
            className="input mono"
            value={form.quantidade_prevista}
            onChange={(e) => set("quantidade_prevista", e.target.value)}
            required
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={form.obrigatoria} onChange={(e) => set("obrigatoria", e.target.checked)} />
          Obrigatória (a OS não conclui sem baixa desta peça)
        </label>

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

export function PlanoPecasTab({ planoId, podeEditar }: { planoId: number; podeEditar: boolean }) {
  const [vinculos, setVinculos] = useState<PlanoPeca[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalVincular, setModalVincular] = useState<{ vinculo: PlanoPeca | null } | null>(null);
  const [removendo, setRemovendo] = useState<PlanoPeca | null>(null);

  function carregar() {
    api
      .get<{ pecas: PlanoPeca[] }>(`/planos/${planoId}/pecas`)
      .then((r) => setVinculos(r.pecas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as peças do plano."));
  }

  useEffect(carregar, [planoId]);

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await api.del(`/planos/${planoId}/pecas/${removendo.id}`);
      setRemovendo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível remover o vínculo.");
      setRemovendo(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Peças do plano</h2>
          <div className="page-header__desc">
            Lista específica deste plano — tem prioridade sobre a lista técnica do ativo ao montar a OS
          </div>
        </div>
        {podeEditar && (
          <button type="button" className="btn btn--primary" onClick={() => setModalVincular({ vinculo: null })}>
            Vincular peça
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
              <th>Código</th>
              <th>Descrição</th>
              <th>Qtd. prevista</th>
              <th>Obrigatória</th>
              <th>Estoque</th>
              {podeEditar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {vinculos?.map((v) => {
              const abaixo = v.estoque_atual < v.estoque_minimo;
              return (
                <tr key={v.id}>
                  <td className="mono">{v.codigo}</td>
                  <td>{v.descricao}</td>
                  <td className="mono">
                    {v.quantidade_prevista} {v.unidade_medida}
                  </td>
                  <td>{v.obrigatoria ? "Sim" : "Não"}</td>
                  <td>
                    <span className={`badge ${abaixo ? "badge--estoque-baixo" : "badge--estoque-ok"}`}>
                      <span className="badge__dot" /> {v.estoque_atual} {v.unidade_medida}
                    </span>
                  </td>
                  {podeEditar && (
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn--ghost" onClick={() => setModalVincular({ vinculo: v })}>
                          Editar
                        </button>
                        <button type="button" className="btn btn--ghost" onClick={() => setRemovendo(v)}>
                          Remover
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {vinculos?.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 6 : 5} className="empty-state">
                  Nenhuma peça vinculada a este plano ainda. A OS usará a lista técnica do ativo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalVincular && (
        <VincularPecaPlanoModal
          planoId={planoId}
          vinculo={modalVincular.vinculo}
          onFechar={() => setModalVincular(null)}
          onSalvo={() => {
            setModalVincular(null);
            carregar();
          }}
        />
      )}

      {removendo && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setRemovendo(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Remover vínculo</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Remover o vínculo com <strong>{removendo.descricao}</strong>?
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
