import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoOcorrencia, CustoPorAtivo, StatusAtivo } from "../types";
import { ROTULO_STATUS_ATIVO } from "./AtivoFormModal";

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function horasEntre(inicio: string, fim: string | null): number {
  const fimMs = fim ? new Date(fim.replace(" ", "T") + "Z").getTime() : Date.now();
  const inicioMs = new Date(inicio.replace(" ", "T") + "Z").getTime();
  return (fimMs - inicioMs) / 3600000;
}

const BADGE_STATUS: Record<StatusAtivo, string> = {
  operando: "badge--estoque-ok",
  parado: "badge--status-atrasada",
  em_manutencao: "badge--status-em_execucao",
  desativado: "badge--status-cancelada",
};

/** DADOS-01/NOVO-03: linha do tempo de status (MTBF/MTTR reais, não só tempo de execução de OS) e custo total acumulado do ativo. */
export function AtivoConfiabilidadeTab({ ativoId }: { ativoId: number }) {
  const [ocorrencias, setOcorrencias] = useState<AtivoOcorrencia[] | null>(null);
  const [custo, setCusto] = useState<CustoPorAtivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ ocorrencias: AtivoOcorrencia[] }>(`/ativos/${ativoId}/ocorrencias`)
      .then((r) => setOcorrencias(r.ocorrencias))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o histórico."));
    api
      .get<{ itens: CustoPorAtivo[] }>(`/indicadores/custo-por-ativo?ativoId=${ativoId}`)
      .then((r) => setCusto(r.itens[0] ?? null))
      .catch(() => {});
  }, [ativoId]);

  const horasIndisponivel = ocorrencias
    ? ocorrencias.filter((o) => o.status === "parado" || o.status === "em_manutencao").reduce((soma, o) => soma + horasEntre(o.inicio, o.fim), 0)
    : 0;
  const quedas = ocorrencias ? ocorrencias.filter((o) => o.status === "parado" || o.status === "em_manutencao").length : 0;

  return (
    <div>
      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="card-grid" style={{ marginBottom: "24px" }}>
        <div className="card">
          <div className="stat-card__label">Custo total acumulado</div>
          <div className="stat-card__value">{custo ? formatarMoeda(custo.custo_total) : "R$ 0,00"}</div>
          {custo && <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>{custo.os_concluidas} OS concluída(s)</div>}
        </div>
        <div className="card">
          <div className="stat-card__label">Horas indisponível (histórico completo)</div>
          <div className="stat-card__value">{horasIndisponivel.toFixed(1)}h</div>
          <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>{quedas} período(s) parado/em manutenção</div>
        </div>
      </div>

      <h3 style={{ fontSize: "var(--text-h3)", marginBottom: "12px", color: "var(--c-n-700)" }}>Linha do tempo de status</h3>
      {ocorrencias == null ? (
        <p style={{ color: "var(--c-n-500)" }}>Carregando…</p>
      ) : ocorrencias.length === 0 ? (
        <div className="empty-state">Nenhuma transição de status registrada ainda.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Duração</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {ocorrencias.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className={`badge ${BADGE_STATUS[o.status]}`}>
                      <span className="badge__dot" /> {ROTULO_STATUS_ATIVO[o.status]}
                    </span>
                  </td>
                  <td className="mono">{o.inicio}</td>
                  <td className="mono">{o.fim ?? "em andamento"}</td>
                  <td className="mono">{horasEntre(o.inicio, o.fim).toFixed(1)}h</td>
                  <td>{o.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
