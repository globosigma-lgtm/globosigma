import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, ClassePeriodicidadeInspecao, CriticidadeAtivo, PlanoInspecao, UsuarioSimples } from "../types";
import { ROTULO_CRITICIDADE } from "./AtivoFormModal";
import { Modal } from "./Modal";

export const ROTULO_CLASSE_PERIODICIDADE: Record<ClassePeriodicidadeInspecao, string> = {
  A: "A — a cada 15 dias",
  B: "B — a cada 30 dias",
  C: "C — a cada 45 dias",
};

interface FormState {
  codigo: string;
  ativo_id: string;
  tag: string;
  setor: string;
  classe_periodicidade: ClassePeriodicidadeInspecao | "";
  semana_base: string;
  duracao_estimada_horas: string;
  responsavel_padrao_id: string;
  prioridade_padrao: CriticidadeAtivo;
  instrucoes: string;
  ativo: boolean;
  data_inicio_vigencia: string;
  data_fim_vigencia: string;
}

function estadoInicial(plano: PlanoInspecao | null): FormState {
  return {
    codigo: plano?.codigo ?? "",
    ativo_id: plano ? String(plano.ativo_id) : "",
    tag: plano?.tag ?? "",
    setor: plano?.setor ?? "",
    classe_periodicidade: plano?.classe_periodicidade ?? "",
    semana_base: plano?.semana_base ? String(plano.semana_base) : "",
    duracao_estimada_horas: plano ? String(plano.duracao_estimada_horas) : "1",
    responsavel_padrao_id: plano?.responsavel_padrao_id ? String(plano.responsavel_padrao_id) : "",
    prioridade_padrao: plano?.prioridade_padrao ?? "media",
    instrucoes: plano?.instrucoes ?? "",
    ativo: plano ? plano.ativo === 1 : true,
    data_inicio_vigencia: plano?.data_inicio_vigencia ?? "",
    data_fim_vigencia: plano?.data_fim_vigencia ?? "",
  };
}

export function PlanoInspecaoFormModal({
  plano,
  onFechar,
  onSalvo,
}: {
  plano: PlanoInspecao | null;
  onFechar: () => void;
  onSalvo: (plano: PlanoInspecao) => void;
}) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(plano));
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples?perfil=Inspetor").then((r) => setUsuarios(r.usuarios));
    if (!plano) {
      api.get<{ codigo: string }>("/inspecoes/planos/codigo-sugerido").then((r) => setForm((f) => ({ ...f, codigo: r.codigo })));
    }
  }, [plano]);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      codigo: form.codigo.trim(),
      ativo_id: Number(form.ativo_id),
      tag: form.tag.trim(),
      setor: form.setor.trim() || null,
      classe_periodicidade: form.classe_periodicidade || null,
      semana_base: form.classe_periodicidade && form.semana_base ? Number(form.semana_base) : null,
      duracao_estimada_horas: Number(form.duracao_estimada_horas) || 0,
      responsavel_padrao_id: form.responsavel_padrao_id ? Number(form.responsavel_padrao_id) : null,
      prioridade_padrao: form.prioridade_padrao,
      instrucoes: form.instrucoes.trim() || null,
      ativo: form.ativo,
      data_inicio_vigencia: form.data_inicio_vigencia,
      data_fim_vigencia: form.data_fim_vigencia || null,
    };
    try {
      const resultado = plano
        ? await api.put<{ plano: PlanoInspecao }>(`/inspecoes/planos/${plano.id}`, payload)
        : await api.post<{ plano: PlanoInspecao }>("/inspecoes/planos", payload);
      onSalvo(resultado.plano);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o plano de inspeção.");
    } finally {
      setEnviando(false);
    }
  }

  function aoEscolherAtivo(ativoId: string) {
    set("ativo_id", ativoId);
    const ativo = ativos.find((a) => String(a.id) === ativoId);
    if (ativo && !form.tag) set("tag", ativo.codigo);
    if (ativo && !form.setor && ativo.setor) set("setor", ativo.setor);
  }

  return (
    <Modal titulo={plano ? "Editar plano de inspeção" : "Novo plano de inspeção"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="codigo">Código</label>
            <input id="codigo" className="input mono" value={form.codigo} onChange={(e) => set("codigo", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="tag">TAG do equipamento</label>
            <input id="tag" className="input mono" value={form.tag} onChange={(e) => set("tag", e.target.value)} required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="ativo_id">Equipamento (ativo)</label>
          <select id="ativo_id" className="input" value={form.ativo_id} onChange={(e) => aoEscolherAtivo(e.target.value)} required>
            <option value="">Selecione…</option>
            {ativos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.caminho}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="setor">Setor</label>
          <input id="setor" className="input" value={form.setor} onChange={(e) => set("setor", e.target.value)} />
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="classe_periodicidade">Classe de periodicidade</label>
            <select
              id="classe_periodicidade"
              className="input"
              value={form.classe_periodicidade}
              onChange={(e) => set("classe_periodicidade", e.target.value as ClassePeriodicidadeInspecao | "")}
            >
              <option value="">Sem classe — definir depois</option>
              {Object.entries(ROTULO_CLASSE_PERIODICIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          {form.classe_periodicidade && (
            <div className="field">
              <label htmlFor="semana_base">Semana-base (1–53)</label>
              <input
                id="semana_base"
                type="number"
                min="1"
                max="53"
                className="input mono"
                value={form.semana_base}
                onChange={(e) => set("semana_base", e.target.value)}
                required
              />
            </div>
          )}
        </div>
        {!form.classe_periodicidade && (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
            Sem classe definida, este plano não entra na geração em lote nem no calendário até ser classificado.
          </p>
        )}

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_inicio_vigencia">Início de vigência</label>
            <input id="data_inicio_vigencia" type="date" className="input" value={form.data_inicio_vigencia} onChange={(e) => set("data_inicio_vigencia", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="data_fim_vigencia">Fim de vigência (opcional)</label>
            <input id="data_fim_vigencia" type="date" className="input" value={form.data_fim_vigencia} onChange={(e) => set("data_fim_vigencia", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="duracao_estimada_horas">Duração estimada (horas)</label>
            <input id="duracao_estimada_horas" type="number" step="0.5" min="0" className="input mono" value={form.duracao_estimada_horas} onChange={(e) => set("duracao_estimada_horas", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="prioridade_padrao">Prioridade padrão</label>
            <select id="prioridade_padrao" className="input" value={form.prioridade_padrao} onChange={(e) => set("prioridade_padrao", e.target.value as CriticidadeAtivo)}>
              {Object.entries(ROTULO_CRITICIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="responsavel_padrao_id">Inspetor padrão (opcional)</label>
          <select id="responsavel_padrao_id" className="input" value={form.responsavel_padrao_id} onChange={(e) => set("responsavel_padrao_id", e.target.value)}>
            <option value="">Nenhum — atribuir depois</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.matricula})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="instrucoes">Instruções (o que verificar)</label>
          <textarea id="instrucoes" className="input" rows={3} value={form.instrucoes} onChange={(e) => set("instrucoes", e.target.value)} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} />
          Plano ativo (gera ocorrências)
        </label>

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
