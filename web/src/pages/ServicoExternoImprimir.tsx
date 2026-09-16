import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Fornecedor, ServicoExterno } from "../types";
import { ROTULO_STATUS_LOGISTICO_SERVICO_EXTERNO, ROTULO_TIPO_SERVICO_EXTERNO } from "../types";
import { agoraSistemaFormatado } from "../lib/horarioSistema";

function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

function formatarMoeda(valor: number | null): string {
  return valor != null ? `R$ ${valor.toFixed(2)}` : "—";
}

export function ServicoExternoImprimir() {
  const { id } = useParams();
  const [servico, setServico] = useState<ServicoExterno | null>(null);
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ servico: ServicoExterno }>(`/servicos-externos/${id}`)
      .then((r) => {
        setServico(r.servico);
        return api.get<{ fornecedor: Fornecedor }>(`/fornecedores/${r.servico.fornecedor_id}`);
      })
      .then((r) => setFornecedor(r.fornecedor))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o registro de serviço externo."));
  }, [id]);

  if (erro) return <div style={{ padding: 24 }}>{erro}</div>;
  if (!servico) return <div style={{ padding: 24 }}>Carregando…</div>;

  return (
    <div className="se-print">
      <style>{`
        .se-print {
          max-width: 800px;
          margin: 0 auto;
          padding: 24px;
          font-family: Arial, Helvetica, sans-serif;
          color: #111;
          background: #fff;
        }
        .se-print__toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px; }
        .se-print__toolbar button {
          padding: 8px 16px; font-size: 14px; border-radius: 6px; border: 1px solid #111; background: #fff; cursor: pointer;
        }
        .se-print__toolbar button:hover { background: #f0f0f0; }
        .se-print__header {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px;
        }
        .se-print__header .titulo { display: flex; align-items: center; gap: 12px; }
        .se-print__header .titulo img { height: 48px; width: auto; }
        .se-print__header h1 { font-size: 20px; margin: 0; }
        .se-print__header .sub { font-size: 13px; color: #444; margin-top: 4px; }
        .se-print__header .meta { text-align: right; font-size: 13px; flex-shrink: 0; white-space: nowrap; }
        .se-print h2 {
          font-size: 14px; text-transform: uppercase; letter-spacing: 0.03em;
          border-bottom: 1px solid #999; padding-bottom: 4px; margin: 20px 0 10px;
        }
        .se-print__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
        .se-print__grid .campo label { display: block; color: #555; font-size: 11px; text-transform: uppercase; }
        .se-print__grid .campo span { display: block; font-size: 13px; }
        .se-print__bloco { font-size: 13px; margin-top: 8px; }
        .se-print__bloco label { display: block; color: #555; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
        .se-print__assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 56px; }
        .se-print__assinatura-linha { border-top: 1px solid #111; padding-top: 6px; font-size: 12px; text-align: center; }
        .se-print__rodape { margin-top: 32px; font-size: 10px; color: #777; text-align: right; }
        @media print {
          .se-print__toolbar { display: none; }
          .se-print { padding: 0; max-width: none; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="se-print__toolbar no-print">
        <button type="button" onClick={() => window.print()}>
          Imprimir / Salvar como PDF
        </button>
      </div>

      <div className="se-print__header">
        <div className="titulo">
          <img src="/logo-sigma-os.png" alt="" />
          <div>
            <h1>Comprovante de Saída para Serviço Externo</h1>
            <div className="sub">{servico.codigo} — OS de origem: {servico.os_codigo}</div>
          </div>
        </div>
        <div className="meta">
          <div>
            <strong>{ROTULO_STATUS_LOGISTICO_SERVICO_EXTERNO[servico.status_logistico]}</strong>
          </div>
          <div>Registrado por: {servico.responsavel_nome}</div>
        </div>
      </div>

      <h2>Item enviado</h2>
      <div className="se-print__grid">
        <div className="campo">
          <label>Descrição</label>
          <span>{servico.descricao_item}</span>
        </div>
        <div className="campo">
          <label>{servico.item_ativo_tipo === "componente" ? "Componente de ativo" : "Ativo enviado"}</label>
          <span>
            {servico.item_ativo_codigo
              ? `${servico.item_ativo_codigo} — ${servico.item_ativo_tipo === "componente" ? servico.item_ativo_pai_nome : servico.item_ativo_nome}`
              : servico.peca_id
                ? `${servico.peca_codigo} — ${servico.peca_descricao} (registro anterior a esta mudança)`
                : "—"}
          </span>
        </div>
        <div className="campo">
          <label>Ativo de origem</label>
          <span>
            {servico.ativo_codigo} — {servico.ativo_nome}
          </span>
        </div>
        <div className="campo">
          <label>Quantidade</label>
          <span>
            {servico.quantidade} {servico.unidade_medida ?? ""}
          </span>
        </div>
        <div className="campo">
          <label>Tipo de serviço</label>
          <span>{ROTULO_TIPO_SERVICO_EXTERNO[servico.tipo_servico]}</span>
        </div>
        <div className="campo">
          <label>Valor orçado</label>
          <span>{formatarMoeda(servico.valor_orcado)}</span>
        </div>
      </div>
      {servico.motivo && (
        <div className="se-print__bloco">
          <label>Motivo / o que foi constatado</label>
          <span>{servico.motivo}</span>
        </div>
      )}

      <h2>Fornecedor / prestador do serviço</h2>
      <div className="se-print__grid">
        <div className="campo">
          <label>Nome</label>
          <span>{fornecedor?.nome ?? servico.fornecedor_nome}</span>
        </div>
        <div className="campo">
          <label>CNPJ</label>
          <span>{fornecedor?.cnpj ?? "—"}</span>
        </div>
        <div className="campo">
          <label>Contato</label>
          <span>{fornecedor?.contato ?? "—"}</span>
        </div>
        <div className="campo">
          <label>Telefone</label>
          <span>{fornecedor?.telefone ?? "—"}</span>
        </div>
      </div>

      <h2>Datas e documento</h2>
      <div className="se-print__grid">
        <div className="campo">
          <label>Registrado em</label>
          <span>{formatarDataHora(servico.criado_em)}</span>
        </div>
        <div className="campo">
          <label>Data de saída</label>
          <span>{servico.data_envio ? formatarDataHora(servico.data_envio) : "____/____/______ às ____:____"}</span>
        </div>
        <div className="campo">
          <label>Previsão de retorno</label>
          <span>{servico.data_previsao_retorno ?? "—"}</span>
        </div>
        <div className="campo">
          <label>Documento de saída</label>
          <span>{servico.documento_saida ?? "—"}</span>
        </div>
      </div>

      <div className="se-print__assinaturas">
        <div className="se-print__assinatura-linha">Retirado por (nome / documento)</div>
        <div className="se-print__assinatura-linha">Recebido por {fornecedor?.nome ?? servico.fornecedor_nome}</div>
      </div>

      <div className="se-print__rodape">Impresso em {agoraSistemaFormatado()} (GMT-04:00) — Globosigma</div>
    </div>
  );
}
