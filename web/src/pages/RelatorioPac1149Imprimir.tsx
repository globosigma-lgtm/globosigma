import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { RelatorioPac } from "../types";
import { agoraSistemaFormatado } from "../lib/horarioSistema";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function RelatorioPac1149Imprimir() {
  const [params] = useSearchParams();
  const ano = Number(params.get("ano")) || new Date().getFullYear();
  const semanaInicio = Number(params.get("semanaInicio")) || 1;
  const semanaFim = Number(params.get("semanaFim")) || semanaInicio;
  const setor = params.get("setor") ?? "";
  const ativoId = params.get("ativoId") ?? "";

  const [relatorio, setRelatorio] = useState<RelatorioPac | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ ano: String(ano), semanaInicio: String(semanaInicio), semanaFim: String(semanaFim) });
    if (setor) query.set("setor", setor);
    if (ativoId) query.set("ativoId", ativoId);
    api
      .get<RelatorioPac>(`/relatorios/pac-1149?${query.toString()}`)
      .then(setRelatorio)
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível gerar o relatório."));
  }, [ano, semanaInicio, semanaFim, setor, ativoId]);

  if (erro) return <div style={{ padding: 24 }}>{erro}</div>;
  if (!relatorio) return <div style={{ padding: 24 }}>Carregando…</div>;

  return (
    <div className="pac-print">
      <style>{`
        .pac-print { max-width: 1100px; margin: 0 auto; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
        .pac-print__toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px; }
        .pac-print__toolbar button { padding: 8px 16px; font-size: 14px; border-radius: 6px; border: 1px solid #111; background: #fff; cursor: pointer; }
        .pac-print__toolbar button:hover { background: #f0f0f0; }
        .pac-print__header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
        .pac-print__header .titulo { display: flex; align-items: center; gap: 12px; }
        .pac-print__header .titulo img { height: 48px; width: auto; }
        .pac-print__header h1 { font-size: 20px; margin: 0; }
        .pac-print__header .sub { font-size: 13px; color: #444; margin-top: 4px; }
        .pac-print__header .meta { text-align: right; font-size: 12px; flex-shrink: 0; }
        .pac-print__header .meta .codigo { font-size: 15px; font-weight: 700; border: 1px solid #111; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 4px; }
        .pac-print__secao { margin-top: 24px; page-break-inside: avoid; }
        .pac-print__secao h2 { font-size: 15px; background: #eee; padding: 6px 10px; margin: 0 0 8px; border-left: 4px solid #111; }
        .pac-print__secao .origem { font-size: 12px; color: #555; margin-bottom: 8px; }
        table.pac-print__tabela { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 6px; }
        table.pac-print__tabela th, table.pac-print__tabela td { border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top; }
        table.pac-print__tabela th { background: #f5f5f5; }
        .pac-print__checklist { list-style: none; margin: 0; padding: 0; }
        .pac-print__checklist li { margin-bottom: 2px; }
        .pac-print__conforme { color: #1a7a1a; font-weight: 600; }
        .pac-print__nao-conforme { color: #b30000; font-weight: 600; }
        .pac-print__pendente { color: #999; }
        .pac-print__nao-realizada { color: #999; font-weight: 700; }
        .pac-print__reprogramada { color: #a35a00; font-weight: 700; }
        .pac-print__rodape { margin-top: 32px; font-size: 10px; color: #777; text-align: right; }
        .pac-print__vazio { color: #999; padding: 24px; text-align: center; }
        @media print {
          .no-print { display: none; }
          .pac-print { padding: 0; max-width: none; }
          @page { margin: 12mm; size: landscape; }
        }
      `}</style>

      <div className="pac-print__toolbar no-print">
        <button type="button" onClick={() => window.print()}>
          Imprimir / Salvar como PDF
        </button>
      </div>

      <div className="pac-print__header">
        <div className="titulo">
          <img src="/logo-sigma-os.png" alt="" />
          <div>
            <h1>Relatório semanal de lubrificação — pontos executados via OS</h1>
            <div className="sub">
              Semana {relatorio.semana_inicio} a {relatorio.semana_fim} de {relatorio.ano} ({formatarData(relatorio.data_inicio)} a{" "}
              {formatarData(relatorio.data_fim)})
              {setor ? ` · Setor: ${setor}` : ""}
            </div>
          </div>
        </div>
        <div className="meta">
          <div className="codigo">{relatorio.codigo_documento}</div>
          <div>Emitido em {formatarData(relatorio.data_emissao)}</div>
        </div>
      </div>

      {relatorio.secoes.length === 0 && <div className="pac-print__vazio">Nenhum ponto de lubrificação encontrado para os filtros informados.</div>}

      {relatorio.secoes.map((secao, i) => (
        <div className="pac-print__secao" key={`${secao.ativo_id}-${secao.origem_codigo}-${i}`}>
          <h2>
            {secao.ativo_nome} <span style={{ fontWeight: 400 }}>({secao.ativo_codigo})</span>
          </h2>
          <div className="origem">
            Setor: {secao.setor} · Ponto: <strong>{secao.origem_codigo}</strong> — {secao.origem_descricao}
          </div>
          <table className="pac-print__tabela">
            <thead>
              <tr>
                <th style={{ width: "90px" }}>Data prevista</th>
                <th style={{ width: "90px" }}>Tipo</th>
                <th style={{ width: "90px" }}>Data execução</th>
                <th style={{ width: "80px" }}>OS</th>
                <th>Situação / Checklist (parâmetro — regime — resultado)</th>
              </tr>
            </thead>
            <tbody>
              {secao.execucoes.map((ex, j) => (
                <tr key={j}>
                  <td>{formatarData(ex.data_prevista)}</td>
                  <td>{ex.tipo ?? "—"}</td>
                  <td>{formatarData(ex.data_execucao)}</td>
                  <td>{ex.os_codigo ?? "—"}</td>
                  <td>
                    {ex.situacao === "nao_realizada" && <span className="pac-print__nao-realizada">--- (não houve manutenção)</span>}
                    {ex.situacao === "reprogramada" && (
                      <span className="pac-print__reprogramada">*** reprogramada — nova data: {formatarData(ex.nova_data)}</span>
                    )}
                    {ex.situacao === "normal" && (
                      <ul className="pac-print__checklist">
                        {ex.checklist.length === 0 && <li>Sem itens de checklist registrados.</li>}
                        {ex.checklist.map((item, k) => (
                          <li key={k}>
                            {item.descricao} {item.regime ? `(${item.regime})` : ""} —{" "}
                            <span
                              className={
                                item.resposta === "Conforme"
                                  ? "pac-print__conforme"
                                  : item.resposta === "Não Conforme"
                                    ? "pac-print__nao-conforme"
                                    : "pac-print__pendente"
                              }
                            >
                              {item.resposta === "Conforme" ? "C" : item.resposta === "Não Conforme" ? "NC" : item.resposta}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="pac-print__rodape">
        Legenda: C = Conforme · NC = Não Conforme · MP = Máquina parada · MF = Máquina funcionando · --- = não houve manutenção · *** = manutenção
        reprogramada
        <br />
        Impresso em {agoraSistemaFormatado()} (GMT-04:00) — Globosigma
      </div>
    </div>
  );
}
