import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, CriticidadeAtivo, PeriodicidadeSemanal, PontoLubrificacao, UsuarioSimples } from "../types";
import { ROTULO_CRITICIDADE } from "./AtivoFormModal";
import { Modal } from "./Modal";

export const ROTULO_PERIODICIDADE_SEMANAL: Record<PeriodicidadeSemanal, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

interface FormState {
  codigo: string;
  ativo_id: string;
  descricao: string;
  especificacao: string;
  componente: string;
  periodicidade: PeriodicidadeSemanal;
  semana_base: string;
  duracao_estimada_horas: string;
  responsavel_padrao_id: string;
  prioridade_padrao: CriticidadeAtivo;
  instrucoes: string;
  ativo: boolean;
  data_inicio_vigencia: string;
  data_fim_vigencia: string;
}

function estadoInicial(ponto: PontoLubrificacao | null, hoje: string): FormState {
  return {
    codigo: ponto?.codigo ?? "",
    ativo_id: ponto ? String(ponto.ativo_id) : "",
    descricao: ponto?.descricao ?? "",
    especificacao: ponto?.especificacao ?? "",
    componente: ponto?.componente ?? "",
    periodicidade: ponto?.periodicidade ?? "mensal",
    semana_base: ponto ? String(ponto.semana_base) : "1",
    duracao_estimada_horas: ponto ? String(ponto.duracao_estimada_horas) : "0.5",
    responsavel_padrao_id: ponto?.responsavel_padrao_id ? String(ponto.responsavel_padrao_id) : "",
    prioridade_padrao: ponto?.prioridade_padrao ?? "media",
    instrucoes: ponto?.instrucoes ?? "",
    ativo: ponto ? ponto.ativo === 1 : true,
    data_inicio_vigencia: ponto?.data_inicio_vigencia ?? hoje,
    data_fim_vigencia: ponto?.data_fim_vigencia ?? "",
  };
}

export function PontoLubrificacaoFormModal({
  ponto,
  onFechar,
  onSalvo,
}: {
  ponto: PontoLubrificacao | null;
  onFechar: () => void;
  onSalvo: (ponto: PontoLubrificacao) => void;
}) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(ponto, new Date().toISOString().slice(0, 10)));
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuarios(r.usuarios));
    if (!ponto) {
      api.get<{ codigo: string }>("/lubrificacao/pontos/codigo-sugerido").then((r) => setForm((f) => ({ ...f, codigo: r.codigo })));
    }
  }, [ponto]);

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
      descricao: form.descricao.trim(),
      especificacao: form.especificacao.trim() || null,
      componente: form.componente.trim() || null,
      periodicidade: form.periodicidade,
      semana_base: Number(form.semana_base) || 1,
      duracao_estimada_horas: Number(form.duracao_estimada_horas) || 0,
      responsavel_padrao_id: form.responsavel_padrao_id ? Number(form.responsavel_padrao_id) : null,
      prioridade_padrao: form.prioridade_padrao,
      instrucoes: form.instrucoes.trim() || null,
      ativo: form.ativo,
      data_inicio_vigencia: form.data_inicio_vigencia,
      data_fim_vigencia: form.data_fim_vigencia || null,
    };
    try {
      const resultado = ponto
        ? await api.put<{ ponto: PontoLubrificacao }>(`/lubrificacao/pontos/${ponto.id}`, payload)
        : await api.post<{ ponto: PontoLubrificacao }>("/lubrificacao/pontos", payload);
      onSalvo(resultado.ponto);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o ponto de lubrificação.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={ponto ? "Editar ponto de lubrificação" : "Novo ponto de lubrificação"} onFechar={onFechar}>
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
        </div>

        <div className="field">
          <label htmlFor="descricao">Descrição do ponto</label>
          <input
            id="descricao"
            className="input"
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            required
            placeholder="Ex.: Motor — graxa sintética"
          />
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="especificacao">Especificação do lubrificante</label>
            <input id="especificacao" className="input" value={form.especificacao} onChange={(e) => set("especificacao", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="componente">Componente (opcional)</label>
            <input id="componente" className="input" value={form.componente} onChange={(e) => set("componente", e.target.value)} placeholder="Ex.: BB, PU, VN" />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="periodicidade">Periodicidade</label>
            <select
              id="periodicidade"
              className="input"
              value={form.periodicidade}
              onChange={(e) => set("periodicidade", e.target.value as PeriodicidadeSemanal)}
            >
              {Object.entries(ROTULO_PERIODICIDADE_SEMANAL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="semana_base">Semana-base do ano (1–53)</label>
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
        </div>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
          A recorrência é por número de semana do ano (não por data-base): a partir da semana-base, o ponto se repete a
          cada intervalo da periodicidade e o ciclo reinicia todo início de ano — calendário separado dos planos de
          manutenção.
        </p>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_inicio_vigencia">Início de vigência</label>
            <input
              id="data_inicio_vigencia"
              type="date"
              className="input"
              value={form.data_inicio_vigencia}
              onChange={(e) => set("data_inicio_vigencia", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="data_fim_vigencia">Fim de vigência (opcional)</label>
            <input id="data_fim_vigencia" type="date" className="input" value={form.data_fim_vigencia} onChange={(e) => set("data_fim_vigencia", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="duracao_estimada_horas">Duração estimada (horas)</label>
            <input
              id="duracao_estimada_horas"
              type="number"
              step="0.5"
              min="0"
              className="input mono"
              value={form.duracao_estimada_horas}
              onChange={(e) => set("duracao_estimada_horas", e.target.value)}
            />
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
          <label htmlFor="responsavel_padrao_id">Responsável padrão</label>
          <select id="responsavel_padrao_id" className="input" value={form.responsavel_padrao_id} onChange={(e) => set("responsavel_padrao_id", e.target.value)}>
            <option value="">Nenhum</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.matricula})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="instrucoes">Instruções (procedimento)</label>
          <textarea id="instrucoes" className="input" rows={3} value={form.instrucoes} onChange={(e) => set("instrucoes", e.target.value)} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} />
          Ponto ativo (gera ocorrências)
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
