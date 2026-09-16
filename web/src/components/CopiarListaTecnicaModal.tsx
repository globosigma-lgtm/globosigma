import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, VinculoAtivoPeca } from "../types";
import { Modal } from "./Modal";

export function CopiarListaTecnicaModal({
  ativoId,
  pecaIdsJaVinculadas,
  onFechar,
  onCopiado,
}: {
  ativoId: number;
  pecaIdsJaVinculadas: Set<number>;
  onFechar: () => void;
  onCopiado: (resumo: { copiados: number; pulados: number }) => void;
}) {
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [ativoOrigemId, setAtivoOrigemId] = useState("");
  const [vinculosOrigem, setVinculosOrigem] = useState<VinculoAtivoPeca[] | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos.filter((a) => a.id !== ativoId)));
  }, [ativoId]);

  useEffect(() => {
    if (!ativoOrigemId) {
      setVinculosOrigem(null);
      return;
    }
    api.get<{ pecas: VinculoAtivoPeca[] }>(`/ativos/${ativoOrigemId}/pecas`).then((r) => {
      setVinculosOrigem(r.pecas);
      setSelecionados(new Set(r.pecas.filter((v) => !pecaIdsJaVinculadas.has(v.peca_id)).map((v) => v.peca_id)));
    });
  }, [ativoOrigemId, pecaIdsJaVinculadas]);

  function alternar(pecaId: number) {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(pecaId)) novo.delete(pecaId);
      else novo.add(pecaId);
      return novo;
    });
  }

  async function confirmar() {
    setErro(null);
    setEnviando(true);
    try {
      const resultado = await api.post<{ copiados: number; pulados: number }>(`/ativos/${ativoId}/pecas/copiar`, {
        ativoOrigemId: Number(ativoOrigemId),
        pecaIds: Array.from(selecionados),
      });
      onCopiado(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível copiar a lista técnica.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Copiar lista técnica de outro ativo" onFechar={onFechar}>
      <div className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="field">
          <label htmlFor="ativo_origem">Ativo de origem</label>
          <select id="ativo_origem" className="input" value={ativoOrigemId} onChange={(e) => setAtivoOrigemId(e.target.value)}>
            <option value="">Selecione um ativo…</option>
            {ativos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.caminho}
              </option>
            ))}
          </select>
        </div>

        {vinculosOrigem && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Aplicação</th>
                  <th>Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {vinculosOrigem.map((v) => {
                  const jaVinculada = pecaIdsJaVinculadas.has(v.peca_id);
                  return (
                    <tr key={v.id} style={jaVinculada ? { opacity: 0.5 } : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={jaVinculada}
                          checked={selecionados.has(v.peca_id)}
                          onChange={() => alternar(v.peca_id)}
                        />
                      </td>
                      <td className="mono">{v.codigo}</td>
                      <td>
                        {v.descricao}
                        {jaVinculada && (
                          <span style={{ color: "var(--c-n-500)", fontSize: "var(--text-caption)" }}> (já vinculada)</span>
                        )}
                      </td>
                      <td>{v.aplicacao}</td>
                      <td className="mono">
                        {v.quantidade_padrao} {v.unidade_medida}
                      </td>
                    </tr>
                  );
                })}
                {vinculosOrigem.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      Este ativo não tem peças vinculadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn--primary" disabled={enviando || selecionados.size === 0} onClick={confirmar}>
            {enviando ? "Copiando…" : `Copiar ${selecionados.size} peça(s)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
