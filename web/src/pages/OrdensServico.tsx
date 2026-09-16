import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AtivoComArvore, EquipeSimples, OrdemServico, StatusOS, UsuarioSimples } from "../types";
import { ROTULO_TIPO_OS, OSFormModal } from "../components/OSFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { exportarCSV } from "../lib/csv";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";
import { decodificarAtribuicao } from "../lib/atribuicaoOS";

export const ROTULO_STATUS_OS: Record<StatusOS, string> = {
  programada: "Programada",
  aberta: "Aberta",
  em_execucao: "Em execução",
  aguardando_peca: "Aguardando peça",
  concluida: "Concluída",
  atrasada: "Atrasada",
  cancelada: "Cancelada",
};

// NOVO-06: só esses papéis decidem a carga de trabalho de terceiros de uma vez; a permissão
// "editar" de ordens_servico sozinha não distingue esses cargos de um Planejador ou Técnico.
const PERFIS_ATRIBUICAO_LOTE = ["Administrador", "Coordenador de PCM", "Supervisor de manutenção"];

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

function osElegivelParaLote(o: OrdemServico): boolean {
  return o.status !== "concluida" && o.status !== "cancelada";
}

export function OrdensServico() {
  const { pode, usuario } = useAuth();
  const navigate = useNavigate();
  const [ordens, setOrdens] = useState<OrdemServico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [ativoId, setAtivoId] = useState("");
  const [texto, setTexto] = useState("");
  const [somenteMinhas, setSomenteMinhas] = useState(false);
  const [reprogramadaFiltro, setReprogramadaFiltro] = useState("");
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [modalAberto, setModalAberto] = useState(false);

  const podeAtribuirLote = !!usuario && PERFIS_ATRIBUICAO_LOTE.includes(usuario.perfil_nome);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [usuariosSimples, setUsuariosSimples] = useState<UsuarioSimples[]>([]);
  const [equipesSimples, setEquipesSimples] = useState<EquipeSimples[]>([]);
  const [atribuicaoLote, setAtribuicaoLote] = useState("");
  const [atribuindo, setAtribuindo] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [sucessoLote, setSucessoLote] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
  }, []);

  useEffect(() => {
    if (podeAtribuirLote) {
      api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuariosSimples(r.usuarios));
      api.get<{ equipes: EquipeSimples[] }>("/equipes/simples").then((r) => setEquipesSimples(r.equipes));
    }
  }, [podeAtribuirLote]);

  function carregar() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (tipo) params.set("tipo", tipo);
    if (ativoId) params.set("ativoId", ativoId);
    if (texto) params.set("texto", texto);
    if (somenteMinhas) params.set("minhas", "true");
    if (reprogramadaFiltro) params.set("reprogramada", reprogramadaFiltro);
    api
      .get<{ ordens: OrdemServico[] }>(`/ordens-servico?${params.toString()}`)
      .then((r) => setOrdens(r.ordens))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as ordens de serviço."));
  }

  useEffect(carregar, [status, tipo, ativoId, texto, somenteMinhas, reprogramadaFiltro]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);
  useEffect(() => {
    setSelecionadas(new Set());
    setSucessoLote(null);
  }, [status, tipo, ativoId, texto, somenteMinhas, reprogramadaFiltro]);

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
    if (!atribuicaoLote || selecionadas.size === 0) return;
    setAtribuindo(true);
    setErroLote(null);
    setSucessoLote(null);
    try {
      const { responsavel_id, equipe_id } = atribuicaoLote === "remover" ? { responsavel_id: null, equipe_id: null } : decodificarAtribuicao(atribuicaoLote);
      const resultado = await api.post<{ atualizadas: number; falhas: { id: number; codigo: string | null; erro: string }[] }>(
        "/ordens-servico/atribuir-lote",
        { ids: [...selecionadas], responsavel_id, equipe_id }
      );
      const nomeAlvo =
        atribuicaoLote === "remover"
          ? "sem responsável"
          : equipe_id != null
            ? `equipe ${equipesSimples.find((eq) => eq.id === equipe_id)?.nome ?? ""}`
            : usuariosSimples.find((u) => u.id === responsavel_id)?.nome ?? "";
      let mensagem = `${resultado.atualizadas} OS atribuída(s) a ${nomeAlvo}.`;
      if (resultado.falhas.length > 0) {
        mensagem += ` ${resultado.falhas.length} não puderam ser alteradas: ${resultado.falhas.map((f) => f.codigo ?? `#${f.id}`).join(", ")}.`;
      }
      setSucessoLote(mensagem);
      setSelecionadas(new Set());
      setAtribuicaoLote("");
      carregar();
    } catch (e) {
      setErroLote(e instanceof ApiError ? e.message : "Não foi possível atribuir as OS selecionadas.");
    } finally {
      setAtribuindo(false);
    }
  }

  function aoSalvar(os: OrdemServico) {
    setModalAberto(false);
    navigate(`/ordens-servico/${os.id}`);
  }

  function exportar() {
    if (!ordens) return;
    exportarCSV(
      "ordens-de-servico",
      [
        { titulo: "Código", valor: (o: OrdemServico) => o.codigo },
        { titulo: "Ativo", valor: (o: OrdemServico) => o.ativo_nome },
        { titulo: "Tipo", valor: (o: OrdemServico) => ROTULO_TIPO_OS[o.tipo] },
        { titulo: "Descrição", valor: (o: OrdemServico) => o.descricao },
        { titulo: "Programada", valor: (o: OrdemServico) => o.data_programada },
        { titulo: "Limite", valor: (o: OrdemServico) => o.data_limite },
        { titulo: "Prioridade", valor: (o: OrdemServico) => ROTULO_CRITICIDADE[o.prioridade] },
        { titulo: "Responsável", valor: (o: OrdemServico) => o.responsavel_nome ?? (o.equipe_nome ? `Equipe: ${o.equipe_nome}` : null) },
        { titulo: "Status", valor: (o: OrdemServico) => ROTULO_STATUS_OS[o.status] },
      ],
      ordens
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ordens de serviço</h1>
          <div className="page-header__desc">Acompanhamento e execução das OS preventivas, corretivas e avulsas</div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn--secondary" disabled={!ordens?.length} onClick={exportar}>
            Exportar CSV
          </button>
          {pode("ordens_servico", "criar") && (
            <button type="button" className="btn btn--primary" onClick={() => setModalAberto(true)}>
              Nova OS avulsa
            </button>
          )}
        </div>
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
        <div className="field">
          <label htmlFor="f-reprogramada">Reprogramada</label>
          <select id="f-reprogramada" className="input" value={reprogramadaFiltro} onChange={(e) => setReprogramadaFiltro(e.target.value)}>
            <option value="">Todas</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)", paddingBottom: "8px" }}>
          <input type="checkbox" checked={somenteMinhas} onChange={(e) => setSomenteMinhas(e.target.checked)} />
          Somente minhas OS
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

      {podeAtribuirLote && selecionadas.size > 0 && (
        <div className="card row-actions" style={{ marginBottom: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "var(--text-small)" }}>{selecionadas.size} OS selecionada(s)</strong>
          <select
            className="input"
            style={{ maxWidth: "280px" }}
            value={atribuicaoLote}
            onChange={(e) => setAtribuicaoLote(e.target.value)}
          >
            <option value="">Atribuir para…</option>
            <option value="remover">— Remover responsável —</option>
            <optgroup label="Pessoas">
              {usuariosSimples.map((u) => (
                <option key={`pessoa:${u.id}`} value={`pessoa:${u.id}`}>
                  {u.nome} ({u.matricula})
                </option>
              ))}
            </optgroup>
            <optgroup label="Equipes">
              {equipesSimples.map((eq) => (
                <option key={`equipe:${eq.id}`} value={`equipe:${eq.id}`}>
                  {eq.nome}
                </option>
              ))}
            </optgroup>
          </select>
          <button type="button" className="btn btn--primary" disabled={!atribuicaoLote || atribuindo} onClick={aoAtribuirLote}>
            {atribuindo ? "Atribuindo…" : "Atribuir"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setSelecionadas(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table data-table--cards-mobile">
          <thead>
            <tr>
              {podeAtribuirLote && (
                <th style={{ width: "1%" }}>
                  <input
                    type="checkbox"
                    checked={todasSelecionadas}
                    disabled={elegiveis.length === 0}
                    onChange={alternarSelecionarTodas}
                    title="Selecionar todas as OS elegíveis"
                  />
                </th>
              )}
              <th>Código</th>
              <th>Ativo</th>
              <th>Tipo</th>
              <th>Descrição</th>
              <th>Programada</th>
              <th>Limite</th>
              <th>Prioridade</th>
              <th>Responsável</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ordens?.map((o) => (
              <tr key={o.id} onClick={() => navigate(`/ordens-servico/${o.id}`)} style={{ cursor: "pointer" }}>
                {podeAtribuirLote && (
                  <td data-label="Selecionar" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selecionadas.has(o.id)}
                      disabled={!osElegivelParaLote(o)}
                      title={osElegivelParaLote(o) ? undefined : "OS concluída ou cancelada não pode ser reatribuída"}
                      onChange={() => alternarSelecao(o.id)}
                    />
                  </td>
                )}
                <td className="mono data-table__td--principal">
                  {o.codigo}
                  {(o.origem === "plano_lote" || o.origem === "plano_manual") && (
                    <span title="Gerada por plano de manutenção" style={{ marginLeft: "6px" }}>
                      🧰
                    </span>
                  )}
                  {o.origem === "avulsa" && (
                    <span title="OS avulsa" style={{ marginLeft: "6px" }}>
                      📌
                    </span>
                  )}
                  {o.solicitacao_origem === "globopac" && (
                    <span title="Solicitação originada no GloboPac" style={{ marginLeft: "6px" }}>
                      🌐
                    </span>
                  )}
                  {!!o.tem_pecas && (
                    <span title="Possui peças vinculadas" style={{ marginLeft: "6px" }}>
                      🧩
                    </span>
                  )}
                  {!!o.tem_checklist && (
                    <span title="Possui checklist" style={{ marginLeft: "6px" }}>
                      📋
                    </span>
                  )}
                  {!!o.responsavel_nome && (
                    <span title={`Responsável: ${o.responsavel_nome}`} style={{ marginLeft: "6px" }}>
                      🧑‍🔧
                    </span>
                  )}
                  {!o.responsavel_nome && !!o.equipe_nome && (
                    <span title={`Equipe: ${o.equipe_nome}`} style={{ marginLeft: "6px" }}>
                      👷
                    </span>
                  )}
                  {o.reprogramada === 1 && (
                    <span title={`Reprogramada ${o.quantidade_reprogramacoes}x`} style={{ marginLeft: "6px" }}>
                      🔁
                    </span>
                  )}
                </td>
                <td data-label="Ativo">{o.ativo_nome}</td>
                <td data-label="Tipo">{ROTULO_TIPO_OS[o.tipo]}</td>
                <td data-label="Descrição">{o.descricao ?? "—"}</td>
                <td className="mono" data-label="Programada">{formatarData(o.data_programada)}</td>
                <td className="mono" data-label="Limite">{formatarData(o.data_limite)}</td>
                <td data-label="Prioridade">
                  <span className={`badge badge--prioridade-${o.prioridade}`}>{ROTULO_CRITICIDADE[o.prioridade]}</span>
                </td>
                <td data-label="Responsável">{o.responsavel_nome ?? (o.equipe_nome ? `Equipe: ${o.equipe_nome}` : "—")}</td>
                <td data-label="Status">
                  <span className={`badge badge--status-${o.status}`}>
                    <span className="badge__dot" /> {ROTULO_STATUS_OS[o.status]}
                  </span>
                </td>
              </tr>
            ))}
            {ordens?.length === 0 && (
              <tr>
                <td colSpan={podeAtribuirLote ? 10 : 9} className="empty-state">
                  Nenhuma ordem de serviço encontrada com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && <OSFormModal onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}
    </div>
  );
}
