import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { MovimentoEstoque, Peca, TipoMovimento } from "../types";
import { Modal } from "./Modal";

export const ROTULO_TIPO_MOVIMENTO: Record<TipoMovimento, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste (contagem física)",
  transferencia: "Transferência de localização",
  devolucao: "Devolução",
};

export function MovimentoEstoqueModal({
  pecaFixa,
  onFechar,
  onSalvo,
}: {
  pecaFixa?: Peca;
  onFechar: () => void;
  onSalvo: (movimento: MovimentoEstoque) => void;
}) {
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [pecaId, setPecaId] = useState(pecaFixa ? String(pecaFixa.id) : "");
  const [tipo, setTipo] = useState<TipoMovimento>("entrada");
  const [quantidade, setQuantidade] = useState("1");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [novaLocalizacao, setNovaLocalizacao] = useState(pecaFixa?.localizacao_almoxarifado ?? "");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!pecaFixa) {
      api.get<{ pecas: Peca[] }>("/pecas").then((r) => setPecas(r.pecas));
    }
  }, [pecaFixa]);

  const pecaSelecionada = pecaFixa ?? pecas.find((p) => p.id === Number(pecaId));

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const id = Number(pecaId);
      let resultado: { movimento: MovimentoEstoque };
      if (tipo === "entrada") {
        resultado = await api.post("/almoxarifado/movimentos/entrada", {
          peca_id: id,
          quantidade: Number(quantidade) || 0,
          custo_unitario: custoUnitario ? Number(custoUnitario) : null,
          motivo: motivo.trim() || null,
        });
      } else if (tipo === "saida") {
        resultado = await api.post("/almoxarifado/movimentos/saida", {
          peca_id: id,
          quantidade: Number(quantidade) || 0,
          motivo: motivo.trim() || null,
        });
      } else if (tipo === "devolucao") {
        resultado = await api.post("/almoxarifado/movimentos/devolucao", {
          peca_id: id,
          quantidade: Number(quantidade) || 0,
          motivo: motivo.trim() || null,
        });
      } else if (tipo === "ajuste") {
        resultado = await api.post("/almoxarifado/movimentos/ajuste", {
          peca_id: id,
          quantidade_contada: Number(quantidade) || 0,
          motivo: motivo.trim(),
        });
      } else {
        resultado = await api.post("/almoxarifado/movimentos/transferencia", {
          peca_id: id,
          nova_localizacao: novaLocalizacao.trim(),
          motivo: motivo.trim() || null,
        });
      }
      onSalvo(resultado.movimento);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível registrar o movimento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Registrar movimento de estoque" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="field">
          <label htmlFor="peca_id">Peça</label>
          {pecaFixa ? (
            <input className="input" value={`${pecaFixa.codigo} — ${pecaFixa.descricao}`} disabled />
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

        <div className="field">
          <label htmlFor="tipo">Tipo de movimento</label>
          <select id="tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimento)}>
            {Object.entries(ROTULO_TIPO_MOVIMENTO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>

        {pecaSelecionada && (
          <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
            Saldo atual: <strong>{pecaSelecionada.estoque_atual} {pecaSelecionada.unidade_medida}</strong>
            {tipo === "transferencia" && ` · Localização atual: ${pecaSelecionada.localizacao_almoxarifado ?? "—"}`}
          </p>
        )}

        {tipo === "transferencia" ? (
          <div className="field">
            <label htmlFor="nova_localizacao">Nova localização</label>
            <input
              id="nova_localizacao"
              className="input"
              value={novaLocalizacao}
              onChange={(e) => setNovaLocalizacao(e.target.value)}
              required
            />
          </div>
        ) : (
          <div className="modal__grid">
            <div className="field">
              <label htmlFor="quantidade">{tipo === "ajuste" ? "Quantidade contada (novo saldo)" : "Quantidade"}</label>
              <input
                id="quantidade"
                type="number"
                step="0.01"
                min="0"
                className="input mono"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
              />
            </div>
            {tipo === "entrada" && (
              <div className="field">
                <label htmlFor="custo_unitario">Custo unitário (opcional)</label>
                <input
                  id="custo_unitario"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input mono"
                  value={custoUnitario}
                  onChange={(e) => setCustoUnitario(e.target.value)}
                  placeholder={pecaSelecionada ? String(pecaSelecionada.custo_unitario_medio) : ""}
                />
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="motivo">{tipo === "ajuste" ? "Motivo do ajuste" : "Motivo (opcional)"}</label>
          <textarea id="motivo" className="input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} required={tipo === "ajuste"} />
        </div>

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando || !pecaId}>
            {enviando ? "Registrando…" : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
