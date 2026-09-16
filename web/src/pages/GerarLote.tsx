import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AtivoComArvore, LoteGeracao, ResultadoSimulacao, StatusLote } from "../types";
import { ROTULO_TIPO_MANUTENCAO, ROTULO_PERIODICIDADE } from "../components/PlanoFormModal";
import { dataInicioDaSemana, dataFimDaSemana, semanaDoAno } from "../lib/semanas";
import { hojeSistema } from "../lib/horarioSistema";

const ROTULO_STATUS_LOTE: Record<StatusLote, string> = {
  simulado: "Simulado",
  confirmado: "Confirmado",
  revertido: "Revertido",
  processando: "Processando",
  erro: "Erro",
};

const BADGE_STATUS_LOTE: Record<StatusLote, string> = {
  simulado: "badge--status-programada",
  confirmado: "badge--status-concluida",
  revertido: "badge--status-cancelada",
  processando: "badge--status-em_execucao",
  erro: "badge--status-atrasada",
};

/** LOTE-BG-01: confirmação roda em background (até 15min) — aqui só ficamos perguntando o status
 * de tempos em tempos até o lote sair de "processando". Intervalo curto pra não segurar o usuário
 * demais quando termina rápido, com limite generoso porque lotes grandes podem legitimamente levar
 * minutos. */
