import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, EquipeSimples, OrdemServico, PrioridadeOS, TipoOS, UsuarioSimples } from "../types";
import { ROTULO_TIPO_MANUTENCAO } from "./PlanoFormModal";
import { ROTULO_CRITICIDADE } from "./AtivoFormModal";
import { Modal } from "./Modal";
import { hojeSistema } from "../lib/horarioSistema";
import { decodificarAtribuicao } from "../lib/atribuicaoOS";

export const ROTULO_TIPO_OS: Record<TipoOS, string> = {
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  inspecao: "Inspeção",
  melhoria: "Melhoria",
  calibracao: "Calibração",
  lubrificacao: "Lubrificação",
};

const hoje = hojeSistema;

interface FormState {
  ativo_id: string;
  tipo: TipoOS;
  prioridade: PrioridadeOS;
  descricao: string;
  data_programada: string;
  data_limite: string;
  atribuicao: string;
  horas_estimadas: string;
  exige_parada_linha: boolean;
}

function estadoInicial(): FormState {
  return {
    ativo_id: "",
    tipo: "corretiva",
    prioridade: "media",
    descricao: "",
    data_programada: hoje(),
    data_limite: hoje(),
    atribuicao: "",
    horas_estimadas: "1",
    exige_parada_linha: false,
  };
}

export function OSFormModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (os: OrdemServico) => void }) {
  const [form, setForm] = useState<FormState>(estadoInicial);
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);
  const [equipes, setEquipes] = useState<EquipeSimples[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuarios(r.usuarios));
    api.get<{ equipes: EquipeSimples[] }>("/equipes/simples").then((r) => setEquipes(r.equipes));
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
      tipo: form.tipo,
      prioridade: form.prioridade,
      descricao: form.descricao.trim(),
      data_programada: form.data_programada,
      data_limite: form.data_limite,
      ...decodificarAtribuicao(form.atribuicao),
      horas_estimadas: Number(form.horas_estimadas) || 0,
      exige_parada_linha: form.exige_parada_linha,
    };
    try {
      const resultado = await api.post<{ os: OrdemServico }>("/ordens-servico", payload);
      onSalvo(resultado.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível criar a OS.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Nova OS avulsa" onFechar={onFechar}>
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
          <label htmlFor="descricao">Descrição do serviço</label>
          <textarea id="descricao" className="input" rows={3} value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" className="input" value={form.tipo} onChange={(e) => set("tipo", e.target.value as TipoOS)}>
              {Object.entries(ROTULO_TIPO_OS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
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
        </div>

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
            <label htmlFor="atribuicao">Atribuir a</label>
            <select id="atribuicao" className="input" value={form.atribuicao} onChange={(e) => set("atribuicao", e.target.value)}>
              <option value="">Nenhum</option>
              <optgroup label="Pessoas">
                {usuarios.map((u) => (
                  <option key={`pessoa:${u.id}`} value={`pessoa:${u.id}`}>
                    {u.nome} ({u.matricula})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Equipes">
                {equipes.map((eq) => (
                  <option key={`equipe:${eq.id}`} value={`equipe:${eq.id}`}>
                    {eq.nome}
                  </option>
                ))}
              </optgroup>
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

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={form.exige_parada_linha} onChange={(e) => set("exige_parada_linha", e.target.checked)} />
          Exige parada de linha
        </label>

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Criando…" : "Criar OS"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
