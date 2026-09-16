import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Usuario } from "../types";
import type { MapaPermissoes } from "../lib/permissions";
import { UsuarioFormModal } from "../components/UsuarioFormModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

interface Perfil {
  id: number;
  nome: string;
  descricao: string;
  permissoes: MapaPermissoes;
  somente_leitura: number;
}

const RES_ACAO: Record<string, string> = {
  ver: "Ver",
  criar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
  aprovar: "Aprovar",
  exportar: "Exportar",
};

function formatarMoeda(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Usuarios() {
  const { pode, usuario: usuarioLogado } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [perfis, setPerfis] = useState<Perfil[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalUsuario, setModalUsuario] = useState<{ usuario: Usuario | null } | null>(null);
  const [removendo, setRemovendo] = useState<Usuario | null>(null);
  const [texto, setTexto] = useState("");

  function carregar() {
    const params = new URLSearchParams();
    if (texto) params.set("texto", texto);
    Promise.all([api.get<{ usuarios: Usuario[] }>(`/usuarios?${params.toString()}`), api.get<{ perfis: Perfil[] }>("/usuarios/perfis")])
      .then(([u, p]) => {
        setUsuarios(u.usuarios);
        setPerfis(p.perfis);
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar usuários e perfis."));
  }

  useEffect(carregar, [texto]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  function aoSalvar() {
    setModalUsuario(null);
    carregar();
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await api.del(`/usuarios/${removendo.id}`);
      setRemovendo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível excluir o usuário.");
      setRemovendo(null);
    }
  }

  const podeCriar = pode("usuarios", "criar");
  const podeEditar = pode("usuarios", "editar");
  const podeExcluir = pode("usuarios", "excluir");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Usuários e perfis</h1>
          <div className="page-header__desc">Cadastro de usuários e permissões granulares por perfil</div>
        </div>
        {podeCriar && (
          <button type="button" className="btn btn--primary" onClick={() => setModalUsuario({ usuario: null })}>
            Novo usuário
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Nome ou matrícula" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "12px", color: "var(--c-n-700)" }}>Usuários</h2>
      <div className="table-wrap" style={{ marginBottom: "32px" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Matrícula</th>
              <th>Nome</th>
              <th>Perfil</th>
              <th>Setor</th>
              <th>Cargo</th>
              <th>Custo/hora</th>
              <th>Status</th>
              {(podeEditar || podeExcluir) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {usuarios?.map((u) => (
              <tr key={u.id}>
                <td className="mono">{u.matricula}</td>
                <td>{u.nome}</td>
                <td>{u.perfil_nome}</td>
                <td>{u.setor}</td>
                <td>{u.cargo}</td>
                <td className="mono">{formatarMoeda(u.custo_hora_padrao)}</td>
                <td>
                  <span className={`badge badge--status-${u.ativo ? "concluida" : "cancelada"}`}>
                    <span className="badge__dot" /> {u.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {(podeEditar || podeExcluir) && (
                  <td>
                    <div className="row-actions">
                      {podeEditar && (
                        <button type="button" className="btn btn--ghost" onClick={() => setModalUsuario({ usuario: u })}>
                          Editar
                        </button>
                      )}
                      {podeExcluir && u.id !== usuarioLogado?.id && (
                        <button type="button" className="btn btn--ghost" onClick={() => setRemovendo(u)}>
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {usuarios?.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "12px", color: "var(--c-n-700)" }}>Perfis e permissões</h2>
      <div className="card-grid">
        {perfis?.map((p) => (
          <div className="card" key={p.id}>
            <h3 style={{ fontSize: "var(--text-h3)", marginBottom: "4px" }}>{p.nome}</h3>
            <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "12px" }}>{p.descricao}</p>
            {Object.keys(p.permissoes).length === 0 ? (
              <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-400)" }}>Sem permissões atribuídas.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {Object.entries(p.permissoes).map(([modulo, acoes]) => (
                  <div key={modulo} style={{ fontSize: "var(--text-caption)" }}>
                    <span className="mono" style={{ color: "var(--c-n-600)" }}>
                      {modulo}
                    </span>
                    : <span style={{ color: "var(--c-n-500)" }}>{(acoes as string[]).map((a) => RES_ACAO[a] ?? a).join(", ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {modalUsuario && perfis && (
        <UsuarioFormModal
          usuario={modalUsuario.usuario}
          perfis={perfis.map((p) => ({ id: p.id, nome: p.nome }))}
          onFechar={() => setModalUsuario(null)}
          onSalvo={aoSalvar}
        />
      )}

      {removendo && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setRemovendo(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Excluir usuário</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Tem certeza que deseja excluir <strong>{removendo.nome}</strong>? O login dessa matrícula deixa de
              funcionar, mas o histórico é preservado.
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
