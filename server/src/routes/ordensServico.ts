import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao, exigirPermissao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { temPermissao } from "../permissions.js";
import { registrarAuditoria } from "../services/auditoriaService.js";
import {
  baixarTSQDaAssinatura,
  baixarTSRDaAssinatura,
  buscarAssinaturaVigenteDaOS,
  listarAssinaturasDaOS,
  verificarAssinaturaDaOS,
} from "../services/assinaturaService.js";
import {
  abrirOS,
  adicionarPecaOS,
  adicionarTarefaOS,
  aguardarPecaOS,
  atribuirEmLote,
  avisarGlobopacExecucaoOS,
  buscarOSPorId,
  cancelarOS,
  codigoSugerido,
  CAUSAS_FALHA,
  concluirOS,
  criarOSAvulsa,
  editarOS,
  editarTarefaOS,
  ErroValidacaoOS,
  excluirOS,
  iniciarExecucaoOS,
  listarOS,
  listarPecasDaOS,
  listarReprogramacoesDaOS,
  listarTarefasDaOS,
  podeExcluirOS,
  reabrirOS,
  registrarConsumoPeca,
  removerPecaOS,
  removerTarefaOS,
  reprogramarOS,
  responderTarefaOS,
  sinalizarExecucaoOS,
} from "../services/osService.js";
import { usuarioPertenceEquipe } from "../services/equipeService.js";

export const ordensServicoRouter = Router();

ordensServicoRouter.use(exigirAutenticacao);

const TIPOS_OS = ["preventiva", "corretiva", "inspecao", "melhoria", "calibracao"] as const;
const PRIORIDADES_OS = ["baixa", "media", "alta", "critica"] as const;
const STATUS_OS = ["programada", "aberta", "em_execucao", "aguardando_peca", "concluida", "atrasada", "cancelada"] as const;

// SEG-03: o perfil Técnico só deveria ver OS atribuídas a ele mesmo (diretamente OU por ser membro
// da equipe atribuída — EQUIPE-01) — antes, "Somente minhas OS" na tela era só conveniência, sem
// trava nenhuma no servidor (qualquer um acessava qualquer OS pela URL direta). Aqui o servidor
// ignora o responsavelId/equipeId que o cliente mandou e força `visivelApenasParaUsuarioId` pro
// próprio id de quem está logado, pra um Técnico não conseguir contornar o filtro. INS-02: Inspetor
// recebe a mesma restrição, já que a execução das inspeções/conferências atribuídas a ele acontece
// nesta mesma lista/tela de OS.
const PERFIS_RESTRITOS_A_PROPRIA_OS = ["Técnico", "Inspetor"];

function restringirVisibilidadeParaUsuario(req: import("express").Request): number | undefined {
  if (PERFIS_RESTRITOS_A_PROPRIA_OS.includes(req.usuario?.perfil_nome ?? "")) return req.usuario!.id;
  return undefined;
}

// SEG-04: o Solicitante só deveria ver as OS que nasceram de uma solicitação aberta por ele mesmo —
// mesmo problema do SEG-03 (era só filtro de conveniência na tela, sem trava no servidor). Aqui o
// servidor ignora qualquer filtro vindo do cliente e força o próprio id de quem está logado; uma OS
// avulsa/de plano (sem solicitacao_id, logo sem solicitacao_solicitante_id) nunca aparece pra ele.
const PERFIL_RESTRITO_A_PROPRIA_SOLICITACAO = "Solicitante";

function solicitanteForcadoParaSolicitante(req: import("express").Request): number | undefined {
  if (req.usuario?.perfil_nome === PERFIL_RESTRITO_A_PROPRIA_SOLICITACAO) return req.usuario!.id;
  return undefined;
}

