import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { dbAll, dbGet, dbRun } from "../db/pg.js";
import { hojeSistema } from "../lib/horarioSistema.js";
import { ajustarDiaNaoUtil, type TratamentoDiaNaoUtil } from "../services/recorrenciaService.js";
import { calcularOcorrenciasIntervaloSemanal } from "../services/recorrenciaSemanalService.js";
import {
  atribuirResponsavelPadraoEmLote,
  atualizarPlanoInspecao,
  buscarPlanoInspecaoPorId,
  codigoSugerido as codigoPlanoSugerido,
  criarPlanoInspecao,
  ErroValidacaoPlanoInspecao,
  excluirPlanoInspecao,
  listarPlanosInspecao,
} from "../services/planoInspecaoService.js";
import {
  atualizarTarefaInspecao,
  criarTarefaInspecao,
  ErroValidacaoTarefaInspecao,
  listarTarefasDoPlanoInspecao,
  moverTarefaInspecao,
  removerTarefaInspecao,
} from "../services/planoInspecaoTarefaService.js";
import {
  buscarLotePorId,
  codigoSugerido as codigoLoteSugerido,
  confirmarLote,
  criarLote,
  ErroValidacaoLoteInspecao,
  listarLotes,
  reverterLote,
  simular,
} from "../services/loteGeracaoInspecaoService.js";
import { obterCalendarioInspecao } from "../services/calendarioInspecaoService.js";
import {
  atribuirEmLote,
  buscarOSPorId,
  criarOSAvulsa,
  criarOSCorretivaDeInspecao,
  editarOS,
  ErroValidacaoOS,
  listarOS,
} from "../services/osService.js";
import {
  atribuirAuditoria,
  concluirAuditoria,
  ErroValidacaoAuditoria,
  listarItensAuditoria,
  listarOSPendentesAuditoria,
  responderItemAuditoria,
} from "../services/auditoriaOSService.js";

export const inspecoesRouter = Router();

inspecoesRouter.use(exigirAutenticacao);

// INS-03: assim como a atribuição em lote de OS (ordensServico.ts), a permissão de módulo "editar"
// sozinha não distingue quem decide a carga de trabalho de um inspetor — só esses quatro perfis,
// por pedido explícito do usuário ("planejador, coordenador, supervisor ou administrador").
const PERFIS_ATRIBUICAO_INSPECAO = ["Administrador", "Coordenador de PCM", "Planejador", "Supervisor de manutenção"];

function exigirPerfilAtribuicao(req: import("express").Request, res: import("express").Response): boolean {
  if (!PERFIS_ATRIBUICAO_INSPECAO.includes(req.usuario?.perfil_nome ?? "")) {
    res.status(403).json({ erro: "Apenas Administrador, Coordenador de PCM, Planejador ou Supervisor de manutenção podem atribuir inspeções." });
    return false;
  }
  return true;
}

// ---------- Calendário ----------

inspecoesRouter.get("/calendario", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return res.status(400).json({ erro: "Informe um ano válido." });
  }
  const { ativoId, classePeriodicidade } = req.query;
  const linhas = await obterCalendarioInspecao(ano, {
    ativoId: ativoId ? Number(ativoId) : undefined,
    classePeriodicidade: typeof classePeriodicidade === "string" ? classePeriodicidade : undefined,
  });
  res.json({ ano, linhas });
}));

// ---------- Planos de inspeção ----------

const dadosPlanoSchema = z.object({
  codigo: z.string().min(1, "Informe o código do plano de inspeção."),
  ativo_id: z.number().int(),
  tag: z.string().min(1, "Informe o TAG do equipamento."),
  setor: z.string().nullable().optional(),
  classe_periodicidade: z.enum(["A", "B", "C"]).nullable().optional(),
  semana_base: z.number().int().min(1).max(53).nullable().optional(),
  duracao_estimada_horas: z.number().min(0).optional(),
  responsavel_padrao_id: z.number().int().nullable().optional(),
  prioridade_padrao: z.enum(["baixa", "media", "alta", "critica"]).optional(),
  instrucoes: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  data_inicio_vigencia: z.string().min(1, "Informe a data de início de vigência."),
  data_fim_vigencia: z.string().nullable().optional(),
});

inspecoesRouter.get("/planos", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  const { texto, ativoId, classePeriodicidade, apenasAtivos, apenasSemClasse } = req.query;
  const planos = await listarPlanosInspecao({
    texto: typeof texto === "string" ? texto : undefined,
    ativoId: ativoId ? Number(ativoId) : undefined,
    classePeriodicidade: typeof classePeriodicidade === "string" ? classePeriodicidade : undefined,
    apenasAtivos: apenasAtivos === "true",
    apenasSemClasse: apenasSemClasse === "true",
  });
  res.json({ planos });
}));

