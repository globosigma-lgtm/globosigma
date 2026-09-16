import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Peca, VinculoAtivoPeca } from "../types";
import { Modal } from "./Modal";

interface FormState {
  peca_id: string;
  quantidade_padrao: string;
  aplicacao: string;
  posicao: string;
  troca_obrigatoria: boolean;
  observacao: string;
  propagarParaFilhos: boolean;
}

function estadoInicial(vinculo: VinculoAtivoPeca | null): FormState {
  return {
    peca_id: vinculo ? String(vinculo.peca_id) : "",
    quantidade_padrao: vinculo ? String(vinculo.quantidade_padrao) : "1",
    aplicacao: vinculo?.aplicacao ?? "",
    posicao: vinculo?.posicao ?? "",
    troca_obrigatoria: vinculo ? vinculo.troca_obrigatoria === 1 : false,
    observacao: vinculo?.observacao ?? "",
    propagarParaFilhos: false,
  };
}

export function VincularPecaModal({
  ativoId,
  vinculo,
  qtdFilhosDiretos,
  onFechar,
  onSalvo,
}: {
  ativoId: number;
  vinculo: VinculoAtivoPeca | null;
  qtdFilhosDiretos: number;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(vinculo));
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
      quantidade_padrao: Number(form.quantidade_padrao) || 0,
      aplicacao: form.aplicacao.trim() || null,
      posicao: form.posicao.trim(),
      troca_obrigatoria: form.troca_obrigatoria,
      observacao: form.observacao.trim() || null,
      propagarParaFilhos: form.propagarParaFilhos,
    };
    try {
      if (vinculo) {
        await api.put(`/ativos/${ativoId}/pecas/${vinculo.id}`, payload);
      } else {
        await api.post(`/ativos/${ativoId}/pecas`, payload);
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o vínculo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={vinculo ? "Editar vínculo" : "Vincular peça"} onFechar={onFechar}>
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

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="quantidade_padrao">Quantidade padrão</label>
            <input
              id="quantidade_padrao"
              type="number"
              step="0.01"
              min="0.01"
              className="input mono"
              value={form.quantidade_padrao}
              onChange={(e) => set("quantidade_padrao", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="posicao">Posição</label>
            <input id="posicao" className="input" value={form.posicao} onChange={(e) => set("posicao", e.target.value)} placeholder="Ex.: Lado acoplamento" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="aplicacao">Aplicação</label>
          <input id="aplicacao" className="input" value={form.aplicacao} onChange={(e) => set("aplicacao", e.target.value)} placeholder="Ex.: Mancal lado acoplamento" />
        </div>

        <div className="field">
          <label htmlFor="observacao">Observação</label>
          <textarea id="observacao" className="input" rows={2} value={form.observacao} onChange={(e) => set("observacao", e.target.value)} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={form.troca_obrigatoria} onChange={(e) => set("troca_obrigatoria", e.target.checked)} />
          Troca obrigatória (sempre entra na OS que envolver esta aplicação)
        </label>

        {!vinculo && qtdFilhosDiretos > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
            <input type="checkbox" checked={form.propagarParaFilhos} onChange={(e) => set("propagarParaFilhos", e.target.checked)} />
            Propagar para os {qtdFilhosDiretos} filho(s) direto(s)
          </label>
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
