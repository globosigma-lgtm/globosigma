import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { AlertaReposicao, IndicadoresDashboard, OrdemServico } from "../types";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function formatarNumero(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function Dashboard() {
  const { usuario, pode } = useAuth();
  const [indicadores, setIndicadores] = useState<IndicadoresDashboard | null>(null);
  const [osAtrasadas, setOsAtrasadas] = useState<OrdemServico[] | null>(null);
  const [alertas, setAlertas] = useState<AlertaReposicao[] | null>(null);

  function carregar() {
    if (pode("indicadores", "ver")) {
      api.get<{ indicadores: IndicadoresDashboard }>("/indicadores/dashboard").then((r) => setIndicadores(r.indicadores));
    }
    if (pode("ordens_servico", "ver")) {
      api.get<{ ordens: OrdemServico[] }>("/ordens-servico?status=atrasada").then((r) => setOsAtrasadas(r.ordens.slice(0, 5)));
    }
    if (pode("almoxarifado", "ver")) {
      api.get<{ alertas: AlertaReposicao[] }>("/almoxarifado/alertas").then((r) => setAlertas(r.alertas.slice(0, 5)));
    }
  }

  useEffect(carregar, []);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Olá, {usuario?.nome.split(" ")[0]}</h1>
          <div className="page-header__desc">
            {usuario?.perfil_nome} · {usuario?.setor}
          </div>
        </div>
      </div>

      {pode("indicadores", "ver") && (
        <div className="card-grid">
          <div className="card">
            <div className="stat-card__label">Cumprimento do plano (30d)</div>
            <div className="stat-card__value">
              {indicadores ? (indicadores.cumprimento_plano_pct != null ? `${indicadores.cumprimento_plano_pct}%` : "—") : "…"}
            </div>
            {indicadores && indicadores.cumprimento_plano_pct != null && (
              <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
                {indicadores.preventivas_no_prazo} de {indicadores.preventivas_devidas} preventivas no prazo
              </div>
            )}
          </div>
          <div className="card">
            <div className="stat-card__label">OS abertas</div>
            <div className="stat-card__value">{indicadores ? indicadores.os_abertas : "…"}</div>
          </div>
          <div className="card">
            <div className="stat-card__label">Peças em ruptura prevista</div>
            <div className="stat-card__value">{indicadores ? indicadores.pecas_em_ruptura : "…"}</div>
          </div>
          <div className="card">
            <div className="stat-card__label">Backlog em horas</div>
            <div className="stat-card__value">{indicadores ? formatarNumero(indicadores.backlog_horas) : "…"}</div>
          </div>
        </div>
      )}

      {osAtrasadas && osAtrasadas.length > 0 && (
        <div className="card" style={{ marginTop: "24px" }}>
          <h3 style={{ marginBottom: "12px" }}>OS atrasadas</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Ativo</th>
                  <th>Tipo</th>
                  <th>Limite</th>
                </tr>
              </thead>
              <tbody>
                {osAtrasadas.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">
                      <Link to={`/ordens-servico/${o.id}`}>{o.codigo}</Link>
                    </td>
                    <td>{o.ativo_nome}</td>
                    <td>{ROTULO_TIPO_OS[o.tipo]}</td>
                    <td className="mono">{o.data_limite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alertas && alertas.length > 0 && (
        <div className="card" style={{ marginTop: "24px" }}>
          <h3 style={{ marginBottom: "12px" }}>Alertas de reposição</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Disponível</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">
                      <Link to={`/pecas/${a.id}`}>{a.codigo}</Link>
                    </td>
                    <td>{a.descricao}</td>
                    <td className="mono">
                      {a.estoque_disponivel} {a.unidade_medida}
                    </td>
                    <td>
                      <span className={`badge ${a.nivel === "critico" ? "badge--status-atrasada" : "badge--estoque-baixo"}`}>
                        <span className="badge__dot" /> {a.nivel === "critico" ? "Crítico" : "Atenção"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!pode("indicadores", "ver") && (
        <div className="card empty-state" style={{ marginTop: "24px" }}>
          <h3>Sem indicadores para o seu perfil</h3>
          <p>Seu perfil não tem acesso ao painel de indicadores. Use o menu para acessar os módulos que você utiliza.</p>
        </div>
      )}
    </div>
  );
}
