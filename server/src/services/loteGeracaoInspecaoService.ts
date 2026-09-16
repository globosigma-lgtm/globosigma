import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { caminhosAtivos } from "./ativoService.js";
import { ajustarDiaNaoUtil, type TratamentoDiaNaoUtil } from "./recorrenciaService.js";
import { calcularOcorrenciasIntervaloSemanal } from "./recorrenciaSemanalService.js";
import { dataInicioDaSemana } from "../lib/semanas.js";
import { listarTarefasDoPlanoInspecao } from "./planoInspecaoTarefaService.js";
import { processarComConcorrencia } from "../lib/concorrencia.js";

/** Limite de OS confirmadas em paralelo por lote — ver comentário em processarComConcorrencia. */
const CONCORRENCIA_CONFIRMACAO = 8;
import type { ClassePeriodicidadeInspecao } from "./planoInspecaoService.js";

export type StatusLoteInspecao = "simulado" | "confirmado" | "revertido";

export interface FiltrosGeracaoInspecao {
  ativoId?: number;
  classePeriodicidade?: string;
  texto?: string;
}

export interface OcorrenciaInspecaoSimulada {
  plano_id: number;
  plano_codigo: string;
  tag: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  classe_periodicidade: ClassePeriodicidadeInspecao | null;
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

export interface AlertaSobrecargaInspecao {
  responsavel_id: number;
  responsavel_nome: string;
  data: string;
  horas_totais: number;
  limite_horas: number;
}

export interface ResultadoSimulacaoInspecao {
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  data_inicio: string;
  data_fim: string;
  tratamento_dia_nao_util: TratamentoDiaNaoUtil;
  ocorrencias: OcorrenciaInspecaoSimulada[];
  total_novas: number;
  total_ja_geradas: number;
  sobrecargas: AlertaSobrecargaInspecao[];
}

export interface LoteGeracaoInspecao {
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
  status: StatusLoteInspecao;
  revertido_em: string | null;
  revertido_por: number | null;
}

export class ErroValidacaoLoteInspecao extends Error {}

interface PlanoElegivel {
  id: number;
  codigo: string;
  tag: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  classe_periodicidade: ClassePeriodicidadeInspecao | null;
  intervalo_semanas: number | null;
  semana_base: number | null;
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

async function planosElegiveis(filtros: FiltrosGeracaoInspecao): Promise<PlanoElegivel[]> {
  const condicoes = ["p.ativo = 1", "p.excluido_em IS NULL", "a.excluido_em IS NULL", "p.intervalo_semanas IS NOT NULL"];
  const params: unknown[] = [];
  if (filtros.ativoId) {
    condicoes.push("p.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.classePeriodicidade) {
    condicoes.push("p.classe_periodicidade = ?");
    params.push(filtros.classePeriodicidade);
  }
  if (filtros.texto) {
    condicoes.push("(p.codigo ILIKE ? OR p.tag ILIKE ? OR a.nome ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  const sql = `
    SELECT p.id, p.codigo, p.tag, p.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
           p.classe_periodicidade, p.intervalo_semanas, p.semana_base, p.data_inicio_vigencia, p.data_fim_vigencia, p.ativo,
           p.duracao_estimada_horas, p.responsavel_padrao_id, u.nome AS responsavel_nome, p.prioridade_padrao
    FROM plano_inspecao p
    JOIN ativo a ON a.id = p.ativo_id
    LEFT JOIN usuario u ON u.id = p.responsavel_padrao_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY a.nome
  `;
  return (await dbAll(sql, params)) as unknown as PlanoElegivel[];
}

export async function simular(
  ano: number,
  semanaInicio: number,
  semanaFim: number,
  filtros: FiltrosGeracaoInspecao = {}
): Promise<ResultadoSimulacaoInspecao> {
  const tratamento = await configuracao<TratamentoDiaNaoUtil>("tratamento_dia_nao_util", "gerar_na_data");
  const margemDias = await configuracao<number>("margem_seguranca_dias", 7);
  const limiteHorasDia = await configuracao<number>("limite_horas_dia_responsavel", 8);
  const feriados = new Set((await dbAll<{ data: string }>("SELECT data FROM feriado")).map((f) => f.data));

  const dataInicio = dataInicioDaSemana(ano, semanaInicio);
  const dataFim = somarDiasIso(dataInicioDaSemana(ano, semanaFim + 1), -1);

  // PERF-01 (mesmo problema de calendarioInspecaoService.ts): com ~780 planos elegíveis, um dbGet
  // (idempotência) + uma consulta de caminho de ativo POR OCORRÊNCIA vira milhares de round-trips
  // seriais. Busca-se a idempotência de uma vez e cacheia-se o caminho por ativo (não por plano).
  const chavesGeradas = new Set(
    ((await dbAll("SELECT chave_idempotencia FROM ordem_servico WHERE chave_idempotencia LIKE 'insp:%'")) as { chave_idempotencia: string }[]).map(
      (r) => r.chave_idempotencia
    )
  );
  const planos = await planosElegiveis(filtros);
  const caminhoPorAtivo = await caminhosAtivos(planos.map((p) => p.ativo_id));

  const ocorrencias: OcorrenciaInspecaoSimulada[] = [];
  for (const plano of planos) {
    const datas = calcularOcorrenciasIntervaloSemanal(
      {
        intervalo_semanas: plano.intervalo_semanas!,
        semana_base: plano.semana_base!,
        data_inicio_vigencia: plano.data_inicio_vigencia,
        data_fim_vigencia: plano.data_fim_vigencia,
        ativo: plano.ativo,
      },
      dataInicio,
      dataFim
    );
    for (const dataPrevista of datas) {
      const dataAjustada = ajustarDiaNaoUtil(dataPrevista, tratamento, feriados);
      const dataLimite = somarDiasIso(dataAjustada, margemDias);
      const chaveIdempotencia = `insp:${plano.ativo_id}:${dataAjustada}`;
      ocorrencias.push({
        plano_id: plano.id,
        plano_codigo: plano.codigo,
        tag: plano.tag,
        ativo_id: plano.ativo_id,
        ativo_codigo: plano.ativo_codigo,
        ativo_nome: plano.ativo_nome,
        ativo_caminho: caminhoPorAtivo.get(plano.ativo_id) ?? plano.ativo_nome,
        classe_periodicidade: plano.classe_periodicidade,
        prioridade: plano.prioridade_padrao,
        responsavel_id: plano.responsavel_padrao_id,
        responsavel_nome: plano.responsavel_nome,
        data_prevista: dataPrevista,
        data_ajustada: dataAjustada,
        data_limite: dataLimite,
        horas_estimadas: plano.duracao_estimada_horas,
        chave_idempotencia: chaveIdempotencia,
        ja_gerada: chavesGeradas.has(chaveIdempotencia),
      });
    }
  }

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
  const sobrecargas: AlertaSobrecargaInspecao[] = [...cargaPorResponsavelData.values()]
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

export async function listarLotes(): Promise<LoteGeracaoInspecao[]> {
  return (await dbAll(
    `SELECT ${COLUNAS_LOTE} FROM lote_geracao_inspecao l JOIN usuario u ON u.id = l.gerado_por ORDER BY l.gerado_em DESC`
  )) as unknown as LoteGeracaoInspecao[];
}

export async function buscarLotePorId(id: number): Promise<LoteGeracaoInspecao | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS_LOTE} FROM lote_geracao_inspecao l JOIN usuario u ON u.id = l.gerado_por WHERE l.id = ?`,
    [id]
  )) as LoteGeracaoInspecao | undefined;
  return row ?? null;
}

export async function codigoSugerido(): Promise<string> {
  const rows = await dbAll<{ codigo: string }>("SELECT codigo FROM lote_geracao_inspecao WHERE codigo LIKE 'LOTE-INS-%'");
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("LOTE-INS-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `LOTE-INS-${String(maior + 1).padStart(4, "0")}`;
}

export async function criarLote(
  codigo: string,
  ano: number,
  semanaInicio: number,
  semanaFim: number,
  filtros: FiltrosGeracaoInspecao,
  usuarioId: number
): Promise<LoteGeracaoInspecao> {
  if (semanaFim < semanaInicio) {
    throw new ErroValidacaoLoteInspecao("A semana final do período não pode ser anterior à semana inicial.");
  }
  const existente = await dbGet("SELECT id FROM lote_geracao_inspecao WHERE codigo = ?", [codigo]);
  if (existente) {
    throw new ErroValidacaoLoteInspecao(`Já existe um lote com o código "${codigo}".`);
  }

  const info = await dbRun(
    `INSERT INTO lote_geracao_inspecao (codigo, ano, semana_inicio, semana_fim, filtros_aplicados, quantidade_gerada, gerado_por, status, gerado_em)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'simulado', (now() - interval '4 hours')) RETURNING id`,
    [codigo, ano, semanaInicio, semanaFim, JSON.stringify(filtros ?? {}), usuarioId]
  );

  const lote = (await buscarLotePorId(info.id!))!;
  await registrarAuditoria({ entidade: "lote_geracao_inspecao", entidade_id: lote.id, acao: "criar", valor_novo: lote, usuario_id: usuarioId });
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

/** Postgres sinaliza violação de UNIQUE com o código SQLSTATE 23505. */
function ehErroDeDuplicidade(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function confirmarLote(
  loteId: number,
  usuarioId: number
): Promise<{ lote: LoteGeracaoInspecao; ordens_criadas: number; ocorrencias_ignoradas: number }> {
  const lote = await buscarLotePorId(loteId);
  if (!lote) {
    throw new ErroValidacaoLoteInspecao("Lote de geração não encontrado.");
  }
  if (lote.status !== "simulado") {
    throw new ErroValidacaoLoteInspecao('Somente lotes com status "simulado" podem ser confirmados.');
  }

  const filtros = lote.filtros_aplicados ? (JSON.parse(lote.filtros_aplicados) as FiltrosGeracaoInspecao) : {};
  const simulacao = await simular(lote.ano, lote.semana_inicio, lote.semana_fim, filtros);

  const SQL_INSERIR_OS = `INSERT INTO ordem_servico (
      codigo, ativo_id, plano_inspecao_id, lote_geracao_inspecao_id, tipo, subtipo_inspecao, origem, prioridade, status,
      descricao, data_programada, data_limite, responsavel_id, horas_estimadas, chave_idempotencia, data_abertura
    ) VALUES (?, ?, ?, ?, 'inspecao', 'periodica', 'inspecao_lote', ?, 'programada', ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`;
  const SQL_INSERIR_TAREFA = `INSERT INTO os_tarefa (os_id, ordem, descricao, tipo_resposta, obrigatoria, valor_min, valor_max, unidade)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  let proximoNumero = await proximoNumeroOS();
  let criadas = 0;
  let ignoradas = 0;

  // Um plano de inspeção recorrente aparece em várias ocorrências do período — cachear evita
  // repetir a mesma consulta de tarefas dezenas de vezes.
  const cacheTarefasDoPlano = new Map<number, ReturnType<typeof listarTarefasDoPlanoInspecao>>();
  const tarefasDoPlanoCache = (planoId: number) => {
    let p = cacheTarefasDoPlano.get(planoId);
    if (!p) {
      p = listarTarefasDoPlanoInspecao(planoId);
      cacheTarefasDoPlano.set(planoId, p);
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
    const descricao = `Inspeção conforme plano ${o.plano_codigo} — ${o.tag}`;

    let osId: number;
    try {
      const info = await dbRun(SQL_INSERIR_OS, [
        codigoOS,
        o.ativo_id,
        o.plano_id,
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

    const tarefas = await tarefasDoPlanoCache(o.plano_id);

    await Promise.all([
      ...tarefas.map((t, i) =>
        dbRun(SQL_INSERIR_TAREFA, [osId, i + 1, t.descricao, t.tipo_resposta, t.obrigatoria, t.valor_min, t.valor_max, t.unidade])
      ),
      registrarAuditoria({
        entidade: "ordem_servico",
        entidade_id: osId,
        acao: "criar",
        valor_novo: {
          codigo: codigoOS,
          origem: "inspecao_lote",
          lote_geracao_inspecao_id: lote.id,
          plano_inspecao_id: o.plano_id,
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

  await dbRun("UPDATE lote_geracao_inspecao SET quantidade_gerada = ?, status = 'confirmado' WHERE id = ?", [criadas, lote.id]);
  const atualizado = (await buscarLotePorId(lote.id))!;
  await registrarAuditoria({
    entidade: "lote_geracao_inspecao",
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
): Promise<{ lote: LoteGeracaoInspecao; revertidas: number; naoRevertidas: number }> {
  const lote = await buscarLotePorId(loteId);
  if (!lote) {
    throw new ErroValidacaoLoteInspecao("Lote de geração não encontrado.");
  }
  if (lote.status !== "confirmado") {
    throw new ErroValidacaoLoteInspecao("Somente lotes confirmados podem ser revertidos.");
  }

  const osDoLote = await dbAll<{ id: number; status: string }>(
    "SELECT id, status FROM ordem_servico WHERE lote_geracao_inspecao_id = ?",
    [loteId]
  );

  let revertidas = 0;
  let naoRevertidas = 0;
  for (const os of osDoLote) {
    if (os.status !== "programada") {
      naoRevertidas++;
      continue;
    }
    await dbRun("DELETE FROM os_tarefa WHERE os_id = ?", [os.id]);
    await dbRun("DELETE FROM ordem_servico WHERE id = ?", [os.id]);
    revertidas++;
  }

  await dbRun(
    "UPDATE lote_geracao_inspecao SET status = 'revertido', revertido_em = (now() - interval '4 hours'), revertido_por = ? WHERE id = ?",
    [usuarioId, loteId]
  );
  const atualizado = (await buscarLotePorId(loteId))!;
  await registrarAuditoria({
    entidade: "lote_geracao_inspecao",
    entidade_id: loteId,
    acao: "status",
    valor_anterior: lote,
    valor_novo: atualizado,
    usuario_id: usuarioId,
  });
  return { lote: atualizado, revertidas, naoRevertidas };
}
