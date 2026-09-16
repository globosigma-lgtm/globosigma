import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Usuario } from "../types";
import { Modal } from "./Modal";

interface Perfil {
  id: number;
  nome: string;
}

export function UsuarioFormModal({
  usuario,
  perfis,
  onFechar,
  onSalvo,
}: {
  usuario: Usuario | null;
  perfis: Perfil[];
  onFechar: () => void;
  onSalvo: (usuario: Usuario) => void;
}) {
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [matricula, setMatricula] = useState(usuario?.matricula ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [perfilId, setPerfilId] = useState(usuario ? String(usuario.perfil_id) : perfis[0] ? String(perfis[0].id) : "");
  const [setor, setSetor] = useState(usuario?.setor ?? "");
  const [cargo, setCargo] = useState(usuario?.cargo ?? "");
  const [custoHora, setCustoHora] = useState(usuario ? String(usuario.custo_hora_padrao) : "0");
  const [ativo, setAtivo] = useState(usuario ? usuario.ativo === 1 : true);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      nome: nome.trim(),
      matricula: matricula.trim(),
      email: email.trim() || null,
      perfil_id: Number(perfilId),
      setor: setor.trim() || null,
      cargo: cargo.trim() || null,
      custo_hora_padrao: Number(custoHora) || 0,
      ativo,
      senha: senha || null,
    };
    try {
      const resultado = usuario
        ? await api.put<{ usuario: Usuario }>(`/usuarios/${usuario.id}`, payload)
        : await api.post<{ usuario: Usuario }>("/usuarios", payload);
      onSalvo(resultado.usuario);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o usuário.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={usuario ? "Editar usuário" : "Novo usuário"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="nome">Nome</label>
            <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="matricula">Matrícula</label>
            <input id="matricula" className="input mono" value={matricula} onChange={(e) => setMatricula(e.target.value)} required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="perfil_id">Perfil</label>
            <select id="perfil_id" className="input" value={perfilId} onChange={(e) => setPerfilId(e.target.value)} required>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="custo_hora">Custo por hora (R$)</label>
            <input
              id="custo_hora"
              type="number"
              step="0.01"
              min="0"
              className="input mono"
              value={custoHora}
              onChange={(e) => setCustoHora(e.target.value)}
            />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="setor">Setor</label>
            <input id="setor" className="input" value={setor} onChange={(e) => setSetor(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cargo">Cargo</label>
            <input id="cargo" className="input" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="senha">{usuario ? "Nova senha (opcional)" : "Senha"}</label>
          <input
            id="senha"
            type="password"
            className="input"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={usuario ? "Deixe em branco para manter a atual" : undefined}
            required={!usuario}
            minLength={6}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Usuário ativo (pode fazer login)
        </label>

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
