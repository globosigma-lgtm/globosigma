import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";

export function Login() {
  const { usuario, login, carregando } = useAuth();
  const [matricula, setMatricula] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (!carregando && usuario) {
    const destino = (location.state as { de?: string })?.de ?? "/";
    return <Navigate to={destino} replace />;
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login(matricula.trim(), senha);
      navigate("/", { replace: true });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__brand">
          <img src="/logo-sigma-os.png" alt="Globosigma" className="login-card__brand-logo" />
          <div className="login-card__brand-sub">Sistema Integrado de Gestão da Manutenção de Ativos</div>
        </div>

        <form onSubmit={aoEnviar}>
          {erro && <div className="login-card__error" role="alert">{erro}</div>}

          <div className="field">
            <label htmlFor="matricula">Matrícula</label>
            <input
              id="matricula"
              className="input"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              className="input"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn btn--primary" type="submit" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
