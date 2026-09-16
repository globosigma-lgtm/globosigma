import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, CriticidadeAtivo, Periodicidade, Plano, TipoManutencao, UsuarioSimples } from "../types";
import { ROTULO_CRITICIDADE } from "./AtivoFormModal";
import { Modal } from "./Modal";
import { dataInicioDaSemana, semanaDoAno } from "../lib/semanas";
import { hojeSistema } from "../lib/horarioSistema";

export const ROTULO_TIPO_MANUTENCAO: Record<TipoManutencao, string> = {
  preventiva: "Preventiva",
  preditiva_manual: "Preditiva manual",
  inspecao: "Inspeção",
  calibracao: "Calibração",
  lubrificacao: "Lubrificação",
  limpeza_tecnica: "Limpeza técnica",
};

export const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  quadrimestral: "Quadrimestral",
  semestral: "Semestral",
  anual: "Anual",
  bienal: "Bienal",
  trienal: "Trienal",
  personalizada: "Personalizada",
};

const PERIODICIDADES_EM_MESES = new Set<Periodicidade>([
  "mensal",
  "bimestral",
  "trimestral",
  "quadrimestral",
  "semestral",
  "anual",
  "bienal",
  "trienal",
]);

/** SEMANA-01: "trocar a semana" da manutenção é, por trás, editar a data-base — toda a
 * recorrência é calculada a partir dela (data_base + N×intervalo, ver recorrenciaService.ts).
 * Este helper só existe pra poupar o usuário de escolher uma data e adivinhar em que semana ela
 * cai: recalcula a data-base preservando o dia da semana atual, só trocando ano/semana. */
