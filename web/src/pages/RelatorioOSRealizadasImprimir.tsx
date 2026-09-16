import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { OSRealizada } from "../types";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { agoraSistemaFormatado } from "../lib/horarioSistema";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [data] = iso.split(" ");
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

const ROTULO_RESULTADO: Record<string, string> = { ok: "OK", atencao: "Atenção", critico: "Crítico" };

export function RelatorioOSRealizadasImprimir() {
  const [params] = useSearchParams();
  const inicio = params.get("inicio") ?? "";
  const fim = params.get("fim") ?? "";
  const tipo = params.get("tipo") ?? "";
  const ativoId = params.get("ativoId") ?? "";
  const responsavelId = params.get("responsavelId") ?? "";

  const [ordens, setOrdens] = useState<OSRealizada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ inicio, fim });
    if (tipo) query.set("tipo", tipo);
    if (ativoId) query.set("ativoId", ativoId);
    if (responsavelId) query.set("responsavelId", responsavelId);
    api
      .get<{ ordens: OSRealizada[] }>(`/relatorios/os-realizadas?${query.toString()}`)
      .then((r) => setOrdens(r.ordens))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível gerar o relatório."));
  }, [inicio, fim, tipo, ativoId, responsavelId]);

  if (erro) return <div style={{ padding: 24 }}>{erro}</div>;
  if (!ordens) return <div style={{ padding: 24 }}>Carregando…</div>;

  return (
    <div className="os-real-print">
      <style>{`
        .os-real-print { max-width: 1100px; margin: 0 auto; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
        .os-real-print__toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px; }
        .os-real-print__toolbar button { padding: 8px 16px; font-size: 14px; border-radius: 6px; border: 1px solid #111; background: #fff; cursor: pointer; }
        .os-real-print__toolbar button:hover { background: #f0f0f0; }
        .os-real-print__header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
        .os-real-print__header .titulo { display: flex; align-items: center; gap: 12px; }
        .os-real-print__header .titulo img { height: 48px; width: auto; }
        .os-real-print__header h1 { font-size: 20px; margin: 0; }
        .os-real-print__header .sub { font-size: 13px; color: #444; margin-top: 4px; }
        .os-real-print__header .meta { text-align: right; font-size: 12px; flex-shrink: 0; }
        .os-real-print__os { margin-top: 20px; page-break-inside: avoid; border: 1px solid #ccc; border-radius: 6px; padding: 12px; }
        .os-real-print__os h2 { font-size: 14px; margin: 0 0 4px; background: none; border: none; padding: 0; }
        .os-real-print__os .info { font-size: 12px; color: #444; margin-bottom: 8px; }
        .os-real-print__os .obs { font-size: 12px; margin-top: 8px; }
        table.os-real-print__tabela { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
        table.os-real-print__tabela th, table.os-real-print__tabela td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
        table.os-real-print__tabela th { background: #f5f5f5; }
        .os-real-print__vazio { color: #999; padding: 24px; text-align: center; }
        .os-real-print__rodape { margin-top: 32px; font-size: 10px; color: #777; text-align: right; }
        @media print {
          .no-print { display: none; }
          .os-real-print { padding: 0; max-width: none; }
          .os-real-print__os { break-inside: avoid; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="os-real-print__toolbar no-print">
        <button type="button" onClick={() => window.print()}>
          Imprimir / Salvar como PDF
        </button>
      </div>

      <div className="os-real-print__header">
        <div className="titulo">
          <img src="/logo-sigma-os.png" alt="" />
          <div>
            <h1>Relatório de OS realizadas</h1>
            <div className="sub">
              {formatarData(inicio)} a {formatarData(fim)}
              {tipo ? ` · Tipo: ${ROTULO_TIPO_OS[tipo as keyof typeof ROTULO_TIPO_OS] ?? tipo}` : ""}
            </div>
          </div>
        </div>
        <div className="meta">
          <div>{ordens.length} OS concluída(s) no período</div>
        </div>
      </div>

      {ordens.length === 0 && <div className="os-real-print__vazio">Nenhuma OS concluída encontrada para os filtros informados.</div>}

      {ordens.map((os) => (
        <div className="os-real-print__os" key={os.id}>
          <h2>
            {os.codigo} — {os.ativo_nome} <span style={{ fontWeight: 400, color: "#555" }}>({ROTULO_TIPO_OS[os.tipo] ?? os.tipo})</span>
          </h2>
          <div className="info">
            {os.ativo_caminho} · Responsável: {os.responsavel_nome ?? "—"} · Concluída em: {formatarData(os.data_conclusao)}
            {os.horas_reais != null ? ` · Horas: ${os.horas_reais}h` : ""}
            {os.resultado_inspecao ? ` · Resultado: ${ROTULO_RESULTADO[os.resultado_inspecao] ?? os.resultado_inspecao}` : ""}
            {os.causa_falha ? ` · Causa da falha: ${os.causa_falha}` : ""}
          </div>

          <table className="os-real-print__tabela">
            <thead>
              <tr>
                <th>Item do checklist</th>
                <th style={{ width: 120 }}>Resposta</th>
              </tr>
            </thead>
            <tbody>
              {os.checklist.map((item, i) => (
                <tr key={i}>
                  <td>
                    {item.descricao}
                    {item.obrigatoria === 1 ? " *" : ""}
                  </td>
                  <td>
                    {item.tipo_resposta === "ok_nok"
                      ? item.resposta === "ok"
                        ? "OK"
                        : item.resposta === "nok"
                          ? "NOK"
                          : "—"
                      : item.tipo_resposta === "numerico"
                        ? `${item.valor_numerico ?? "—"} ${item.unidade ?? ""}`
                        : item.resposta ?? "—"}
                  </td>
                </tr>
              ))}
              {os.checklist.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ color: "#999" }}>
                    Sem itens de checklist registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {os.observacoes_execucao && (
            <div className="obs">
              <strong>Observações:</strong> {os.observacoes_execucao}
            </div>
          )}
        </div>
      ))}

      <div className="os-real-print__rodape">Impresso em {agoraSistemaFormatado()} (GMT-04:00) — Globosigma</div>
    </div>
  );
}
