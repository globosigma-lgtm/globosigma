import { useEffect } from "react";
import { tocarSom } from "../lib/sons";

const SELETOR_ALERTA = '.alert--success, [role="alert"]';

/** Efeitos sonoros globais: clique em botões e aparição de banners de sucesso/erro (Seção 4 do design system já usa essas classes em toda a aplicação, então basta observar o DOM). */
export function SomGlobal() {
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      const alvo = (e.target as HTMLElement | null)?.closest("button, a.btn, [role='button']") as HTMLButtonElement | null;
      if (!alvo || alvo.disabled) return;
      tocarSom("clique");
    }
    document.addEventListener("click", aoClicar, true);

    const observador = new MutationObserver((mutacoes) => {
      for (const mutacao of mutacoes) {
        for (const no of Array.from(mutacao.addedNodes)) {
          if (!(no instanceof HTMLElement)) continue;
          const alertas = no.matches(SELETOR_ALERTA) ? [no] : Array.from(no.querySelectorAll(SELETOR_ALERTA));
          for (const alerta of alertas) {
            tocarSom(alerta.matches(".alert--success") ? "sucesso" : "erro");
          }
        }
      }
    });
    observador.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("click", aoClicar, true);
      observador.disconnect();
    };
  }, []);

  return null;
}