inspecoesRouter.get("/planos/codigo-sugerido", exigirPermissao("inspecoes", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoPlanoSugerido() });
}));

const atribuicaoLotePlanosSchema = z.object({
  ids: z.array(z.number().int()).min(1, "Selecione ao menos um plano."),
  responsavel_id: z.number().int().nullable(),
});

inspecoesRouter.put("/planos/atribuir-lote", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = atribuicaoLotePlanosSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const resultado = await atribuirResponsavelPadraoEmLote(parsed.data.ids, parsed.data.responsavel_id, req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoPlanoInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.get("/planos/:id", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  const plano = await buscarPlanoInspecaoPorId(Number(req.params.id));
  if (!plano) {
    return res.status(404).json({ erro: "Plano de inspeção não encontrado." });
  }
  res.json({ plano });
}));

inspecoesRouter.post("/planos", exigirPermissao("inspecoes", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosPlanoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const plano = await criarPlanoInspecao(parsed.data, req.usuario!.id);
    res.status(201).json({ plano });
  } catch (err) {
    if (err instanceof ErroValidacaoPlanoInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.put("/planos/:id", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosPlanoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const plano = await atualizarPlanoInspecao(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ plano });
  } catch (err) {
    if (err instanceof ErroValidacaoPlanoInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.delete("/planos/:id", exigirPermissao("inspecoes", "excluir"), asyncHandler(async (req, res) => {
  try {
    await excluirPlanoInspecao(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoPlanoInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosTarefaSchema = z.object({
  descricao: z.string().min(1, "Informe a descrição do item."),
  tipo_resposta: z.enum(["ok_nok", "texto", "numerico", "selecao"]),
  obrigatoria: z.boolean().optional(),
  valor_min: z.number().nullable().optional(),
  valor_max: z.number().nullable().optional(),
  unidade: z.string().nullable().optional(),
});

inspecoesRouter.get("/planos/:id/tarefas", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  res.json({ tarefas: await listarTarefasDoPlanoInspecao(Number(req.params.id)) });
}));

inspecoesRouter.post("/planos/:id/tarefas", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosTarefaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const tarefa = await criarTarefaInspecao(Number(req.params.id), parsed.data, req.usuario!.id);
  res.status(201).json({ tarefa });
}));

inspecoesRouter.put("/planos/:id/tarefas/:tarefaId", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosTarefaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const tarefa = await atualizarTarefaInspecao(Number(req.params.tarefaId), parsed.data, req.usuario!.id);
    res.json({ tarefa });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefaInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.delete("/planos/:id/tarefas/:tarefaId", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  try {
    await removerTarefaInspecao(Number(req.params.tarefaId), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefaInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.post("/planos/:id/tarefas/:tarefaId/mover", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  const direcao = req.body?.direcao;
  if (direcao !== "cima" && direcao !== "baixo") {
    return res.status(400).json({ erro: 'Direção inválida: use "cima" ou "baixo".' });
  }
  try {
    await moverTarefaInspecao(Number(req.params.tarefaId), direcao);
    res.json({ tarefas: await listarTarefasDoPlanoInspecao(Number(req.params.id)) });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefaInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

function somarMesesISO(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 + meses, dia));
  return data.toISOString().slice(0, 10);
}

inspecoesRouter.get("/planos/:id/ocorrencias", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  const plano = await buscarPlanoInspecaoPorId(Number(req.params.id));
  if (!plano) {
    return res.status(404).json({ erro: "Plano de inspeção não encontrado." });
  }
  const inicio = typeof req.query.inicio === "string" ? req.query.inicio : hojeSistema();
  const fim = typeof req.query.fim === "string" ? req.query.fim : somarMesesISO(inicio, 12);

  const configRow = await dbGet<{ valor: string }>("SELECT valor FROM configuracao WHERE chave = 'tratamento_dia_nao_util'");
  const tratamento: TratamentoDiaNaoUtil = configRow ? JSON.parse(configRow.valor) : "gerar_na_data";
  const feriados = new Set((await dbAll<{ data: string }>("SELECT data FROM feriado")).map((f) => f.data));

  if (!plano.intervalo_semanas || !plano.semana_base) {
    return res.json({ inicio, fim, tratamento_dia_nao_util: tratamento, ocorrencias: [] });
  }

  const brutas = calcularOcorrenciasIntervaloSemanal(
    {
      intervalo_semanas: plano.intervalo_semanas,
      semana_base: plano.semana_base,
      data_inicio_vigencia: plano.data_inicio_vigencia,
      data_fim_vigencia: plano.data_fim_vigencia,
      ativo: plano.ativo,
    },
    inicio,
    fim
  );
  const ocorrencias = brutas.map((data) => ({ data_prevista: data, data_ajustada: ajustarDiaNaoUtil(data, tratamento, feriados) }));

  res.json({ inicio, fim, tratamento_dia_nao_util: tratamento, ocorrencias });
}));

// ---------- Geração em lote ----------

const filtrosSchema = z.object({
  ativoId: z.number().int().optional(),
  classePeriodicidade: z.string().optional(),
  texto: z.string().optional(),
});

const simularSchema = z.object({
  ano: z.number().int().min(2000).max(2100),
  semana_inicio: z.number().int().min(1).max(53),
  semana_fim: z.number().int().min(1).max(53),
  filtros: filtrosSchema.optional(),
});

inspecoesRouter.get("/lotes", exigirPermissao("inspecoes", "ver"), asyncHandler(async (_req, res) => {
  res.json({ lotes: await listarLotes() });
}));

inspecoesRouter.get("/lotes/codigo-sugerido", exigirPermissao("inspecoes", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoLoteSugerido() });
}));

inspecoesRouter.get("/lotes/:id", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  const lote = await buscarLotePorId(Number(req.params.id));
  if (!lote) {
    return res.status(404).json({ erro: "Lote de geração não encontrado." });
  }
  res.json({ lote });
}));

inspecoesRouter.post("/lotes/simular", exigirPermissao("inspecoes", "criar"), asyncHandler(async (req, res) => {
  const parsed = simularSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  if (parsed.data.semana_fim < parsed.data.semana_inicio) {
    return res.status(400).json({ erro: "A semana final do período não pode ser anterior à semana inicial." });
  }
  const resultado = await simular(parsed.data.ano, parsed.data.semana_inicio, parsed.data.semana_fim, parsed.data.filtros ?? {});
  res.json(resultado);
}));

const criarLoteSchema = simularSchema.extend({
  codigo: z.string().min(1, "Informe o código do lote."),
});

inspecoesRouter.post("/lotes", exigirPermissao("inspecoes", "criar"), asyncHandler(async (req, res) => {
  const parsed = criarLoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const lote = await criarLote(
      parsed.data.codigo,
      parsed.data.ano,
      parsed.data.semana_inicio,
      parsed.data.semana_fim,
      parsed.data.filtros ?? {},
      req.usuario!.id
    );
    res.status(201).json({ lote });
  } catch (err) {
    if (err instanceof ErroValidacaoLoteInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.post("/lotes/:id/confirmar", exigirPermissao("inspecoes", "aprovar"), asyncHandler(async (req, res) => {
  try {
    const resultado = await confirmarLote(Number(req.params.id), req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoLoteInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.post("/lotes/:id/reverter", exigirPermissao("inspecoes", "aprovar"), asyncHandler(async (req, res) => {
  try {
    const resultado = await reverterLote(Number(req.params.id), req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoLoteInspecao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

// ---------- Inspeções avulsas e atribuição a um inspetor ----------

const dadosAvulsaSchema = z.object({
  ativo_id: z.number().int(),
  descricao: z.string().min(1, "Descreva a inspeção a ser executada."),
  prioridade: z.enum(["baixa", "media", "alta", "critica"]),
  data_programada: z.string().min(1, "Informe a data programada."),
  data_limite: z.string().min(1, "Informe a data limite."),
  responsavel_id: z.number().int().nullable().optional(),
  horas_estimadas: z.number().min(0).optional(),
});

inspecoesRouter.post("/", exigirPermissao("inspecoes", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosAvulsaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await criarOSAvulsa(
      { ...parsed.data, tipo: "inspecao", subtipo_inspecao: "periodica" },
      req.usuario!.id
    );

    const plano = await dbGet<{ id: number }>(
      "SELECT id FROM plano_inspecao WHERE ativo_id = ? AND ativo = 1 AND excluido_em IS NULL ORDER BY id LIMIT 1",
      [parsed.data.ativo_id]
    );
    if (plano) {
      const tarefas = await listarTarefasDoPlanoInspecao(plano.id);
      let ordem = 0;
      for (const t of tarefas) {
        ordem++;
        await dbRun(
          `INSERT INTO os_tarefa (os_id, ordem, descricao, tipo_resposta, obrigatoria, valor_min, valor_max, unidade)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [os.id, ordem, t.descricao, t.tipo_resposta, t.obrigatoria, t.valor_min, t.valor_max, t.unidade]
        );
      }
    }

    res.status(201).json({ os: (await buscarOSPorId(os.id))! });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.get("/", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  const { status, ativoId, responsavelId, texto } = req.query;
  const responsavelForcado =
    req.usuario?.perfil_nome === "Inspetor" ? req.usuario.id : responsavelId ? Number(responsavelId) : undefined;
  const ordens = await listarOS({
    tipo: "inspecao",
    status: typeof status === "string" ? (status as any) : undefined,
    ativoId: ativoId ? Number(ativoId) : undefined,
    responsavelId: responsavelForcado,
    texto: typeof texto === "string" ? texto : undefined,
  });
  res.json({ ordens });
}));

const dadosCorretivaSchema = z.object({
  descricao: z.string().min(1, "Descreva a anomalia encontrada."),
  prioridade: z.enum(["baixa", "media", "alta", "critica"]),
  data_programada: z.string().min(1, "Informe a data programada."),
  data_limite: z.string().min(1, "Informe a data limite."),
  responsavel_id: z.number().int().nullable().optional(),
  horas_estimadas: z.number().min(0).optional(),
});

inspecoesRouter.post("/:id/corretiva", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosCorretivaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await criarOSCorretivaDeInspecao(Number(req.params.id), parsed.data, req.usuario!.id);
    res.status(201).json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const atribuicaoSchema = z.object({
  responsavel_id: z.number().int().nullable(),
});

inspecoesRouter.put("/:id/atribuir", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  if (!exigirPerfilAtribuicao(req, res)) return;
  const parsed = atribuicaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const os = await buscarOSPorId(Number(req.params.id));
  if (!os || os.tipo !== "inspecao") {
    return res.status(404).json({ erro: "Inspeção não encontrada." });
  }
  try {
    const atualizada = await editarOS(
      os.id,
      { prioridade: os.prioridade, descricao: os.descricao, responsavel_id: parsed.data.responsavel_id, exige_parada_linha: !!os.exige_parada_linha, horas_estimadas: os.horas_estimadas },
      req.usuario!.id
    );
    res.json({ os: atualizada });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const atribuicaoLoteSchema = z.object({
  ids: z.array(z.number().int()).min(1, "Selecione ao menos uma inspeção."),
  responsavel_id: z.number().int().nullable(),
});

inspecoesRouter.post("/atribuir-lote", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  if (!exigirPerfilAtribuicao(req, res)) return;
  const parsed = atribuicaoLoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const resultado = await atribuirEmLote(parsed.data.ids, { responsavelId: parsed.data.responsavel_id }, req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

// ---------- Conferência de OS já executadas ----------

inspecoesRouter.get("/auditorias/pendentes", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  const { ativoId, texto } = req.query;
  const pendentes = await listarOSPendentesAuditoria({
    ativoId: ativoId ? Number(ativoId) : undefined,
    texto: typeof texto === "string" ? texto : undefined,
  });
  res.json({ pendentes });
}));

const dadosAuditoriaSchema = z.object({
  os_auditada_id: z.number().int(),
  inspetor_id: z.number().int(),
  data_programada: z.string().min(1, "Informe a data programada."),
  data_limite: z.string().min(1, "Informe a data limite."),
  prioridade: z.enum(["baixa", "media", "alta", "critica"]),
});

inspecoesRouter.post("/auditorias", exigirPermissao("inspecoes", "criar"), asyncHandler(async (req, res) => {
  if (!exigirPerfilAtribuicao(req, res)) return;
  const parsed = dadosAuditoriaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await atribuirAuditoria(
      parsed.data.os_auditada_id,
      parsed.data.inspetor_id,
      { data_programada: parsed.data.data_programada, data_limite: parsed.data.data_limite, prioridade: parsed.data.prioridade },
      req.usuario!.id
    );
    res.status(201).json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoAuditoria) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

inspecoesRouter.get("/auditorias/:osId/itens", exigirPermissao("inspecoes", "ver"), asyncHandler(async (req, res) => {
  res.json({ itens: await listarItensAuditoria(Number(req.params.osId)) });
}));

const dadosRespostaAuditoriaSchema = z.object({
  conformidade: z.enum(["conforme", "divergente"]),
  observacao: z.string().nullable().optional(),
});

inspecoesRouter.put("/auditorias/:osId/itens/:itemId", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosRespostaAuditoriaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const item = await responderItemAuditoria(Number(req.params.osId), Number(req.params.itemId), parsed.data, req.usuario!.id);
    res.json({ item });
  } catch (err) {
    if (err instanceof ErroValidacaoAuditoria) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosConclusaoAuditoriaSchema = z.object({
  resultado_inspecao: z.enum(["ok", "atencao", "critico"]),
  observacoes_execucao: z.string().nullable().optional(),
  data_conclusao: z.string().min(1).nullable().optional(),
});

inspecoesRouter.post("/auditorias/:osId/concluir", exigirPermissao("inspecoes", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosConclusaoAuditoriaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await concluirAuditoria(Number(req.params.osId), parsed.data, req.usuario!.id);
    res.json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoAuditoria || err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
