import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  atribuirResponsavelPadraoEmLote,
  atualizarPontoLubrificacao,
  buscarPontoLubrificacaoPorId,
  codigoSugerido as codigoPontoSugerido,
  criarPontoLubrificacao,
  ErroValidacaoPontoLubrificacao,
  excluirPontoLubrificacao,
  listarPontosLubrificacao,
} from "../services/pontoLubrificacaoService.js";
import {
  buscarLotePorId,
  codigoSugerido as codigoLoteSugerido,
  confirmarLote,
  criarLote,
  ErroValidacaoLoteLubrificacao,
  listarLotes,
  reverterLote,
  simular,
} from "../services/loteGeracaoLubrificacaoService.js";
import { obterCalendarioLubrificacao } from "../services/calendarioLubrificacaoService.js";
import {
  atualizarTarefaLubrificacao,
  criarTarefaLubrificacao,
  ErroValidacaoTarefaLubrificacao,
  listarTarefasDoPontoLubrificacao,
  moverTarefaLubrificacao,
  removerTarefaLubrificacao,
} from "../services/pontoLubrificacaoTarefaService.js";

export const lubrificacaoRouter = Router();

lubrificacaoRouter.use(exigirAutenticacao);

lubrificacaoRouter.get("/calendario", exigirPermissao("lubrificacao", "ver"), asyncHandler(async (req, res) => {
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return res.status(400).json({ erro: "Informe um ano válido." });
  }
  const { ativoId, periodicidade } = req.query;
  const linhas = await obterCalendarioLubrificacao(ano, {
    ativoId: ativoId ? Number(ativoId) : undefined,
    periodicidade: typeof periodicidade === "string" ? periodicidade : undefined,
  });
  res.json({ ano, linhas });
}));

const dadosPontoSchema = z.object({
  codigo: z.string().min(1, "Informe o código do ponto de lubrificação."),
  ativo_id: z.number().int(),
  descricao: z.string().min(1, "Informe a descrição do ponto."),
  especificacao: z.string().nullable().optional(),
  componente: z.string().nullable().optional(),
  periodicidade: z.enum(["semanal", "quinzenal", "mensal", "bimestral", "trimestral", "semestral", "anual"]),
  semana_base: z.number().int().min(1).max(53),
  duracao_estimada_horas: z.number().min(0).optional(),
  responsavel_padrao_id: z.number().int().nullable().optional(),
  prioridade_padrao: z.enum(["baixa", "media", "alta", "critica"]).optional(),
  instrucoes: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  data_inicio_vigencia: z.string().min(1, "Informe a data de início de vigência."),
  data_fim_vigencia: z.string().nullable().optional(),
});

lubrificacaoRouter.get("/pontos", exigirPermissao("lubrificacao", "ver"), asyncHandler(async (req, res) => {
  const { texto, ativoId, periodicidade, apenasAtivos } = req.query;
  const pontos = await listarPontosLubrificacao({
    texto: typeof texto === "string" ? texto : undefined,
    ativoId: ativoId ? Number(ativoId) : undefined,
    periodicidade: typeof periodicidade === "string" ? periodicidade : undefined,
    apenasAtivos: apenasAtivos === "true",
  });
  res.json({ pontos });
}));

lubrificacaoRouter.get("/pontos/codigo-sugerido", exigirPermissao("lubrificacao", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoPontoSugerido() });
}));

const atribuicaoLotePontosSchema = z.object({
  ids: z.array(z.number().int()).min(1, "Selecione ao menos um ponto."),
  responsavel_id: z.number().int().nullable(),
});

