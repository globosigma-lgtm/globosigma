import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { hojeSistema } from "../lib/horarioSistema";

interface Ocorrencia {
  data_prevista: string;
  data_ajustada: string;
}

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function diaDaSemana(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 + meses, dia));
  return data.toISOString().slice(0, 10);
}

export function OcorrenciasInspecaoTab({ planoId }: { planoId: number }) {
  const [horizonte, setHorizonte] = useState(12);
  const [dados, setDados] = useState<{ tratamento_dia_nao_util: string; ocorrencias: Ocorrencia[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const inicio = hojeSistema();
    const fim = somarMeses(inicio, horizonte);
    api
      .get<{ tratamento_dia_nao_util: string; ocorrencias: Ocorrencia[] }>(
        `/inspecoes/planos/${planoId}/ocorrencias?inicio=${inicio}&fim=${fim}`
      )
      .then(setDados)
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível calcular as ocorrências."));
  }, [planoId, horizonte]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Próximas ocorrências</h2>
          <div className="page-header__desc">
            Calculadas pelo motor de recorrência a partir da classe de periodicidade e semana-base do plano.
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className={`btn ${horizonte === 12 ? "btn--primary" : "btn--secondary"}`} onClick={() => setHorizonte(12)}>
            12 meses
          </button>
          <button type="button" className={`btn ${horizonte === 24 ? "btn--primary" : "btn--secondary"}`} onClick={() => setHorizonte(24)}>
            24 meses
          </button>
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      {dados && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data prevista</th>
                <th>Dia da semana</th>
                {dados.tratamento_dia_nao_util !== "gerar_na_data" && <th>Data ajustada (feriado)</th>}
              </tr>
            </thead>
            <tbody>
              {dados.ocorrencias.map((o) => (
                <tr key={o.data_prevista}>
                  <td className="mono">{formatarData(o.data_prevista)}</td>
                  <td>{diaDaSemana(o.data_prevista)}</td>
                  {dados.tratamento_dia_nao_util !== "gerar_na_data" && (
                    <td className="mono">{o.data_ajustada !== o.data_prevista ? formatarData(o.data_ajustada) : ""}</td>
                  )}
                </tr>
              ))}
              {dados.ocorrencias.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty-state">
                    Nenhuma ocorrência prevista neste período (plano inativo, sem classe de periodicidade, fora de
                    vigência, ou horizonte muito curto).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
