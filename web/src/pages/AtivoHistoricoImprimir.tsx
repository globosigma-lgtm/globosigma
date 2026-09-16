import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { AtivoDetalhe as AtivoDetalheType, CausaFalha, OrdemServico } from "../types";
import { ROTULO_CAUSA_FALHA } from "../types";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { ROTULO_STATUS_OS } from "./OrdensServico";
import { agoraSistemaFormatado } from "../lib/horarioSistema";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataDeReferencia(o: OrdemServico): string {
  return o.data_conclusao ?? o.data_programada;
}

export function AtivoHistoricoImprimir() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const status = params.get("status") ?? "";
  const tipo = params.get("tipo") ?? "";

  const [ativo, setAtivo] = useState<AtivoDetalheType | null>(null);
  const [ordens, setOrdens] = useState<OrdemServico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ ativoId: String(id) });
    if (status) query.set("status", status);
    if (tipo) query.set("tipo", tipo);
    Promise.all([
      api.get<{ ativo: AtivoDetalheType }>(`/ativos/${id}`),
      api.get<{ ordens: OrdemServico[] }>(`/ordens-servico?${query.toString()}`),
    ])
      .then(([ativoR, ordensR]) => {
        setAtivo(ativoR.ativo);
        setOrdens([...ordensR.ordens].sort((a, b) => dataDeReferencia(b).localeCompare(dataDeReferencia(a))));
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o histórico de manutenções."));
  }, [id, status, tipo]);

  if (erro) return <div style={{ padding: 24 }}>{erro}</div>;
  if (!ativo || !ordens) return <div style={{ padding: 24 }}>Carregando…</div>;

  const concluidas = ordens.filter((o) => o.status === "concluida");
  const horasTotais = concluidas.reduce((soma, o) => soma + (o.horas_reais ?? 0), 0);
  const custoTotal = concluidas.reduce((soma, o) => soma + (o.custo_mao_obra ?? 0) + (o.custo_pecas ?? 0), 0);
  const partes = ativo.caminho.split(" › ");
  const equipamento = partes[partes.length - 1];
  const setor = partes.slice(0, -1).join(" › ");

  return (
    <div className="hist-print">
      <style>{`
        .hist-print {
          max-width: 1000px;
          margin: 0 auto;
          padding: 24px;
          font-family: Arial, Helvetica, sans-serif;
          color: #111;
          background: #fff;
        }
        .hist-print__toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px; }
        .hist-print__toolbar button {
          padding: 8px 16px; font-size: 14px; border-radius: 6px; border: 1px solid #111; background: #fff; cursor: pointer;
        }
        .hist-print__toolbar button:hover { background: #f0f0f0; }
        .hist-print__header {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px;
        }
        .hist-print__header .titulo { display: flex; align-items: center; gap: 12px; }
        .hist-print__header .titulo img { height: 48px; width: auto; }
        .hist-print__header h1 { font-size: 22px; margin: 0; }
        .hist-print__header .sub { font-size: 13px; color: #444; margin-top: 4px; }
        .hist-print__header .sub .equipamento { display: block; font-size: 16px; font-weight: 700; color: #111; margin-top: 2px; }
        .hist-print__header .meta { text-align: right; font-size: 13px; flex-shrink: 0; white-space: nowrap; }
        .hist-print h2 {
          font-size: 14px; text-transform: uppercase; letter-spacing: 0.03em;
          border-bottom: 1px solid #999; padding-bottom: 4px; margin: 20px 0 10px;
        }
        .hist-print__resumo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 8px; }
        .hist-print__resumo .item { border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; }
        .hist-print__resumo .item label { display: block; color: #555; font-size: 11px; text-transform: uppercase; }
        .hist-print__resumo .item span { display: block; font-size: 18px; font-weight: 700; margin-top: 2px; }
        table.hist-print__tabela { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
        table.hist-print__tabela th, table.hist-print__tabela td {
          border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top;
        }
        table.hist-print__tabela th { background: #eee; }
        .hist-print__linha-vazia { color: #999; }
        .hist-print__rodape { margin-top: 32px; font-size: 10px; color: #777; text-align: right; }
        @media print {
          .no-print { display: none; }
          .hist-print { padding: 0; max-width: none; }
          @page { margin: 14mm; size: landscape; }
        }
      `}</style>

      <div className="hist-print__toolbar no-print">
        <button type="button" onClick={() => window.print()}>
          Imprimir / Salvar como PDF
        </button>
      </div>

      <div className="hist-print__header">
        <div className="titulo">
          <img src="/logo-sigma-os.png" alt="" />
          <div>
            <h1>Histórico de manutenções</h1>
            <div className="sub">
              {setor}
              <span className="equipamento">{equipamento}</span>
            </div>
          </div>
        </div>
        <div className="meta">
          <div>
            <strong>{ativo.codigo}</strong>
          </div>
          <div>{ordens.length} ordem(ns) de serviço</div>
        </div>
      </div>

      <div className="hist-print__resumo">
        <div className="item">
          <label>OS concluídas</label>
          <span>{concluidas.length}</span>
        </div>
        <div className="item">
          <label>Horas reais acumuladas</label>
          <span>{horasTotais.toFixed(1)}h</span>
        </div>
        <div className="item">
          <label>Custo total (mão de obra + peças)</label>
          <span>{formatarMoeda(custoTotal)}</span>
        </div>
      </div>

      <h2>Ordens de serviço</h2>
      <table className="hist-print__tabela">
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
              <tr key={o.id}>
                <td>{o.codigo}</td>
                <td>{ROTULO_TIPO_OS[o.tipo]}</td>
                <td>{o.descricao ?? "—"}</td>
                <td>{formatarData(o.data_programada)}</td>
                <td>{formatarData(o.data_conclusao)}</td>
                <td>{ROTULO_STATUS_OS[o.status]}</td>
                <td>{o.causa_falha ? ROTULO_CAUSA_FALHA[o.causa_falha as CausaFalha] : "—"}</td>
                <td>{o.responsavel_nome ?? "—"}</td>
                <td>{o.horas_reais != null ? `${o.horas_reais}h` : "—"}</td>
                <td>{custo != null ? formatarMoeda(custo) : "—"}</td>
              </tr>
            );
          })}
          {ordens.length === 0 && (
            <tr>
              <td colSpan={10} className="hist-print__linha-vazia">
                Nenhuma ordem de serviço registrada para este ativo.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="hist-print__rodape">Impresso em {agoraSistemaFormatado()} (GMT-04:00) — Globosigma</div>
    </div>
  );
}
