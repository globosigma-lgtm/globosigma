import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { AssinaturaDigital, OrdemServico, OSPeca, OSTarefa } from "../types";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { ROTULO_STATUS_OS } from "./OrdensServico";
import { AssinaturaStamp } from "../components/AssinaturaStamp";
import { semanaDoAno } from "../lib/semanas";
import { agoraSistemaFormatado } from "../lib/horarioSistema";

const ROTULO_ORIGEM_OS: Record<string, string> = {
  plano_lote: "Geração em lote",
  plano_manual: "Plano (manual)",
  lubrificacao_lote: "Lubrificação (geração em lote)",
  solicitacao: "Solicitação",
  avulsa: "Avulsa",
};

const ROTULO_ORIGEM_PECA: Record<string, string> = {
  plano: "Plano",
  lista_tecnica_ativo: "Lista técnica",
  manual: "Manual",
};

function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return iso.length <= 10 ? d.toLocaleDateString("pt-BR") : d.toLocaleString("pt-BR");
}

export function OrdemServicoImprimir() {
  const { id } = useParams();
  const [os, setOs] = useState<OrdemServico | null>(null);
  const [tarefas, setTarefas] = useState<OSTarefa[] | null>(null);
  const [pecas, setPecas] = useState<OSPeca[] | null>(null);
  const [assinatura, setAssinatura] = useState<AssinaturaDigital | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ os: OrdemServico }>(`/ordens-servico/${id}`),
      api.get<{ tarefas: OSTarefa[] }>(`/ordens-servico/${id}/tarefas`),
      api.get<{ pecas: OSPeca[] }>(`/ordens-servico/${id}/pecas`),
    ])
      .then(([osR, tarefasR, pecasR]) => {
        setOs(osR.os);
        setTarefas(tarefasR.tarefas);
        setPecas(pecasR.pecas);
        if (osR.os.status === "concluida") {
          api
            .get<{ vigente: AssinaturaDigital | null }>(`/ordens-servico/${id}/assinatura`)
            .then((r) => setAssinatura(r.vigente))
            .catch(() => setAssinatura(null));
        }
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a ordem de serviço."));
  }, [id]);

  if (erro) return <div style={{ padding: 24 }}>{erro}</div>;
  if (!os || !tarefas || !pecas) return <div style={{ padding: 24 }}>Carregando…</div>;

  return (
    <div className="os-print">
      <style>{`
        .os-print {
          max-width: 800px;
          margin: 0 auto;
          padding: 24px;
          font-family: Arial, Helvetica, sans-serif;
          color: #111;
          background: #fff;
        }
        .os-print__toolbar {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-bottom: 16px;
        }
        .os-print__toolbar button {
          padding: 8px 16px;
          font-size: 14px;
          border-radius: 6px;
          border: 1px solid #111;
          background: #fff;
          cursor: pointer;
        }
        .os-print__toolbar button:hover { background: #f0f0f0; }
        .os-print__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #111;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .os-print__header .titulo { display: flex; align-items: center; gap: 12px; }
        .os-print__header .titulo img { height: 48px; width: auto; }
        .os-print__header h1 { font-size: 22px; margin: 0; }
        .os-print__header .sub { font-size: 13px; color: #444; margin-top: 4px; }
        .os-print__header .sub .equipamento { display: block; font-size: 16px; font-weight: 700; color: #111; margin-top: 2px; }
        .os-print__header .meta { text-align: right; font-size: 13px; flex-shrink: 0; white-space: nowrap; }
        .os-print h2 {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          border-bottom: 1px solid #999;
          padding-bottom: 4px;
          margin: 20px 0 10px;
        }
        .os-print__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 24px;
          font-size: 13px;
        }
        .os-print__grid .campo label { display: block; color: #555; font-size: 11px; text-transform: uppercase; }
        .os-print__grid .campo span { display: block; font-size: 13px; }
        .os-print__bloco { font-size: 13px; margin-top: 8px; }
        .os-print__bloco label { display: block; color: #555; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
        table.os-print__tabela { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
        table.os-print__tabela th, table.os-print__tabela td {
          border: 1px solid #999;
          padding: 6px 8px;
          text-align: left;
          vertical-align: top;
        }
        table.os-print__tabela th { background: #eee; }
        .os-print__linha-vazia { color: #999; }
        .os-print__checkbox {
          display: inline-block;
          width: 11px;
          height: 11px;
          border: 1px solid #111;
          margin-right: 4px;
          vertical-align: middle;
        }
        .os-print__assinaturas {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-top: 48px;
        }
        .os-print__assinatura-linha {
          border-top: 1px solid #111;
          padding-top: 6px;
          font-size: 12px;
          text-align: center;
        }
        .os-print__rodape {
          margin-top: 32px;
          font-size: 10px;
          color: #777;
          text-align: right;
        }
        @media print {
          .os-print__toolbar { display: none; }
          .os-print { padding: 0; max-width: none; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="os-print__toolbar no-print">
        <button type="button" onClick={() => window.print()}>
          Imprimir / Salvar como PDF
        </button>
      </div>

      <div className="os-print__header">
        <div className="titulo">
          <img src="/logo-sigma-os.png" alt="" />
          <div>
            <h1>Ordem de Serviço {os.codigo}</h1>
            {(() => {
              const partes = os.ativo_caminho.split(" › ");
              const equipamento = partes[partes.length - 1];
              const setor = partes.slice(0, -1).join(" › ");
              return (
                <div className="sub">
                  {setor}
                  <span className="equipamento">{equipamento}</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="meta">
          <div>
            <strong>{ROTULO_STATUS_OS[os.status]}</strong>
          </div>
          <div>Prioridade: {ROTULO_CRITICIDADE[os.prioridade]}</div>
        </div>
      </div>

      <h2>Dados gerais</h2>
      <div className="os-print__grid">
        <div className="campo">
          <label>Tipo</label>
          <span>{ROTULO_TIPO_OS[os.tipo]}</span>
        </div>
        <div className="campo">
          <label>Origem</label>
          <span>{ROTULO_ORIGEM_OS[os.origem] ?? os.origem}</span>
        </div>
        {os.solicitacao_origem === "globopac" && (
          <>
            <div className="campo">
              <label>Solicitante (GloboPac)</label>
              <span>{os.solicitacao_solicitante_externo_nome ?? "—"}</span>
            </div>
            <div className="campo">
              <label>Solicitação criada em</label>
              <span>{formatarDataHora(os.solicitacao_criada_em)}</span>
            </div>
          </>
        )}
        <div className="campo">
          <label>Plano de origem</label>
          <span>{os.plano_codigo ?? "—"}</span>
        </div>
        <div className="campo">
          <label>Responsável</label>
          <span>{os.responsavel_nome ?? "—"}</span>
        </div>
        <div className="campo">
          <label>Data programada</label>
          <span>{formatarDataHora(os.data_programada)}</span>
        </div>
        <div className="campo">
          <label>Semana</label>
          <span>{`Semana ${semanaDoAno(os.data_programada)}/${os.data_programada.slice(0, 4)}`}</span>
        </div>
        <div className="campo">
          <label>Data limite</label>
          <span>{formatarDataHora(os.data_limite)}</span>
        </div>
        <div className="campo">
          <label>Horas estimadas</label>
          <span>{os.horas_estimadas}h</span>
        </div>
        <div className="campo">
          <label>Exige parada de linha</label>
          <span>{os.exige_parada_linha ? "Sim" : "Não"}</span>
        </div>
      </div>
      {os.descricao && (
        <div className="os-print__bloco">
          <label>Descrição</label>
          <span>{os.descricao}</span>
        </div>
      )}

      <h2>Execução (preencher no local)</h2>
      <div className="os-print__grid">
        <div className="campo">
          <label>Data</label>
          <span className="os-print__linha-vazia">____/____/______</span>
        </div>
        <div className="campo">
          <label>Hora de início</label>
          <span className="os-print__linha-vazia">_______:_______</span>
        </div>
        <div className="campo">
          <label>Hora de término</label>
          <span className="os-print__linha-vazia">_______:_______</span>
        </div>
      </div>

      <h2>Checklist</h2>
      <table className="os-print__tabela">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>Item</th>
            <th style={{ width: 170 }}>Resposta</th>
          </tr>
        </thead>
        <tbody>
          {tarefas.map((t) => (
            <tr key={t.id}>
              <td>{t.ordem}</td>
              <td>
                {t.descricao}
                {t.obrigatoria === 1 && " *"}
              </td>
              <td>
                {t.tipo_resposta === "ok_nok" ? (
                  <span>
                    <span className="os-print__checkbox" /> OK &nbsp;&nbsp;
                    <span className="os-print__checkbox" /> NOK
                  </span>
                ) : t.tipo_resposta === "numerico" ? (
                  <span>
                    _______ {t.unidade ?? ""}
                    {(t.valor_min != null || t.valor_max != null) && (
                      <div style={{ fontSize: 10, color: "#777" }}>
                        faixa: {t.valor_min ?? "—"} a {t.valor_max ?? "—"}
                      </div>
                    )}
                  </span>
                ) : (
                  <span className="os-print__linha-vazia">_____________________</span>
                )}
              </td>
            </tr>
          ))}
          {tarefas.length === 0 && (
            <tr>
              <td colSpan={3} className="os-print__linha-vazia">
                Nenhum item de checklist para esta OS.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Peças previstas</h2>
      <table className="os-print__tabela">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descrição</th>
            <th style={{ width: 70 }}>Prevista</th>
            <th style={{ width: 90 }}>Consumida</th>
            <th style={{ width: 90 }}>Origem</th>
          </tr>
        </thead>
        <tbody>
          {pecas.map((p) => (
            <tr key={p.id}>
              <td>{p.codigo}</td>
              <td>
                {p.descricao}
                {p.obrigatoria === 1 && " *"}
              </td>
              <td>
                {p.quantidade_prevista} {p.unidade_medida}
              </td>
              <td className="os-print__linha-vazia">_______</td>
              <td>{ROTULO_ORIGEM_PECA[p.origem] ?? p.origem}</td>
            </tr>
          ))}
          {pecas.length === 0 && (
            <tr>
              <td colSpan={5} className="os-print__linha-vazia">
                Nenhuma peça prevista para esta OS.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {os.status === "concluida" && assinatura ? (
        <div style={{ marginTop: "48px", maxWidth: "320px" }}>
          <AssinaturaStamp
            titulo="Assinatura Eletrônica da Conclusão"
            nome={assinatura.criado_por_nome ?? "Usuário do sistema"}
            dataHora={assinatura.criado_em}
            hash={assinatura.hash_sha256}
          />
        </div>
      ) : (
        <div className="os-print__assinaturas">
          <div className="os-print__assinatura-linha">Técnico responsável — Data: ____/____/______</div>
          <div className="os-print__assinatura-linha">Supervisor — Data: ____/____/______</div>
        </div>
      )}

      <div className="os-print__rodape">Impresso em {agoraSistemaFormatado()} (GMT-04:00) — Globosigma</div>
    </div>
  );
}
