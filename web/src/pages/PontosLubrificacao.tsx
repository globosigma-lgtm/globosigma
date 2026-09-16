import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { PontoLubrificacao, UsuarioSimples } from "../types";
import { PontoLubrificacaoFormModal, ROTULO_PERIODICIDADE_SEMANAL } from "../components/PontoLubrificacaoFormModal";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export function PontosLubrificacao() {
  const { pode } = useAuth();
  const [pontos, setPontos] = useState<PontoLubrificacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [periodicidade, setPeriodicidade] = useState("");
  const [apenasAtivos, setApenasAtivos] = useState(false);
  const [modalPonto, setModalPonto] = useState<{ ponto: PontoLubrificacao | null } | null>(null);
  const [removendo, setRemovendo] = useState<PontoLubrificacao | null>(null);

  const podeEditar = pode("lubrificacao", "editar");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [usuariosSimples, setUsuariosSimples] = useState<UsuarioSimples[]>([]);
  const [responsavelLote, setResponsavelLote] = useState("");
  const [atribuindo, setAtribuindo] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [sucessoLote, setSucessoLote] = useState<string | null>(null);

  useEffect(() => {
    if (podeEditar) {
      api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuariosSimples(r.usuarios));
    }
  }, [podeEditar]);

  function carregar() {
    const params = new URLSearchParams();
    if (texto) params.set("texto", texto);
    if (periodicidade) params.set("periodicidade", periodicidade);
    if (apenasAtivos) params.set("apenasAtivos", "true");
    api
      .get<{ pontos: PontoLubrificacao[] }>(`/lubrificacao/pontos?${params.toString()}`)
      .then((r) => setPontos(r.pontos))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os pontos de lubrificação."));
  }

  useEffect(carregar, [texto, periodicidade, apenasAtivos]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);
  useEffect(() => {
    setSelecionados(new Set());
    setSucessoLote(null);
  }, [texto, periodicidade, apenasAtivos]);

  function aoSalvar() {
    setModalPonto(null);
    carregar();
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await api.del(`/lubrificacao/pontos/${removendo.id}`);
      setRemovendo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível excluir o ponto de lubrificação.");
      setRemovendo(null);
    }
  }

  const podeCriar = pode("lubrificacao", "criar");
  const podeExcluir = pode("lubrificacao", "excluir");

  const todosSelecionados = !!pontos?.length && pontos.every((p) => selecionados.has(p.id));

  function alternarSelecao(id: number) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set((pontos ?? []).map((p) => p.id)));
  }

  async function aoAtribuirLote() {
    if (!responsavelLote || selecionados.size === 0) return;
    setAtribuindo(true);
    setErroLote(null);
    setSucessoLote(null);
    try {
      const resultado = await api.put<{ atualizados: number; falhas: { id: number; codigo: string | null; erro: string }[] }>(
        "/lubrificacao/pontos/atribuir-lote",
        {
          ids: [...selecionados],
          responsavel_id: responsavelLote === "remover" ? null : Number(responsavelLote),
        }
      );
      const nomeResponsavel =
        responsavelLote === "remover" ? "sem responsável" : usuariosSimples.find((u) => u.id === Number(responsavelLote))?.nome ?? "";
      let mensagem = `${resultado.atualizados} ponto(s) atualizado(s) com responsável padrão ${nomeResponsavel}.`;
      if (resultado.falhas.length > 0) {
        mensagem += ` ${resultado.falhas.length} não puderam ser alterados.`;
      }
      setSucessoLote(mensagem);
      setSelecionados(new Set());
      setResponsavelLote("");
      carregar();
    } catch (e) {
      setErroLote(e instanceof ApiError ? e.message : "Não foi possível atribuir o responsável padrão.");
    } finally {
      setAtribuindo(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pontos de lubrificação</h1>
          <div className="page-header__desc">Cadastro por ativo, com recorrência por semana do ano — separado dos planos de manutenção</div>
        </div>
        {podeCriar && (
          <button type="button" className="btn btn--primary" onClick={() => setModalPonto({ ponto: null })}>
            Novo ponto
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código ou descrição" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-periodicidade">Periodicidade</label>
          <select id="f-periodicidade" className="input" value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_PERIODICIDADE_SEMANAL).map(([valor, rotulo]) => (
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
          <strong style={{ fontSize: "var(--text-small)" }}>{selecionados.size} ponto(s) selecionado(s)</strong>
          <select className="input" style={{ maxWidth: "280px" }} value={responsavelLote} onChange={(e) => setResponsavelLote(e.target.value)}>
            <option value="">Atribuir responsável padrão…</option>
            <option value="remover">— Remover responsável padrão —</option>
            {usuariosSimples.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.matricula})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--primary" disabled={!responsavelLote || atribuindo} onClick={aoAtribuirLote}>
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
                    disabled={!pontos?.length}
                    onChange={alternarSelecionarTodos}
                    title="Selecionar todos os pontos"
                  />
                </th>
              )}
              <th>Código</th>
              <th>Ativo</th>
              <th>Descrição</th>
              <th>Periodicidade</th>
              <th>Semana-base</th>
              <th>Prioridade</th>
              <th>Responsável padrão</th>
              <th>Status</th>
              {(podeEditar || podeExcluir) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {pontos?.map((p) => (
              <tr key={p.id}>
                {podeEditar && (
                  <td>
                    <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternarSelecao(p.id)} />
                  </td>
                )}
                <td className="mono">{p.codigo}</td>
                <td>{p.ativo_nome}</td>
                <td>{p.descricao}</td>
                <td>{ROTULO_PERIODICIDADE_SEMANAL[p.periodicidade]}</td>
                <td className="mono">{p.semana_base}</td>
                <td>
                  <span className={`badge badge--prioridade-${p.prioridade_padrao}`}>{ROTULO_CRITICIDADE[p.prioridade_padrao]}</span>
                </td>
                <td>{p.responsavel_padrao_nome ?? "—"}</td>
                <td>
                  <span className={`badge ${p.ativo ? "badge--estoque-ok" : "badge--status-cancelada"}`}>
                    <span className="badge__dot" /> {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {(podeEditar || podeExcluir) && (
                  <td>
                    <div className="row-actions">
                      {podeEditar && (
                        <button type="button" className="btn btn--ghost" onClick={() => setModalPonto({ ponto: p })}>
                          Editar
                        </button>
                      )}
                      {podeExcluir && (
                        <button type="button" className="btn btn--ghost" onClick={() => setRemovendo(p)}>
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {pontos?.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 10 : 9} className="empty-state">
                  Nenhum ponto de lubrificação encontrado com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalPonto && <PontoLubrificacaoFormModal ponto={modalPonto.ponto} onFechar={() => setModalPonto(null)} onSalvo={aoSalvar} />}

      {removendo && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setRemovendo(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Excluir ponto de lubrificação</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja excluir <strong>{removendo.codigo}</strong> ({removendo.descricao})? O histórico de
              OS já geradas é preservado.
            </p>
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setRemovendo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--destructive" onClick={confirmarRemocao}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
