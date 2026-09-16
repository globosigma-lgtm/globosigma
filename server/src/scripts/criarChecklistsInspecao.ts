/**
 * Cria o checklist de inspeção de cada plano_inspecao, classificando o equipamento por palavras-
 * chave no nome (esteira, bomba, ar condicionado, compressor, etc.) e aplicando o checklist
 * padrão daquela categoria — não é um texto único por máquina (inviável para ~780 equipamentos
 * distintos), mas cada uma recebe os itens relevantes para o que ela é. Equipamentos que não
 * batem com nenhuma categoria específica (agrupamentos genéricos como "EQUIPAMENTOS DA SALA X",
 * luminárias, etc.) recebem um checklist genérico de inspeção visual.
 *
 * Idempotente: pula qualquer plano que já tenha algum item de checklist.
 * Rodar: node --env-file=.env --import tsx src/scripts/criarChecklistsInspecao.ts
 */
import { dbAll, pool } from "../db/pg.js";
import type { TipoResposta } from "../services/planoTarefaService.js";

interface ItemChecklist {
  descricao: string;
  tipo_resposta: TipoResposta;
}

const CHECKLISTS: Record<string, ItemChecklist[]> = {
  esteira_transporte: [
    { descricao: "Esteira/correia/corrente sem desalinhamento, folga excessiva ou desgaste visível", tipo_resposta: "ok_nok" },
    { descricao: "Mancais e rolamentos sem ruído ou vibração anormal", tipo_resposta: "ok_nok" },
    { descricao: "Redutor/motor de acionamento sem vazamento de óleo", tipo_resposta: "ok_nok" },
    { descricao: "Proteções e guardas de segurança no lugar", tipo_resposta: "ok_nok" },
  ],
  ar_condicionado: [
    { descricao: "Filtros de ar limpos e sem obstrução", tipo_resposta: "ok_nok" },
    { descricao: "Dreno de condensado sem vazamento ou obstrução", tipo_resposta: "ok_nok" },
    { descricao: "Funcionamento sem ruído anormal", tipo_resposta: "ok_nok" },
    { descricao: "Serpentina/aletas sem sujeira excessiva ou dano", tipo_resposta: "ok_nok" },
  ],
  bomba: [
    { descricao: "Ausência de vazamento no selo mecânico ou gaxeta", tipo_resposta: "ok_nok" },
    { descricao: "Ruído e vibração dentro do normal", tipo_resposta: "ok_nok" },
    { descricao: "Acoplamento e fixação sem folga", tipo_resposta: "ok_nok" },
    { descricao: "Motor sem aquecimento excessivo", tipo_resposta: "ok_nok" },
  ],
  balanca: [
    { descricao: "Estrutura e célula de carga sem dano visível", tipo_resposta: "ok_nok" },
    { descricao: "Display/indicador funcionando corretamente", tipo_resposta: "ok_nok" },
    { descricao: "Calibração/zero da balança conferido", tipo_resposta: "ok_nok" },
    { descricao: "Limpeza da plataforma de pesagem", tipo_resposta: "ok_nok" },
  ],
  ventilador: [
    { descricao: "Hélice/rotor sem desbalanceamento, trinca ou dano", tipo_resposta: "ok_nok" },
    { descricao: "Ruído e vibração dentro do normal", tipo_resposta: "ok_nok" },
    { descricao: "Correias de acionamento sem desgaste ou folga (quando houver)", tipo_resposta: "ok_nok" },
    { descricao: "Proteção/grade de segurança no lugar", tipo_resposta: "ok_nok" },
  ],
  tanque_reservatorio: [
    { descricao: "Estrutura sem trinca, corrosão ou vazamento", tipo_resposta: "ok_nok" },
    { descricao: "Nível/indicador funcionando corretamente", tipo_resposta: "ok_nok" },
    { descricao: "Tampa/vedação em boas condições", tipo_resposta: "ok_nok" },
    { descricao: "Limpeza e ausência de contaminação visível", tipo_resposta: "ok_nok" },
  ],
  compressor: [
    { descricao: "Nível de óleo dentro da faixa", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamento (óleo, gás ou amônia)", tipo_resposta: "ok_nok" },
    { descricao: "Ruído e vibração dentro do normal", tipo_resposta: "ok_nok" },
    { descricao: "Pressão de operação dentro da faixa esperada", tipo_resposta: "ok_nok" },
  ],
  veiculo: [
    { descricao: "Freios funcionando corretamente", tipo_resposta: "ok_nok" },
    { descricao: "Pneus/rodízios em condição adequada", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamento de óleo, combustível ou fluido hidráulico", tipo_resposta: "ok_nok" },
    { descricao: "Buzina, luzes e sinalização funcionando", tipo_resposta: "ok_nok" },
  ],
  lavador_botas: [
    { descricao: "Bicos e jatos sem entupimento", tipo_resposta: "ok_nok" },
    { descricao: "Pressão de água adequada", tipo_resposta: "ok_nok" },
    { descricao: "Estrutura sem corrosão", tipo_resposta: "ok_nok" },
    { descricao: "Dreno sem obstrução", tipo_resposta: "ok_nok" },
  ],
  dosagem_tratamento: [
    { descricao: "Funcionamento sem ruído anormal", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamento", tipo_resposta: "ok_nok" },
    { descricao: "Limpeza e ausência de obstrução", tipo_resposta: "ok_nok" },
    { descricao: "Estrutura sem corrosão visível", tipo_resposta: "ok_nok" },
  ],
  camara_fria: [
    { descricao: "Vedação de portas íntegra", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de acúmulo excessivo de gelo ou geada", tipo_resposta: "ok_nok" },
    { descricao: "Iluminação interna funcionando", tipo_resposta: "ok_nok" },
    { descricao: "Temperatura interna dentro do esperado", tipo_resposta: "ok_nok" },
  ],
  bebedouro: [
    { descricao: "Funcionamento e fluxo de água adequado", tipo_resposta: "ok_nok" },
    { descricao: "Higienização em dia", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamento", tipo_resposta: "ok_nok" },
  ],
  cortina_ar: [
    { descricao: "Fluxo de ar contínuo e uniforme", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de ruído anormal", tipo_resposta: "ok_nok" },
    { descricao: "Fixação e estrutura sem dano", tipo_resposta: "ok_nok" },
  ],
  caldeira: [
    { descricao: "Nível de água dentro da faixa", tipo_resposta: "ok_nok" },
    { descricao: "Pressão de operação dentro da faixa", tipo_resposta: "ok_nok" },
    { descricao: "Válvulas de segurança sem vazamento", tipo_resposta: "ok_nok" },
    { descricao: "Sistema de queima/chama estável", tipo_resposta: "ok_nok" },
  ],
  maquina_corte: [
    { descricao: "Lâmina/faca em condição adequada de corte", tipo_resposta: "ok_nok" },
    { descricao: "Proteções e guardas de segurança no lugar", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamento hidráulico (quando houver)", tipo_resposta: "ok_nok" },
    { descricao: "Funcionamento sem ruído anormal", tipo_resposta: "ok_nok" },
  ],
  gerador: [
    { descricao: "Nível de óleo e combustível adequado", tipo_resposta: "ok_nok" },
    { descricao: "Bateria de partida em boas condições", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamento", tipo_resposta: "ok_nok" },
    { descricao: "Painel de controle sem alarmes ativos", tipo_resposta: "ok_nok" },
  ],
  painel_eletrico: [
    { descricao: "Conexões e terminais sem sinais de aquecimento ou oxidação", tipo_resposta: "ok_nok" },
    { descricao: "Sinalizações e lâmpadas piloto funcionando", tipo_resposta: "ok_nok" },
    { descricao: "Limpeza interna do painel", tipo_resposta: "ok_nok" },
    { descricao: "Porta com fechamento e aterramento adequados", tipo_resposta: "ok_nok" },
  ],
  lavanderia: [
    { descricao: "Funcionamento sem ruído anormal", tipo_resposta: "ok_nok" },
    { descricao: "Vedação de portas/tampas", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamento", tipo_resposta: "ok_nok" },
  ],
  maquina_generica: [
    { descricao: "Funcionamento sem ruído ou vibração anormal", tipo_resposta: "ok_nok" },
    { descricao: "Proteções e guardas de segurança no lugar", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamento (óleo, água ou produto)", tipo_resposta: "ok_nok" },
    { descricao: "Limpeza e higienização adequadas", tipo_resposta: "ok_nok" },
  ],
  generico: [
    { descricao: "Inspeção visual geral sem danos aparentes", tipo_resposta: "ok_nok" },
    { descricao: "Funcionamento sem ruído ou vibração anormal", tipo_resposta: "ok_nok" },
    { descricao: "Ausência de vazamentos", tipo_resposta: "ok_nok" },
    { descricao: "Limpeza e conservação adequadas", tipo_resposta: "ok_nok" },
  ],
};

const CATEGORIAS: [string, string[]][] = [
  ["lavanderia", ["MAQUINA DE LAVAR", "MAQUINA DE SECAR", "CENTRIFUGA", "SENTRIFUGA"]],
  ["lavador_botas", ["LAVADOR DE BOTAS", "LAVADOR DE GANCHO", "HIGIENIZACAO DE CAIXAS", "HIGIENIZACAO DE GAIOLAS", "MAQUINA DE HIGIENIZACAO"]],
  ["balanca", ["BALANCA", "BALANÇA", "CHECADORA"]],
  ["ar_condicionado", ["CONDICIONADO", "SPLIT", "CHILLER", "EVAPORADOR", "CLIMATIZADOR", "CONDENSADOR", "TROCADOR DE CALOR"]],
  ["camara_fria", ["CAMARA FRIA", "CÂMARA FRIA", "TUNEL DE CONGELAMENTO", "TUNEL DE ENCOLHIMENTO", "TUNEL GIROFREEZER", "TUNEL IBEX"]],
  ["caldeira", ["CALDEIRA"]],
  ["gerador", ["GERADOR"]],
  ["compressor", ["COMPRESSOR", "SECADOR DE AR", "SECADOR ROTATIVO", "SEPARADOR DE LIQUIDO", "SEPARADOR DE LÍQUIDO"]],
  ["painel_eletrico", ["PAINEL", "QUADRO ELETRICO", "QUADRO DE COMANDO"]],
  ["veiculo", ["EMPILHADEIRA", "PALETEIRA", "RETROESCAVADEIRA", "CARREGADEIRA", "CAMBAO", "TRATOR", "CAMINHAO", "AMBULANCIA", "CACAMBA", "HB20", "STRADA", "S10 -", "RANGER -", "TCROSS", "COMBI -"]],
  ["bebedouro", ["BEBEDOURO"]],
  ["bomba", ["BOMBA"]],
  ["ventilador", ["VENTILADOR", "EXAUSTOR", "AGITADOR", "AERADOR"]],
  ["tanque_reservatorio", ["TANQUE", "RESERVATORIO", "CAIXA DE AGUA", "DEPOSITO", "SILO"]],
  ["esteira_transporte", ["ESTEIRA", "TRANSPORTADOR", "REDLER", "NOREA", "NORIA", "ROSCA", "ELEVADOR", "ELEVATORIA", "CHUTE", "SHOOT", "GUINCHO", "ROLO DE", "TAMBOR DE", "LINHA DE CONE"]],
  ["dosagem_tratamento", ["DOSADORA", "FLOTADOR", "RASPADOR", "DECANTADOR", "FILTRO", "TRIDECANTER", "DIGESTOR", "CICLONE", "PENEIRA", "PERCULADOR"]],
  ["cortina_ar", ["CORTINA DE AR"]],
  ["maquina_corte", ["CORTA", "CORTADOR", "TESOURA", "FACA", "GUILHOTINA"]],
  [
    "maquina_generica",
    [
      "MAQUINA",
      "MÁQUINA",
      "EMBALADORA",
      "SELADORA",
      "MISTURADOR",
      "MOINHO",
      "TRITURADOR",
      "PELETIZADORA",
      "DEPENADEIRA",
      "INSENSIBILIZADOR",
      "CONDICIONADOR DE RA",
      "DEPILADOR",
      "SANGRADOR",
      "PRENSA",
      "DESENGORDURADOR",
      "LIMPADOR",
      "EXTRATORA",
      "GRAMPEADEIRA",
    ],
  ],
];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function classificar(nome: string): string {
  const n = stripAccents(nome.toUpperCase());
  for (const [categoria, palavras] of CATEGORIAS) {
    for (const p of palavras) {
      if (n.includes(stripAccents(p))) return categoria;
    }
  }
  return "generico";
}

async function main() {
  const planos = await dbAll<{ id: number; nome: string }>(
    `SELECT p.id, a.nome FROM plano_inspecao p JOIN ativo a ON a.id = p.ativo_id
     WHERE p.excluido_em IS NULL AND NOT EXISTS (SELECT 1 FROM plano_inspecao_tarefa t WHERE t.plano_inspecao_id = p.id)`
  );
  console.log(`Planos sem checklist: ${planos.length}`);

  const contagem: Record<string, number> = {};
  const CHUNK = 40;
  let inseridos = 0;

  for (let i = 0; i < planos.length; i += CHUNK) {
    const lote = planos.slice(i, i + CHUNK);
    const valores: string[] = [];
    const params: unknown[] = [];
    let placeholder = 1;

    for (const plano of lote) {
      const categoria = classificar(plano.nome);
      contagem[categoria] = (contagem[categoria] ?? 0) + 1;
      const itens = CHECKLISTS[categoria];
      itens.forEach((item, ordem) => {
        valores.push(`($${placeholder++}, $${placeholder++}, $${placeholder++}, $${placeholder++}, 1)`);
        params.push(plano.id, ordem + 1, item.descricao, item.tipo_resposta);
        inseridos++;
      });
    }

    if (valores.length > 0) {
      await pool.query(
        `INSERT INTO plano_inspecao_tarefa (plano_inspecao_id, ordem, descricao, tipo_resposta, obrigatoria) VALUES ${valores.join(", ")}`,
        params
      );
    }
    console.log(`Processados ${Math.min(i + CHUNK, planos.length)} de ${planos.length}...`);
  }

  console.log("\n--- Resumo por categoria ---");
  for (const [categoria, n] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
    console.log(`${categoria}: ${n} equipamento(s), ${CHECKLISTS[categoria].length} item(ns) cada`);
  }
  console.log(`\nTotal de itens de checklist inseridos: ${inseridos}`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Falha no script:", err);
    pool.end().finally(() => process.exit(1));
  });