function diaDaSemana(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

function somarDiasIso(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

interface FormState {
  codigo: string;
  nome: string;
  ativo_id: string;
  tipo_manutencao: TipoManutencao;
  periodicidade: Periodicidade;
  intervalo_customizado_dias: string;
  data_base: string;
  duracao_estimada_horas: string;
  responsavel_padrao_id: string;
  equipe_padrao: string;
  prioridade_padrao: CriticidadeAtivo;
  exige_parada_linha: boolean;
  instrucoes: string;
  ativo: boolean;
  data_inicio_vigencia: string;
  data_fim_vigencia: string;
}

function estadoInicial(plano: Plano | null): FormState {
  return {
    codigo: plano?.codigo ?? "",
    nome: plano?.nome ?? "",
    ativo_id: plano ? String(plano.ativo_id) : "",
    tipo_manutencao: plano?.tipo_manutencao ?? "preventiva",
    periodicidade: plano?.periodicidade ?? "mensal",
    intervalo_customizado_dias: plano?.intervalo_customizado_dias ? String(plano.intervalo_customizado_dias) : "",
    data_base: plano?.data_base ?? "",
    duracao_estimada_horas: plano ? String(plano.duracao_estimada_horas) : "1",
    responsavel_padrao_id: plano?.responsavel_padrao_id ? String(plano.responsavel_padrao_id) : "",
    equipe_padrao: plano?.equipe_padrao ?? "",
    prioridade_padrao: plano?.prioridade_padrao ?? "media",
    exige_parada_linha: plano ? plano.exige_parada_linha === 1 : false,
    instrucoes: plano?.instrucoes ?? "",
    ativo: plano ? plano.ativo === 1 : true,
    data_inicio_vigencia: plano?.data_inicio_vigencia ?? "",
    data_fim_vigencia: plano?.data_fim_vigencia ?? "",
  };
}

export function PlanoFormModal({
  plano,
  onFechar,
  onSalvo,
}: {
  plano: Plano | null;
  onFechar: () => void;
  onSalvo: (plano: Plano) => void;
}) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(plano));
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [anoSemana, setAnoSemana] = useState(() => Number((plano?.data_base ?? hojeSistema()).slice(0, 4)));
  const [numSemana, setNumSemana] = useState(() => semanaDoAno(plano?.data_base ?? hojeSistema()));

  function aplicarSemanaNaDataBase() {
    const offsetDiaSemana = form.data_base ? diaDaSemana(form.data_base) : 0;
    const domingoDaSemana = dataInicioDaSemana(anoSemana, numSemana);
    set("data_base", somarDiasIso(domingoDaSemana, offsetDiaSemana));
  }

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuarios(r.usuarios));
    if (!plano) {
      api.get<{ codigo: string }>("/planos/codigo-sugerido").then((r) => setForm((f) => ({ ...f, codigo: r.codigo })));
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
      nome: form.nome.trim(),
      ativo_id: Number(form.ativo_id),
      tipo_manutencao: form.tipo_manutencao,
      periodicidade: form.periodicidade,
      intervalo_customizado_dias:
        form.periodicidade === "personalizada" ? Number(form.intervalo_customizado_dias) || null : null,
      data_base: form.data_base,
      duracao_estimada_horas: Number(form.duracao_estimada_horas) || 0,
      responsavel_padrao_id: form.responsavel_padrao_id ? Number(form.responsavel_padrao_id) : null,
      equipe_padrao: form.equipe_padrao.trim() || null,
      prioridade_padrao: form.prioridade_padrao,
      exige_parada_linha: form.exige_parada_linha,
      instrucoes: form.instrucoes.trim() || null,
      ativo: form.ativo,
      data_inicio_vigencia: form.data_inicio_vigencia,
      data_fim_vigencia: form.data_fim_vigencia || null,
    };
    try {
      const resultado = plano
        ? await api.put<{ plano: Plano }>(`/planos/${plano.id}`, payload)
        : await api.post<{ plano: Plano }>("/planos", payload);
      onSalvo(resultado.plano);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o plano.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={plano ? "Editar plano de manutenção" : "Novo plano de manutenção"} onFechar={onFechar}>
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
            <label htmlFor="tipo_manutencao">Tipo de manutenção</label>
            <select id="tipo_manutencao" className="input" value={form.tipo_manutencao} onChange={(e) => set("tipo_manutencao", e.target.value as TipoManutencao)}>
              {Object.entries(ROTULO_TIPO_MANUTENCAO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="nome">Nome</label>
          <input id="nome" className="input" value={form.nome} onChange={(e) => set("nome", e.target.value)} required placeholder="Ex.: Lubrificação mensal do redutor" />
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

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="periodicidade">Periodicidade</label>
            <select id="periodicidade" className="input" value={form.periodicidade} onChange={(e) => set("periodicidade", e.target.value as Periodicidade)}>
              {Object.entries(ROTULO_PERIODICIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          {form.periodicidade === "personalizada" ? (
            <div className="field">
              <label htmlFor="intervalo_customizado_dias">Intervalo (dias)</label>
              <input
                id="intervalo_customizado_dias"
                type="number"
                min="1"
                className="input mono"
                value={form.intervalo_customizado_dias}
                onChange={(e) => set("intervalo_customizado_dias", e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="data_base">Data-base</label>
              <input id="data_base" type="date" className="input" value={form.data_base} onChange={(e) => set("data_base", e.target.value)} required />
            </div>
          )}
        </div>

        {form.periodicidade === "personalizada" && (
          <div className="field">
            <label htmlFor="data_base_2">Data-base</label>
            <input id="data_base_2" type="date" className="input" value={form.data_base} onChange={(e) => set("data_base", e.target.value)} required />
          </div>
        )}

        {PERIODICIDADES_EM_MESES.has(form.periodicidade) && (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
            Recorrências mensais ou maiores caem no mesmo dia do mês seguinte a partir da data-base; se esse dia não
            existir no mês (ex.: 31 em fevereiro), a ocorrência cai no último dia do mês.
          </p>
        )}

        <div className="field" style={{ background: "var(--c-n-50)", padding: "12px", borderRadius: "8px" }}>
          <label>Ajustar pela semana do ano (opcional)</label>
          <div className="row-actions" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="semana_ano" style={{ fontSize: "var(--text-caption)" }}>
                Ano
              </label>
              <input
                id="semana_ano"
                type="number"
                className="input mono"
                style={{ width: "90px" }}
                value={anoSemana}
                onChange={(e) => setAnoSemana(Number(e.target.value) || anoSemana)}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="semana_numero" style={{ fontSize: "var(--text-caption)" }}>
                Semana (1-53)
              </label>
              <input
                id="semana_numero"
                type="number"
                min="1"
                max="53"
                className="input mono"
                style={{ width: "90px" }}
                value={numSemana}
                onChange={(e) => setNumSemana(Number(e.target.value) || numSemana)}
              />
            </div>
            <button type="button" className="btn btn--secondary" onClick={aplicarSemanaNaDataBase}>
              Aplicar à data-base
            </button>
          </div>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)", marginTop: "6px", marginBottom: 0 }}>
            {form.data_base
              ? `Data-base atual (${form.data_base}) está na semana ${semanaDoAno(form.data_base)}/${form.data_base.slice(0, 4)}.`
              : "Defina a data-base ou aplique uma semana aqui."}{" "}
            Aplicar recalcula a data-base pro mesmo dia da semana escolhida, deslocando todas as próximas ocorrências.
          </p>
        </div>

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

        <div className="modal__grid">
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
            <label htmlFor="equipe_padrao">Equipe padrão</label>
            <input id="equipe_padrao" className="input" value={form.equipe_padrao} onChange={(e) => set("equipe_padrao", e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="instrucoes">Instruções (procedimento)</label>
          <textarea id="instrucoes" className="input" rows={3} value={form.instrucoes} onChange={(e) => set("instrucoes", e.target.value)} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={form.exige_parada_linha} onChange={(e) => set("exige_parada_linha", e.target.checked)} />
          Exige parada de linha
        </label>

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
