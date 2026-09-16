import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { OSPeca, Peca } from "../types";
import { Modal } from "./Modal";

function AdicionarPecaModal({ osId, onFechar, onSalvo }: { osId: number; onFechar: () => void; onSalvo: () => void }) {
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [pecaId, setPecaId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [obrigatoria, setObrigatoria] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ pecas: Peca[] }>("/pecas").then((r) => setPecas(r.pecas));
  }, []);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/ordens-servico/${osId}/pecas`, {
        peca_id: Number(pecaId),
        quantidade_prevista: Number(quantidade) || 0,
        obrigatoria,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível adicionar a peça.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Adicionar peça à OS" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="peca_id">Peça</label>
          <select id="peca_id" className="input" value={pecaId} onChange={(e) => setPecaId(e.target.value)} required>
            <option value="">Selecione…</option>
            {pecas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.descricao}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="quantidade">Quantidade prevista</label>
          <input
            id="quantidade"
            type="number"
            step="0.01"
            min="0.01"
            className="input mono"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} />
          Obrigatória (a OS não conclui sem baixa desta peça)
        </label>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConsumoModal({ item, onFechar, onSalvo }: { item: OSPeca; onFechar: () => void; onSalvo: () => void }) {
  const [quantidade, setQuantidade] = useState(item.quantidade_consumida != null ? String(item.quantidade_consumida) : String(item.quantidade_prevista));
  const [justificativa, setJustificativa] = useState(item.justificativa_divergencia ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.put(`/ordens-servico/${item.os_id}/pecas/${item.id}/consumo`, {
        quantidade_consumida: Number(quantidade) || 0,
        justificativa_divergencia: justificativa.trim() || null,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível registrar o consumo.");
    } finally {
      setEnviando(false);
    }
  }

  const divergente = Number(quantidade) !== item.quantidade_prevista;

  return (
    <Modal titulo={`Registrar consumo — ${item.descricao}`} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
          Quantidade prevista: <strong>{item.quantidade_prevista} {item.unidade_medida}</strong>. Estoque atual: {item.estoque_atual} {item.unidade_medida}.
        </p>
        <div className="field">
          <label htmlFor="quantidade_consumida">Quantidade efetivamente usada</label>
          <input
            id="quantidade_consumida"
            type="number"
            step="0.01"
            min="0"
            className="input mono"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
          />
        </div>
        {divergente && (
          <div className="field">
            <label htmlFor="justificativa">Justificativa da divergência</label>
            <textarea
              id="justificativa"
              className="input"
              rows={2}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Por que a quantidade usada difere da prevista?"
            />
          </div>
        )}
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Salvando…" : "Registrar consumo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function OSPecasTab({ osId, podeEditar, bloqueado }: { osId: number; podeEditar: boolean; bloqueado: boolean }) {
  const [pecas, setPecas] = useState<OSPeca[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [modalConsumo, setModalConsumo] = useState<OSPeca | null>(null);
  const [removendo, setRemovendo] = useState<OSPeca | null>(null);

  function carregar() {
    api
      .get<{ pecas: OSPeca[] }>(`/ordens-servico/${osId}/pecas`)
      .then((r) => setPecas(r.pecas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as peças da OS."));
  }

  useEffect(carregar, [osId]);

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await api.del(`/ordens-servico/${osId}/pecas/${removendo.id}`);
      setRemovendo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível remover a peça.");
      setRemovendo(null);
    }
  }

  const podeAlterar = podeEditar && !bloqueado;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Peças</h2>
          <div className="page-header__desc">
            Itens com * são obrigatórios — a OS não conclui sem a baixa de consumo registrada
          </div>
        </div>
        {podeAlterar && (
          <button type="button" className="btn btn--primary" onClick={() => setModalAdicionar(true)}>
            Adicionar peça
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
              <th>Prevista</th>
              <th>Consumida</th>
              <th>Origem</th>
              {podeAlterar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {pecas?.map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.codigo}</td>
                <td>
                  {p.descricao}
                  {p.obrigatoria === 1 && <span style={{ color: "var(--c-danger-500)" }}> *</span>}
                </td>
                <td className="mono">
                  {p.quantidade_prevista} {p.unidade_medida}
                </td>
                <td className="mono">
                  {p.quantidade_consumida != null ? `${p.quantidade_consumida} ${p.unidade_medida}` : "—"}
                  {p.justificativa_divergencia && (
                    <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>{p.justificativa_divergencia}</div>
                  )}
                </td>
                <td>{p.origem === "plano" ? "Plano" : p.origem === "lista_tecnica_ativo" ? "Lista técnica" : "Manual"}</td>
                {podeAlterar && (
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn--ghost" onClick={() => setModalConsumo(p)}>
                        {p.quantidade_consumida != null ? "Editar consumo" : "Registrar consumo"}
                      </button>
                      {p.quantidade_consumida == null && (
                        <button type="button" className="btn btn--ghost" onClick={() => setRemovendo(p)}>
                          Remover
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {pecas?.length === 0 && (
              <tr>
                <td colSpan={podeAlterar ? 6 : 5} className="empty-state">
                  Nenhuma peça prevista para esta OS.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAdicionar && (
        <AdicionarPecaModal
          osId={osId}
          onFechar={() => setModalAdicionar(false)}
          onSalvo={() => {
            setModalAdicionar(false);
            carregar();
          }}
        />
      )}

      {modalConsumo && (
        <ConsumoModal
          item={modalConsumo}
          onFechar={() => setModalConsumo(null)}
          onSalvo={() => {
            setModalConsumo(null);
            carregar();
          }}
        />
      )}

      {removendo && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setRemovendo(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Remover peça</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Remover <strong>{removendo.descricao}</strong> desta OS?
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
