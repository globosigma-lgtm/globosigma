/**
 * Horário do sistema é fixo em GMT-04:00 — não depende do fuso do SO/processo (que pode variar
 * entre máquina de desenvolvimento e servidor de produção). É a mesma janela aplicada nos
 * DEFAULT de timestamp do schema.sql (`datetime('now', '-4 hours')`) e em todo INSERT/UPDATE que
 * grava "agora" — para "hoje" significar o mesmo dia civil em qualquer lugar do sistema.
 */
const OFFSET_MS = 4 * 60 * 60 * 1000;

export function hojeSistema(): string {
  return new Date(Date.now() - OFFSET_MS).toISOString().slice(0, 10);
}
