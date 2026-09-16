import { Router } from "express";
import { z } from "zod";
import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { hojeSistema } from "../lib/horarioSistema.js";
import {
  atualizarPlano,
  buscarPlanoPorId,
  codigoSugerido,
  criarPlano,
  ErroValidacaoPlano,
  excluirPlano,
  listarPlanos,
} from "../services/planoService.js";
import {
  atualizarTarefa,
  criarTarefa,
  ErroValidacaoTarefa,
  listarTarefasDoPlano,
  moverTarefa,
  removerTarefa,
} from "../services/planoTarefaService.js";
import {
  atualizarVinculo,
  ErroValidacaoPlanoPeca,
  listarPecasDoPlano,
  removerVinculo,
  vincularPeca,
} from "../services/planoPecaService.js";
import { ajustarDiaNaoUtil, calcularOcorrencias, type TratamentoDiaNaoUtil } from "../services/recorrenciaService.js";
import { obterCalendarioAnual } from "../services/calendarioService.js";

export const planosRouter = Router();

planosRouter.use(exigirAutenticacao);

planosRouter.get("/calendario", exigirPermissao("planos", "ver"), asyncHandler(async (req, res) => {
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return res.status(400).json({ erro: "Informe um ano válido." });
  }
  const { ativoId, tipoManutencao } = req.query;
  const linhas = await obterCalendarioAnual(ano, {
    ativoId: ativoId ? Number(ativoId) : undefined,
    tipoManutencao: typeof tipoManutencao === "string" ? tipoManutencao : undefined,
  });
  res.json({ ano, linhas });
}));

const dadosPlanoSchema = z.object({
  codigo: z.string().min(1, "Informe o código do plano."),
  nome: z.string().min(1, "Informe o nome do plano."),
  ativo_id: z.number().int(),
  tipo_manutencao: z.enum(["preventiva", "preditiva_manual", "inspecao", "calibracao", "lubrificacao", "limpeza_tecnica"]),
  periodicidade: z.enum([
    "diaria",
    "semanal",
    "quinzenal",
    "mensal",
    "bimestral",
    "trimestral",
    "quadrimestral",
    "semestral",
    "anual",
    "bienal",
    "trienal",
    "personalizada",
  ]),
  intervalo_customizado_dias: z.number().int().positive().nullable().optional(),
  data_base: z.string().min(1, "Informe a data-base."),
  duracao_estimada_horas: z.number().min(0).optional(),
  responsavel_padrao_id: z.number().int().nullable().optional(),
  equipe_padrao: z.string().nullable().optional(),
  prioridade_padrao: z.enum(["baixa", "media", "alta", "critica"]),
  exige_parada_linha: z.boolean().optional(),
  instrucoes: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  data_inicio_vigencia: z.string().min(1, "Informe a data de início de vigência."),
  data_fim_vigencia: z.string().nullable().optional(),
});

planosRouter.get("/", exigirPermissao("planos", "ver"), asyncHandler(async (req, res) => {
  const { texto, ativoId, tipoManutencao, periodicidade, apenasAtivos } = req.query;
  const planos = await listarPlanos({
    texto: typeof texto === "string" ? texto : undefined,
    ativoId: ativoId ? Number(ativoId) : undefined,
    tipoManutencao: typeof tipoManutencao === "string" ? tipoManutencao : undefined,
    periodicidade: typeof periodicidade === "string" ? periodicidade : undefined,
    apenasAtivos: apenasAtivos === "true",
  });
  res.json({ planos });
}));

planosRouter.get("/codigo-sugerido", exigirPermissao("planos", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoSugerido() });
}));

planosRouter.get("/:id", exigirPermissao("planos", "ver"), asyncHandler(async (req, res) => {
  const plano = await buscarPlanoPorId(Number(req.params.id));
  if (!plano) {
    return res.status(404).json({ erro: "Plano não encontrado." });
  }
  res.json({ plano });
}));

