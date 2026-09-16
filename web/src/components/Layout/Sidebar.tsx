import { NavLink, useLocation } from "react-router-dom";
import { NAVEGACAO } from "../../nav";
import { useAuth } from "../../context/AuthContext";

/**
 * Alguns itens do menu têm caminho prefixo de outro (ex.: "/planos" e "/planos/calendario",
 * "/ordens-servico" e "/ordens-servico/gerar-lote") — os dois são páginas distintas, cada uma
 * com sua própria entrada no menu, não uma relação de seção pai/filho. `NavLink` sem `end`
 * acende por prefixo, então em "/planos/calendario" os dois links ficavam marcados como ativos
 * ao mesmo tempo. Em vez de `end` (que perderia o destaque de "Planos" ao abrir o detalhe de um
 * plano em "/planos/5"), cada item verifica se é o caminho mais específico entre os visíveis que
 * combina com a rota atual — só esse fica ativo.
 */
function combina(caminho: string, pathname: string): boolean {
  if (caminho === "/") return pathname === "/";
  return pathname === caminho || pathname.startsWith(`${caminho}/`);
}

export function Sidebar({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const { pode } = useAuth();
  const location = useLocation();

  const caminhosVisiveis = NAVEGACAO.flatMap((grupo) => grupo.itens)
    .filter((item) => pode(item.modulo, "ver"))
    .map((item) => item.caminho);

  function ehAtivo(caminho: string): boolean {
    if (!combina(caminho, location.pathname)) return false;
    return !caminhosVisiveis.some(
      (outro) => outro !== caminho && outro.length > caminho.length && combina(outro, location.pathname)
    );
  }

  return (
    <nav className={`sidebar${aberta ? " is-open" : ""}`} aria-label="Navegação principal">
      <div className="sidebar__brand">
        <img src="/logo-sigma-os.png" alt="Globosigma" className="sidebar__brand-logo" />
      </div>

      {NAVEGACAO.map((grupo) => {
        const itensVisiveis = grupo.itens.filter((item) => pode(item.modulo, "ver"));
        if (itensVisiveis.length === 0) return null;
        return (
          <div key={grupo.titulo}>
            <div className="sidebar__group-label">{grupo.titulo}</div>
            <div className="sidebar__nav">
              {itensVisiveis.map((item) => (
                <NavLink
                  key={item.caminho}
                  to={item.caminho}
                  onClick={onFechar}
                  className={`sidebar__link${ehAtivo(item.caminho) ? " is-active" : ""}`}
                >
                  <span className="sidebar__icon" aria-hidden="true">{item.icone}</span>
                  {item.rotulo}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
