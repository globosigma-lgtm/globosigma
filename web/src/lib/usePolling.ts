import { useEffect, useRef } from "react";

/** Intervalo padrão de recarga automática das telas — um valor só pra ajustar globalmente depois. */
export const INTERVALO_POLLING_PADRAO = 15000;

/**
 * Reexecuta `callback` a cada `intervaloMs` enquanto o componente estiver montado —
 * mesma ideia do polling que já existia só no NotificationBell, generalizada pra
 * qualquer tela recarregar sozinha sem precisar de F5. Pausa quando a aba fica oculta
 * (usuário em outra aba/janela) e refaz a busca imediatamente ao voltar o foco, pra não
 * gastar requisição à toa nem mostrar dado desatualizado quando o usuário volta.
 *
 * Não dispara a primeira busca — a tela continua responsável pelo carregamento inicial
 * (ex.: `useEffect(carregar, [id])`), este hook só cuida das buscas seguintes.
 */
export function usePolling(callback: () => void, intervaloMs: number): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval> | null = null;

    function iniciar() {
      if (intervalo) return;
      intervalo = setInterval(() => callbackRef.current(), intervaloMs);
    }
    function parar() {
      if (intervalo) {
        clearInterval(intervalo);
        intervalo = null;
      }
    }
    function aoMudarVisibilidade() {
      if (document.hidden) {
        parar();
      } else {
        callbackRef.current();
        iniciar();
      }
    }

    if (!document.hidden) iniciar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [intervaloMs]);
}
