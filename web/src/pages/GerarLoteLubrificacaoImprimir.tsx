import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { ResultadoSimulacaoLubrificacao } from "../types";
import { agoraSistemaFormatado } from "../lib/horarioSistema";

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function GerarLoteLubrificacaoImprimir() {
  const [params] = useSearchParams();
  const ano = Number(params.get("ano")) || new Date().getFullYear();
  const semanaInicio = Number(params.get("semana_inicio")) || 1;
  const semanaFim = Number(params.get("semana_fim")) || 1;
  const ativoId = params.get("ativoId");
  const periodicidade = params.get("periodicidade");
  const texto = params.get("texto");

  const [resultado, setResultado] = useState<ResultadoSimulacaoLubrificacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const filtros: { ativoId?: number; periodicidade?: string; texto?: string } = {};
    if (ativoId) filtros.ativoId = Number(ativoId);
    if (periodicidade) filtros.periodicidade = periodicidade;
    if (texto) filtros.texto = texto;
    api
      .post<ResultadoSimulacaoLubrificacao>("/lubrificacao/lotes/simular", { ano, semana_inicio: semanaInicio, semana_fim: semanaFim, filtros })
      .then(setResultado)
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível gerar o relatório."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, semanaInicio, semanaFim, ativoId, periodicidade, texto]);

  if (erro) return <div style={{ padding: 24 }}>{erro}</div>;
  if (!resultado) return <div style={{ padding: 24 }}>Carregando…</div>;

  return (
    <div className="lote-print">
      <style>{`
        .lote-print {
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px;
          font-family: Arial, Helvetica, sans-serif;
          color: #111;
          background: #fff;
        }
        .lote-print__toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px; }
        .lote-print__toolbar button {
          padding: 8px 16px; font-size: 14px; border-radius: 6px; border: 1px solid #111; background: #fff; cursor: pointer;
        }
        .lote-print__toolbar button:hover { background: #f0f0f0; }
        .lote-print__header {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px;
        }
        .lote-print__header .titulo { display: flex; align-items: center; gap: 12px; }
        .lote-print__header .titulo img { height: 48px; width: auto; }
        .lote-print__header h1 { font-size: 22px; margin: 0; }
        .lote-print__header .sub { font-size: 13px; color: #444; margin-top: 4px; }
        .lote-print__header .meta { text-align: right; font-size: 13px; flex-shrink: 0; white-space: nowrap; }
        .lote-print h2 {
          font-size: 14px; text-transform: uppercase; letter-spacing: 0.03em;
          border-bottom: 1px solid #999; padding-bottom: 4px; margin: 20px 0 10px;
        }
        .lote-print__resumo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 8px; }
        .lote-print__resumo .item { border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; }
        .lote-print__resumo .item label { display: block; color: #555; font-size: 11px; text-transform: uppercase; }
        .lote-print__resumo .item span { display: block; font-size: 18px; font-weight: 700; margin-top: 2px; }
        .lote-print__alerta { border: 1px solid #c99; background: #fdf2f2; border-radius: 6px; padding: 10px 12px; font-size: 12px; margin-bottom: 12px; }
        .lote-print__alerta ul { margin: 6px 0 0; padding-left: 18px; }
        table.lote-print__tabela { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
        table.lote-print__tabela th, table.lote-print__tabela td {
          border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top;
        }
        table.lote-print__tabela th { background: #eee; }
        .lote-print__linha-vazia { color: #999; }
        .lote-print__rodape { margin-top: 32px; font-size: 10px; color: #777; text-align: right; }
        @media print {
          .no-print { display: none; }
          .lote-print { padding: 0; max-width: none; }
          @page { margin: 14mm; size: landscape; }
        }
      `}</style>

      <div className="lote-print__toolbar no-print">
        <button type="button" onClick={() => window.print()}>
          Imprimir / Salvar como PDF
        </button>
      </div>

      <div className="lote-print__header">
        <div className="titulo">
          <img src="/logo-sigma-os.png" alt="" />
          <div>
            <h1>Relatório de geração de OS de lubrificação em lote</h1>
            <div className="sub">
              Semana {resultado.semana_inicio === resultado.semana_fim ? resultado.semana_inicio : `${resultado.semana_inicio} a ${resultado.semana_fim}`} de{" "}
              {resultado.ano} ({formatarData(resultado.data_inicio)} a {formatarData(resultado.data_fim)})
            </div>
          </div>
        </div>
        <div className="meta">
          <div>
            <strong>Prévia — nenhuma OS foi criada ainda</strong>
          </div>
          <div>{resultado.ocorrencias.length} ocorrência(s) no período</div>
        </div>
      </div>

      <div className="lote-print__resumo">
        <div className="item">
          <label>Novas OS a gerar</label>
          <span>{resultado.total_novas}</span>
        </div>
        <div className="item">
          <label>Já geradas anteriormente</label>
          <span>{resultado.total_ja_geradas}</span>
        </div>
        <div className="item">
          <label>Alertas de sobrecarga</label>
          <span>{resultado.sobrecargas.length}</span>
        </div>
      </div>

      {resultado.sobrecargas.length > 0 && (
        <div className="lote-print__alerta">
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

      <h2>Ocorrências</h2>
      <table className="lote-print__tabela">
        <thead>
          <tr>
            <th>Ativo</th>
            <th>Ponto de lubrificação</th>
            <th>Material</th>
            <th>Data programada</th>
            <th>Data limite</th>
            <th>Responsável</th>
            <th>Horas</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {resultado.ocorrencias.map((o) => {
            const consolidada = o.pontos.length > 1;
            return (
              <tr key={o.chave_idempotencia}>
                <td>{o.ativo_nome}</td>
                <td>{consolidada ? `${o.pontos.length} pontos: ${o.pontos.map((p) => p.codigo).join(", ")}` : `${o.ponto_codigo} — ${o.ponto_descricao}`}</td>
                <td>
                  {consolidada
                    ? o.pontos.map((p) => p.especificacao).filter(Boolean).join("; ") || "—"
                    : o.pontos[0]?.especificacao ?? "—"}
                </td>
                <td>{formatarData(o.data_ajustada)}</td>
                <td>{formatarData(o.data_limite)}</td>
                <td>{o.responsavel_nome ?? "—"}</td>
                <td>{o.horas_estimadas}h</td>
                <td>{o.ja_gerada ? "Já gerada" : "Nova"}</td>
              </tr>
            );
          })}
          {resultado.ocorrencias.length === 0 && (
            <tr>
              <td colSpan={8} className="lote-print__linha-vazia">
                Nenhuma ocorrência encontrada para o período e filtros informados.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="lote-print__rodape">Impresso em {agoraSistemaFormatado()} (GMT-04:00) — Globosigma</div>
    </div>
  );
}
