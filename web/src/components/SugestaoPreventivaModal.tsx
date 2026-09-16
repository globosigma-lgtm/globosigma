import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { RequisicaoCompra } from "../types";
import { Modal } from "./Modal";
import { hojeSistema } from "../lib/horarioSistema";

const hoje = hojeSistema;

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function SugestaoPreventivaModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (requisicao: RequisicaoCompra) => void }) {
  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFim, setDataFim] = useState(somarDias(hoje(), 90));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resultado = await api.post<{ requisicao: RequisicaoCompra }>("/requisicoes-compra/sugestao/programacao-preventiva", {
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      onSalvo(resultado.requisicao);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível gerar a sugestão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Sugestão a partir da programação preventiva" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
          Projeta a demanda de peças dos planos de manutenção ativos no período e sugere comprar o que faltar em
          relação ao estoque disponível.
        </p>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_inicio">Início do período</label>
            <input id="data_inicio" type="date" className="input" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="data_fim">Fim do período</label>
            <input id="data_fim" type="date" className="input" value={dataFim} onChange={(e) => setDataFim(e.target.value)} required />
          </div>
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Gerando…" : "Gerar rascunho"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
