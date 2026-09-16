import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, LinhaCalendarioInspecao } from "../types";
import { ROTULO_CLASSE_PERIODICIDADE } from "../components/PlanoInspecaoFormModal";
import { semanaDoAno } from "../lib/semanas";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export function CalendarioInspecao() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [linhas, setLinhas] = useState<LinhaCalendarioInspecao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [ativoId, setAtivoId] = useState("");
  const [classePeriodicidade, setClassePeriodicidade] = useState("");

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
  }, []);

  function carregar() {
    const params = new URLSearchParams({ ano: String(ano) });
    if (ativoId) params.set("ativoId", ativoId);
    if (classePeriodicidade) params.set("classePeriodicidade", classePeriodicidade);
    api
      .get<{ linhas: LinhaCalendarioInspecao[] }>(`/inspecoes/calendario?${params.toString()}`)
      .then((r) => setLinhas(r.linhas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o calendário de inspeções."));
  }

  useEffect(carregar, [ano, ativoId, classePeriodicidade]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  const totalSemanas = semanaDoAno(`${ano}-12-31`);
  const semanas = Array.from({ length: totalSemanas }, (_, i) => i + 1);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Calendário de inspeções</h1>
          <div className="page-header__desc">
            Ocorrências previstas dos planos de inspeção ativos e classificados, por número de semana do ano
          </div>
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
          <label htmlFor="f-classe">Classe de periodicidade</label>
          <select id="f-classe" className="input" value={classePeriodicidade} onChange={(e) => setClassePeriodicidade(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_CLASSE_PERIODICIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
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
              <th>TAG</th>
              {semanas.map((s) => (
                <th key={s} style={{ textAlign: "center", padding: "6px 4px" }}>
                  {s}
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas?.map((l) => {
              const porSemana = new Map(l.semanas.map((s) => [s.semana, s]));
              return (
                <tr key={l.plano_id}>
                  <td>
                    <Link to={`/ativos/${l.ativo_id}`}>{l.ativo_nome}</Link>
                  </td>
                  <td>
                    <span className="mono">{l.tag}</span>
                    {l.classe_periodicidade && (
                      <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
                        {ROTULO_CLASSE_PERIODICIDADE[l.classe_periodicidade]}
                      </div>
                    )}
                  </td>
                  {semanas.map((numeroSemana) => {
                    const ocorrencia = porSemana.get(numeroSemana);
                    return (
                      <td key={numeroSemana} style={{ textAlign: "center", padding: "4px 2px" }}>
                        {ocorrencia && (
                          <span
                            title={`Semana ${numeroSemana}${ocorrencia.gerada ? " — OS já gerada" : " — ainda não gerada"}`}
                            className={`badge ${ocorrencia.gerada ? "badge--status-concluida" : "badge--status-programada"}`}
                            style={{ padding: "2px 6px", minWidth: "18px", justifyContent: "center" }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="mono" style={{ textAlign: "center" }}>
                    {l.total_ano}
                  </td>
                </tr>
              );
            })}
            {linhas?.length === 0 && (
              <tr>
                <td colSpan={totalSemanas + 3} className="empty-state">
                  Nenhum plano de inspeção ativo e classificado com ocorrências previstas em {ano} para os filtros
                  atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
