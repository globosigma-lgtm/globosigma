import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { ItemRequisicao, Peca } from "../types";
import { Modal } from "./Modal";

export function ItemRequisicaoFormModal({
  requisicaoId,
  item,
  onFechar,
  onSalvo,
}: {
  requisicaoId: number;
  item: ItemRequisicao | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [pecaId, setPecaId] = useState(item ? String(item.peca_id) : "");
  const [quantidade, setQuantidade] = useState(item ? String(item.quantidade) : "1");
  const [custoEstimado, setCustoEstimado] = useState(item?.custo_unitario_estimado != null ? String(item.custo_unitario_estimado) : "");
  const [dataNecessidade, setDataNecessidade] = useState(item?.data_necessidade ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!item) {
      api.get<{ pecas: Peca[] }>("/pecas").then((r) => setPecas(r.pecas));
    }
  }, [item]);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      peca_id: Number(pecaId),
      quantidade: Number(quantidade) || 0,
      custo_unitario_estimado: custoEstimado ? Number(custoEstimado) : null,
      data_necessidade: dataNecessidade || null,
    };
    try {
      if (item) {
        await api.put(`/requisicoes-compra/${requisicaoId}/itens/${item.id}`, payload);
      } else {
        await api.post(`/requisicoes-compra/${requisicaoId}/itens`, payload);
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o item.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={item ? "Editar item" : "Adicionar peça à requisição"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="peca_id">Peça</label>
          {item ? (
            <input className="input" value={`${item.peca_codigo} — ${item.peca_descricao}`} disabled />
          ) : (
            <select id="peca_id" className="input" value={pecaId} onChange={(e) => setPecaId(e.target.value)} required>
              <option value="">Selecione…</option>
              {pecas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.descricao}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="quantidade">Quantidade</label>
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
          <div className="field">
            <label htmlFor="custo_unitario_estimado">Custo unitário estimado</label>
            <input
              id="custo_unitario_estimado"
              type="number"
              step="0.01"
              min="0"
              className="input mono"
              value={custoEstimado}
              onChange={(e) => setCustoEstimado(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="data_necessidade">Data de necessidade</label>
          <input
            id="data_necessidade"
            type="date"
            className="input"
            value={dataNecessidade}
            onChange={(e) => setDataNecessidade(e.target.value)}
          />
        </div>
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
