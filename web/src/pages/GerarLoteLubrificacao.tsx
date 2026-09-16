import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AtivoComArvore, LoteGeracaoLubrificacao, ResultadoSimulacaoLubrificacao, StatusLoteLubrificacao } from "../types";
import { ROTULO_PERIODICIDADE_SEMANAL } from "../components/PontoLubrificacaoFormModal";
import { semanaDoAno } from "../lib/semanas";

const ROTULO_STATUS_LOTE: Record<StatusLoteLubrificacao, string> = {
  simulado: "Simulado",
  confirmado: "Confirmado",
  revertido: "Revertido",
};

const BADGE_STATUS_LOTE: Record<StatusLoteLubrificacao, string> = {
  simulado: "badge--status-programada",
  confirmado: "badge--status-concluida",
  revertido: "badge--status-cancelada",
};

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function GerarLoteLubrificacao() {
  const { pode } = useAuth();
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [semana, setSemana] = useState(1);
  const [ativoId, setAtivoId] = useState("");
  const [periodicidade, setPeriodicidade] = useState("");
  const [texto, setTexto] = useState("");

  const [simulando, setSimulando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSimulacaoLubrificacao | null>(null);
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [lotes, setLotes] = useState<LoteGeracaoLubrificacao[] | null>(null);
  const [revertendoId, setRevertendoId] = useState<number | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);
  const [loteParaReverter, setLoteParaReverter] = useState<LoteGeracaoLubrificacao | null>(null);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    carregarHistorico();
  }, []);

  function carregarHistorico() {
    api
      .get<{ lotes: LoteGeracaoLubrificacao[] }>("/lubrificacao/lotes")
      .then((r) => setLotes(r.lotes))
      .catch((e) => setErroHistorico(e instanceof ApiError ? e.message : "Não foi possível carregar o histórico de lotes."));
  }

  function filtrosAtuais() {
    const filtros: { ativoId?: number; periodicidade?: string; texto?: string } = {};
    if (ativoId) filtros.ativoId = Number(ativoId);
    if (periodicidade) filtros.periodicidade = periodicidade;
    if (texto) filtros.texto = texto;
    return filtros;
  }

  async function aoSimular() {
    setErroSimulacao(null);
    setSucesso(null);
    setResultado(null);
    setSimulando(true);
    try {
      const r = await api.post<ResultadoSimulacaoLubrificacao>("/lubrificacao/lotes/simular", {
        ano,
        semana_inicio: semana,
        semana_fim: semana,
        filtros: filtrosAtuais(),
      });
      setResultado(r);
      const sugestao = await api.get<{ codigo: string }>("/lubrificacao/lotes/codigo-sugerido");
      setCodigo(sugestao.codigo);
    } catch (e) {
      setErroSimulacao(e instanceof ApiError ? e.message : "Não foi possível simular a geração.");
    } finally {
      setSimulando(false);
    }
  }

  async function aoConfirmar() {
    if (!resultado) return;
    setErroConfirmacao(null);
    setConfirmando(true);
    try {
      const criado = await api.post<{ lote: LoteGeracaoLubrificacao }>("/lubrificacao/lotes", {
        codigo: codigo.trim(),
        ano: resultado.ano,
        semana_inicio: resultado.semana_inicio,
        semana_fim: resultado.semana_fim,
        filtros: filtrosAtuais(),
      });
      const confirmado = await api.post<{ lote: LoteGeracaoLubrificacao; ordens_criadas: number; ocorrencias_ignoradas: number }>(
        `/lubrificacao/lotes/${criado.lote.id}/confirmar`
      );
      setSucesso(
        `Lote ${confirmado.lote.codigo} confirmado: ${confirmado.ordens_criadas} ordem(ns) de serviço gerada(s)` +
          (confirmado.ocorrencias_ignoradas ? `, ${confirmado.ocorrencias_ignoradas} ocorrência(s) já existente(s) ignorada(s).` : ".")
      );
      setResultado(null);
      carregarHistorico();
    } catch (e) {
      setErroConfirmacao(e instanceof ApiError ? e.message : "Não foi possível confirmar a geração do lote.");
    } finally {
      setConfirmando(false);
    }
  }

  async function confirmarReversao() {
    if (!loteParaReverter) return;
    const lote = loteParaReverter;
    setRevertendoId(lote.id);
    setErroHistorico(null);
    try {
      const r = await api.post<{ revertidas: number; naoRevertidas: number }>(`/lubrificacao/lotes/${lote.id}/reverter`);
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

  const podeGerar = pode("lubrificacao", "criar");
  const podeAprovar = pode("lubrificacao", "aprovar");
  const totalSemanas = semanaDoAno(`${ano}-12-31`);
  const semanas = Array.from({ length: totalSemanas }, (_, i) => i + 1);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Gerar OS de lubrificação em lote</h1>
          <div className="page-header__desc">
            Calcula as ocorrências dos pontos de lubrificação ativos num intervalo de semanas do ano e gera as OS de uma vez
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px" }}>Período e filtros</h3>
        <div className="filters-bar">
          <div className="field">
            <label htmlFor="ano">Ano</label>
            <input
              id="ano"
              type="number"
              className="input mono"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value) || new Date().getFullYear())}
            />
          </div>
          <div className="field">
            <label htmlFor="semana">Semana</label>
            <select id="semana" className="input" value={semana} onChange={(e) => setSemana(Number(e.target.value))}>
              {semanas.map((s) => (
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
            <label htmlFor="f-periodicidade">Periodicidade</label>
            <select id="f-periodicidade" className="input" value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ROTULO_PERIODICIDADE_SEMANAL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-texto">Buscar ponto</label>
            <input id="f-texto" className="input" placeholder="Código ou descrição do ponto" value={texto} onChange={(e) => setTexto(e.target.value)} />
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
                Prévia — semana {resultado.semana_inicio === resultado.semana_fim ? resultado.semana_inicio : `${resultado.semana_inicio} a ${resultado.semana_fim}`}{" "}
                de {resultado.ano} ({formatarData(resultado.data_inicio)} a{" "}
                {formatarData(resultado.data_fim)})
              </h3>
              <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)", marginBottom: "12px" }}>
                {resultado.total_novas} nova(s) ordem(ns) seria(m) gerada(s)
                {resultado.total_ja_geradas ? ` · ${resultado.total_ja_geradas} ocorrência(s) já geradas anteriormente serão ignoradas` : ""}
              </p>
            </div>
            <a
              className="btn btn--secondary"
              href={`/lubrificacao/gerar-lote/imprimir?${new URLSearchParams({
                ano: String(resultado.ano),
                semana_inicio: String(resultado.semana_inicio),
                semana_fim: String(resultado.semana_fim),
                ...(ativoId ? { ativoId } : {}),
                ...(periodicidade ? { periodicidade } : {}),
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
                  <th>Ponto de lubrificação</th>
                  <th>Data programada</th>
                  <th>Data limite</th>
                  <th>Responsável</th>
                  <th>Horas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resultado.ocorrencias.map((o) => {
                  const consolidada = o.pontos.length > 1;
                  return (
                    <tr key={o.chave_idempotencia} style={o.ja_gerada ? { opacity: 0.55 } : undefined}>
                      <td>{o.ativo_nome}</td>
                      <td>
                        {consolidada ? (
                          <>
                            <span className="badge badge--status-aberta" style={{ marginBottom: "4px" }}>
                              {o.pontos.length} pontos consolidados
                            </span>
                            <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
                              {o.pontos.map((p) => (
                                <div key={p.id}>
                                  {p.codigo} — {p.descricao}
                                  {p.especificacao && <> · Material: {p.especificacao}</>}
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="mono">{o.ponto_codigo}</span> — {o.ponto_descricao}
                            {o.pontos[0]?.especificacao && (
                              <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
                                Material: {o.pontos[0].especificacao}
                              </div>
                            )}
                          </>
                        )}
                      </td>
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
                    <td colSpan={7} className="empty-state">
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
                    Semana {l.semana_inicio === l.semana_fim ? l.semana_inicio : `${l.semana_inicio}–${l.semana_fim}`} / {l.ano}
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
