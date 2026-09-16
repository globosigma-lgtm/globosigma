import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { OrdemServico, StatusOS, UsuarioSimples } from "../types";
import { ROTULO_STATUS_OS } from "./OrdensServico";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { InspecaoAvulsaFormModal } from "../components/InspecaoAvulsaFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

// INS-03: mesmo critério do backend (routes/inspecoes.ts) — quem decide a atribuição de inspeções.
const PERFIS_ATRIBUICAO_INSPECAO = ["Administrador", "Coordenador de PCM", "Planejador", "Supervisor de manutenção"];

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

function osElegivelParaLote(o: OrdemServico): boolean {
  return o.status !== "concluida" && o.status !== "cancelada";
}

export function Inspecoes() {
  const { pode, usuario } = useAuth();
  const navigate = useNavigate();
  const [ordens, setOrdens] = useState<OrdemServico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [texto, setTexto] = useState("");
  const [somenteMinhas, setSomenteMinhas] = useState(false);

  const podeAtribuir = !!usuario && PERFIS_ATRIBUICAO_INSPECAO.includes(usuario.perfil_nome);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [inspetores, setInspetores] = useState<UsuarioSimples[]>([]);
  const [responsavelLote, setResponsavelLote] = useState("");
  const [atribuindo, setAtribuindo] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [sucessoLote, setSucessoLote] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  useEffect(() => {
    if (podeAtribuir) {
      api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples?perfil=Inspetor").then((r) => setInspetores(r.usuarios));
    }
  }, [podeAtribuir]);

  function carregar() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (texto) params.set("texto", texto);
    if (somenteMinhas && usuario) params.set("responsavelId", String(usuario.id));
    api
      .get<{ ordens: OrdemServico[] }>(`/inspecoes?${params.toString()}`)
      .then((r) => setOrdens(r.ordens))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as inspeções."));
  }

  useEffect(carregar, [status, texto, somenteMinhas]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);
  useEffect(() => {
    setSelecionadas(new Set());
    setSucessoLote(null);
  }, [status, texto, somenteMinhas]);

  const elegiveis = ordens?.filter(osElegivelParaLote) ?? [];
  const todasSelecionadas = elegiveis.length > 0 && elegiveis.every((o) => selecionadas.has(o.id));

  function alternarSelecao(id: number) {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodas() {
    setSelecionadas(todasSelecionadas ? new Set() : new Set(elegiveis.map((o) => o.id)));
  }

  async function aoAtribuirLote() {
    if (!responsavelLote || selecionadas.size === 0) return;
    setAtribuindo(true);
    setErroLote(null);
    setSucessoLote(null);
    try {
      const resultado = await api.post<{ atualizadas: number; falhas: { id: number; codigo: string | null; erro: string }[] }>(
        "/inspecoes/atribuir-lote",
        {
          ids: [...selecionadas],
          responsavel_id: responsavelLote === "remover" ? null : Number(responsavelLote),
        }
      );
      const nomeInspetor =
        responsavelLote === "remover" ? "sem inspetor" : inspetores.find((u) => u.id === Number(responsavelLote))?.nome ?? "";
      let mensagem = `${resultado.atualizadas} inspeção(ões) atribuída(s) a ${nomeInspetor}.`;
      if (resultado.falhas.length > 0) {
        mensagem += ` ${resultado.falhas.length} não puderam ser alteradas: ${resultado.falhas.map((f) => f.codigo ?? `#${f.id}`).join(", ")}.`;
      }
      setSucessoLote(mensagem);
      setSelecionadas(new Set());
      setResponsavelLote("");
      carregar();
    } catch (e) {
      setErroLote(e instanceof ApiError ? e.message : "Não foi possível atribuir as inspeções selecionadas.");
    } finally {
      setAtribuindo(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inspeções</h1>
          <div className="page-header__desc">Inspeções periódicas de equipamento geradas pelos planos de inspeção</div>
        </div>
        {pode("inspecoes", "criar") && (
          <button type="button" className="btn btn--primary" onClick={() => setModalAberto(true)}>
            Nova inspeção avulsa
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código ou descrição" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
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
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)", paddingBottom: "8px" }}>
          <input type="checkbox" checked={somenteMinhas} onChange={(e) => setSomenteMinhas(e.target.checked)} />
          Somente minhas inspeções
        </label>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      {sucessoLote && (
        <div className="alert alert--success" style={{ marginBottom: "16px" }}>
          {sucessoLote}
        </div>
      )}
      {erroLote && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erroLote}
        </div>
      )}

      {podeAtribuir && selecionadas.size > 0 && (
        <div className="card row-actions" style={{ marginBottom: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "var(--text-small)" }}>{selecionadas.size} inspeção(ões) selecionada(s)</strong>
          <select className="input" style={{ maxWidth: "280px" }} value={responsavelLote} onChange={(e) => setResponsavelLote(e.target.value)}>
            <option value="">Atribuir para…</option>
            <option value="remover">— Remover inspetor —</option>
            {inspetores.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.matricula})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--primary" disabled={!responsavelLote || atribuindo} onClick={aoAtribuirLote}>
            {atribuindo ? "Atribuindo…" : "Atribuir"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setSelecionadas(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {podeAtribuir && (
                <th style={{ width: "1%" }}>
                  <input
                    type="checkbox"
                    checked={todasSelecionadas}
                    disabled={elegiveis.length === 0}
                    onChange={alternarSelecionarTodas}
                    title="Selecionar todas as inspeções elegíveis"
                  />
                </th>
              )}
              <th>Código</th>
              <th>Ativo</th>
              <th>Descrição</th>
              <th>Programada</th>
              <th>Limite</th>
              <th>Prioridade</th>
              <th>Inspetor</th>
              <th>Status</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {ordens?.map((o) => (
              <tr key={o.id} onClick={() => navigate(`/ordens-servico/${o.id}`)} style={{ cursor: "pointer" }}>
                {podeAtribuir && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selecionadas.has(o.id)}
                      disabled={!osElegivelParaLote(o)}
                      title={osElegivelParaLote(o) ? undefined : "Inspeção concluída ou cancelada não pode ser reatribuída"}
                      onChange={() => alternarSelecao(o.id)}
                    />
                  </td>
                )}
                <td className="mono">{o.codigo}</td>
                <td>{o.ativo_nome}</td>
                <td>{o.descricao ?? "—"}</td>
                <td className="mono">{formatarData(o.data_programada)}</td>
                <td className="mono">{formatarData(o.data_limite)}</td>
                <td>
                  <span className={`badge badge--prioridade-${o.prioridade}`}>{ROTULO_CRITICIDADE[o.prioridade]}</span>
                </td>
                <td>{o.responsavel_nome ?? "—"}</td>
                <td>
                  <span className={`badge badge--status-${o.status as StatusOS}`}>
                    <span className="badge__dot" /> {ROTULO_STATUS_OS[o.status]}
                  </span>
                </td>
                <td>
                  {o.resultado_inspecao ? (
                    <span className={`badge badge--resultado-${o.resultado_inspecao}`}>
                      <span className="badge__dot" /> {o.resultado_inspecao === "ok" ? "OK" : o.resultado_inspecao === "atencao" ? "Atenção" : "Crítico"}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {ordens?.length === 0 && (
              <tr>
                <td colSpan={podeAtribuir ? 9 : 8} className="empty-state">
                  Nenhuma inspeção encontrada com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <InspecaoAvulsaFormModal
          onFechar={() => setModalAberto(false)}
          onSalvo={(os) => {
            setModalAberto(false);
            navigate(`/ordens-servico/${os.id}`);
          }}
        />
      )}
    </div>
  );
}