const POLL_INTERVALO_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const hoje = hojeSistema;

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function GerarLote() {
  const { pode } = useAuth();
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFim, setDataFim] = useState(somarDias(hoje(), 30));
  const [semana, setSemana] = useState("");
  const [ativoId, setAtivoId] = useState("");
  const [tipoManutencao, setTipoManutencao] = useState("");
  const [texto, setTexto] = useState("");

  const [simulando, setSimulando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSimulacao | null>(null);
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [mensagemProcessando, setMensagemProcessando] = useState<string | null>(null);
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [lotes, setLotes] = useState<LoteGeracao[] | null>(null);
  const [revertendoId, setRevertendoId] = useState<number | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);
  const [loteParaReverter, setLoteParaReverter] = useState<LoteGeracao | null>(null);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    carregarHistorico();
  }, []);

  function carregarHistorico() {
    api
      .get<{ lotes: LoteGeracao[] }>("/geracao-lote")
      .then((r) => setLotes(r.lotes))
      .catch((e) => setErroHistorico(e instanceof ApiError ? e.message : "Não foi possível carregar o histórico de lotes."));
  }

  function filtrosAtuais() {
    const filtros: { ativoId?: number; tipoManutencao?: string; texto?: string } = {};
    if (ativoId) filtros.ativoId = Number(ativoId);
    if (tipoManutencao) filtros.tipoManutencao = tipoManutencao;
    if (texto) filtros.texto = texto;
    return filtros;
  }

  async function aoSimular() {
    setErroSimulacao(null);
    setSucesso(null);
    setResultado(null);
    setSimulando(true);
    try {
      const r = await api.post<ResultadoSimulacao>("/geracao-lote/simular", {
        data_inicio: dataInicio,
        data_fim: dataFim,
        filtros: filtrosAtuais(),
      });
      setResultado(r);
      const sugestao = await api.get<{ codigo: string }>("/geracao-lote/codigo-sugerido");
      setCodigo(sugestao.codigo);
    } catch (e) {
      setErroSimulacao(e instanceof ApiError ? e.message : "Não foi possível simular a geração.");
    } finally {
      setSimulando(false);
    }
  }

  /** LOTE-BG-01: a confirmação roda em background no servidor — aqui só ficamos perguntando
   * (polling) até o lote sair de "processando", em vez de esperar uma resposta síncrona. */
  async function aguardarConclusao(loteId: number): Promise<LoteGeracao> {
    const inicio = Date.now();
    while (Date.now() - inicio < POLL_TIMEOUT_MS) {
      const { lote } = await api.get<{ lote: LoteGeracao }>(`/geracao-lote/${loteId}`);
      if (lote.status !== "processando") return lote;
      setMensagemProcessando(
        `Gerando ordens de serviço... (${Math.round((Date.now() - inicio) / 1000)}s) — isso pode levar alguns minutos em lotes grandes.`
      );
      await aguardar(POLL_INTERVALO_MS);
    }
    throw new Error("A confirmação está demorando mais do que o esperado. Verifique o histórico de lotes em instantes.");
  }

  async function aoConfirmar() {
    if (!resultado) return;
    setErroConfirmacao(null);
    setConfirmando(true);
    setMensagemProcessando("Iniciando a confirmação...");
    try {
      const criado = await api.post<{ lote: LoteGeracao }>("/geracao-lote", {
        codigo: codigo.trim(),
        data_inicio: resultado.data_inicio,
        data_fim: resultado.data_fim,
        filtros: filtrosAtuais(),
      });
      await api.post<{ lote: LoteGeracao }>(`/geracao-lote/${criado.lote.id}/confirmar`);
      const loteFinal = await aguardarConclusao(criado.lote.id);

      if (loteFinal.status === "erro") {
        throw new Error(loteFinal.erro_mensagem ?? "Não foi possível confirmar a geração do lote.");
      }

      setSucesso(`Lote ${loteFinal.codigo} confirmado: ${loteFinal.quantidade_gerada} ordem(ns) de serviço gerada(s).`);
      setResultado(null);
      carregarHistorico();
    } catch (e) {
      setErroConfirmacao(e instanceof ApiError || e instanceof Error ? e.message : "Não foi possível confirmar a geração do lote.");
    } finally {
      setConfirmando(false);
      setMensagemProcessando(null);
    }
  }

  async function confirmarReversao() {
    if (!loteParaReverter) return;
    const lote = loteParaReverter;
    setRevertendoId(lote.id);
    setErroHistorico(null);
    try {
      const r = await api.post<{ revertidas: number; naoRevertidas: number }>(`/geracao-lote/${lote.id}/reverter`);
      setSucesso(
        `Lote ${lote.codigo} revertido: ${r.revertidas} OS excluída(s)` +
          (r.naoRevertidas ? `, ${r.naoRevertidas} já em andamento e mantida(s).` : ".")
      );
      setLoteParaReverter(null);
      carregarHistorico();
    } catch (e) {
      setErroHistorico(e instanceof ApiError ? e.message : "Não foi possível reverter o lote.");
    } finally {
      setRevertendoId(null);
    }
  }

  const podeGerar = pode("geracao_lote", "criar");
  const podeAprovar = pode("geracao_lote", "aprovar");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Gerar ordens de serviço em lote</h1>
          <div className="page-header__desc">
            Calcula as ocorrências dos planos preventivos ativos em um período e gera as OS de uma vez
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px" }}>Período e filtros</h3>
        <div className="filters-bar">
          <div className="field">
            <label htmlFor="data-inicio">Início do período</label>
            <input
              id="data-inicio"
              type="date"
              className="input"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                setSemana("");
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="data-fim">Fim do período</label>
            <input
              id="data-fim"
              type="date"
              className="input"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value);
                setSemana("");
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="f-semana">Semana do ano</label>
            <select
              id="f-semana"
              className="input"
              value={semana}
              onChange={(e) => {
                const valor = e.target.value;
                setSemana(valor);
                if (valor) {
                  const ano = Number(dataInicio.slice(0, 4)) || new Date().getFullYear();
                  setDataInicio(dataInicioDaSemana(ano, Number(valor)));
                  setDataFim(dataFimDaSemana(ano, Number(valor)));
                }
              }}
            >
              <option value="">Datas manuais</option>
              {Array.from(
                { length: semanaDoAno(`${Number(dataInicio.slice(0, 4)) || new Date().getFullYear()}-12-31`) },
                (_, i) => i + 1
              ).map((s) => (
                <option key={s} value={s}>
                  Semana {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-ativo">Ativo</label>
            <select id="f-ativo" className="input" value={ativoId} onChange={(e) => setAtivoId(e.target.value)}>
              <option value="">Todos</option>
              {ativos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.caminho}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-tipo">Tipo de manutenção</label>
            <select id="f-tipo" className="input" value={tipoManutencao} onChange={(e) => setTipoManutencao(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ROTULO_TIPO_MANUTENCAO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-texto">Buscar plano</label>
            <input id="f-texto" className="input" placeholder="Código ou nome do plano" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        </div>

        {erroSimulacao && (
          <div className="login-card__error" style={{ marginTop: "12px" }}>
            {erroSimulacao}
          </div>
        )}

        <div style={{ marginTop: "12px" }}>
          <button type="button" className="btn btn--primary" onClick={aoSimular} disabled={!podeGerar || simulando}>
            {simulando ? "Simulando…" : "Simular"}
          </button>
        </div>
      </div>

      {sucesso && (
        <div className="alert alert--success" style={{ marginBottom: "16px" }}>
          {sucesso}
        </div>
      )}

      {resultado && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ marginBottom: "4px" }}>
                Prévia — {formatarData(resultado.data_inicio)} a {formatarData(resultado.data_fim)}
              </h3>
              <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)", marginBottom: "12px" }}>
                {resultado.total_novas} nova(s) ordem(ns) seria(m) gerada(s)
                {resultado.total_ja_geradas ? ` · ${resultado.total_ja_geradas} ocorrência(s) já geradas anteriormente serão ignoradas` : ""}
              </p>
            </div>
            <a
              className="btn btn--secondary"
              href={`/ordens-servico/gerar-lote/imprimir?${new URLSearchParams({
                data_inicio: resultado.data_inicio,
                data_fim: resultado.data_fim,
                ...(ativoId ? { ativoId } : {}),
                ...(tipoManutencao ? { tipoManutencao } : {}),
                ...(texto ? { texto } : {}),
              }).toString()}`}
              target="_blank"
              rel="noreferrer"
            >
              Imprimir relatório
            </a>
          </div>

          {resultado.sobrecargas.length > 0 && (
            <div className="alert alert--warning" style={{ marginBottom: "12px" }}>
              <strong>Possível sobrecarga de responsáveis:</strong>
              <ul>
                {resultado.sobrecargas.map((s, i) => (
                  <li key={i}>
                    {s.responsavel_nome} em {formatarData(s.data)}: {s.horas_totais}h previstas (limite configurado: {s.limite_horas}h/dia)
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="table-wrap" style={{ marginBottom: "12px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Plano</th>
                  <th>Tipo</th>
                  <th>Frequência</th>
                  <th>Data programada</th>
                  <th>Data limite</th>
                  <th>Responsável</th>
                  <th>Horas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resultado.ocorrencias.map((o) => {
                  const consolidada = o.planos.length > 1;
                  const tiposIguais = o.planos.every((p) => p.tipo_manutencao === o.planos[0].tipo_manutencao);
                  const periodicidadesIguais = o.planos.every((p) => p.periodicidade === o.planos[0].periodicidade);
                  return (
                    <tr key={o.chave_idempotencia} style={o.ja_gerada ? { opacity: 0.55 } : undefined}>
                      <td>{o.ativo_nome}</td>
                      <td>
                        {consolidada ? (
                          <>
                            <span className="badge badge--status-aberta" style={{ marginBottom: "4px" }}>
                              {o.planos.length} atividades consolidadas
                            </span>
                            <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
                              {o.planos.map((p) => `${p.codigo} — ${p.nome}`).join("; ")}
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="mono">{o.plano_codigo}</span> — {o.plano_nome}
                          </>
                        )}
                      </td>
                      <td>{tiposIguais ? ROTULO_TIPO_MANUTENCAO[o.tipo_manutencao] : "Diversos"}</td>
                      <td>{periodicidadesIguais ? ROTULO_PERIODICIDADE[o.periodicidade] : "Diversas"}</td>
                      <td className="mono">{formatarData(o.data_ajustada)}</td>
                      <td className="mono">{formatarData(o.data_limite)}</td>
                      <td>{o.responsavel_nome ?? "—"}</td>
                      <td>{o.horas_estimadas}h</td>
                      <td>
                        {o.ja_gerada && (
                          <span className="badge badge--status-cancelada">
                            <span className="badge__dot" /> Já gerada
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {resultado.ocorrencias.length === 0 && (
                  <tr>
                    <td colSpan={9} className="empty-state">
                      Nenhuma ocorrência encontrada para o período e filtros informados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {erroConfirmacao && (
            <div className="login-card__error" style={{ marginBottom: "12px" }}>
              {erroConfirmacao}
            </div>
          )}

          {confirmando && mensagemProcessando && (
            <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "12px" }}>
              {mensagemProcessando}
            </p>
          )}

          {resultado.total_novas > 0 && podeAprovar && (
            <div className="filters-bar" style={{ alignItems: "flex-end" }}>
              <div className="field">
                <label htmlFor="codigo-lote">Código do lote</label>
                <input id="codigo-lote" className="input mono" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              </div>
              <button type="button" className="btn btn--primary" onClick={aoConfirmar} disabled={confirmando || !codigo.trim()}>
                {confirmando ? "Confirmando…" : `Confirmar geração de ${resultado.total_novas} OS`}
              </button>
            </div>
          )}
          {resultado.total_novas > 0 && !podeAprovar && (
            <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)" }}>
              Seu perfil não tem permissão para confirmar a geração — apenas simular.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: "12px" }}>Lotes gerados anteriormente</h3>
        {erroHistorico && (
          <div className="login-card__error" style={{ marginBottom: "12px" }}>
            {erroHistorico}
          </div>
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Período</th>
                <th>Status</th>
                <th>OS geradas</th>
                <th>Gerado por</th>
                <th>Gerado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lotes?.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.codigo}</td>
                  <td className="mono">
                    {formatarData(l.data_inicio_periodo)} – {formatarData(l.data_fim_periodo)}
                  </td>
                  <td>
                    <span className={`badge ${BADGE_STATUS_LOTE[l.status]}`}>
                      <span className="badge__dot" /> {ROTULO_STATUS_LOTE[l.status]}
                    </span>
                  </td>
                  <td>{l.quantidade_gerada}</td>
                  <td>{l.gerado_por_nome}</td>
                  <td className="mono">{l.gerado_em}</td>
                  <td>
                    {l.status === "confirmado" && podeAprovar && (
                      <button type="button" className="btn btn--ghost" onClick={() => setLoteParaReverter(l)}>
                        Reverter
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {lotes?.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    Nenhum lote gerado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loteParaReverter && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setLoteParaReverter(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Reverter lote</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja reverter <strong>{loteParaReverter.codigo}</strong>? As OS geradas por este lote que
              ainda estiverem com status "programada" serão excluídas; as que já saíram desse status são mantidas.
            </p>
            {erroHistorico && (
              <div className="login-card__error" role="alert" style={{ marginTop: "12px" }}>
                {erroHistorico}
              </div>
            )}
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setLoteParaReverter(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--destructive" onClick={confirmarReversao} disabled={revertendoId === loteParaReverter.id}>
                {revertendoId === loteParaReverter.id ? "Revertendo…" : "Reverter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
