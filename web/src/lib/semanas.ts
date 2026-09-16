// Semanas do calendário de manutenção: domingo a sábado, não o padrão ISO-8601 (que começa na
// segunda). A semana 1 do ano começa no primeiro domingo A PARTIR de 1º de janeiro (nunca antes)
// — ex.: em 2026, 1º de janeiro é quinta-feira, então a semana 1 começa no domingo seguinte,
// 04/01/2026. Os poucos dias antes desse domingo (aqui, 1 a 3 de janeiro) ficam dentro da
// semana 1 também, em vez de ganharem um número de semana próprio.

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
  // A semana 1 é o próprio primeiro domingo do ano (não um "resto" antes dele) — cada semana
  // seguinte é um bloco cheio de 7 dias a partir daí.
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
  // 1º de janeiro até o dia anterior ao 1º domingo (poucos dias, nunca uma semana inteira) não
  // têm uma semana anterior válida no mesmo ano — contam como parte da semana 1.
  if (diasDesde < 0) return 1;
  return Math.floor(diasDesde / 7) + 1;
}