planosRouter.post("/", exigirPermissao("planos", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosPlanoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const plano = await criarPlano(parsed.data, req.usuario!.id);
    res.status(201).json({ plano });
  } catch (err) {
    if (err instanceof ErroValidacaoPlano) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

planosRouter.put("/:id", exigirPermissao("planos", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosPlanoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const plano = await atualizarPlano(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ plano });
  } catch (err) {
    if (err instanceof ErroValidacaoPlano) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

planosRouter.delete("/:id", exigirPermissao("planos", "excluir"), asyncHandler(async (req, res) => {
  try {
    await excluirPlano(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoPlano) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const hoje = hojeSistema;

function somarMesesISO(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 + meses, dia));
  return data.toISOString().slice(0, 10);
}

planosRouter.get("/:id/ocorrencias", exigirPermissao("planos", "ver"), asyncHandler(async (req, res) => {
  const plano = await buscarPlanoPorId(Number(req.params.id));
  if (!plano) {
    return res.status(404).json({ erro: "Plano não encontrado." });
  }
  const inicio = typeof req.query.inicio === "string" ? req.query.inicio : hoje();
  const fim = typeof req.query.fim === "string" ? req.query.fim : somarMesesISO(inicio, 12);

  const configRow = await dbGet<{ valor: string }>(
    "SELECT valor FROM configuracao WHERE chave = 'tratamento_dia_nao_util'"
  );
  const tratamento = (configRow ? (JSON.parse(configRow.valor) as TratamentoDiaNaoUtil) : "gerar_na_data");
  const feriados = new Set(
    (await dbAll<{ data: string }>("SELECT data FROM feriado")).map((f) => f.data)
  );

  const brutas = calcularOcorrencias(
    {
      periodicidade: plano.periodicidade,
      intervalo_customizado_dias: plano.intervalo_customizado_dias,
      data_base: plano.data_base,
      data_inicio_vigencia: plano.data_inicio_vigencia,
      data_fim_vigencia: plano.data_fim_vigencia,
      ativo: plano.ativo,
    },
    inicio,
    fim
  );
  const ocorrencias = brutas.map((data) => ({
    data_prevista: data,
    data_ajustada: ajustarDiaNaoUtil(data, tratamento, feriados),
  }));

  res.json({ inicio, fim, tratamento_dia_nao_util: tratamento, ocorrencias });
}));

const dadosTarefaSchema = z.object({
  descricao: z.string().min(1, "Informe a descrição da tarefa."),
  tipo_resposta: z.enum(["ok_nok", "texto", "numerico", "selecao"]),
  obrigatoria: z.boolean().optional(),
  valor_min: z.number().nullable().optional(),
  valor_max: z.number().nullable().optional(),
  unidade: z.string().nullable().optional(),
  regime: z.enum(["MP", "MF"]).nullable().optional(),
});

planosRouter.get("/:id/tarefas", exigirPermissao("planos", "ver"), asyncHandler(async (req, res) => {
  res.json({ tarefas: await listarTarefasDoPlano(Number(req.params.id)) });
}));

planosRouter.post("/:id/tarefas", exigirPermissao("planos", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosTarefaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const tarefa = await criarTarefa(Number(req.params.id), parsed.data, req.usuario!.id);
  res.status(201).json({ tarefa });
}));

planosRouter.put("/:id/tarefas/:tarefaId", exigirPermissao("planos", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosTarefaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const tarefa = await atualizarTarefa(Number(req.params.tarefaId), parsed.data, req.usuario!.id);
    res.json({ tarefa });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefa) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

planosRouter.delete("/:id/tarefas/:tarefaId", exigirPermissao("planos", "editar"), asyncHandler(async (req, res) => {
  try {
    await removerTarefa(Number(req.params.tarefaId), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefa) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

planosRouter.post("/:id/tarefas/:tarefaId/mover", exigirPermissao("planos", "editar"), asyncHandler(async (req, res) => {
  const direcao = req.body?.direcao;
  if (direcao !== "cima" && direcao !== "baixo") {
    return res.status(400).json({ erro: 'Direção inválida: use "cima" ou "baixo".' });
  }
  try {
    await moverTarefa(Number(req.params.tarefaId), direcao);
    res.json({ tarefas: await listarTarefasDoPlano(Number(req.params.id)) });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefa) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosPlanoPecaSchema = z.object({
  peca_id: z.number().int(),
  quantidade_prevista: z.number().positive("Informe uma quantidade prevista maior que zero."),
  obrigatoria: z.boolean().optional(),
});

planosRouter.get("/:id/pecas", exigirPermissao("planos", "ver"), asyncHandler(async (req, res) => {
  res.json({ pecas: await listarPecasDoPlano(Number(req.params.id)) });
}));

planosRouter.post("/:id/pecas", exigirPermissao("planos", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosPlanoPecaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const vinculo = await vincularPeca(Number(req.params.id), parsed.data, req.usuario!.id);
    res.status(201).json({ vinculo });
  } catch (err) {
    if (err instanceof ErroValidacaoPlanoPeca) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

planosRouter.put("/:id/pecas/:vinculoId", exigirPermissao("planos", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosPlanoPecaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const vinculo = await atualizarVinculo(Number(req.params.vinculoId), parsed.data, req.usuario!.id);
    res.json({ vinculo });
  } catch (err) {
    if (err instanceof ErroValidacaoPlanoPeca) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

planosRouter.delete("/:id/pecas/:vinculoId", exigirPermissao("planos", "editar"), asyncHandler(async (req, res) => {
  try {
    await removerVinculo(Number(req.params.vinculoId), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoPlanoPeca) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
