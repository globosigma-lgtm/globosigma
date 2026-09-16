/**
 * Horário do sistema é fixo em GMT-04:00, igual ao servidor (ver server/src/lib/horarioSistema.ts)
 * — não depende do fuso configurado no navegador de quem está usando o sistema, pra "hoje" (data
 * padrão de formulário, filtro de "últimos N dias") significar o mesmo dia civil pra todo mundo.
 */
const OFFSET_MS = 4 * 60 * 60 * 1000;

export function hojeSistema(): string {
  return new Date(Date.now() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Para o valor inicial de um <input type="datetime-local"> — "agora" em GMT-04:00, sem marcador de fuso. */
export function agoraSistemaDatetimeLocal(): string {
  return new Date(Date.now() - OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * "Agora" formatado em pt-BR (dd/mm/aaaa, hh:mm:ss) — usa o deslocamento fixo em vez do fuso do
 * navegador de quem está imprimindo, pra a mesma OS impressa em máquinas diferentes mostrar o
 * mesmo horário.
 */
export function agoraSistemaFormatado(): string {
  const data = new Date(Date.now() - OFFSET_MS);
  const dd = String(data.getUTCDate()).padStart(2, "0");
  const mm = String(data.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = data.getUTCFullYear();
  const hh = String(data.getUTCHours()).padStart(2, "0");
  const min = String(data.getUTCMinutes()).padStart(2, "0");
  const ss = String(data.getUTCSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${aaaa}, ${hh}:${min}:${ss}`;
}
