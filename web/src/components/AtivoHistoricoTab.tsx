import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { CausaFalha, OrdemServico } from "../types";
import { ROTULO_CAUSA_FALHA } from "../types";
import { ROTULO_TIPO_OS } from "./OSFormModal";
import { ROTULO_STATUS_OS } from "../pages/OrdensServico";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data de referência usada para ordenar o histórico do mais recente pro mais antigo. */
function dataDeReferencia(o: OrdemServico): string {
  return o.data_conclusao ?? o.data_programada;
}

interface AnaliseManutencao {
  percentualCorretiva: number | null;
  mtbfDias: number | null;
  mttrHoras: number | null;
  classificacao: "saudavel" | "atencao" | "critico" | "insuficiente";
}

const ROTULO_CLASSIFICACAO: Record<AnaliseManutencao["classificacao"], string> = {
  saudavel: "Saudável — manutenção majoritariamente preventiva",
  atencao: "Atenção — parcela relevante de corretivas",
  critico: "Crítico — predominantemente reativo",
  insuficiente: "Dados insuficientes",
};

const BADGE_CLASSIFICACAO: Record<AnaliseManutencao["classificacao"], string> = {
  saudavel: "badge--status-concluida",
  atencao: "badge--status-em_execucao",
  critico: "badge--status-atrasada",
  insuficiente: "badge--status-cancelada",
};

/**
 * Análise baseada em TODO o histórico do ativo (não no que está filtrado na tabela abaixo) —
 * é um indicador de saúde da manutenção, não deve mudar conforme o usuário filtra a tela.
 * % corretiva é o indicador clássico de PCM: quanto menor, mais a manutenção é preventiva
 * (proativa) em vez de reativa. Faixas seguem referência usual de manutenção classe mundial
 * (<25% corretiva = boa prática; >50% = predominantemente reativo).
 */
function analisar(todas: OrdemServico[]): AnaliseManutencao {
  const concluidas = todas.filter((o) => o.status === "concluida");
  if (concluidas.length < 2) {
    return { percentualCorretiva: null, mtbfDias: null, mttrHoras: null, classificacao: "insuficiente" };
  }

  const corretivas = concluidas.filter((o) => o.tipo === "corretiva");
  const percentualCorretiva = (corretivas.length / concluidas.length) * 100;

  const mttrHoras =
    corretivas.length > 0 ? corretivas.reduce((soma, o) => soma + (o.horas_reais ?? 0), 0) / corretivas.length : null;

  const datasCorretivas = corretivas
    .map((o) => o.data_conclusao)
    .filter((d): d is string => !!d)
    .sort();
  const mtbfDias =
    datasCorretivas.length >= 2
      ? (new Date(datasCorretivas[datasCorretivas.length - 1]).getTime() - new Date(datasCorretivas[0]).getTime()) /
        86400000 /
        (datasCorretivas.length - 1)
      : null;

  const classificacao: AnaliseManutencao["classificacao"] =
    percentualCorretiva <= 25 ? "saudavel" : percentualCorretiva <= 50 ? "atencao" : "critico";

  return { percentualCorretiva, mtbfDias, mttrHoras, classificacao };
}

