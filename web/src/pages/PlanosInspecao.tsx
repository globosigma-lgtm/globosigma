import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { PlanoInspecao, UsuarioSimples } from "../types";
import { PlanoInspecaoFormModal, ROTULO_CLASSE_PERIODICIDADE } from "../components/PlanoInspecaoFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export function PlanosInspecao() {
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [planos, setPlanos] = useState<PlanoInspecao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [classePeriodicidade, setClassePeriodicidade] = useState("");
  const [apenasAtivos, setApenasAtivos] = useState(false);
  const [apenasSemClasse, setApenasSemClasse] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  const podeEditar = pode("inspecoes", "editar");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [inspetores, setInspetores] = useState<UsuarioSimples[]>([]);
  const [inspetorLote, setInspetorLote] = useState("");
  const [atribuindo, setAtribuindo] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [sucessoLote, setSucessoLote] = useState<string | null>(null);

  useEffect(() => {
    if (podeEditar) {
      api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples?perfil=Inspetor").then((r) => setInspetores(r.usuarios));
    }
  }, [podeEditar]);

  function carregar() {
    const params = new URLSearchParams();
    if (texto) params.set("texto", texto);
    if (classePeriodicidade) params.set("classePeriodicidade", classePeriodicidade);
    if (apenasAtivos) params.set("apenasAtivos", "true");
    if (apenasSemClasse) params.set("apenasSemClasse", "true");
    api
      .get<{ planos: PlanoInspecao[] }>(`/inspecoes/planos?${params.toString()}`)
      .then((r) => setPlanos(r.planos))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os planos de inspeção."));
  }

  useEffect(carregar, [texto, classePeriodicidade, apenasAtivos, apenasSemClasse]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);
  useEffect(() => {
    setSelecionados(new Set());
    setSucessoLote(null);
  }, [texto, classePeriodicidade, apenasAtivos, apenasSemClasse]);

  function aoSalvar(_plano: PlanoInspecao) {
    setModalAberto(false);
    carregar();
  }

  const todosSelecionados = !!planos?.length && planos.every((p) => selecionados.has(p.id));

  function alternarSelecao(id: number) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set((planos ?? []).map((p) => p.id)));
  }

  async function aoAtribuirLote() {
    if (!inspetorLote || selecionados.size === 0) return;
    setAtribuindo(true);
    setErroLote(null);
    setSucessoLote(null);
    try {
      const resultado = await api.put<{ atualizados: number; falhas: { id: number; codigo: string | null; erro: string }[] }>(
        "/inspecoes/planos/atribuir-lote",
        {
          ids: [...selecionados],
          responsavel_id: inspetorLote === "remover" ? null : Number(inspetorLote),
        }
      );
      const nomeInspetor = inspetorLote === "remover" ? "sem inspetor" : inspetores.find((u) => u.id === Number(inspetorLote))?.nome ?? "";
      let mensagem = `${resultado.atualizados} plano(s) atualizado(s) com inspetor padrão ${nomeInspetor}.`;
      if (resultado.falhas.length > 0) {
        mensagem += ` ${resultado.falhas.length} não puderam ser alterados.`;
      }
      setSucessoLote(mensagem);
      setSelecionados(new Set());
      setInspetorLote("");
      carregar();
    } catch (e) {
      setErroLote(e instanceof ApiError ? e.message : "Não foi possível atribuir o inspetor padrão.");
    } finally {
      setAtribuindo(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Planos de inspeção</h1>
          <div className="page-header__desc">Periodicidade e checklist de inspeção por equipamento</div>
        </div>
        {pode("inspecoes", "criar") && (
          <button type="button" className="btn btn--primary" onClick={() => setModalAberto(true)}>
            Novo plano
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código, TAG ou equipamento" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-classe">Classe de periodicidade</label>
          <select id="f-classe" className="input" value={classePeriodicidade} onChange={(e) => setClassePeriodicidade(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_CLASSE_PERIODICIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)", paddingBottom: "8px" }}>
          <input type="checkbox" checked={apenasAtivos} onChange={(e) => setApenasAtivos(e.target.checked)} />
          Apenas ativos
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)", paddingBottom: "8px" }}>
          <input type="checkbox" checked={apenasSemClasse} onChange={(e) => setApenasSemClasse(e.target.checked)} />
          Apenas sem classe (a definir)
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

      {podeEditar && selecionados.size > 0 && (
        <div className="card row-actions" style={{ marginBottom: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "var(--text-small)" }}>{selecionados.size} plano(s) selecionado(s)</strong>
          <select className="input" style={{ maxWidth: "280px" }} value={inspetorLote} onChange={(e) => setInspetorLote(e.target.value)}>
            <option value="">Atribuir inspetor padrão…</option>
            <option value="remover">— Remover inspetor padrão —</option>
            {inspetores.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.matricula})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--primary" disabled={!inspetorLote || atribuindo} onClick={aoAtribuirLote}>
            {atribuindo ? "Atribuindo…" : "Atribuir"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {podeEditar && (
                <th style={{ width: "1%" }}>
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    disabled={!planos?.length}
                    onChange={alternarSelecionarTodos}
                    title="Selecionar todos os planos"
                  />
                </th>
              )}
              <th>Código</th>
              <th>TAG</th>
              <th>Equipamento</th>
              <th>Setor</th>
              <th>Classe</th>
              <th>Prioridade</th>
              <th>Inspetor padrão</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {planos?.map((p) => (
              <tr key={p.id} onClick={() => navigate(`/inspecoes/planos/${p.id}`)} style={{ cursor: "pointer" }}>
                {podeEditar && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternarSelecao(p.id)} />
                  </td>
                )}
                <td className="mono">{p.codigo}</td>
                <td className="mono">{p.tag}</td>
                <td>{p.ativo_nome}</td>
                <td>{p.setor ?? "—"}</td>
                <td>
                  {p.classe_periodicidade ? (
                    <span className="badge badge--status-aberta">
                      <span className="badge__dot" /> {ROTULO_CLASSE_PERIODICIDADE[p.classe_periodicidade]}
                    </span>
                  ) : (
                    <span className="badge badge--status-cancelada">
                      <span className="badge__dot" /> Sem classe
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge badge--prioridade-${p.prioridade_padrao}`}>{ROTULO_CRITICIDADE[p.prioridade_padrao]}</span>
                </td>
                <td>{p.responsavel_padrao_nome ?? "—"}</td>
                <td>
                  <span className={`badge ${p.ativo ? "badge--estoque-ok" : "badge--status-cancelada"}`}>
                    <span className="badge__dot" /> {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {planos?.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 9 : 8} className="empty-state">
                  Nenhum plano de inspeção encontrado com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && <PlanoInspecaoFormModal plano={null} onFechar={() => setModalAberto(false)} onSalvo={aoSalvar} />}
    </div>
  );
}