lubrificacaoRouter.put("/pontos/atribuir-lote", exigirPermissao("lubrificacao", "editar"), asyncHandler(async (req, res) => {
  const parsed = atribuicaoLotePontosSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const resultado = await atribuirResponsavelPadraoEmLote(parsed.data.ids, parsed.data.responsavel_id, req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoPontoLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

lubrificacaoRouter.get("/pontos/:id", exigirPermissao("lubrificacao", "ver"), asyncHandler(async (req, res) => {
  const ponto = await buscarPontoLubrificacaoPorId(Number(req.params.id));
  if (!ponto) {
    return res.status(404).json({ erro: "Ponto de lubrificação não encontrado." });
  }
  res.json({ ponto });
}));

lubrificacaoRouter.post("/pontos", exigirPermissao("lubrificacao", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosPontoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const ponto = await criarPontoLubrificacao(parsed.data, req.usuario!.id);
    res.status(201).json({ ponto });
  } catch (err) {
    if (err instanceof ErroValidacaoPontoLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

lubrificacaoRouter.put("/pontos/:id", exigirPermissao("lubrificacao", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosPontoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const ponto = await atualizarPontoLubrificacao(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ ponto });
  } catch (err) {
    if (err instanceof ErroValidacaoPontoLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

lubrificacaoRouter.delete("/pontos/:id", exigirPermissao("lubrificacao", "excluir"), asyncHandler(async (req, res) => {
  try {
    await excluirPontoLubrificacao(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoPontoLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosTarefaLubrificacaoSchema = z.object({
  descricao: z.string().min(1, "Informe a descrição do item."),
  tipo_resposta: z.enum(["ok_nok", "texto", "numerico", "selecao"]),
  obrigatoria: z.boolean().optional(),
  valor_min: z.number().nullable().optional(),
  valor_max: z.number().nullable().optional(),
  unidade: z.string().nullable().optional(),
  regime: z.enum(["MP", "MF"]).nullable().optional(),
});

lubrificacaoRouter.get("/pontos/:id/tarefas", exigirPermissao("lubrificacao", "ver"), asyncHandler(async (req, res) => {
  res.json({ tarefas: await listarTarefasDoPontoLubrificacao(Number(req.params.id)) });
}));

lubrificacaoRouter.post("/pontos/:id/tarefas", exigirPermissao("lubrificacao", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosTarefaLubrificacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const tarefa = await criarTarefaLubrificacao(Number(req.params.id), parsed.data, req.usuario!.id);
  res.status(201).json({ tarefa });
}));

lubrificacaoRouter.put("/pontos/:id/tarefas/:tarefaId", exigirPermissao("lubrificacao", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosTarefaLubrificacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const tarefa = await atualizarTarefaLubrificacao(Number(req.params.tarefaId), parsed.data, req.usuario!.id);
    res.json({ tarefa });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefaLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

lubrificacaoRouter.delete("/pontos/:id/tarefas/:tarefaId", exigirPermissao("lubrificacao", "editar"), asyncHandler(async (req, res) => {
  try {
    await removerTarefaLubrificacao(Number(req.params.tarefaId), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefaLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

lubrificacaoRouter.post("/pontos/:id/tarefas/:tarefaId/mover", exigirPermissao("lubrificacao", "editar"), asyncHandler(async (req, res) => {
  const direcao = req.body?.direcao;
  if (direcao !== "cima" && direcao !== "baixo") {
    return res.status(400).json({ erro: 'Direção inválida: use "cima" ou "baixo".' });
  }
  try {
    await moverTarefaLubrificacao(Number(req.params.tarefaId), direcao);
    res.json({ tarefas: await listarTarefasDoPontoLubrificacao(Number(req.params.id)) });
  } catch (err) {
    if (err instanceof ErroValidacaoTarefaLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const filtrosSchema = z.object({
  ativoId: z.number().int().optional(),
  periodicidade: z.string().optional(),
  texto: z.string().optional(),
});

const simularSchema = z.object({
  ano: z.number().int().min(2000).max(2100),
  semana_inicio: z.number().int().min(1).max(53),
  semana_fim: z.number().int().min(1).max(53),
  filtros: filtrosSchema.optional(),
});

lubrificacaoRouter.get("/lotes", exigirPermissao("lubrificacao", "ver"), asyncHandler(async (_req, res) => {
  res.json({ lotes: await listarLotes() });
}));

lubrificacaoRouter.get("/lotes/codigo-sugerido", exigirPermissao("lubrificacao", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoLoteSugerido() });
}));

lubrificacaoRouter.get("/lotes/:id", exigirPermissao("lubrificacao", "ver"), asyncHandler(async (req, res) => {
  const lote = await buscarLotePorId(Number(req.params.id));
  if (!lote) {
    return res.status(404).json({ erro: "Lote de geração não encontrado." });
  }
  res.json({ lote });
}));

lubrificacaoRouter.post("/lotes/simular", exigirPermissao("lubrificacao", "criar"), asyncHandler(async (req, res) => {
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

lubrificacaoRouter.post("/lotes", exigirPermissao("lubrificacao", "criar"), asyncHandler(async (req, res) => {
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
    if (err instanceof ErroValidacaoLoteLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

lubrificacaoRouter.post("/lotes/:id/confirmar", exigirPermissao("lubrificacao", "aprovar"), asyncHandler(async (req, res) => {
  try {
    const resultado = await confirmarLote(Number(req.params.id), req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoLoteLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

lubrificacaoRouter.post("/lotes/:id/reverter", exigirPermissao("lubrificacao", "aprovar"), asyncHandler(async (req, res) => {
  try {
    const resultado = await reverterLote(Number(req.params.id), req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoLoteLubrificacao) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
