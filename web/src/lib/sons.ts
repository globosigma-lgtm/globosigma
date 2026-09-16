export type TipoSom = "clique" | "sucesso" | "erro" | "notificacao" | "alerta_critico";

const CHAVE_PREFERENCIA = "sigma:som_ativado";
const EVENTO_PREFERENCIA = "sigma:som-preferencia";

let contexto: AudioContext | null = null;

function obterContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Construtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Construtor) return null;
  if (!contexto) contexto = new Construtor();
  if (contexto.state === "suspended") void contexto.resume();
  return contexto;
}

export function somAtivado(): boolean {
  if (typeof window === "undefined") return true;
  const valor = window.localStorage.getItem(CHAVE_PREFERENCIA);
  return valor !== "0";
}

export function definirSomAtivado(ativo: boolean) {
  window.localStorage.setItem(CHAVE_PREFERENCIA, ativo ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENTO_PREFERENCIA, { detail: ativo }));
}

export function aoMudarPreferenciaDeSom(ouvinte: (ativo: boolean) => void): () => void {
  function manipulador(e: Event) {
    ouvinte((e as CustomEvent<boolean>).detail);
  }
  window.addEventListener(EVENTO_PREFERENCIA, manipulador);
  return () => window.removeEventListener(EVENTO_PREFERENCIA, manipulador);
}

interface Tom {
  frequencia: number;
  inicioSeg: number;
  duracaoSeg: number;
  tipoOnda?: OscillatorType;
  ganho?: number;
}

function tocarTons(tons: Tom[]) {
  const ctx = obterContexto();
  if (!ctx) return;
  const agora = ctx.currentTime;
  for (const tom of tons) {
    const osc = ctx.createOscillator();
    const ganhoNode = ctx.createGain();
    osc.type = tom.tipoOnda ?? "sine";
    osc.frequency.value = tom.frequencia;
    const inicio = agora + tom.inicioSeg;
    const fim = inicio + tom.duracaoSeg;
    const pico = tom.ganho ?? 0.1;
    ganhoNode.gain.setValueAtTime(0.0001, inicio);
    ganhoNode.gain.linearRampToValueAtTime(pico, inicio + 0.008);
    ganhoNode.gain.exponentialRampToValueAtTime(0.0001, fim);
    osc.connect(ganhoNode).connect(ctx.destination);
    osc.start(inicio);
    osc.stop(fim + 0.02);
  }
}

const RECEITAS: Record<TipoSom, Tom[]> = {
  clique: [{ frequencia: 720, inicioSeg: 0, duracaoSeg: 0.03, ganho: 0.045 }],
  sucesso: [
    { frequencia: 587.33, inicioSeg: 0, duracaoSeg: 0.09, ganho: 0.08 },
    { frequencia: 880, inicioSeg: 0.08, duracaoSeg: 0.15, ganho: 0.08 },
  ],
  erro: [
    { frequencia: 293.66, inicioSeg: 0, duracaoSeg: 0.12, tipoOnda: "square", ganho: 0.05 },
    { frequencia: 220, inicioSeg: 0.11, duracaoSeg: 0.18, tipoOnda: "square", ganho: 0.05 },
  ],
  notificacao: [
    { frequencia: 784, inicioSeg: 0, duracaoSeg: 0.09, ganho: 0.07 },
    { frequencia: 987.77, inicioSeg: 0.1, duracaoSeg: 0.13, ganho: 0.07 },
  ],
  alerta_critico: [
    { frequencia: 880, inicioSeg: 0, duracaoSeg: 0.1, tipoOnda: "triangle", ganho: 0.09 },
    { frequencia: 659.25, inicioSeg: 0.12, duracaoSeg: 0.1, tipoOnda: "triangle", ganho: 0.09 },
    { frequencia: 880, inicioSeg: 0.24, duracaoSeg: 0.16, tipoOnda: "triangle", ganho: 0.09 },
  ],
};

export function tocarSom(tipo: TipoSom) {
  if (!somAtivado()) return;
  tocarTons(RECEITAS[tipo]);
}