ordensServicoRouter.get("/", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const { status, ativoId, responsavelId, equipeId, minhas, tipo, origem, texto, reprogramada } = req.query;
  // "somente minhas" (checkbox do front) e a restrição forçada de Técnico/Inspetor usam o mesmo
  // mecanismo (visivelApenasParaUsuarioId, cobre responsável direto OU membro da equipe atribuída).
  const visivelApenasParaUsuarioId = restringirVisibilidadeParaUsuario(req) ?? (minhas === "true" ? req.usuario!.id : undefined);
  const os = await listarOS({
    status: typeof status === "string" && (STATUS_OS as readonly string[]).includes(status) ? (status as (typeof STATUS_OS)[number]) : undefined,
    ativoId: ativoId ? Number(ativoId) : undefined,
    responsavelId: responsavelId ? Number(responsavelId) : undefined,
    equipeId: equipeId ? Number(equipeId) : undefined,
    visivelApenasParaUsuarioId,
    solicitanteId: solicitanteForcadoParaSolicitante(req),
    tipo: typeof tipo === "string" ? tipo : undefined,
    origem: typeof origem === "string" ? origem : undefined,
    texto: typeof texto === "string" ? texto : undefined,
    reprogramada: reprogramada === "true" ? true : reprogramada === "false" ? false : undefined,
  });
  res.json({ ordens: os });
}));

ordensServicoRouter.get("/codigo-sugerido", exigirPermissao("ordens_servico", "criar"), asyncHandler(async (_req, res) => {
  res.json({ codigo: await codigoSugerido() });
}));

// NOVO-06: atribuição em lote — só Administrador, Coordenador de PCM ou Supervisor de manutenção
// decidem a carga de trabalho de outras pessoas de uma vez; a permissão de módulo "editar" sozinha
// não distingue esses papéis de um Planejador ou Técnico, que também têm "editar" em ordens_servico.
const PERFIS_ATRIBUICAO_LOTE = ["Administrador", "Coordenador de PCM", "Supervisor de manutenção"];

const atribuicaoLoteSchema = z
  .object({
    ids: z.array(z.number().int()).min(1, "Selecione ao menos uma OS."),
    responsavel_id: z.number().int().nullable().optional(),
    equipe_id: z.number().int().nullable().optional(),
  })
  .refine((d) => d.responsavel_id == null || d.equipe_id == null, {
    message: "Escolha um responsável OU uma equipe, não os dois.",
  });

ordensServicoRouter.post("/atribuir-lote", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  if (!PERFIS_ATRIBUICAO_LOTE.includes(req.usuario?.perfil_nome ?? "")) {
    return res.status(403).json({ erro: "Apenas Administrador, Coordenador de PCM ou Supervisor de manutenção podem atribuir OS em lote." });
  }
  const parsed = atribuicaoLoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const atribuicao = parsed.data.equipe_id !== undefined && parsed.data.equipe_id !== null
      ? { equipeId: parsed.data.equipe_id }
      : { responsavelId: parsed.data.responsavel_id ?? null };
    const resultado = await atribuirEmLote(parsed.data.ids, atribuicao, req.usuario!.id);
    res.json(resultado);
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ordensServicoRouter.get("/:id", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const os = await buscarOSPorId(Number(req.params.id));
  if (!os) {
    return res.status(404).json({ erro: "Ordem de serviço não encontrada." });
  }
  if (
    PERFIS_RESTRITOS_A_PROPRIA_OS.includes(req.usuario?.perfil_nome ?? "") &&
    os.responsavel_id !== req.usuario!.id &&
    !(await usuarioPertenceEquipe(req.usuario!.id, os.equipe_id))
  ) {
    return res.status(403).json({ erro: "Esta OS não está atribuída a você." });
  }
  if (req.usuario?.perfil_nome === PERFIL_RESTRITO_A_PROPRIA_SOLICITACAO && os.solicitacao_solicitante_id !== req.usuario!.id) {
    return res.status(403).json({ erro: "Esta OS não foi originada a partir de uma solicitação sua." });
  }
  res.json({ os });
}));

const dadosAvulsaSchema = z.object({
  ativo_id: z.number().int(),
  tipo: z.enum(TIPOS_OS),
  prioridade: z.enum(PRIORIDADES_OS),
  descricao: z.string().min(1, "Descreva o serviço a ser executado."),
  data_programada: z.string().min(1, "Informe a data programada."),
  data_limite: z.string().min(1, "Informe a data limite."),
  responsavel_id: z.number().int().nullable().optional(),
  equipe_id: z.number().int().nullable().optional(),
  horas_estimadas: z.number().min(0).optional(),
  exige_parada_linha: z.boolean().optional(),
});

