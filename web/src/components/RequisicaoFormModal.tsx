import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { RequisicaoCompra } from "../types";
import { Modal } from "./Modal";

export function RequisicaoFormModal({
  requisicao,
  onFechar,
  onSalvo,
}: {
  requisicao: RequisicaoCompra | null;
  onFechar: () => void;
  onSalvo: (requisicao: RequisicaoCompra) => void;
}) {
  const [fornecedor, setFornecedor] = useState(requisicao?.fornecedor ?? "");
  const [dataNecessidade, setDataNecessidade] = useState(requisicao?.data_necessidade ?? "");
  const [observacoes, setObservacoes] = useState(requisicao?.observacoes ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      fornecedor: fornecedor.trim() || null,
      data_necessidade: dataNecessidade || null,
      observacoes: observacoes.trim() || null,
    };
    try {
      const resultado = requisicao
        ? await api.put<{ requisicao: RequisicaoCompra }>(`/requisicoes-compra/${requisicao.id}`, payload)
        : await api.post<{ requisicao: RequisicaoCompra }>("/requisicoes-compra", payload);
      onSalvo(resultado.requisicao);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar a requisição.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={requisicao ? "Editar requisição" : "Nova requisição de compra"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="fornecedor">Fornecedor (opcional)</label>
          <input id="fornecedor" className="input" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="data_necessidade">Data de necessidade (opcional)</label>
          <input
            id="data_necessidade"
            type="date"
            className="input"
            value={dataNecessidade}
            onChange={(e) => setDataNecessidade(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="observacoes">Observações</label>
          <textarea id="observacoes" className="input" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
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
