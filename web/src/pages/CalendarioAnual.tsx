import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, LinhaCalendarioAnual } from "../types";
import { ROTULO_TIPO_MANUTENCAO } from "../components/PlanoFormModal";
import { semanaDoAno } from "../lib/semanas";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function diaDoMes(iso: string): number {
  return Number(iso.slice(8, 10));
}

function formatarDataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

interface OcorrenciaComSemana {
  data: string;
  gerada: boolean;
}

function agruparPorSemana(linha: LinhaCalendarioAnual, totalSemanas: number): OcorrenciaComSemana[][] {
  const semanas: OcorrenciaComSemana[][] = Array.from({ length: totalSemanas }, () => []);
  for (const m of linha.meses) {
    for (const d of m.dias) {
      semanas[semanaDoAno(d.data) - 1].push(d);
    }
  }
  return semanas;
}

export function CalendarioAnual() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [visualizacao, setVisualizacao] = useState<"mes" | "semana">("mes");
  const [linhas, setLinhas] = useState<LinhaCalendarioAnual[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [ativoId, setAtivoId] = useState("");
  const [tipoManutencao, setTipoManutencao] = useState("");

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
  }, []);

  function carregar() {
    const params = new URLSearchParams({ ano: String(ano) });
    if (ativoId) params.set("ativoId", ativoId);
    if (tipoManutencao) params.set("tipoManutencao", tipoManutencao);
    api
      .get<{ linhas: LinhaCalendarioAnual[] }>(`/planos/calendario?${params.toString()}`)
      .then((r) => setLinhas(r.linhas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o calendário."));
  }

  useEffect(carregar, [ano, ativoId, tipoManutencao]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  const totalSemanas = semanaDoAno(`${ano}-12-31`);
  const semanas = Array.from({ length: totalSemanas }, (_, i) => i + 1);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Calendário anual de manutenção</h1>
          <div className="page-header__desc">Ocorrências previstas dos planos preventivos ativos ao longo do ano</div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn--secondary" onClick={() => setAno((a) => a - 1)}>
            ← {ano - 1}
          </button>
          <span style={{ fontSize: "var(--text-h3)", fontWeight: 700, padding: "0 8px" }}>{ano}</span>
          <button type="button" className="btn btn--secondary" onClick={() => setAno((a) => a + 1)}>
            {ano + 1} →
          </button>
        </div>
      </div>

      <div className="filters-bar">
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
          <label>Visualização</label>
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${visualizacao === "mes" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setVisualizacao("mes")}
            >
              Por mês
            </button>
            <button
              type="button"
              className={`btn ${visualizacao === "semana" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setVisualizacao("semana")}
            >
              Por semana
            </button>
          </div>
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="row-actions" style={{ marginBottom: "12px", fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
        <span className="badge badge--status-concluida">
          <span className="badge__dot" /> OS já gerada
        </span>
        <span className="badge badge--status-programada">
          <span className="badge__dot" /> Apenas planejado
        </span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ativo</th>
              <th>Plano</th>
              {visualizacao === "mes"
                ? MESES.map((m) => (
                    <th key={m} style={{ textAlign: "center" }}>
                      {m}
                    </th>
                  ))
                : semanas.map((s) => (
                    <th key={s} style={{ textAlign: "center", padding: "6px 4px" }}>
                      {s}
                    </th>
                  ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas?.map((l) => (
              <tr key={l.plano_id}>
                <td>
                  <Link to={`/ativos/${l.ativo_id}`}>{l.ativo_nome}</Link>
                </td>
                <td>
                  <Link to={`/planos/${l.plano_id}`} className="mono">
                    {l.plano_codigo}
                  </Link>
                </td>
                {visualizacao === "mes"
                  ? l.meses.map((m) => (
                      <td key={m.mes} style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
                          {m.dias.map((d) => (
                            <span
                              key={d.data}
                              title={`${d.data}${d.gerada ? " — OS já gerada" : " — ainda não gerada"}`}
                              className={`badge ${d.gerada ? "badge--status-concluida" : "badge--status-programada"}`}
                              style={{ padding: "2px 6px", minWidth: "22px", justifyContent: "center" }}
                            >
                              {diaDoMes(d.data)}
                            </span>
                          ))}
                        </div>
                      </td>
                    ))
                  : agruparPorSemana(l, totalSemanas).map((dias, i) => (
                      <td key={i} style={{ textAlign: "center", padding: "4px 2px" }}>
                        <div style={{ display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
                          {dias.map((d) => (
                            <span
                              key={d.data}
                              title={`Semana ${i + 1} — ${formatarDataCurta(d.data)}${d.gerada ? " — OS já gerada" : " — ainda não gerada"}`}
                              className={`badge ${d.gerada ? "badge--status-concluida" : "badge--status-programada"}`}
                              style={{ padding: "2px 6px", minWidth: "22px", justifyContent: "center", fontWeight: 700 }}
                            >
                              {i + 1}
                            </span>
                          ))}
                        </div>
                      </td>
                    ))}
                <td className="mono" style={{ textAlign: "center" }}>
                  {l.total_ano}
                </td>
              </tr>
            ))}
            {linhas?.length === 0 && (
              <tr>
                <td colSpan={visualizacao === "mes" ? 15 : totalSemanas + 3} className="empty-state">
                  Nenhum plano ativo com ocorrências previstas em {ano} para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
