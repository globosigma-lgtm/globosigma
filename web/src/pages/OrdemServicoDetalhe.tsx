import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type {
  AssinaturaDigital,
  AtivoComArvore,
  CausaFalha,
  EquipeSimples,
  OrdemServico,
  OSReprogramacao,
  PrioridadeOS,
  ResultadoInspecao,
  TipoOS,
  UsuarioSimples,
} from "../types";
import { codificarAtribuicao, decodificarAtribuicao } from "../lib/atribuicaoOS";
import { CAUSAS_FALHA, ROTULO_CAUSA_FALHA } from "../types";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { ROTULO_STATUS_OS } from "./OrdensServico";
import { OSChecklistTab } from "../components/OSChecklistTab";
import { OSPecasTab } from "../components/OSPecasTab";
import { OSServicoExternoTab } from "../components/OSServicoExternoTab";
import { AnexosTab } from "../components/AnexosTab";
import { AssinaturaStamp } from "../components/AssinaturaStamp";
import { Modal } from "../components/Modal";
import { semanaDoAno } from "../lib/semanas";
import { agoraSistemaDatetimeLocal, hojeSistema } from "../lib/horarioSistema";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

type Aba = "dados" | "checklist" | "pecas" | "servico_externo" | "anexos";

const ROTULO_ORIGEM: Record<string, string> = {
  plano_lote: "Geração em lote",
  plano_manual: "Plano (manual)",
  solicitacao: "Solicitação",
  avulsa: "Avulsa",
  lubrificacao_lote: "Lubrificação (geração em lote)",
  inspecao_lote: "Inspeção (geração em lote)",
  inspecao_corretiva: "Corretiva (aberta em inspeção)",
};

const ROTULO_RESULTADO_INSPECAO: Record<ResultadoInspecao, string> = {
  ok: "OK",
  atencao: "Atenção",
  critico: "Crítico",
};

/** Converte "YYYY-MM-DD HH:MM:SS" (formato salvo pelo servidor) para o valor aceito por <input type="datetime-local">. */
function paraDatetimeLocal(valor?: string | null): string {
  const base = valor ? valor.replace(" ", "T").slice(0, 16) : agoraSistemaDatetimeLocal();
  return base;
}

/** Converte o valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:MM") para o formato salvo pelo servidor. */
function deDatetimeLocal(valor: string): string {
  return `${valor.replace("T", " ")}:00`;
}

