import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Equipe } from "../types";
import { EquipeFormModal } from "../components/EquipeFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

export function Equipes() {
  const { pode } = useAuth();
  const [equipes, setEquipes] = useState<Equipe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalEquipe, setModalEquipe] = useState<{ equipe: Equipe | null } | null>(null);
  const [removendo, setRemovendo] = useState<Equipe | null>(null);
  const [texto, setTexto] = useState("");

  function carregar() {
    const params = new URLSearchParams();
    if (texto) params.set("texto", texto);
    api
      .get<{ equipes: Equipe[] }>(`/equipes?${params.toString()}`)
      .then((r) => setEquipes(r.equipes))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as equipes."));
  }

  useEffect(carregar, [texto]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar() {
    setModalEquipe(null);
    carregar();
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await api.del(`/equipes/${removendo.id}`);
      setRemovendo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível excluir a equipe.");
      setRemovendo(null);
    }
  }

  const podeCriar = pode("equipes", "criar");
  const podeEditar = pode("equipes", "editar");
  const podeExcluir = pode("equipes", "excluir");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Equipes</h1>
          <div className="page-header__desc">Grupos de usuários pra atribuição de ordens de serviço</div>
        </div>
        {podeCriar && (
          <button type="button" className="btn btn--primary" onClick={() => setModalEquipe({ equipe: null })}>
            Nova equipe
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Nome da equipe" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Membros</th>
              {(podeEditar || podeExcluir) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {equipes?.map((eq) => (
              <tr key={eq.id}>
                <td>{eq.nome}</td>
                <td>{eq.descricao}</td>
                <td>{eq.membros.map((m) => m.nome).join(", ") || "—"}</td>
                {(podeEditar || podeExcluir) && (
                  <td>
                    <div className="row-actions">
                      {podeEditar && (
                        <button type="button" className="btn btn--ghost" onClick={() => setModalEquipe({ equipe: eq })}>
                          Editar
                        </button>
                      )}
                      {podeExcluir && (
                        <button type="button" className="btn btn--ghost" onClick={() => setRemovendo(eq)}>
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {equipes?.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-state">
                  Nenhuma equipe cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalEquipe && (
        <EquipeFormModal equipe={modalEquipe.equipe} onFechar={() => setModalEquipe(null)} onSalvo={aoSalvar} />
      )}

      {removendo && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setRemovendo(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Excluir equipe</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja excluir <strong>{removendo.nome}</strong>?
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