export function AtivoHistoricoTab({ ativoId }: { ativoId: number }) {
  const navigate = useNavigate();
  const [todas, setTodas] = useState<OrdemServico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");

  useEffect(() => {
    setTodas(null);
    api
      .get<{ ordens: OrdemServico[] }>(`/ordens-servico?ativoId=${ativoId}`)
      .then((r) => setTodas(r.ordens))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o histórico de manutenções."));
  }, [ativoId]);

  const ordens = useMemo(() => {
    if (!todas) return null;
    return todas
      .filter((o) => (!status || o.status === status) && (!tipo || o.tipo === tipo))
      .sort((a, b) => dataDeReferencia(b).localeCompare(dataDeReferencia(a)));
  }, [todas, status, tipo]);

  const concluidas = ordens?.filter((o) => o.status === "concluida") ?? [];
  const horasTotais = concluidas.reduce((soma, o) => soma + (o.horas_reais ?? 0), 0);
  const custoTotal = concluidas.reduce((soma, o) => soma + (o.custo_mao_obra ?? 0) + (o.custo_pecas ?? 0), 0);
  const analise = useMemo(() => analisar(todas ?? []), [todas]);

  return (
    <div>
      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="row-actions" style={{ justifyContent: "flex-end", marginBottom: "12px" }}>
        <a
          className="btn btn--secondary"
          href={`/ativos/${ativoId}/historico/imprimir?${new URLSearchParams({ ...(status && { status }), ...(tipo && { tipo }) }).toString()}`}
          target="_blank"
          rel="noreferrer"
        >
          Imprimir
        </a>
      </div>

      <div className="card-grid" style={{ marginBottom: "24px" }}>
        <div className="card">
          <div className="stat-card__label">OS concluídas</div>
          <div className="stat-card__value">{concluidas.length}</div>
        </div>
        <div className="card">
          <div className="stat-card__label">Horas reais acumuladas</div>
          <div className="stat-card__value">{horasTotais.toFixed(1)}h</div>
        </div>
        <div className="card">
          <div className="stat-card__label">Custo total (mão de obra + peças)</div>
          <div className="stat-card__value">{formatarMoeda(custoTotal)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Análise de manutenção</h3>
            <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>Com base em todo o histórico do ativo (não considera os filtros abaixo)</div>
          </div>
          <span className={`badge ${BADGE_CLASSIFICACAO[analise.classificacao]}`}>
            <span className="badge__dot" /> {ROTULO_CLASSIFICACAO[analise.classificacao]}
          </span>
        </div>
        {analise.classificacao === "insuficiente" ? (
          <p style={{ marginTop: "12px", color: "var(--c-n-500)", fontSize: "var(--text-small)" }}>
            São necessárias pelo menos 2 OS concluídas para calcular a análise.
          </p>
        ) : (
          <div className="modal__grid" style={{ marginTop: "16px" }}>
            <div className="field">
              <label>% de manutenção corretiva</label>
              <span>{analise.percentualCorretiva!.toFixed(0)}% das OS concluídas</span>
            </div>
            <div className="field">
              <label>MTBF (tempo médio entre falhas)</label>
              <span>{analise.mtbfDias != null ? `${analise.mtbfDias.toFixed(1)} dias` : "— (menos de 2 corretivas concluídas)"}</span>
            </div>
            <div className="field">
              <label>MTTR (tempo médio de reparo)</label>
              <span>{analise.mttrHoras != null ? `${analise.mttrHoras.toFixed(1)}h` : "—"}</span>
            </div>
          </div>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="h-status">Status</label>
          <select id="h-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_STATUS_OS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="h-tipo">Tipo</label>
          <select id="h-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_TIPO_OS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {ordens == null ? (
        <p style={{ color: "var(--c-n-500)" }}>Carregando…</p>
      ) : ordens.length === 0 ? (
        <div className="empty-state">Nenhuma ordem de serviço registrada para este ativo.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Programada</th>
                <th>Conclusão</th>
                <th>Status</th>
                <th>Causa da falha</th>
                <th>Responsável</th>
                <th>Horas reais</th>
                <th>Custo total</th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((o) => {
                const custo = o.custo_mao_obra != null || o.custo_pecas != null ? (o.custo_mao_obra ?? 0) + (o.custo_pecas ?? 0) : null;
                return (
                  <tr key={o.id} onClick={() => navigate(`/ordens-servico/${o.id}`)} style={{ cursor: "pointer" }}>
                    <td className="mono">{o.codigo}</td>
                    <td>{ROTULO_TIPO_OS[o.tipo]}</td>
                    <td>{o.descricao ?? "—"}</td>
                    <td className="mono">{formatarData(o.data_programada)}</td>
                    <td className="mono">{formatarData(o.data_conclusao)}</td>
                    <td>
                      <span className={`badge badge--status-${o.status}`}>
                        <span className="badge__dot" /> {ROTULO_STATUS_OS[o.status]}
                      </span>
                    </td>
                    <td>{o.causa_falha ? ROTULO_CAUSA_FALHA[o.causa_falha as CausaFalha] : "—"}</td>
                    <td>{o.responsavel_nome ?? "—"}</td>
                    <td className="mono">{o.horas_reais != null ? `${o.horas_reais}h` : "—"}</td>
                    <td className="mono">{custo != null ? formatarMoeda(custo) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
