import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { caminhoAtivo } from "./ativoService.js";
import { ajustarDiaNaoUtil, type TratamentoDiaNaoUtil } from "./recorrenciaService.js";
import { calcularOcorrenciasSemanais, type PeriodicidadeSemanal } from "./recorrenciaSemanalService.js";
import { dataInicioDaSemana } from "../lib/semanas.js";
import { listarTarefasDoPontoLubrificacao } from "./pontoLubrificacaoTarefaService.js";
import { processarComConcorrencia } from "../lib/concorrencia.js";

/** Limite de OS confirmadas em paralelo por lote — ver comentário em processarComConcorrencia. */
const CONCORRENCIA_CONFIRMACAO = 8;

export type StatusLoteLubrificacao = "simulado" | "confirmado" | "revertido";

export interface FiltrosGeracaoLubrificacao {
  ativoId?: number;
  periodicidade?: string;
  texto?: string;
}

export interface PontoDaOcorrencia {
  id: number;
  codigo: string;
  descricao: string;
  especificacao: string | null;
  instrucoes: string | null;
  periodicidade: PeriodicidadeSemanal;
}

export interface OcorrenciaLubrificacaoSimulada {
  ponto_id: number;
  ponto_codigo: string;
  ponto_descricao: string;
  pontos: PontoDaOcorrencia[];
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  prioridade: string;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  data_prevista: string;
  data_ajustada: string;
  data_limite: string;
  horas_estimadas: number;
  chave_idempotencia: string;
  ja_gerada: boolean;
}

export interface AlertaSobrecargaLubrificacao {
  responsavel_id: number;
  responsavel_nome: string;
  data: string;
  horas_totais: number;
  limite_horas: number;
}

export interface ResultadoSimulacaoLubrificacao {
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  data_inicio: string;
  data_fim: string;
  tratamento_dia_nao_util: TratamentoDiaNaoUtil;
  ocorrencias: OcorrenciaLubrificacaoSimulada[];
  total_novas: number;
  total_ja_geradas: number;
  sobrecargas: AlertaSobrecargaLubrificacao[];
}

export interface LoteGeracaoLubrificacao {
  id: number;
  codigo: string;
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  filtros_aplicados: string | null;
  quantidade_gerada: number;
  gerado_em: string;
  gerado_por: number;
  gerado_por_nome: string;
  status: StatusLoteLubrificacao;
  revertido_em: string | null;
  revertido_por: number | null;
}

export class ErroValidacaoLoteLubrificacao extends Error {}

interface PontoElegivel {
  id: number;
  codigo: string;
  descricao: string;
  especificacao: string | null;
  instrucoes: string | null;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  periodicidade: PeriodicidadeSemanal;
  semana_base: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
  ativo: number;
  duracao_estimada_horas: number;
  responsavel_padrao_id: number | null;
  responsavel_nome: string | null;
  prioridade_padrao: string;
}

async function configuracao<T>(chave: string, padrao: T): Promise<T> {
  const row = await dbGet<{ valor: string }>("SELECT valor FROM configuracao WHERE chave = ?", [chave]);
  return row ? (JSON.parse(row.valor) as T) : padrao;
}