ordensServicoRouter.post("/", exigirPermissao("ordens_servico", "criar"), asyncHandler(async (req, res) => {
  const parsed = dadosAvulsaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await criarOSAvulsa(parsed.data, req.usuario!.id);
    res.status(201).json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosEdicaoSchema = z.object({
  prioridade: z.enum(PRIORIDADES_OS),
  descricao: z.string().nullable().optional(),
  responsavel_id: z.number().int().nullable().optional(),
  equipe_id: z.number().int().nullable().optional(),
  exige_parada_linha: z.boolean().optional(),
  horas_estimadas: z.number().min(0).optional(),
});

const dadosEdicaoCompletaSchema = dadosEdicaoSchema.extend({
  ativo_id: z.number().int().optional(),
  tipo: z.enum(TIPOS_OS).optional(),
  data_programada: z.string().min(1).optional(),
  data_limite: z.string().min(1).optional(),
});

ordensServicoRouter.put("/:id", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const schema = temPermissao(req.usuario!.permissoes, "ordens_servico", "editar_completo")
    ? dadosEdicaoCompletaSchema
    : dadosEdicaoSchema;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await editarOS(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

// EXCL-ADM-01: excluir OS é decisão exclusiva do Administrador — a permissão de módulo "excluir"
// sozinha não basta porque o JSON de permissões de um perfil pode ser configurado incorretamente
// (ou herdar "excluir" de outro contexto); a checagem de papel abaixo (podeExcluirOS, testada em
// osService.test.ts) é a trava de fato, tanto na API (aqui) quanto na tela (mesma função usada em
// OrdemServicoDetalhe.tsx). Tentativas de um perfil não autorizado ficam registradas em
// log_auditoria com acao "negado", mesmo que a chamada venha direto na API sem passar pela UI.
ordensServicoRouter.delete("/:id", exigirPermissao("ordens_servico", "excluir"), asyncHandler(async (req, res) => {
  if (!podeExcluirOS(req.usuario?.perfil_nome)) {
    await registrarAuditoria({
      entidade: "ordem_servico",
      entidade_id: Number(req.params.id),
      acao: "negado",
      valor_novo: { tentativa: "excluir", perfil: req.usuario?.perfil_nome ?? null },
      usuario_id: req.usuario!.id,
    });
    return res.status(403).json({ erro: "Apenas o Administrador pode excluir uma ordem de serviço." });
  }
  try {
    await excluirOS(Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

function acaoTransicao(handler: (id: number, usuarioId: number) => Promise<unknown>) {
  return asyncHandler(async (req, res) => {
    try {
      const os = await handler(Number(req.params.id), req.usuario!.id);
      res.json({ os });
    } catch (err) {
      if (err instanceof ErroValidacaoOS) {
        return res.status(400).json({ erro: err.message });
      }
      throw err;
    }
  });
}

ordensServicoRouter.post("/:id/abrir", exigirPermissao("ordens_servico", "editar"), acaoTransicao(abrirOS));

const dadosInicioSchema = z.object({
  data_inicio_execucao: z.string().min(1).nullable().optional(),
});

ordensServicoRouter.post("/:id/iniciar", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosInicioSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await iniciarExecucaoOS(Number(req.params.id), req.usuario!.id, parsed.data.data_inicio_execucao);
    res.json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ordensServicoRouter.post("/:id/aguardar-peca", exigirPermissao("ordens_servico", "editar"), acaoTransicao(aguardarPecaOS));

ordensServicoRouter.post(
  "/:id/avisar-globopac-execucao",
  exigirPermissao("ordens_servico", "editar"),
  acaoTransicao(avisarGlobopacExecucaoOS)
);

// BAIXA-01: Técnico sinaliza que o serviço foi realizado, mas não conclui a OS — ver
// PERFIS_QUE_PODEM_CONCLUIR_OS logo abaixo e sinalizarExecucaoOS em osService.ts.
ordensServicoRouter.post(
  "/:id/sinalizar-execucao",
  exigirPermissao("ordens_servico", "editar"),
  acaoTransicao(sinalizarExecucaoOS)
);

const dadosConclusaoSchema = z.object({
  horas_reais: z.number().min(0).nullable().optional(),
  observacoes_execucao: z.string().nullable().optional(),
  data_conclusao: z.string().min(1).nullable().optional(),
  causa_falha: z.enum(CAUSAS_FALHA).nullable().optional(),
  resultado_inspecao: z.enum(["ok", "atencao", "critico"]).nullable().optional(),
});

// BAIXA-01: a baixa (conclusão de fato) de uma OS é decisão de PCM/gestão, não de quem executou o
// serviço em campo — Técnico só sinaliza (ver /:id/sinalizar-execucao acima). A permissão de módulo
// "editar" sozinha não distingue esses papéis de um Técnico, que também tem "editar" em ordens_servico
// (mesmo motivo do NOVO-06/PERFIS_ATRIBUICAO_LOTE, só que pra outra ação).
const PERFIS_QUE_PODEM_CONCLUIR_OS = ["Administrador", "Coordenador de PCM", "Planejador", "Supervisor de manutenção"];

ordensServicoRouter.post("/:id/concluir", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  if (!PERFIS_QUE_PODEM_CONCLUIR_OS.includes(req.usuario?.perfil_nome ?? "")) {
    return res.status(403).json({
      erro: "Apenas Administrador, Coordenador de PCM, Planejador ou Supervisor de manutenção podem concluir uma OS. Use \"Sinalizar serviço realizado\" para avisar que a execução terminou.",
    });
  }
  const parsed = dadosConclusaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    // ASSIN-01: a assinatura digital é gerada dentro de concluirOS (osService.ts), não aqui — assim
    // o mesmo gatilho vale pra qualquer caminho que conclua uma OS (inclusive concluirAuditoria, do
    // fluxo de conferência de OS em campo, que não passa por esta rota).
    const os = await concluirOS(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosCancelamentoSchema = z.object({
  motivo: z.string().min(1, "Informe o motivo do cancelamento."),
});

ordensServicoRouter.post("/:id/cancelar", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosCancelamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await cancelarOS(Number(req.params.id), parsed.data.motivo, req.usuario!.id);
    res.json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

// ASSIN-01: invalidar a assinatura vigente também é feito dentro de reabrirOS (osService.ts), pelo
// mesmo motivo do comentário em /:id/concluir acima.
ordensServicoRouter.post("/:id/reabrir", exigirPermissao("ordens_servico", "reabrir"), acaoTransicao(reabrirOS));

const dadosReprogramacaoSchema = z.object({
  data_nova: z.string().min(1, "Informe a nova data prevista."),
  motivo: z.string().nullable().optional(),
});

ordensServicoRouter.post("/:id/reprogramar", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosReprogramacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const os = await reprogramarOS(Number(req.params.id), parsed.data, req.usuario!.id);
    res.json({ os });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ordensServicoRouter.get("/:id/reprogramacoes", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  res.json({ reprogramacoes: await listarReprogramacoesDaOS(Number(req.params.id)) });
}));

ordensServicoRouter.get("/:id/assinatura", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const osId = Number(req.params.id);
  const [assinaturas, vigente] = await Promise.all([listarAssinaturasDaOS(osId), buscarAssinaturaVigenteDaOS(osId)]);
  res.json({ assinaturas, vigente });
}));

ordensServicoRouter.post("/:id/assinatura/verificar", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  const resultado = await verificarAssinaturaDaOS(Number(req.params.id));
  if (!resultado) {
    return res.status(404).json({ erro: "Esta OS ainda não possui assinatura digital registrada." });
  }
  res.json({ resultado });
}));

ordensServicoRouter.get(
  "/:id/assinatura/:assinaturaId/tsq",
  exigirPermissao("ordens_servico", "ver"),
  asyncHandler(async (req, res) => {
    const tsq = await baixarTSQDaAssinatura(Number(req.params.assinaturaId));
    if (!tsq) return res.status(404).json({ erro: "Consulta (.tsq) não encontrada." });
    res.setHeader("Content-Type", "application/timestamp-query");
    res.setHeader("Content-Disposition", `attachment; filename="assinatura_${req.params.assinaturaId}.tsq"`);
    res.send(tsq);
  })
);

ordensServicoRouter.get(
  "/:id/assinatura/:assinaturaId/tsr",
  exigirPermissao("ordens_servico", "ver"),
  asyncHandler(async (req, res) => {
    const tsr = await baixarTSRDaAssinatura(Number(req.params.assinaturaId));
    if (!tsr) return res.status(404).json({ erro: "Comprovante (.tsr) ainda não disponível para esta assinatura." });
    res.setHeader("Content-Type", "application/timestamp-reply");
    res.setHeader("Content-Disposition", `attachment; filename="assinatura_${req.params.assinaturaId}.tsr"`);
    res.send(tsr);
  })
);

ordensServicoRouter.get("/:id/tarefas", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  res.json({ tarefas: await listarTarefasDaOS(Number(req.params.id)) });
}));

const dadosRespostaSchema = z.object({
  resposta: z.string().nullable().optional(),
  valor_numerico: z.number().nullable().optional(),
  concluida: z.boolean(),
});

ordensServicoRouter.put("/:id/tarefas/:tarefaId", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosRespostaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const tarefa = await responderTarefaOS(Number(req.params.id), Number(req.params.tarefaId), parsed.data, req.usuario!.id);
    res.json({ tarefa });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosTarefaOSSchema = z.object({
  descricao: z.string().min(1, "Informe a descrição do item."),
  tipo_resposta: z.enum(["ok_nok", "texto", "numerico", "selecao"]),
  obrigatoria: z.boolean().optional(),
  valor_min: z.number().nullable().optional(),
  valor_max: z.number().nullable().optional(),
  unidade: z.string().nullable().optional(),
  regime: z.enum(["MP", "MF"]).nullable().optional(),
});

ordensServicoRouter.post("/:id/tarefas", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosTarefaOSSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const tarefa = await adicionarTarefaOS(Number(req.params.id), parsed.data, req.usuario!.id);
    res.status(201).json({ tarefa });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ordensServicoRouter.put("/:id/tarefas/:tarefaId/definicao", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosTarefaOSSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const tarefa = await editarTarefaOS(Number(req.params.id), Number(req.params.tarefaId), parsed.data, req.usuario!.id);
    res.json({ tarefa });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ordensServicoRouter.delete("/:id/tarefas/:tarefaId", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  try {
    await removerTarefaOS(Number(req.params.id), Number(req.params.tarefaId), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ordensServicoRouter.get("/:id/pecas", exigirPermissao("ordens_servico", "ver"), asyncHandler(async (req, res) => {
  res.json({ pecas: await listarPecasDaOS(Number(req.params.id)) });
}));

const dadosPecaSchema = z.object({
  peca_id: z.number().int(),
  quantidade_prevista: z.number().positive("Informe uma quantidade prevista maior que zero."),
  obrigatoria: z.boolean().optional(),
});

ordensServicoRouter.post("/:id/pecas", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosPecaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const peca = await adicionarPecaOS(Number(req.params.id), parsed.data, req.usuario!.id);
    res.status(201).json({ peca });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

const dadosConsumoSchema = z.object({
  quantidade_consumida: z.number().min(0),
  justificativa_divergencia: z.string().nullable().optional(),
});

ordensServicoRouter.put("/:id/pecas/:osPecaId/consumo", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  const parsed = dadosConsumoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
  }
  try {
    const peca = await registrarConsumoPeca(Number(req.params.osPecaId), parsed.data, req.usuario!.id);
    res.json({ peca });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));

ordensServicoRouter.delete("/:id/pecas/:osPecaId", exigirPermissao("ordens_servico", "editar"), asyncHandler(async (req, res) => {
  try {
    await removerPecaOS(Number(req.params.osPecaId), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroValidacaoOS) {
      return res.status(400).json({ erro: err.message });
    }
    throw err;
  }
}));