function EditarOSModal({
  os,
  edicaoCompleta,
  onFechar,
  onSalvo,
}: {
  os: OrdemServico;
  edicaoCompleta: boolean;
  onFechar: () => void;
  onSalvo: (os: OrdemServico) => void;
}) {
  const [prioridade, setPrioridade] = useState<PrioridadeOS>(os.prioridade);
  const [descricao, setDescricao] = useState(os.descricao ?? "");
  const [atribuicao, setAtribuicao] = useState(codificarAtribuicao(os.responsavel_id, os.equipe_id));
  const [exigeParada, setExigeParada] = useState(os.exige_parada_linha === 1);
  const [horasEstimadas, setHorasEstimadas] = useState(String(os.horas_estimadas));
  const [ativoId, setAtivoId] = useState(String(os.ativo_id));
  const [tipo, setTipo] = useState<TipoOS>(os.tipo);
  const [dataProgramada, setDataProgramada] = useState(os.data_programada);
  const [dataLimite, setDataLimite] = useState(os.data_limite);
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);
  const [equipes, setEquipes] = useState<EquipeSimples[]>([]);
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuarios(r.usuarios));
    api.get<{ equipes: EquipeSimples[] }>("/equipes/simples").then((r) => setEquipes(r.equipes));
    if (edicaoCompleta) {
      api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    }
  }, [edicaoCompleta]);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.put<{ os: OrdemServico }>(`/ordens-servico/${os.id}`, {
        prioridade,
        descricao: descricao.trim() || null,
        ...decodificarAtribuicao(atribuicao),
        exige_parada_linha: exigeParada,
        horas_estimadas: Number(horasEstimadas) || 0,
        ...(edicaoCompleta
          ? {
              ativo_id: Number(ativoId),
              tipo,
              data_programada: dataProgramada,
              data_limite: dataLimite,
            }
          : {}),
      });
      onSalvo(r.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar as alterações.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Editar OS" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        {edicaoCompleta && (
          <div className="field">
            <label htmlFor="ativo_id">Ativo</label>
            <select id="ativo_id" className="input" value={ativoId} onChange={(e) => setAtivoId(e.target.value)} required>
              {ativos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.caminho}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="descricao">Descrição</label>
          <textarea id="descricao" className="input" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="modal__grid">
          {edicaoCompleta && (
            <div className="field">
              <label htmlFor="tipo">Tipo</label>
              <select id="tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOS)}>
                {Object.entries(ROTULO_TIPO_OS).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="prioridade">Prioridade</label>
            <select id="prioridade" className="input" value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeOS)}>
              {Object.entries(ROTULO_CRITICIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="atribuicao">Atribuir a</label>
            <select id="atribuicao" className="input" value={atribuicao} onChange={(e) => setAtribuicao(e.target.value)}>
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
              value={horasEstimadas}
              onChange={(e) => setHorasEstimadas(e.target.value)}
            />
          </div>
        </div>
        {edicaoCompleta && (
          <div className="modal__grid">
            <div className="field">
              <label htmlFor="data_programada">Data programada</label>
              <input
                id="data_programada"
                type="date"
                className="input"
                value={dataProgramada}
                onChange={(e) => setDataProgramada(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="data_limite">Data limite</label>
              <input id="data_limite" type="date" className="input" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} required />
            </div>
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={exigeParada} onChange={(e) => setExigeParada(e.target.checked)} />
          Exige parada de linha
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

function IniciarOSModal({ os, onFechar, onSalvo }: { os: OrdemServico; onFechar: () => void; onSalvo: (os: OrdemServico) => void }) {
  const [dataInicio, setDataInicio] = useState(paraDatetimeLocal(os.data_inicio_execucao));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<{ os: OrdemServico }>(`/ordens-servico/${os.id}/iniciar`, {
        data_inicio_execucao: deDatetimeLocal(dataInicio),
      });
      onSalvo(r.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível iniciar a execução da OS.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Iniciar execução" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="data_inicio_execucao">Início real da execução</label>
          <input
            id="data_inicio_execucao"
            type="datetime-local"
            className="input"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            required
          />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Iniciando…" : "Iniciar execução"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConcluirOSModal({ os, onFechar, onSalvo }: { os: OrdemServico; onFechar: () => void; onSalvo: (os: OrdemServico) => void }) {
  const [horasReais, setHorasReais] = useState(os.horas_reais != null ? String(os.horas_reais) : String(os.horas_estimadas));
  const [observacoes, setObservacoes] = useState(os.observacoes_execucao ?? "");
  const [dataConclusao, setDataConclusao] = useState(paraDatetimeLocal(os.data_conclusao));
  const [causaFalha, setCausaFalha] = useState<CausaFalha | "">((os.causa_falha as CausaFalha) ?? "");
  const ehInspecaoPeriodica = os.tipo === "inspecao" && os.subtipo_inspecao === "periodica";
  const [resultadoInspecao, setResultadoInspecao] = useState<ResultadoInspecao | "">(os.resultado_inspecao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<{ os: OrdemServico }>(`/ordens-servico/${os.id}/concluir`, {
        horas_reais: horasReais ? Number(horasReais) : null,
        observacoes_execucao: observacoes.trim() || null,
        data_conclusao: deDatetimeLocal(dataConclusao),
        causa_falha: causaFalha || null,
        resultado_inspecao: ehInspecaoPeriodica ? resultadoInspecao || null : null,
      });
      onSalvo(r.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível concluir a OS.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Concluir OS" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="horas_reais">Horas realmente gastas</label>
            <input
              id="horas_reais"
              type="number"
              step="0.5"
              min="0"
              className="input mono"
              value={horasReais}
              onChange={(e) => setHorasReais(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="data_conclusao">Data e hora de conclusão</label>
            <input
              id="data_conclusao"
              type="datetime-local"
              className="input"
              value={dataConclusao}
              onChange={(e) => setDataConclusao(e.target.value)}
              required
            />
          </div>
        </div>
        {os.tipo === "corretiva" && (
          <div className="field">
            <label htmlFor="causa_falha">Causa da falha</label>
            <select id="causa_falha" className="input" value={causaFalha} onChange={(e) => setCausaFalha(e.target.value as CausaFalha | "")}>
              <option value="">Não informar</option>
              {CAUSAS_FALHA.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CAUSA_FALHA[c]}
                </option>
              ))}
            </select>
          </div>
        )}
        {ehInspecaoPeriodica && (
          <div className="field">
            <label htmlFor="resultado_inspecao">Resultado da inspeção</label>
            <select
              id="resultado_inspecao"
              className="input"
              value={resultadoInspecao}
              onChange={(e) => setResultadoInspecao(e.target.value as ResultadoInspecao | "")}
              required
            >
              <option value="">Selecione…</option>
              {Object.entries(ROTULO_RESULTADO_INSPECAO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="observacoes">Observações da execução</label>
          <textarea id="observacoes" className="input" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Concluindo…" : "Concluir OS"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelarOSModal({ os, onFechar, onSalvo }: { os: OrdemServico; onFechar: () => void; onSalvo: (os: OrdemServico) => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<{ os: OrdemServico }>(`/ordens-servico/${os.id}/cancelar`, { motivo: motivo.trim() });
      onSalvo(r.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível cancelar a OS.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Cancelar OS" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="motivo">Motivo do cancelamento</label>
          <textarea id="motivo" className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Voltar
          </button>
          <button type="submit" className="btn btn--destructive" disabled={enviando || !motivo.trim()}>
            {enviando ? "Cancelando…" : "Cancelar OS"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AbrirCorretivaModal({ os, onFechar, onCriada }: { os: OrdemServico; onFechar: () => void; onCriada: (novaOS: OrdemServico) => void }) {
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<PrioridadeOS>("alta");
  const [dataProgramada, setDataProgramada] = useState(hojeSistema());
  const [dataLimite, setDataLimite] = useState(hojeSistema());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<{ os: OrdemServico }>(`/inspecoes/${os.id}/corretiva`, {
        descricao: descricao.trim(),
        prioridade,
        data_programada: dataProgramada,
        data_limite: dataLimite,
      });
      onCriada(r.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível abrir a OS corretiva.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Abrir OS corretiva a partir desta inspeção" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <p style={{ color: "var(--c-n-700)" }}>
          Descreva a anomalia encontrada em <strong>{os.ativo_nome}</strong> durante a inspeção {os.codigo}. Uma nova OS
          corretiva será criada para o mesmo equipamento, com um vínculo de volta a esta inspeção.
        </p>
        <div className="field">
          <label htmlFor="descricao-corretiva">O que foi encontrado</label>
          <textarea id="descricao-corretiva" className="input" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_programada_corretiva">Data programada</label>
            <input
              id="data_programada_corretiva"
              type="date"
              className="input"
              value={dataProgramada}
              onChange={(e) => setDataProgramada(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="data_limite_corretiva">Data limite</label>
            <input
              id="data_limite_corretiva"
              type="date"
              className="input"
              value={dataLimite}
              onChange={(e) => setDataLimite(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="prioridade_corretiva">Prioridade</label>
          <select id="prioridade_corretiva" className="input" value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeOS)}>
            {Object.entries(ROTULO_CRITICIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando || !descricao.trim()}>
            {enviando ? "Criando…" : "Abrir OS corretiva"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="info-field">
      <label>{rotulo}</label>
      <span className={mono ? "mono" : undefined} style={{ color: valor ? "var(--c-n-800)" : "var(--c-n-400)" }}>
        {valor || "—"}
      </span>
    </div>
  );
}

// BAIXA-01: só quem tem permissão de baixa conclui a OS — Técnico (e qualquer outro perfil com
// "editar" em ordens_servico fora desta lista) só sinaliza que o serviço foi realizado. Mesma lista
// usada no servidor (PERFIS_QUE_PODEM_CONCLUIR_OS em routes/ordensServico.ts).
const PERFIS_QUE_PODEM_CONCLUIR_OS = ["Administrador", "Coordenador de PCM", "Planejador", "Supervisor de manutenção"];

// EXCL-ADM-01: excluir OS é exclusivo do Administrador — mesma lista usada no servidor
// (PERFIS_QUE_PODEM_EXCLUIR_OS em routes/ordensServico.ts). Esconder o botão aqui é só conveniência
// de UI; quem trava de verdade é a checagem no endpoint DELETE.
const PERFIS_QUE_PODEM_EXCLUIR_OS = ["Administrador"];

const ROTULO_STATUS_ASSINATURA: Record<string, string> = {
  aguardando_tsa: "Aguardando carimbo de tempo",
  completa: "Assinada digitalmente",
  falha_tsa: "Assinada (carimbo de tempo indisponível)",
  invalidada: "Invalidada (OS reaberta)",
};

function ReprogramarOSModal({ os, onFechar, onSalvo }: { os: OrdemServico; onFechar: () => void; onSalvo: (os: OrdemServico) => void }) {
  const [dataNova, setDataNova] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<{ os: OrdemServico }>(`/ordens-servico/${os.id}/reprogramar`, {
        data_nova: dataNova,
        motivo: motivo.trim() || null,
      });
      onSalvo(r.os);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível reprogramar a OS.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Reprogramar OS" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <p style={{ color: "var(--c-n-600)", fontSize: "var(--text-small)" }}>
          Data limite atual: <strong>{os.data_limite}</strong>. A OS mantém o mesmo código — nenhuma nova ordem é criada.
        </p>
        <div className="field">
          <label htmlFor="data_nova">Nova data prevista</label>
          <input
            id="data_nova"
            type="date"
            className="input"
            value={dataNova}
            onChange={(e) => setDataNova(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="motivo_reprogramacao">Motivo (opcional)</label>
          <textarea id="motivo_reprogramacao" className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando || !dataNova}>
            {enviando ? "Salvando…" : "Reprogramar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function HistoricoReprogramacoes({ osId }: { osId: number }) {
  const [itens, setItens] = useState<OSReprogramacao[] | null>(null);

  useEffect(() => {
    api.get<{ reprogramacoes: OSReprogramacao[] }>(`/ordens-servico/${osId}/reprogramacoes`).then((r) => setItens(r.reprogramacoes));
  }, [osId]);

  if (!itens || itens.length === 0) return null;

  return (
    <div className="field" style={{ marginTop: "16px" }}>
      <label>Histórico de reprogramações</label>
      <div className="reprogramacoes-lista">
        {itens.map((item) => (
          <div key={item.id} className="reprogramacoes-lista__item">
            <span>
              <strong>{item.data_anterior}</strong> → <strong>{item.data_nova}</strong>
            </span>
            <span style={{ color: "var(--c-n-500)" }}>
              {item.usuario_nome ?? "—"} em {item.criado_em}
            </span>
            {item.motivo && <span style={{ color: "var(--c-n-600)", width: "100%" }}>{item.motivo}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssinaturaSecao({ osId }: { osId: number }) {
  const [vigente, setVigente] = useState<AssinaturaDigital | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [resultado, setResultado] = useState<{ integro: boolean; hash_atual: string } | null>(null);

  useEffect(() => {
    api
      .get<{ vigente: AssinaturaDigital | null }>(`/ordens-servico/${osId}/assinatura`)
      .then((r) => setVigente(r.vigente))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a assinatura digital."));
  }, [osId]);

  async function verificar() {
    setVerificando(true);
    setErro(null);
    try {
      const r = await api.post<{ resultado: { integro: boolean; hash_atual: string } }>(`/ordens-servico/${osId}/assinatura/verificar`);
      setResultado(r.resultado);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível verificar a assinatura.");
    } finally {
      setVerificando(false);
    }
  }

  if (vigente === undefined) return null;
  if (vigente === null) {
    return erro ? (
      <div className="login-card__error" style={{ marginTop: "16px" }}>
        {erro}
      </div>
    ) : null;
  }

  return (
    <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--c-n-100)" }}>
      <div className="row-actions" style={{ marginBottom: "12px", flexWrap: "wrap" }}>
        <span className={`badge badge--assinatura-${vigente.status}`}>
          <span className="badge__dot" /> {ROTULO_STATUS_ASSINATURA[vigente.status] ?? vigente.status}
        </span>
        <a
          className="btn btn--ghost"
          href={`/api/ordens-servico/${osId}/assinatura/${vigente.id}/tsr`}
          target="_blank"
          rel="noreferrer"
        >
          Baixar comprovante (.tsr)
        </a>
        <a
          className="btn btn--ghost"
          href={`/api/ordens-servico/${osId}/assinatura/${vigente.id}/tsq`}
          target="_blank"
          rel="noreferrer"
        >
          Baixar consulta (.tsq)
        </a>
        <button type="button" className="btn btn--ghost" disabled={verificando} onClick={verificar}>
          {verificando ? "Verificando…" : "Verificar assinatura"}
        </button>
      </div>

      {resultado && (
        <div className={resultado.integro ? "alert alert--success" : "login-card__error"} style={{ marginBottom: "12px" }}>
          {resultado.integro
            ? "✓ Documento íntegro — o conteúdo não foi alterado desde a assinatura."
            : "⚠ Integridade comprometida — o conteúdo atual difere do hash registrado na assinatura."}
        </div>
      )}
      {erro && (
        <div className="login-card__error" style={{ marginBottom: "12px" }}>
          {erro}
        </div>
      )}

      <div style={{ maxWidth: "320px" }}>
        <AssinaturaStamp
          titulo="Assinatura Eletrônica da Conclusão"
          nome={vigente.criado_por_nome ?? "Usuário do sistema"}
          dataHora={vigente.criado_em}
          hash={vigente.hash_sha256}
        />
      </div>
    </div>
  );
}

export function OrdemServicoDetalhe() {
  const { id } = useParams();
  const { pode, usuario } = useAuth();
  const navigate = useNavigate();
  const [os, setOs] = useState<OrdemServico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("dados");
  const [modalEditar, setModalEditar] = useState(false);
  const [modalIniciar, setModalIniciar] = useState(false);
  const [modalConcluir, setModalConcluir] = useState(false);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [modalCorretiva, setModalCorretiva] = useState(false);
  const [modalReprogramar, setModalReprogramar] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [processando, setProcessando] = useState(false);

  function carregar() {
    api
      .get<{ os: OrdemServico }>(`/ordens-servico/${id}`)
      .then((r) => setOs(r.os))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a ordem de serviço."));
  }

  useEffect(carregar, [id]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  async function executarAcao(caminho: string) {
    if (!os) return;
    setErroAcao(null);
    setProcessando(true);
    try {
      const r = await api.post<{ os: OrdemServico }>(`/ordens-servico/${os.id}/${caminho}`);
      setOs(r.os);
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : "Não foi possível executar a ação.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarExclusao() {
    try {
      await api.del(`/ordens-servico/${id}`);
      navigate("/ordens-servico");
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : "Não foi possível excluir a OS.");
      setConfirmandoExclusao(false);
    }
  }

  if (erro) {
    return (
      <div className="empty-state">
        <h3>Não foi possível abrir esta OS</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!os) return null;

  const podeEditar = pode("ordens_servico", "editar");
  const podeEditarCompleto = pode("ordens_servico", "editar_completo");
  const podeReabrir = pode("ordens_servico", "reabrir");
  const podeConcluirOS = podeEditar && PERFIS_QUE_PODEM_CONCLUIR_OS.includes(usuario?.perfil_nome ?? "");
  const bloqueado = os.status === "concluida" || os.status === "cancelada";
  const aguardandoValidacaoGlobopac = os.solicitacao_origem === "globopac" && !os.globopac_validado_em;
  const podeAvisarGlobopac =
    aguardandoValidacaoGlobopac && ["em_execucao", "aguardando_peca", "atrasada"].includes(os.status);
  const podeSinalizarExecucao =
    podeEditar && !podeConcluirOS && ["em_execucao", "aguardando_peca", "atrasada"].includes(os.status);

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/ordens-servico">Ordens de serviço</Link> › <strong>{os.codigo}</strong>
      </div>

      <div className="page-header">
        <div>
          <h1>{os.codigo}</h1>
          {(() => {
            const partes = os.ativo_caminho.split(" › ");
            const equipamento = partes[partes.length - 1];
            const setor = partes.slice(0, -1).join(" › ");
            return (
              <div className="page-header__desc">
                {setor && <div>{setor}</div>}
                <Link
                  to={`/ativos/${os.ativo_id}`}
                  style={{ fontSize: "var(--text-h2)", fontWeight: 700 }}
                >
                  {equipamento}
                </Link>
              </div>
            );
          })()}
        </div>
        <div className="row-actions" style={{ flexWrap: "wrap" }}>
          <a className="btn btn--secondary" href={`/ordens-servico/${os.id}/imprimir`} target="_blank" rel="noreferrer">
            Imprimir
          </a>
          {podeEditar && os.status === "programada" && (
            <button type="button" className="btn btn--secondary" disabled={processando} onClick={() => executarAcao("abrir")}>
              Abrir
            </button>
          )}
          {podeEditar && ["aberta", "aguardando_peca", "atrasada"].includes(os.status) && (
            <button type="button" className="btn btn--primary" onClick={() => setModalIniciar(true)}>
              Iniciar execução
            </button>
          )}
          {podeEditar && os.status === "em_execucao" && (
            <button type="button" className="btn btn--secondary" disabled={processando} onClick={() => executarAcao("aguardar-peca")}>
              Aguardar peça
            </button>
          )}
          {podeEditar && podeAvisarGlobopac && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={processando}
              title={
                os.globopac_execucao_avisada_em
                  ? `Avisado em ${os.globopac_execucao_avisada_em} — clique para avisar novamente`
                  : "Avisa o GloboPac que a execução terminou, para que ele vá in loco validar e dar conforme."
              }
              onClick={() => executarAcao("avisar-globopac-execucao")}
            >
              🌐 {os.globopac_execucao_avisada_em ? "Avisar GloboPac novamente" : "Avisar GloboPac (execução concluída)"}
            </button>
          )}
          {podeSinalizarExecucao && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={processando || !!os.execucao_sinalizada_em}
              title={
                os.execucao_sinalizada_em
                  ? `Sinalizado em ${os.execucao_sinalizada_em} — aguardando a baixa por quem tem permissão para concluir.`
                  : "Avisa que o serviço foi realizado, para que Administrador, Coordenador de PCM, Planejador ou Supervisor de manutenção façam a baixa desta OS."
              }
              onClick={() => executarAcao("sinalizar-execucao")}
            >
              ✅ {os.execucao_sinalizada_em ? "Serviço sinalizado como realizado" : "Sinalizar serviço realizado"}
            </button>
          )}
          {podeConcluirOS && ["em_execucao", "aguardando_peca", "atrasada"].includes(os.status) && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={aguardandoValidacaoGlobopac}
              title={
                aguardandoValidacaoGlobopac
                  ? "Aguardando o GloboPac dar conforme (validar) esta OS na aba de acompanhamento de OS do painel dele."
                  : undefined
              }
              onClick={() => setModalConcluir(true)}
            >
              Concluir
            </button>
          )}
          {podeEditar && !bloqueado && (
            <button type="button" className="btn btn--secondary" onClick={() => setModalEditar(true)}>
              Editar
            </button>
          )}
          {podeEditar && !bloqueado && (
            <button type="button" className="btn btn--destructive" onClick={() => setModalCancelar(true)}>
              Cancelar OS
            </button>
          )}
          {podeReabrir && bloqueado && (
            <button type="button" className="btn btn--secondary" disabled={processando} onClick={() => executarAcao("reabrir")}>
              Reabrir OS
            </button>
          )}
          {os.tipo === "inspecao" && pode("inspecoes", "editar") && (
            <button type="button" className="btn btn--destructive" onClick={() => setModalCorretiva(true)}>
              Abrir OS corretiva
            </button>
          )}
          {podeEditar && os.status === "atrasada" && (
            <button type="button" className="btn btn--secondary" onClick={() => setModalReprogramar(true)}>
              Reprogramar OS
            </button>
          )}
          {pode("ordens_servico", "excluir") && PERFIS_QUE_PODEM_EXCLUIR_OS.includes(usuario?.perfil_nome ?? "") && (
            <button type="button" className="btn btn--destructive" onClick={() => setConfirmandoExclusao(true)}>
              Excluir
            </button>
          )}
        </div>
      </div>

      <div className="row-actions" style={{ marginBottom: "16px" }}>
        <span className={`badge badge--status-${os.status}`}>
          <span className="badge__dot" /> {ROTULO_STATUS_OS[os.status]}
        </span>
        <span className={`badge badge--prioridade-${os.prioridade}`}>{ROTULO_CRITICIDADE[os.prioridade]}</span>
        {os.reprogramada === 1 && (
          <span className="badge badge--reprogramada" title={`Data prevista original: ${os.data_prevista_original ?? "—"}`}>
            <span className="badge__dot" /> Reprogramada ({os.quantidade_reprogramacoes}x)
          </span>
        )}
      </div>

      {erroAcao && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erroAcao}
        </div>
      )}

      {os.execucao_sinalizada_em && !bloqueado && (
        <div className="alert alert--success" style={{ marginBottom: "16px" }}>
          ✅ Serviço sinalizado como realizado {os.execucao_sinalizada_por_nome ? `por ${os.execucao_sinalizada_por_nome} ` : ""}
          em {os.execucao_sinalizada_em}. Aguardando a baixa por Administrador, Coordenador de PCM, Planejador ou Supervisor de
          manutenção.
        </div>
      )}

      {aguardandoValidacaoGlobopac && !bloqueado && (
        <div className="alert alert--warning" style={{ marginBottom: "16px" }}>
          {os.globopac_execucao_avisada_em ? (
            <>
              🌐 GloboPac avisado em {os.globopac_execucao_avisada_em} de que a execução terminou. Aguardando o GloboPac ir in
              loco validar e dar "conforme" — só depois disso é possível concluir esta OS.
            </>
          ) : (
            <>
              🌐 Esta OS foi aberta a partir de uma solicitação do GloboPac. Assim que a execução terminar, use o botão
              "Avisar GloboPac" acima para que ele vá in loco validar e dar "conforme" — só depois disso é possível concluir
              a OS.
            </>
          )}
        </div>
      )}

      <div className="tabs">
        <button type="button" className={`tab${aba === "dados" ? " is-active" : ""}`} onClick={() => setAba("dados")}>
          Dados gerais
        </button>
        <button type="button" className={`tab${aba === "checklist" ? " is-active" : ""}`} onClick={() => setAba("checklist")}>
          Checklist
        </button>
        <button type="button" className={`tab${aba === "pecas" ? " is-active" : ""}`} onClick={() => setAba("pecas")}>
          Peças
        </button>
        <button
          type="button"
          className={`tab${aba === "servico_externo" ? " is-active" : ""}`}
          onClick={() => setAba("servico_externo")}
        >
          Serviço externo
        </button>
        <button type="button" className={`tab${aba === "anexos" ? " is-active" : ""}`} onClick={() => setAba("anexos")}>
          Anexos
        </button>
      </div>

      {aba === "dados" && (
        <div className="card">
          <div className="info-grid">
            <Campo rotulo="Tipo" valor={ROTULO_TIPO_OS[os.tipo]} />
            <Campo rotulo="Origem" valor={ROTULO_ORIGEM[os.origem] ?? os.origem} />
            {os.solicitacao_origem === "globopac" && (
              <>
                <Campo rotulo="Solicitante (GloboPac)" valor={os.solicitacao_solicitante_externo_nome} />
                <Campo rotulo="Solicitação criada em" valor={os.solicitacao_criada_em} mono />
                <Campo rotulo="Execução avisada ao GloboPac em" valor={os.globopac_execucao_avisada_em} mono />
                <Campo
                  rotulo="Validação GloboPac"
                  valor={
                    os.globopac_validado_em
                      ? `Conforme em ${os.globopac_validado_em}${os.globopac_validado_por_nome ? ` por ${os.globopac_validado_por_nome}` : ""}`
                      : "Aguardando validação do GloboPac"
                  }
                />
              </>
            )}
            {os.os_origem_inspecao_id && (
              <Campo rotulo="Inspeção de origem" valor={<Link to={`/ordens-servico/${os.os_origem_inspecao_id}`}>Ver inspeção</Link>} />
            )}
            <Campo rotulo="Plano de origem" valor={os.plano_codigo} mono />
            <Campo rotulo="Responsável" valor={os.responsavel_nome ?? (os.equipe_nome ? `Equipe: ${os.equipe_nome}` : null)} />
            <Campo rotulo="Data programada" valor={os.data_programada} mono />
            <Campo rotulo="Semana" valor={`Semana ${semanaDoAno(os.data_programada)}/${os.data_programada.slice(0, 4)}`} />
            <Campo rotulo="Data limite" valor={os.data_limite} mono />
            <Campo rotulo="Data de abertura" valor={os.data_abertura} mono />
            <Campo rotulo="Início da execução" valor={os.data_inicio_execucao} mono />
            <Campo rotulo="Conclusão" valor={os.data_conclusao} mono />
            <Campo rotulo="Horas estimadas" valor={`${os.horas_estimadas}h`} />
            <Campo rotulo="Horas reais" valor={os.horas_reais != null ? `${os.horas_reais}h` : null} />
            <Campo rotulo="Custo de peças" valor={os.custo_pecas != null ? `R$ ${os.custo_pecas.toFixed(2)}` : null} />
            <Campo rotulo="Custo de mão de obra" valor={os.custo_mao_obra != null ? `R$ ${os.custo_mao_obra.toFixed(2)}` : null} />
            <Campo rotulo="Exige parada de linha" valor={os.exige_parada_linha ? "Sim" : "Não"} />
            {os.tipo === "corretiva" && <Campo rotulo="Causa da falha" valor={os.causa_falha ? ROTULO_CAUSA_FALHA[os.causa_falha as CausaFalha] : null} />}
          </div>
          {os.descricao && (
            <div className="field" style={{ marginTop: "16px" }}>
              <label>Descrição</label>
              <p style={{ color: "var(--c-n-700)" }}>{os.descricao}</p>
            </div>
          )}
          {os.observacoes_execucao && (
            <div className="field" style={{ marginTop: "16px" }}>
              <label>Observações da execução</label>
              <p style={{ color: "var(--c-n-700)" }}>{os.observacoes_execucao}</p>
            </div>
          )}
          {os.motivo_cancelamento && (
            <div className="field" style={{ marginTop: "16px" }}>
              <label>Motivo do cancelamento</label>
              <p style={{ color: "var(--c-n-700)" }}>{os.motivo_cancelamento}</p>
            </div>
          )}
          {os.reprogramada === 1 && <HistoricoReprogramacoes osId={os.id} />}
          {os.status === "concluida" && <AssinaturaSecao osId={os.id} />}
        </div>
      )}

      {aba === "checklist" && <OSChecklistTab osId={os.id} podeEditar={podeEditar && !bloqueado} />}
      {aba === "pecas" && <OSPecasTab osId={os.id} podeEditar={podeEditar} bloqueado={bloqueado} />}
      {aba === "servico_externo" && <OSServicoExternoTab osId={os.id} podeEditar={podeEditar} bloqueado={bloqueado} />}

      {aba === "anexos" && <AnexosTab entidade="ordem_servico" entidadeId={os.id} podeEditar={podeEditar && !bloqueado} />}

      {modalEditar && (
        <EditarOSModal
          os={os}
          edicaoCompleta={podeEditarCompleto}
          onFechar={() => setModalEditar(false)}
          onSalvo={(atualizado) => {
            setOs(atualizado);
            setModalEditar(false);
          }}
        />
      )}
      {modalIniciar && (
        <IniciarOSModal
          os={os}
          onFechar={() => setModalIniciar(false)}
          onSalvo={(atualizado) => {
            setOs(atualizado);
            setModalIniciar(false);
          }}
        />
      )}
      {modalConcluir && (
        <ConcluirOSModal
          os={os}
          onFechar={() => setModalConcluir(false)}
          onSalvo={(atualizado) => {
            setOs(atualizado);
            setModalConcluir(false);
          }}
        />
      )}
      {modalCancelar && (
        <CancelarOSModal
          os={os}
          onFechar={() => setModalCancelar(false)}
          onSalvo={(atualizado) => {
            setOs(atualizado);
            setModalCancelar(false);
          }}
        />
      )}

      {modalReprogramar && (
        <ReprogramarOSModal
          os={os}
          onFechar={() => setModalReprogramar(false)}
          onSalvo={(atualizado) => {
            setOs(atualizado);
            setModalReprogramar(false);
          }}
        />
      )}

      {modalCorretiva && (
        <AbrirCorretivaModal
          os={os}
          onFechar={() => setModalCorretiva(false)}
          onCriada={(novaOS) => {
            setModalCorretiva(false);
            navigate(`/ordens-servico/${novaOS.id}`);
          }}
        />
      )}

      {confirmandoExclusao && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmandoExclusao(false)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Excluir OS</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja excluir <strong>{os.codigo}</strong>? Esta ação sai das listagens, mas o histórico é preservado.
            </p>
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirmandoExclusao(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--destructive" onClick={confirmarExclusao}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
