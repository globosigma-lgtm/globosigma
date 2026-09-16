import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, OrdemServico, PrioridadeOS, UsuarioSimples } from "../types";
import { ROTULO_CRITICIDADE } from "./AtivoFormModal";
import { Modal } from "./Modal";
import { hojeSistema } from "../lib/horarioSistema";

interface FormState {
  ativo_id: string;
  prioridade: PrioridadeOS;
  descricao: string;
  data_programada: string;
  data_limite: string;
  responsavel_id: string;
  horas_estimadas: string;
}

function estadoInicial(): FormState {
  return {
    ativo_id: "",
    prioridade: "media",
    descricao: "",
    data_programada: hojeSistema(),
    data_limite: hojeSistema(),
    responsavel_id: "",
    horas_estimadas: "1",
  };
}

export function InspecaoAvulsaFormModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (os: OrdemServico) => void }) {
  const [form, setForm] = useState<FormState>(estadoInicial);
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [inspetores, setInspetores] = useState<UsuarioSimples[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples?perfil=Inspetor").then((r) => setInspetores(r.usuarios));
  }, []);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      ativo_id: Number(form.ativo_id),
      prioridade: form.prioridade,
      descricao: form.descricao.trim(),
      data_programada: form.data_programada,
      data_limite: form.data_limite,
      responsavel_id: form.responsavel_id ? Number(form.responsavel_id) : null,
      horas_estimadas: Number(form.horas_estimadas) || 0,
    };
    try {
      const resultado = await api.post<{ os: OrdemServico }>("/inspecoes", payload);
      onSalvo(resultado.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível criar a inspeção.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Nova inspeção avulsa" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="field">
          <label htmlFor="ativo_id">Ativo</label>
          <select id="ativo_id" className="input" value={form.ativo_id} onChange={(e) => set("ativo_id", e.target.value)} required>
            <option value="">Selecione…</option>
            {ativos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.caminho}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="descricao">Descrição da inspeção</label>
          <textarea id="descricao" className="input" rows={3} value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
        </div>

        <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
          Se já existir um plano de inspeção ativo para este equipamento, o checklist dele é copiado automaticamente
          para esta OS.
        </p>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_programada">Data programada</label>
            <input
              id="data_programada"
              type="date"
              className="input"
              value={form.data_programada}
              onChange={(e) => set("data_programada", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="data_limite">Data limite</label>
            <input id="data_limite" type="date" className="input" value={form.data_limite} onChange={(e) => set("data_limite", e.target.value)} required />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="prioridade">Prioridade</label>
            <select id="prioridade" className="input" value={form.prioridade} onChange={(e) => set("prioridade", e.target.value as PrioridadeOS)}>
              {Object.entries(ROTULO_CRITICIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="horas_estimadas">Horas estimadas</label>
            <input
              id="horas_estimadas"
              type="number"
              step="0.5"
              min="0"
              className="input mono"
              value={form.horas_estimadas}
              onChange={(e) => set("horas_estimadas", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="responsavel_id">Inspetor</label>
          <select id="responsavel_id" className="input" value={form.responsavel_id} onChange={(e) => set("responsavel_id", e.target.value)}>
            <option value="">Nenhum — atribuir depois</option>
            {inspetores.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.matricula})
              </option>
            ))}
          </select>
        </div>

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Criando…" : "Criar inspeção"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