function somarDiasIso(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

const ORDEM_PRIORIDADE = ["baixa", "media", "alta", "critica"];

function prioridadeMaisAlta(a: string, b: string): string {
  return ORDEM_PRIORIDADE.indexOf(b) > ORDEM_PRIORIDADE.indexOf(a) ? b : a;
}

async function pontosElegiveis(filtros: FiltrosGeracaoLubrificacao): Promise<PontoElegivel[]> {
  const condicoes = ["p.ativo = 1", "p.excluido_em IS NULL", "a.excluido_em IS NULL"];
  const params: unknown[] = [];
  if (filtros.ativoId) {
    condicoes.push("p.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.periodicidade) {
    condicoes.push("p.periodicidade = ?");
    params.push(filtros.periodicidade);
  }
  if (filtros.texto) {
    condicoes.push("(p.codigo ILIKE ? OR p.descricao ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  const sql = `
    SELECT p.id, p.codigo, p.descricao, p.especificacao, p.instrucoes, p.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
           p.periodicidade, p.semana_base, p.data_inicio_vigencia, p.data_fim_vigencia, p.ativo,
           p.duracao_estimada_horas, p.responsavel_padrao_id, u.nome AS responsavel_nome, p.prioridade_padrao
    FROM ponto_lubrificacao p
    JOIN ativo a ON a.id = p.ativo_id
    LEFT JOIN usuario u ON u.id = p.responsavel_padrao_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY a.nome, p.descricao
  `;
  return (await dbAll(sql, params)) as unknown as PontoElegivel[];
}

interface OcorrenciaIndividual {
  ponto: PontoElegivel;
  data_prevista: string;
  data_ajustada: string;
}

/** Mesma ideia de consolidarPorAtivoEData (loteGeracaoService.ts): pontos do mesmo ativo vencendo
 * na mesma semana viram uma OS só, não uma por ponto. */
async function consolidarPorAtivoEData(individuais: OcorrenciaIndividual[], margemDias: number): Promise<OcorrenciaLubrificacaoSimulada[]> {
  const grupos = new Map<string, OcorrenciaIndividual[]>();
  for (const o of individuais) {
    const chave = `${o.ponto.ativo_id}:${o.data_ajustada}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(o);
  }

  const resultado: OcorrenciaLubrificacaoSimulada[] = [];
  for (const membros of grupos.values()) {
    membros.sort((a, b) => a.ponto.id - b.ponto.id);
    const principal = membros[0].ponto;
    const dataAjustada = membros[0].data_ajustada;

    const responsaveisDoGrupo = new Set(membros.map((m) => m.ponto.responsavel_padrao_id));
    const chaveIdempotencia = `lub:${principal.ativo_id}:${dataAjustada}`;
    const existente = await dbGet("SELECT id FROM ordem_servico WHERE chave_idempotencia = ?", [chaveIdempotencia]);

    resultado.push({
      ponto_id: principal.id,
      ponto_codigo: principal.codigo,
      ponto_descricao: principal.descricao,
      pontos: membros.map((m) => ({
        id: m.ponto.id,
        codigo: m.ponto.codigo,
        descricao: m.ponto.descricao,
        especificacao: m.ponto.especificacao,
        instrucoes: m.ponto.instrucoes,
        periodicidade: m.ponto.periodicidade,
      })),
      ativo_id: principal.ativo_id,
      ativo_codigo: principal.ativo_codigo,
      ativo_nome: principal.ativo_nome,
      ativo_caminho: await caminhoAtivo(principal.ativo_id),
      prioridade: membros.reduce((maior, m) => prioridadeMaisAlta(maior, m.ponto.prioridade_padrao), "baixa"),
      responsavel_id: responsaveisDoGrupo.size === 1 ? principal.responsavel_padrao_id : null,
      responsavel_nome: responsaveisDoGrupo.size === 1 ? principal.responsavel_nome : null,
      data_prevista: membros[0].data_prevista,
      data_ajustada: dataAjustada,
      data_limite: somarDiasIso(dataAjustada, margemDias),
      horas_estimadas: membros.reduce((soma, m) => soma + m.ponto.duracao_estimada_horas, 0),
      chave_idempotencia: chaveIdempotencia,
      ja_gerada: !!existente,
    });
  }
  return resultado;
}

export async function simular(
  ano: number,
  semanaInicio: number,
  semanaFim: number,
  filtros: FiltrosGeracaoLubrificacao = {}
): Promise<ResultadoSimulacaoLubrificacao> {
  const tratamento = await configuracao<TratamentoDiaNaoUtil>("tratamento_dia_nao_util", "gerar_na_data");
  const margemDias = await configuracao<number>("margem_seguranca_dias", 7);
  const limiteHorasDia = await configuracao<number>("limite_horas_dia_responsavel", 8);
  const feriados = new Set((await dbAll<{ data: string }>("SELECT data FROM feriado")).map((f) => f.data));

  const dataInicio = dataInicioDaSemana(ano, semanaInicio);
  const dataFim = somarDiasIso(dataInicioDaSemana(ano, semanaFim + 1), -1);

  const individuais: OcorrenciaIndividual[] = [];
  for (const ponto of await pontosElegiveis(filtros)) {
    const datas = calcularOcorrenciasSemanais(
      {
        periodicidade: ponto.periodicidade,
        semana_base: ponto.semana_base,
        data_inicio_vigencia: ponto.data_inicio_vigencia,
        data_fim_vigencia: ponto.data_fim_vigencia,
        ativo: ponto.ativo,
      },
      dataInicio,
      dataFim
    );
    for (const dataPrevista of datas) {
      const dataAjustada = ajustarDiaNaoUtil(dataPrevista, tratamento, feriados);
      individuais.push({ ponto, data_prevista: dataPrevista, data_ajustada: dataAjustada });
    }
  }

  const ocorrencias = await consolidarPorAtivoEData(individuais, margemDias);
  ocorrencias.sort((a, b) => a.data_ajustada.localeCompare(b.data_ajustada) || a.ativo_nome.localeCompare(b.ativo_nome));

  const cargaPorResponsavelData = new Map<string, { responsavel_id: number; responsavel_nome: string; data: string; horas: number }>();
  for (const o of ocorrencias) {
    if (o.ja_gerada || !o.responsavel_id) continue;
    const chave = `${o.responsavel_id}:${o.data_ajustada}`;
    const atual = cargaPorResponsavelData.get(chave) ?? {
      responsavel_id: o.responsavel_id,
      responsavel_nome: o.responsavel_nome ?? "",
      data: o.data_ajustada,
      horas: 0,
    };
    atual.horas += o.horas_estimadas;
    cargaPorResponsavelData.set(chave, atual);
  }
  const sobrecargas: AlertaSobrecargaLubrificacao[] = [...cargaPorResponsavelData.values()]
    .filter((c) => c.horas > limiteHorasDia)
    .map((c) => ({ responsavel_id: c.responsavel_id, responsavel_nome: c.responsavel_nome, data: c.data, horas_totais: c.horas, limite_horas: limiteHorasDia }));

  return {
    ano,
    semana_inicio: semanaInicio,
    semana_fim: semanaFim,
    data_inicio: dataInicio,
    data_fim: dataFim,
    tratamento_dia_nao_util: tratamento,
    ocorrencias,
    total_novas: ocorrencias.filter((o) => !o.ja_gerada).length,
    total_ja_geradas: ocorrencias.filter((o) => o.ja_gerada).length,
    sobrecargas,
  };
}

const COLUNAS_LOTE = `
  l.id, l.codigo, l.ano, l.semana_inicio, l.semana_fim, l.filtros_aplicados,
  l.quantidade_gerada, l.gerado_em, l.gerado_por, u.nome AS gerado_por_nome, l.status,
  l.revertido_em, l.revertido_por
`;

export async function listarLotes(): Promise<LoteGeracaoLubrificacao[]> {
  return (await dbAll(
    `SELECT ${COLUNAS_LOTE} FROM lote_geracao_lubrificacao l JOIN usuario u ON u.id = l.gerado_por ORDER BY l.gerado_em DESC`
  )) as unknown as LoteGeracaoLubrificacao[];
}

export async function buscarLotePorId(id: number): Promise<LoteGeracaoLubrificacao | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS_LOTE} FROM lote_geracao_lubrificacao l JOIN usuario u ON u.id = l.gerado_por WHERE l.id = ?`,
    [id]
  )) as LoteGeracaoLubrificacao | undefined;
  return row ?? null;
}

export async function codigoSugerido(): Promise<string> {
  const rows = await dbAll<{ codigo: string }>("SELECT codigo FROM lote_geracao_lubrificacao WHERE codigo LIKE 'LOTE-LUB-%'");
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("LOTE-LUB-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `LOTE-LUB-${String(maior + 1).padStart(4, "0")}`;
}

export async function criarLote(
  codigo: string,
  ano: number,
  semanaInicio: number,
  semanaFim: number,
  filtros: FiltrosGeracaoLubrificacao,
  usuarioId: number
): Promise<LoteGeracaoLubrificacao> {
  if (semanaFim < semanaInicio) {
    throw new ErroValidacaoLoteLubrificacao("A semana final do período não pode ser anterior à semana inicial.");
  }
  const existente = await dbGet("SELECT id FROM lote_geracao_lubrificacao WHERE codigo = ?", [codigo]);
  if (existente) {
    throw new ErroValidacaoLoteLubrificacao(`Já existe um lote com o código "${codigo}".`);
  }

  const info = await dbRun(
    `INSERT INTO lote_geracao_lubrificacao (codigo, ano, semana_inicio, semana_fim, filtros_aplicados, quantidade_gerada, gerado_por, status, gerado_em)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'simulado', (now() - interval '4 hours')) RETURNING id`,
    [codigo, ano, semanaInicio, semanaFim, JSON.stringify(filtros ?? {}), usuarioId]
  );

  const lote = (await buscarLotePorId(info.id!))!;
  await registrarAuditoria({ entidade: "lote_geracao_lubrificacao", entidade_id: lote.id, acao: "criar", valor_novo: lote, usuario_id: usuarioId });
  return lote;
}

async function proximoNumeroOS(): Promise<number> {
  // MAX calculado no próprio Postgres em vez de trazer toda a tabela pra somar em JS — a versão
  // antiga escalava mal (uma consulta desnecessariamente pesada a cada confirmação de lote).
  const row = await dbGet<{ maior: number | null }>(
    "SELECT MAX((substring(codigo from 4))::int) AS maior FROM ordem_servico WHERE codigo ~ '^OS-[0-9]+$'"
  );
  return row?.maior ?? 0;
}

/** Postgres sinaliza violação de UNIQUE com o código SQLSTATE 23505 (a mensagem não é mais "UNIQUE constraint failed" como no SQLite). */
function ehErroDeDuplicidade(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function confirmarLote(
  loteId: number,
  usuarioId: number
): Promise<{ lote: LoteGeracaoLubrificacao; ordens_criadas: number; ocorrencias_ignoradas: number }> {
  const lote = await buscarLotePorId(loteId);
  if (!lote) {
    throw new ErroValidacaoLoteLubrificacao("Lote de geração não encontrado.");
  }
  if (lote.status !== "simulado") {
    throw new ErroValidacaoLoteLubrificacao('Somente lotes com status "simulado" podem ser confirmados.');
  }

  const filtros = lote.filtros_aplicados ? (JSON.parse(lote.filtros_aplicados) as FiltrosGeracaoLubrificacao) : {};
  const simulacao = await simular(lote.ano, lote.semana_inicio, lote.semana_fim, filtros);

  const SQL_INSERIR_OS = `INSERT INTO ordem_servico (
      codigo, ativo_id, ponto_lubrificacao_id, lote_geracao_lubrificacao_id, tipo, origem, prioridade, status,
      descricao, data_programada, data_limite, responsavel_id, horas_estimadas, chave_idempotencia, data_abertura
    ) VALUES (?, ?, ?, ?, 'lubrificacao', 'lubrificacao_lote', ?, 'programada', ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`;
  const SQL_INSERIR_OS_PONTO = `INSERT INTO os_ponto_lubrificacao (os_id, ponto_lubrificacao_id) VALUES (?, ?)`;
  const SQL_INSERIR_TAREFA = `INSERT INTO os_tarefa (os_id, ordem, descricao, tipo_resposta, obrigatoria, valor_min, valor_max, unidade, regime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  let proximoNumero = await proximoNumeroOS();
  let criadas = 0;
  let ignoradas = 0;

  // Um ponto recorrente aparece em várias ocorrências do período — cachear evita repetir a mesma
  // consulta de tarefas dezenas de vezes.
  const cacheTarefasDoPonto = new Map<number, ReturnType<typeof listarTarefasDoPontoLubrificacao>>();
  const tarefasDoPontoCache = (pontoId: number) => {
    let p = cacheTarefasDoPonto.get(pontoId);
    if (!p) {
      p = listarTarefasDoPontoLubrificacao(pontoId);
      cacheTarefasDoPonto.set(pontoId, p);
    }
    return p;
  };

  const pendentes: { o: (typeof simulacao.ocorrencias)[number]; codigoOS: string }[] = [];
  for (const o of simulacao.ocorrencias) {
    if (o.ja_gerada) {
      ignoradas++;
      continue;
    }
    proximoNumero++;
    pendentes.push({ o, codigoOS: `OS-${String(proximoNumero).padStart(6, "0")}` });
  }

  // LOTE-PERF: ver processarComConcorrencia — cada ocorrência processada em série fazia vários
  // round-trips sequenciais ao Postgres, o que estourava o tempo limite da function serverless
  // em lotes de poucas dezenas de OS.
  const resultados = await processarComConcorrencia(pendentes, CONCORRENCIA_CONFIRMACAO, async ({ o, codigoOS }) => {
    const descricao =
      o.pontos.length === 1
        ? `Lubrificação conforme ponto ${o.ponto_codigo} — ${o.ponto_descricao}`
        : `Lubrificação consolidada — ${o.pontos.length} pontos: ${o.pontos.map((p) => `${p.codigo} (${p.descricao})`).join("; ")}`;

    let osId: number;
    try {
      const info = await dbRun(SQL_INSERIR_OS, [
        codigoOS,
        o.ativo_id,
        o.ponto_id,
        lote.id,
        o.prioridade,
        descricao,
        o.data_ajustada,
        o.data_limite,
        o.responsavel_id,
        o.horas_estimadas,
        o.chave_idempotencia,
      ]);
      osId = info.id!;
    } catch (err) {
      if (ehErroDeDuplicidade(err)) return "ignorada" as const;
      throw err;
    }

    const tarefasPorPonto = await Promise.all(o.pontos.map((p) => tarefasDoPontoCache(p.id)));
    let ordemTarefa = 0;
    const tarefasParaInserir = tarefasPorPonto.flat().map((t) => ({ ...t, ordem: ++ordemTarefa }));

    await Promise.all([
      ...o.pontos.map((p) => dbRun(SQL_INSERIR_OS_PONTO, [osId, p.id])),
      ...tarefasParaInserir.map((t) =>
        dbRun(SQL_INSERIR_TAREFA, [osId, t.ordem, t.descricao, t.tipo_resposta, t.obrigatoria, t.valor_min, t.valor_max, t.unidade, t.regime])
      ),
      registrarAuditoria({
        entidade: "ordem_servico",
        entidade_id: osId,
        acao: "criar",
        valor_novo: {
          codigo: codigoOS,
          origem: "lubrificacao_lote",
          lote_geracao_lubrificacao_id: lote.id,
          pontos_id: o.pontos.map((p) => p.id),
          data_programada: o.data_ajustada,
        },
        usuario_id: usuarioId,
      }),
    ]);

    return "criada" as const;
  });

  for (const r of resultados) {
    if (r === "criada") criadas++;
    else ignoradas++;
  }

  await dbRun("UPDATE lote_geracao_lubrificacao SET quantidade_gerada = ?, status = 'confirmado' WHERE id = ?", [criadas, lote.id]);
  const atualizado = (await buscarLotePorId(lote.id))!;
  await registrarAuditoria({
    entidade: "lote_geracao_lubrificacao",
    entidade_id: lote.id,
    acao: "status",
    valor_anterior: lote,
    valor_novo: atualizado,
    usuario_id: usuarioId,
  });
  return { lote: atualizado, ordens_criadas: criadas, ocorrencias_ignoradas: ignoradas };
}

export async function reverterLote(
  loteId: number,
  usuarioId: number
): Promise<{ lote: LoteGeracaoLubrificacao; revertidas: number; naoRevertidas: number }> {
  const lote = await buscarLotePorId(loteId);
  if (!lote) {
    throw new ErroValidacaoLoteLubrificacao("Lote de geração não encontrado.");
  }
  if (lote.status !== "confirmado") {
    throw new ErroValidacaoLoteLubrificacao("Somente lotes confirmados podem ser revertidos.");
  }

  const osDoLote = await dbAll<{ id: number; status: string }>(
    "SELECT id, status FROM ordem_servico WHERE lote_geracao_lubrificacao_id = ?",
    [loteId]
  );

  let revertidas = 0;
  let naoRevertidas = 0;
  for (const os of osDoLote) {
    if (os.status !== "programada") {
      naoRevertidas++;
      continue;
    }
    await dbRun("DELETE FROM os_ponto_lubrificacao WHERE os_id = ?", [os.id]);
    await dbRun("DELETE FROM os_tarefa WHERE os_id = ?", [os.id]);
    await dbRun("DELETE FROM ordem_servico WHERE id = ?", [os.id]);
    revertidas++;
  }

  await dbRun(
    "UPDATE lote_geracao_lubrificacao SET status = 'revertido', revertido_em = (now() - interval '4 hours'), revertido_por = ? WHERE id = ?",
    [usuarioId, loteId]
  );
  const atualizado = (await buscarLotePorId(loteId))!;
  await registrarAuditoria({
    entidade: "lote_geracao_lubrificacao",
    entidade_id: loteId,
    acao: "status",
    valor_anterior: lote,
    valor_novo: atualizado,
    usuario_id: usuarioId,
  });
  return { lote: atualizado, revertidas, naoRevertidas };
}
