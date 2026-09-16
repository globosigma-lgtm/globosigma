import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, PrioridadeSolicitacao, Solicitacao } from "../types";
import { ROTULO_CRITICIDADE } from "./AtivoFormModal";
import { Modal } from "./Modal";

export function SolicitacaoFormModal({
  solicitacao,
  onFechar,
  onSalvo,
}: {
  solicitacao: Solicitacao | null;
  onFechar: () => void;
  onSalvo: (solicitacao: Solicitacao) => void;
}) {
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [ativoId, setAtivoId] = useState(solicitacao?.ativo_id != null ? String(solicitacao.ativo_id) : "");
  const [descricao, setDescricao] = useState(solicitacao?.descricao ?? "");
  const [prioridade, setPrioridade] = useState<PrioridadeSolicitacao>(solicitacao?.prioridade_sugerida ?? "media");
  const [setor, setSetor] = useState(solicitacao?.setor_solicitante ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
  }, []);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      ativo_id: ativoId ? Number(ativoId) : null,
      descricao: descricao.trim(),
      prioridade_sugerida: prioridade,
      setor_solicitante: setor.trim() || null,
    };
    try {
      const resultado = solicitacao
        ? await api.put<{ solicitacao: Solicitacao }>(`/solicitacoes/${solicitacao.id}`, payload)
        : await api.post<{ solicitacao: Solicitacao }>("/solicitacoes", payload);
      onSalvo(resultado.solicitacao);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar a solicitação.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={solicitacao ? "Editar solicitação" : "Nova solicitação de manutenção"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="ativo_id">Ativo (opcional)</label>
          <select id="ativo_id" className="input" value={ativoId} onChange={(e) => setAtivoId(e.target.value)}>
            <option value="">A definir na análise…</option>
            {ativos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.caminho}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="descricao">Descrição do problema ou serviço</label>
          <textarea id="descricao" className="input" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="prioridade">Prioridade sugerida</label>
            <select id="prioridade" className="input" value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeSolicitacao)}>
              {Object.entries(ROTULO_CRITICIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="setor">Setor solicitante (opcional)</label>
            <input id="setor" className="input" value={setor} onChange={(e) => setSetor(e.target.value)} />
          </div>
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
