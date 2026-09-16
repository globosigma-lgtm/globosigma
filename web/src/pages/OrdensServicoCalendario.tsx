import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { EventClickArg, EventDropArg, EventHoveringArg } from "@fullcalendar/core";
import type { EventDragStartArg } from "@fullcalendar/interaction";
import dayjs from "dayjs";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AtivoComArvore, OrdemServico, StatusOS } from "../types";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { ROTULO_STATUS_OS } from "./OrdensServico";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

const ORIGEM_PLANO = new Set(["plano_lote", "plano_manual"]);
const ROTULO_ORIGEM: Record<string, string> = {
  plano_lote: "Plano de manutenção (lote)",
  plano_manual: "Plano de manutenção (manual)",
  solicitacao: "Solicitação",
  avulsa: "Avulsa",
  lubrificacao_lote: "Lubrificação (lote)",
  inspecao_lote: "Inspeção (lote)",
  inspecao_corretiva: "Corretiva (aberta em inspeção)",
};

/** Cor fixa (roxo da marca) para toda OS de lubrificação, independente do status — nenhum status
 * usa essa cor, então ela funciona como um marcador de categoria sem se confundir com atraso/
 * conclusão/etc. Mesma ideia para inspeção (INS-01), com uma cor própria (laranja escuro) pra não
 * se confundir com a de lubrificação nem com nenhum status. */
const COR_LUBRIFICACAO = "var(--c-primary-500)";
const COR_INSPECAO = "var(--c-alert-800)";
const COR_CORRETIVA_DE_INSPECAO = "var(--c-danger-700)";

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

interface HoverInfo {
  os: OrdemServico;
  top: number;
  left: number;
}

const COR_STATUS: Record<StatusOS, string> = {
  programada: "var(--c-n-500)",
  aberta: "var(--c-n-600)",
  em_execucao: "var(--c-warning-500)",
  aguardando_peca: "var(--c-alert-600)",
  concluida: "var(--c-success-500)",
  atrasada: "var(--c-danger-500)",
  cancelada: "var(--c-n-400)",
};

const STATUS_TRAVADOS: StatusOS[] = ["concluida", "cancelada"];

