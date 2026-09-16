import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Equipe, UsuarioSimples } from "../types";
import { Modal } from "./Modal";

export function EquipeFormModal({
  equipe,
  onFechar,
  onSalvo,
}: {
  equipe: Equipe | null;
  onFechar: () => void;
  onSalvo: (equipe: Equipe) => void;
}) {
  const [nome, setNome] = useState(equipe?.nome ?? "");
  const [descricao, setDescricao] = useState(equipe?.descricao ?? "");
  const [membroIds, setMembroIds] = useState<Set<number>>(new Set(equipe?.membros.map((m) => m.id) ?? []));
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuarios(r.usuarios));
  }, []);

  function alternarMembro(id: number) {
    setMembroIds((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      membroIds: [...membroIds],
    };
    try {
      const resultado = equipe
        ? await api.put<{ equipe: Equipe }>(`/equipes/${equipe.id}`, payload)
        : await api.post<{ equipe: Equipe }>("/equipes", payload);
      onSalvo(resultado.equipe);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar a equipe.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={equipe ? "Editar equipe" : "Nova equipe"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="field">
          <label htmlFor="nome">Nome</label>
          <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="descricao">Descrição</label>
          <input id="descricao" className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>

        <div className="field">
          <label>Membros</label>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              maxHeight: "220px",
              overflowY: "auto",
              border: "1px solid var(--c-n-200)",
              borderRadius: "8px",
              padding: "10px",
            }}
          >
            {usuarios.map((u) => (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
                <input type="checkbox" checked={membroIds.has(u.id)} onChange={() => alternarMembro(u.id)} />
                {u.nome} ({u.matricula})
              </label>
            ))}
            {usuarios.length === 0 && (
              <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-400)" }}>Nenhum usuário disponível.</p>
            )}
          </div>
        </div>

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
