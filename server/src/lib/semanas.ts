// Espelha web/src/lib/semanas.ts — mesma convenção de "semana do ano" já usada no filtro de
// GerarLote.tsx: domingo a sábado (não ISO-8601, que começa na segunda). A semana 1 do ano começa
// no primeiro domingo A PARTIR de 1º de janeiro (nunca antes) — os poucos dias antes desse domingo
// ficam dentro da semana 1 também, em vez de ganharem um número de semana próprio.

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function somarDiasIso(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return paraIso(new Date(Date.UTC(ano, mes - 1, dia + dias)));
}

function domingoDaSemana1(ano: number): Date {
  const jan1 = new Date(Date.UTC(ano, 0, 1));
  const diaSemana = jan1.getUTCDay(); // 0 = domingo
  const offset = diaSemana === 0 ? 0 : 7 - diaSemana;
  jan1.setUTCDate(jan1.getUTCDate() + offset);
  return jan1;
}

export function dataInicioDaSemana(ano: number, semana: number): string {
  const inicio = domingoDaSemana1(ano);
  inicio.setUTCDate(inicio.getUTCDate() + (semana - 1) * 7);
  return paraIso(inicio);
}

export function dataFimDaSemana(ano: number, semana: number): string {
  return somarDiasIso(dataInicioDaSemana(ano, semana + 1), -1);
}

export function semanaDoAno(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = Date.UTC(ano, mes - 1, dia);
  const inicioSemana1 = domingoDaSemana1(ano).getTime();
  const diasDesde = Math.round((data - inicioSemana1) / 86400000);
  if (diasDesde < 0) return 1;
  return Math.floor(diasDesde / 7) + 1;
}

/** Quantas semanas o ano tem nesta convenção (52 ou 53) — a última semana é a que contém 31/12. */
export function semanasNoAno(ano: number): number {
  return semanaDoAno(`${ano}-12-31`);
}