export function OrdensServicoCalendario() {
  const { pode } = useAuth();
  const navigate = useNavigate();
  const podeReagendar = pode("ordens_servico", "editar_completo");

  const [ordens, setOrdens] = useState<OrdemServico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [ativoId, setAtivoId] = useState("");
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
  }, []);

  useEffect(() => {
    if (!hover) return;
    const fechar = () => setHover(null);
    window.addEventListener("scroll", fechar, true);
    return () => window.removeEventListener("scroll", fechar, true);
  }, [hover]);

  function carregar() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (tipo) params.set("tipo", tipo);
    if (ativoId) params.set("ativoId", ativoId);
    api
      .get<{ ordens: OrdemServico[] }>(`/ordens-servico?${params.toString()}`)
      .then((r) => {
        setOrdens(r.ordens);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as ordens de serviço."));
  }

  useEffect(carregar, [status, tipo, ativoId]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  const eventos = useMemo(
    () =>
      (ordens ?? []).map((o) => {
        const eLubrificacao = o.tipo === "lubrificacao";
        const eInspecaoLote = o.origem === "inspecao_lote";
        const eCorretivaDeInspecao = o.origem === "inspecao_corretiva";
        const cor = eCorretivaDeInspecao
          ? COR_CORRETIVA_DE_INSPECAO
          : eLubrificacao
            ? COR_LUBRIFICACAO
            : eInspecaoLote
              ? COR_INSPECAO
              : COR_STATUS[o.status];
        const classNames = eCorretivaDeInspecao
          ? ["fc-evt-corretiva-inspecao"]
          : ORIGEM_PLANO.has(o.origem)
            ? ["fc-evt-plano"]
            : o.origem === "avulsa"
              ? ["fc-evt-avulsa"]
              : eLubrificacao
                ? ["fc-evt-lubrificacao"]
                : eInspecaoLote
                  ? ["fc-evt-inspecao"]
                  : [];
        // Solicitação vinda do GloboPac só existe em OS de origem "solicitacao", que não entra em
        // nenhum dos ramos acima — por isso o selo é sempre adicionado, nunca substitui outro.
        if (o.solicitacao_origem === "globopac") classNames.push("fc-evt-globopac");
        return {
          id: String(o.id),
          title: o.codigo,
          start: o.data_programada,
          allDay: true,
          backgroundColor: cor,
          borderColor: cor,
          editable: podeReagendar && !STATUS_TRAVADOS.includes(o.status),
          classNames,
          extendedProps: { os: o },
        };
      }),
    [ordens, podeReagendar]
  );

  function aoSoltarEvento(info: EventDropArg) {
    const os: OrdemServico = info.event.extendedProps.os;
    const deltaDias = info.delta.days;
    if (!deltaDias) return;
    const novaProgramada = dayjs(os.data_programada).add(deltaDias, "day").format("YYYY-MM-DD");
    const novaLimite = dayjs(os.data_limite).add(deltaDias, "day").format("YYYY-MM-DD");
    api
      .put<{ os: OrdemServico }>(`/ordens-servico/${os.id}`, {
        prioridade: os.prioridade,
        descricao: os.descricao,
        responsavel_id: os.responsavel_id,
        exige_parada_linha: !!os.exige_parada_linha,
        horas_estimadas: os.horas_estimadas,
        data_programada: novaProgramada,
        data_limite: novaLimite,
      })
      .then(() => {
        setErro(null);
        carregar();
      })
      .catch((e) => {
        info.revert();
        setErro(e instanceof ApiError ? e.message : "Não foi possível reagendar a OS.");
      });
  }

  function aoClicarEvento(info: EventClickArg) {
    navigate(`/ordens-servico/${info.event.id}`);
  }

  function aoEntrarNoEvento(info: EventHoveringArg) {
    const os: OrdemServico = info.event.extendedProps.os;
    const rect = info.el.getBoundingClientRect();
    const largura = 300;
    const left = Math.min(rect.left, window.innerWidth - largura - 12);
    setHover({ os, top: rect.bottom + 6, left: Math.max(12, left) });
  }

  function aoSairDoEvento() {
    setHover(null);
  }

  /**
   * O tooltip de hover é posicionado logo abaixo da OS — se o mouse sair arrastando pra baixo
   * (comum: soltar num dia mais adiante no mesmo mês), ele podia ficar visualmente por cima da
   * célula de destino durante o arraste. Mesmo com pointer-events:none no CSS (que já impede o
   * tooltip de "roubar" o soltar), fechar aqui evita a sobreposição visual confusa durante o
   * arraste.
   */
  function aoComecarArrasto(_info: EventDragStartArg) {
    setHover(null);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Calendário de ordens de serviço</h1>
          <div className="page-header__desc">
            {podeReagendar
              ? "Arraste uma OS para outro dia para reprogramá-la automaticamente"
              : "OS programadas por dia — reprogramar exige permissão de edição completa"}
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_STATUS_OS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-tipo">Tipo</label>
          <select id="f-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_TIPO_OS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
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
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="row-actions" style={{ marginBottom: "12px", fontSize: "var(--text-small)", color: "var(--c-n-600)", flexWrap: "wrap" }}>
        {Object.entries(ROTULO_STATUS_OS).map(([valor, rotulo]) => (
          <span key={valor} className="row-actions" style={{ gap: "6px" }}>
            <span className="badge__dot" style={{ background: COR_STATUS[valor as StatusOS] }} />
            {rotulo}
          </span>
        ))}
        <span className="row-actions" style={{ gap: "6px" }}>
          🧰 Gerada por plano de manutenção
        </span>
        <span className="row-actions" style={{ gap: "6px" }}>
          📌 Avulsa
        </span>
        <span className="row-actions" style={{ gap: "6px" }}>
          <span className="badge__dot" style={{ background: "var(--c-primary-500)" }} />
          🛢️ Lubrificação
        </span>
        <span className="row-actions" style={{ gap: "6px" }}>
          <span className="badge__dot" style={{ background: "var(--c-alert-800)" }} />
          🔍 Inspeção (lote)
        </span>
        <span className="row-actions" style={{ gap: "6px" }}>
          <span className="badge__dot" style={{ background: "var(--c-danger-700)" }} />
          ⚠️ Corretiva aberta em inspeção
        </span>
        <span className="row-actions" style={{ gap: "6px" }}>
          🌐 Solicitação do GloboPac
        </span>
      </div>

      <div className="calendar-os card">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={ptBrLocale}
          height="auto"
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          events={eventos}
          eventDrop={aoSoltarEvento}
          eventClick={aoClicarEvento}
          eventMouseEnter={aoEntrarNoEvento}
          eventMouseLeave={aoSairDoEvento}
          eventDragStart={aoComecarArrasto}
        />
      </div>

      {hover && (
        <div className="card calendar-os-tooltip" style={{ top: hover.top, left: hover.left }}>
          <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <strong className="mono">{hover.os.codigo}</strong>
            <span className={`badge badge--status-${hover.os.status}`}>
              <span className="badge__dot" /> {ROTULO_STATUS_OS[hover.os.status]}
            </span>
          </div>
          <div style={{ fontWeight: 600, marginTop: "6px" }}>{hover.os.ativo_nome}</div>
          <div style={{ color: "var(--c-n-500)", fontSize: "var(--text-caption)" }}>{hover.os.ativo_caminho}</div>

          {hover.os.descricao && <div style={{ marginTop: "8px" }}>{hover.os.descricao}</div>}

          <div className="row-actions" style={{ marginTop: "8px", flexWrap: "wrap" }}>
            <span className={`badge badge--prioridade-${hover.os.prioridade}`}>{ROTULO_CRITICIDADE[hover.os.prioridade]}</span>
            <span className="badge" style={{ background: "var(--c-n-100)", color: "var(--c-n-700)" }}>
              {ROTULO_TIPO_OS[hover.os.tipo]}
            </span>
            {ORIGEM_PLANO.has(hover.os.origem) && (
              <span className="badge" style={{ background: "var(--c-n-100)", color: "var(--c-n-700)" }}>
                🧰 {hover.os.plano_codigo ?? "Plano"}
              </span>
            )}
          </div>

          <div style={{ marginTop: "8px", fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
            <div>Programada: {formatarData(hover.os.data_programada)} · Limite: {formatarData(hover.os.data_limite)}</div>
            <div>Responsável: {hover.os.responsavel_nome ?? "Não atribuído"}</div>
            <div>
              Origem: {ROTULO_ORIGEM[hover.os.origem] ?? hover.os.origem}
              {hover.os.solicitacao_origem === "globopac" && " (GloboPac)"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
