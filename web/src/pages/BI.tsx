import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { CumprimentoPorSetor, CustoPorAtivo, IndicadorTempoExecucao, PontoBacklogSemanal, TicketMedioTecnico } from "../types";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { BarraHorizontal } from "../components/charts/BarraHorizontal";
import { LinhaTendencia } from "../components/charts/LinhaTendencia";
import { hojeSistema } from "../lib/horarioSistema";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarDataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

const hoje = hojeSistema;

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function formatarHoras(h: number): string {
  return h.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function BI() {
  const [dataInicio, setDataInicio] = useState(somarDias(hoje(), -30));
  const [dataFim, setDataFim] = useState(hoje());
  const [tempoExecucao, setTempoExecucao] = useState<IndicadorTempoExecucao | null>(null);
  const [ticketMedio, setTicketMedio] = useState<TicketMedioTecnico[] | null>(null);
  const [backlog, setBacklog] = useState<PontoBacklogSemanal[] | null>(null);
  const [custoPorAtivo, setCustoPorAtivo] = useState<CustoPorAtivo[] | null>(null);
  const [cumprimentoPorSetor, setCumprimentoPorSetor] = useState<CumprimentoPorSetor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  function carregar() {
    setErro(null);
    setCarregando(true);
    api
      .get<{ indicador: IndicadorTempoExecucao }>(`/indicadores/tempo-execucao?inicio=${dataInicio}&fim=${dataFim}`)
      .then((r) => setTempoExecucao(r.indicador))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os indicadores."))
      .finally(() => setCarregando(false));
    api
      .get<{ itens: TicketMedioTecnico[] }>(`/indicadores/ticket-medio-tecnico?inicio=${dataInicio}&fim=${dataFim}`)
      .then((r) => setTicketMedio(r.itens))
      .catch(() => setTicketMedio([]));
  }

  function carregarIndicadoresGerais() {
    api.get<{ pontos: PontoBacklogSemanal[] }>("/indicadores/backlog-semanal?semanas=12").then((r) => setBacklog(r.pontos));
    api.get<{ itens: CustoPorAtivo[] }>("/indicadores/custo-por-ativo").then((r) => setCustoPorAtivo(r.itens));
    api.get<{ itens: CumprimentoPorSetor[] }>("/indicadores/cumprimento-por-setor").then((r) => setCumprimentoPorSetor(r.itens));
  }

  useEffect(carregarIndicadoresGerais, []);
  usePolling(carregarIndicadoresGerais, INTERVALO_POLLING_PADRAO);

  useEffect(carregar, [dataInicio, dataFim]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>BI</h1>
          <div className="page-header__desc">Indicadores analíticos de manutenção — mais indicadores serão adicionados aqui ao longo do tempo</div>
        </div>
      </div>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)", marginBottom: "4px" }}>Backlog em aberto — últimas 12 semanas</h2>
        <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "16px" }}>
          Quantidade de horas estimadas em OS que ainda não foram concluídas nem canceladas, medida no fim de cada semana.
        </p>
        <div className="card">
          {backlog == null ? (
            <p style={{ color: "var(--c-n-500)" }}>Carregando…</p>
          ) : (
            <LinhaTendencia
              pontos={backlog.map((p) => ({ chave: p.semana_fim, valor: p.horas_em_aberto }))}
              formatarValor={(v) => `${formatarHoras(v)}h`}
              formatarRotulo={formatarDataCurta}
            />
          )}
        </div>
      </section>

      <div className="card-grid" style={{ marginBottom: "32px" }}>
        <section>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)", marginBottom: "4px" }}>Custo por ativo</h2>
          <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "16px" }}>
            Peças + mão de obra de OS concluídas, os 10 ativos de maior custo acumulado.
          </p>
          <div className="card">
            {custoPorAtivo == null ? (
              <p style={{ color: "var(--c-n-500)" }}>Carregando…</p>
            ) : custoPorAtivo.length === 0 ? (
              <div className="empty-state">Nenhuma OS concluída com custo registrado ainda.</div>
            ) : (
              <BarraHorizontal
                itens={custoPorAtivo.map((a) => ({ chave: a.ativo_id, rotulo: `${a.ativo_codigo} — ${a.ativo_nome}`, valor: a.custo_total }))}
                formatarValor={formatarMoeda}
                cor="var(--c-primary-500)"
              />
            )}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)", marginBottom: "4px" }}>Cumprimento do plano por setor</h2>
          <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "16px" }}>
            Preventivas concluídas até a data limite, últimos 30 dias, por setor do ativo.
          </p>
          <div className="card">
            {cumprimentoPorSetor == null ? (
              <p style={{ color: "var(--c-n-500)" }}>Carregando…</p>
            ) : cumprimentoPorSetor.length === 0 ? (
              <div className="empty-state">Nenhuma preventiva devida no período.</div>
            ) : (
              <BarraHorizontal
                itens={cumprimentoPorSetor.map((s) => ({ chave: s.setor, rotulo: s.setor, valor: s.cumprimento_pct ?? 0 }))}
                formatarValor={(v) => `${v.toFixed(0)}%`}
                cor="var(--c-success-500)"
              />
            )}
          </div>
        </section>
      </div>

      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="modal__grid" style={{ maxWidth: "440px" }}>
          <div className="field">
            <label htmlFor="data_inicio">Período — de</label>
            <input id="data_inicio" type="date" className="input" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} max={dataFim} />
          </div>
          <div className="field">
            <label htmlFor="data_fim">até</label>
            <input id="data_fim" type="date" className="input" value={dataFim} onChange={(e) => setDataFim(e.target.value)} min={dataInicio} max={hoje()} />
          </div>
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)", marginBottom: "12px" }}>Tempo médio de execução</h2>
        <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "16px" }}>
          Média de horas entre o início da execução e a conclusão das OS concluídas no período — considera só OS com os dois horários registrados.
        </p>

        <div className="card-grid" style={{ marginBottom: "16px" }}>
          <div className="card">
            <div className="stat-card__label">Tempo médio geral</div>
            <div className="stat-card__value">
              {carregando ? "…" : tempoExecucao?.media_horas != null ? `${formatarHoras(tempoExecucao.media_horas)}h` : "—"}
            </div>
            {tempoExecucao && (
              <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
                {tempoExecucao.amostras} OS concluída(s) com início e fim registrados no período
              </div>
            )}
          </div>
        </div>

        {tempoExecucao && tempoExecucao.por_tipo.length > 0 && (
          <div className="card" style={{ marginBottom: "16px" }}>
            <h3 style={{ marginBottom: "12px" }}>Por tipo de OS</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>OS consideradas</th>
                    <th>Tempo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {tempoExecucao.por_tipo.map((t) => (
                    <tr key={t.tipo}>
                      <td>{ROTULO_TIPO_OS[t.tipo]}</td>
                      <td className="mono">{t.amostras}</td>
                      <td className="mono">{formatarHoras(t.media_horas)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tempoExecucao && tempoExecucao.por_ativo.length > 0 && (
          <div className="card">
            <h3 style={{ marginBottom: "4px" }}>Por ativo (top 10 — maior tempo médio)</h3>
            <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)", marginBottom: "12px" }}>
              Só ativos com pelo menos uma OS concluída com início e fim registrados no período.
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>OS consideradas</th>
                    <th>Tempo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {tempoExecucao.por_ativo.map((a) => (
                    <tr key={a.ativo_id}>
                      <td>
                        <Link to={`/ativos/${a.ativo_id}`}>
                          {a.ativo_codigo} — {a.ativo_nome}
                        </Link>
                      </td>
                      <td className="mono">{a.amostras}</td>
                      <td className="mono">{formatarHoras(a.media_horas)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tempoExecucao && tempoExecucao.amostras === 0 && (
          <div className="card empty-state">Nenhuma OS concluída com início e fim de execução registrados nesse período.</div>
        )}
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)", marginBottom: "4px" }}>Ticket médio por técnico</h2>
        <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "16px" }}>
          Cruza, no período selecionado acima, quantas OS cada técnico concluiu com quantas horas reais ele registrou nelas — o ticket médio é a razão entre as duas.
        </p>

        {ticketMedio == null ? (
          <div className="card">
            <p style={{ color: "var(--c-n-500)" }}>Carregando…</p>
          </div>
        ) : ticketMedio.length === 0 ? (
          <div className="card empty-state">Nenhuma OS concluída com responsável atribuído nesse período.</div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: "16px" }}>
              <BarraHorizontal
                itens={ticketMedio.map((t) => ({ chave: t.responsavel_id, rotulo: t.responsavel_nome, valor: t.ticket_medio_horas }))}
                formatarValor={(v) => `${formatarHoras(v)}h/OS`}
                cor="var(--c-primary-500)"
              />
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Técnico</th>
                    <th>OS concluídas</th>
                    <th>Horas totais</th>
                    <th>Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketMedio.map((t) => (
                    <tr key={t.responsavel_id}>
                      <td>{t.responsavel_nome}</td>
                      <td className="mono">{t.os_concluidas}</td>
                      <td className="mono">{formatarHoras(t.horas_totais)}h</td>
                      <td className="mono">{formatarHoras(t.ticket_medio_horas)}h/OS</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
