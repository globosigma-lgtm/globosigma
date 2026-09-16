import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarAtivoPorId, caminhoAtivo, verificarClassificacaoManutencao } from "./ativoService.js";
import { buscarPecaPorId } from "./pecaService.js";
import type { UnidadeMedida } from "./pecaService.js";
import type { Regime, TipoResposta } from "./planoTarefaService.js";
import { baixarConsumoOS, consumirReserva, criarReserva, liberarReservasDaOS, removerReservaDaLinha } from "./estoqueService.js";
import { criarNotificacao } from "./notificacaoService.js";
import { notificarGlobopacAtualizacaoOS, type ItemChecklistGlobopac } from "./integracaoGlobopacService.js";
import { hojeSistema } from "../lib/horarioSistema.js";

export type StatusOS = "programada" | "aberta" | "em_execucao" | "aguardando_peca" | "concluida" | "atrasada" | "cancelada";
export type TipoOS = "preventiva" | "corretiva" | "inspecao" | "melhoria" | "calibracao" | "lubrificacao";
export type OrigemOS = "plano_lote" | "plano_manual" | "solicitacao" | "avulsa" | "lubrificacao_lote" | "inspecao_lote" | "inspecao_corretiva";
export type PrioridadeOS = "baixa" | "media" | "alta" | "critica";
export type SubtipoInspecao = "periodica" | "auditoria_os";
export type AuditoriaStatusOS = "nao_auditada" | "conforme" | "divergente";
export type ResultadoInspecao = "ok" | "atencao" | "critico";

export interface OrdemServico {
  id: number;
  codigo: string;
  ativo_id: number;
  plano_id: number | null;
  lote_geracao_id: number | null;
  solicitacao_id: number | null;
  plano_inspecao_id: number | null;
  lote_geracao_inspecao_id: number | null;
  os_auditada_id: number | null;
  os_origem_inspecao_id: number | null;
  tipo: TipoOS;
  subtipo_inspecao: SubtipoInspecao | null;
  origem: OrigemOS;
  prioridade: PrioridadeOS;
  status: StatusOS;
  descricao: string | null;
  data_programada: string;
  data_limite: string;
  data_abertura: string;
  data_inicio_execucao: string | null;
  data_conclusao: string | null;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  equipe_id: number | null;
  equipe_nome: string | null;
  horas_estimadas: number;
  horas_reais: number | null;
  custo_mao_obra: number | null;
  custo_pecas: number | null;
  exige_parada_linha: number;
  observacoes_execucao: string | null;
  motivo_cancelamento: string | null;
  causa_falha: string | null;
  auditoria_status: AuditoriaStatusOS;
  resultado_inspecao: ResultadoInspecao | null;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  plano_codigo: string | null;
  tem_pecas: number;
  tem_checklist: number;
  solicitacao_origem: "interna" | "globopac" | null;
  solicitacao_criada_em: string | null;
  solicitacao_solicitante_id: number | null;
  solicitacao_solicitante_externo_nome: string | null;
  globopac_validado_em: string | null;
  globopac_validado_por_nome: string | null;
  globopac_execucao_avisada_em: string | null;
  execucao_sinalizada_em: string | null;
  execucao_sinalizada_por_nome: string | null;
  reprogramada: number;
  data_prevista_original: string | null;
  quantidade_reprogramacoes: number;
}

export interface OSTarefa {
  id: number;
  os_id: number;
  ordem: number;
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: number;
  valor_min: number | null;
  valor_max: number | null;
  unidade: string | null;
  resposta: string | null;
  valor_numerico: number | null;
  concluida: number;
  concluida_em: string | null;
  concluida_por: number | null;
  regime: Regime | null;
}

export interface OSPeca {
  id: number;
  os_id: number;
  peca_id: number;
  quantidade_prevista: number;
  quantidade_reservada: number;
  quantidade_consumida: number | null;
  custo_unitario_no_consumo: number | null;
  justificativa_divergencia: string | null;
  origem: "plano" | "lista_tecnica_ativo" | "manual";
  obrigatoria: number;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
}

export class ErroValidacaoOS extends Error {}

// EXCL-ADM-01: excluir OS é decisão exclusiva do Administrador (ver rota DELETE em
// routes/ordensServico.ts, que chama esta função tanto pra liberar o botão quanto pra travar a
// própria chamada de API). Função pura e exportada pra poder ser testada sem precisar de banco.
export function podeExcluirOS(perfilNome: string | null | undefined): boolean {
  return perfilNome === "Administrador";
}

/**
 * Sem um job agendado no servidor, o status "atrasada" é sincronizado sob demanda: toda leitura
 * de OS primeiro promove para "atrasada" qualquer OS ainda aberta cuja data_limite já passou.
 * Uma vez atrasada, a OS continua podendo ser aberta/iniciada/concluída/cancelada normalmente —
 * "atrasada" é só mais um estado de origem aceito por essas transições.
 */
async function sincronizarAtrasos(): Promise<void> {
  const passandoAAtrasar = await dbAll<{ id: number; codigo: string; responsavel_id: number | null; equipe_id: number | null }>(
    `SELECT id, codigo, responsavel_id, equipe_id FROM ordem_servico
     WHERE status IN ('programada', 'aberta', 'em_execucao', 'aguardando_peca')
       AND data_limite::date < (now() - interval '4 hours')::date
       AND excluido_em IS NULL`
  );

  await dbRun(
    `UPDATE ordem_servico SET status = 'atrasada'
     WHERE status IN ('programada', 'aberta', 'em_execucao', 'aguardando_peca')
       AND data_limite::date < (now() - interval '4 hours')::date
       AND excluido_em IS NULL`
  );

  // CAMPO-01: sem isso, "atrasada" só aparece se alguém abrir o sistema e olhar a lista.
  for (const os of passandoAAtrasar) {
    if (os.responsavel_id) {
      await criarNotificacao({
        usuario_id: os.responsavel_id,
        tipo: "os_atrasada",
        titulo: `${os.codigo} está atrasada`,
        entidade: "ordem_servico",
        entidade_id: os.id,
      });
    } else if (os.equipe_id) {
      for (const usuarioIdMembro of await usuariosDaEquipe(os.equipe_id)) {
        await criarNotificacao({
          usuario_id: usuarioIdMembro,
          tipo: "os_atrasada",
          titulo: `${os.codigo} (equipe) está atrasada`,
          entidade: "ordem_servico",
          entidade_id: os.id,
        });
      }
    }
  }
}

const COLUNAS_OS = `
  os.id, os.codigo, os.ativo_id, os.plano_id, os.lote_geracao_id, os.solicitacao_id,
  os.plano_inspecao_id, os.lote_geracao_inspecao_id, os.os_auditada_id, os.os_origem_inspecao_id, os.tipo, os.subtipo_inspecao, os.origem,
  os.prioridade, os.status, os.descricao, os.data_programada, os.data_limite, os.data_abertura,
  os.data_inicio_execucao, os.data_conclusao, os.responsavel_id, u.nome AS responsavel_nome,
  os.equipe_id, eq.nome AS equipe_nome,
  os.horas_estimadas, os.horas_reais, os.custo_mao_obra, os.custo_pecas, os.exige_parada_linha,
  os.observacoes_execucao, os.motivo_cancelamento, os.causa_falha, os.auditoria_status, os.resultado_inspecao,
  os.globopac_validado_em, os.globopac_validado_por_nome, os.globopac_execucao_avisada_em,
  os.execucao_sinalizada_em, sig.nome AS execucao_sinalizada_por_nome,
  os.reprogramada, os.data_prevista_original, os.quantidade_reprogramacoes,
  a.codigo AS ativo_codigo, a.nome AS ativo_nome,
  pm.codigo AS plano_codigo,
  sol.origem AS solicitacao_origem, sol.criada_em AS solicitacao_criada_em,
  sol.solicitante_id AS solicitacao_solicitante_id,
  sol.solicitante_externo_nome AS solicitacao_solicitante_externo_nome,
  EXISTS(SELECT 1 FROM os_peca op WHERE op.os_id = os.id) AS tem_pecas,
  EXISTS(SELECT 1 FROM os_tarefa ot WHERE ot.os_id = os.id) AS tem_checklist
`;

export interface FiltrosOS {
  status?: StatusOS;
  ativoId?: number;
  responsavelId?: number;
  equipeId?: number;
  /**
   * Restringe a OS onde o usuário é responsável direto OU membro da equipe atribuída — mecanismo
   * único usado tanto pelo gate de segurança de Técnico/Inspetor (PERFIS_RESTRITOS_A_PROPRIA_OS
   * em ordensServico.ts) quanto pelo checkbox voluntário "somente minhas" da listagem. Mutuamente
   * exclusivo com `responsavelId`/`equipeId` acima (quando setado, os outros dois são ignorados).
   */
  visivelApenasParaUsuarioId?: number;
  solicitanteId?: number;
  tipo?: string;
  origem?: string;
  texto?: string;
  reprogramada?: boolean;
}

export async function listarOS(filtros: FiltrosOS = {}): Promise<OrdemServico[]> {
  await sincronizarAtrasos();

  const condicoes = ["os.excluido_em IS NULL"];
  const params: unknown[] = [];
  if (filtros.status) {
    condicoes.push("os.status = ?");
    params.push(filtros.status);
  }
  if (filtros.ativoId) {
    condicoes.push("os.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.visivelApenasParaUsuarioId) {
    condicoes.push("(os.responsavel_id = ? OR os.equipe_id IN (SELECT equipe_id FROM equipe_membro WHERE usuario_id = ?))");
    params.push(filtros.visivelApenasParaUsuarioId, filtros.visivelApenasParaUsuarioId);
  } else {
    if (filtros.responsavelId) {
      condicoes.push("os.responsavel_id = ?");
      params.push(filtros.responsavelId);
    }
    if (filtros.equipeId) {
      condicoes.push("os.equipe_id = ?");
      params.push(filtros.equipeId);
    }
  }
  if (filtros.solicitanteId) {
    condicoes.push("sol.solicitante_id = ?");
    params.push(filtros.solicitanteId);
  }
  if (filtros.tipo) {
    condicoes.push("os.tipo = ?");
    params.push(filtros.tipo);
  }
  if (filtros.origem) {
    condicoes.push("os.origem = ?");
    params.push(filtros.origem);
  }
  if (filtros.texto) {
    condicoes.push("(os.codigo ILIKE ? OR os.descricao ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  if (filtros.reprogramada !== undefined) {
    condicoes.push("os.reprogramada = ?");
    params.push(filtros.reprogramada ? 1 : 0);
  }

  const sql = `
    SELECT ${COLUNAS_OS}
    FROM ordem_servico os
    JOIN ativo a ON a.id = os.ativo_id
    LEFT JOIN plano_manutencao pm ON pm.id = os.plano_id
    LEFT JOIN usuario u ON u.id = os.responsavel_id
    LEFT JOIN equipe eq ON eq.id = os.equipe_id
    LEFT JOIN usuario sig ON sig.id = os.execucao_sinalizada_por_id
    LEFT JOIN solicitacao sol ON sol.id = os.solicitacao_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY
      CASE os.status WHEN 'atrasada' THEN 0 ELSE 1 END,
      os.data_programada,
      CASE os.prioridade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END
  `;
  const rows = (await dbAll(sql, params)) as unknown as OrdemServico[];
  return Promise.all(rows.map(async (r) => ({ ...r, ativo_caminho: await caminhoAtivo(r.ativo_id) })));
}

export async function buscarOSPorId(id: number): Promise<OrdemServico | null> {
  await sincronizarAtrasos();
  const row = (await dbGet(
    `SELECT ${COLUNAS_OS}
     FROM ordem_servico os
     JOIN ativo a ON a.id = os.ativo_id
     LEFT JOIN plano_manutencao pm ON pm.id = os.plano_id
     LEFT JOIN usuario u ON u.id = os.responsavel_id
     LEFT JOIN equipe eq ON eq.id = os.equipe_id
     LEFT JOIN usuario sig ON sig.id = os.execucao_sinalizada_por_id
     LEFT JOIN solicitacao sol ON sol.id = os.solicitacao_id
     WHERE os.id = ? AND os.excluido_em IS NULL`,
    [id]
  )) as OrdemServico | undefined;
  if (!row) return null;
  return { ...row, ativo_caminho: await caminhoAtivo(row.ativo_id) };
}

export async function codigoSugerido(): Promise<string> {
  const rows = await dbAll<{ codigo: string }>("SELECT codigo FROM ordem_servico WHERE codigo LIKE 'OS-%'");
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("OS-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `OS-${String(maior + 1).padStart(6, "0")}`;
}

export interface DadosOSAvulsa {
  ativo_id: number;
  tipo: TipoOS;
  prioridade: PrioridadeOS;
  descricao: string;
  data_programada: string;
  data_limite: string;
  responsavel_id?: number | null;
  equipe_id?: number | null;
  horas_estimadas?: number;
  exige_parada_linha?: boolean;
  subtipo_inspecao?: SubtipoInspecao | null;
}

/** Usuários da equipe, pra notificar todo mundo quando a OS é atribuída a uma equipe em vez de
 * uma pessoa só (criarNotificacao só aceita um usuario_id por chamada). */
async function usuariosDaEquipe(equipeId: number): Promise<number[]> {
  const rows = await dbAll<{ usuario_id: number }>("SELECT usuario_id FROM equipe_membro WHERE equipe_id = ?", [equipeId]);
  return rows.map((r) => r.usuario_id);
}

async function validarDadosCriacaoOS(dados: DadosOSAvulsa) {
  if (!(await buscarAtivoPorId(dados.ativo_id))) {
    throw new ErroValidacaoOS("Ativo não encontrado.");
  }
  if (dados.data_limite < dados.data_programada) {
    throw new ErroValidacaoOS("A data limite não pode ser anterior à data programada.");
  }
  if (dados.responsavel_id != null && dados.equipe_id != null) {
    throw new ErroValidacaoOS("Escolha um responsável OU uma equipe, não os dois.");
  }
  if (dados.responsavel_id != null) {
    const usuario = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [dados.responsavel_id]);
    if (!usuario) {
      throw new ErroValidacaoOS("O responsável selecionado não existe.");
    }
  }
  if (dados.equipe_id != null) {
    const equipe = await dbGet("SELECT id FROM equipe WHERE id = ? AND excluido_em IS NULL", [dados.equipe_id]);
    if (!equipe) {
      throw new ErroValidacaoOS("A equipe selecionada não existe.");
    }
  }
}

/**
 * Ponto único de criação de OS já "aberta" (avulsa ou vinda de solicitação convertida) —
 * diferente da OS de plano, que nasce "programada" e precisa de abertura explícita (Fase 5),
 * porque nos dois casos aqui alguém já está, na prática, liberando o serviço no mesmo ato.
 */
async function inserirOSAberta(
  dados: DadosOSAvulsa,
  origem: OrigemOS,
  solicitacaoId: number | null,
  usuarioId: number,
  codigoForcado?: string | null
): Promise<OrdemServico> {
  await validarDadosCriacaoOS(dados);
  if (codigoForcado && (await dbGet("SELECT id FROM ordem_servico WHERE codigo = ?", [codigoForcado]))) {
    throw new ErroValidacaoOS(`Já existe uma OS com o código ${codigoForcado}.`);
  }
  const codigo = codigoForcado || (await codigoSugerido());
  const info = await dbRun(
    `INSERT INTO ordem_servico (
      codigo, ativo_id, solicitacao_id, tipo, subtipo_inspecao, origem, prioridade, status, descricao, data_programada, data_limite,
      responsavel_id, equipe_id, horas_estimadas, exige_parada_linha, data_abertura
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'aberta', ?, ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`,
    [
      codigo,
      dados.ativo_id,
      solicitacaoId,
      dados.tipo,
      dados.subtipo_inspecao ?? null,
      origem,
      dados.prioridade,
      dados.descricao.trim(),
      dados.data_programada,
      dados.data_limite,
      dados.responsavel_id ?? null,
      dados.equipe_id ?? null,
      dados.horas_estimadas ?? 0,
      dados.exige_parada_linha ? 1 : 0,
    ]
  );

  const nova = (await buscarOSPorId(info.id!))!;
  await registrarAuditoria({ entidade: "ordem_servico", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  if (nova.responsavel_id) {
    await criarNotificacao({
      usuario_id: nova.responsavel_id,
      tipo: "os_atribuida",
      titulo: `Você foi atribuído à ${nova.codigo}`,
      mensagem: nova.descricao,
      entidade: "ordem_servico",
      entidade_id: nova.id,
    });
  } else if (nova.equipe_id) {
    for (const usuarioIdMembro of await usuariosDaEquipe(nova.equipe_id)) {
      await criarNotificacao({
        usuario_id: usuarioIdMembro,
        tipo: "os_atribuida",
        titulo: `Sua equipe foi atribuída à ${nova.codigo}`,
        mensagem: nova.descricao,
        entidade: "ordem_servico",
        entidade_id: nova.id,
      });
    }
  }
  return nova;
}

export async function criarOSAvulsa(dados: DadosOSAvulsa, usuarioId: number): Promise<OrdemServico> {
  return inserirOSAberta(dados, "avulsa", null, usuarioId);
}

/**
 * Usada pelo fluxo de Solicitações (Fase 9) ao converter uma solicitação em OS. `codigoForcado` é
 * usado quando a solicitação veio de um sistema externo (ex. GloboPac) que já numerou a própria OS
 * — reaproveitamos o mesmo número em vez de gerar um novo, pra facilitar a correlação entre os dois
 * sistemas. Se o número já existir aqui por algum motivo, a constraint UNIQUE de `codigo` barra a
 * inserção com um erro claro em vez de deixar dois registros divergentes com o mesmo código.
 */
export async function criarOSDeSolicitacao(
  solicitacaoId: number,
  dados: DadosOSAvulsa,
  usuarioId: number,
  codigoForcado?: string | null
): Promise<OrdemServico> {
  return inserirOSAberta(dados, "solicitacao", solicitacaoId, usuarioId, codigoForcado);
}

export interface DadosOSCorretivaDeInspecao {
  descricao: string;
  prioridade: PrioridadeOS;
  data_programada: string;
  data_limite: string;
  responsavel_id?: number | null;
  horas_estimadas?: number;
}

/**
 * INS-04: o inspetor que nota uma anomalia durante a inspeção abre, na hora, uma OS corretiva
 * pro mesmo ativo — sem precisar da permissão genérica de criar OS (ordens_servico:criar), que o
 * perfil Inspetor não tem. O ativo vem da própria OS de inspeção, não de um campo livre.
 */
export async function criarOSCorretivaDeInspecao(
  osInspecaoId: number,
  dados: DadosOSCorretivaDeInspecao,
  usuarioId: number
): Promise<OrdemServico> {
  const osInspecao = await exigirOS(osInspecaoId);
  if (osInspecao.tipo !== "inspecao") {
    throw new ErroValidacaoOS("Só é possível abrir uma OS corretiva a partir de uma inspeção.");
  }
  const nova = await inserirOSAberta(
    { ...dados, ativo_id: osInspecao.ativo_id, tipo: "corretiva" },
    "inspecao_corretiva",
    null,
    usuarioId
  );
  await dbRun("UPDATE ordem_servico SET os_origem_inspecao_id = ? WHERE id = ?", [osInspecaoId, nova.id]);
  return (await buscarOSPorId(nova.id))!;
}

export interface DadosEdicaoOS {
  prioridade: PrioridadeOS;
  descricao?: string | null;
  responsavel_id?: number | null;
  equipe_id?: number | null;
  exige_parada_linha?: boolean;
  horas_estimadas?: number;
  ativo_id?: number;
  tipo?: TipoOS;
  data_programada?: string;
  data_limite?: string;
}

export async function editarOS(id: number, dados: DadosEdicaoOS, usuarioId: number): Promise<OrdemServico> {
  const anterior = await buscarOSPorId(id);
  if (!anterior) {
    throw new ErroValidacaoOS("OS não encontrada.");
  }
  if (anterior.status === "concluida" || anterior.status === "cancelada") {
    throw new ErroValidacaoOS("Não é possível editar uma OS concluída ou cancelada.");
  }
  if (dados.responsavel_id != null && dados.equipe_id != null) {
    throw new ErroValidacaoOS("Escolha um responsável OU uma equipe, não os dois.");
  }
  if (dados.responsavel_id != null) {
    const usuario = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [dados.responsavel_id]);
    if (!usuario) {
      throw new ErroValidacaoOS("O responsável selecionado não existe.");
    }
  }
  if (dados.equipe_id != null) {
    const equipe = await dbGet("SELECT id FROM equipe WHERE id = ? AND excluido_em IS NULL", [dados.equipe_id]);
    if (!equipe) {
      throw new ErroValidacaoOS("A equipe selecionada não existe.");
    }
  }
  if (dados.horas_estimadas != null && dados.horas_estimadas < 0) {
    throw new ErroValidacaoOS("As horas estimadas não podem ser negativas.");
  }
  if (dados.ativo_id != null && !(await buscarAtivoPorId(dados.ativo_id))) {
    throw new ErroValidacaoOS("Ativo não encontrado.");
  }
  const dataProgramada = dados.data_programada ?? anterior.data_programada;
  const dataLimite = dados.data_limite ?? anterior.data_limite;
  if (dataLimite < dataProgramada) {
    throw new ErroValidacaoOS("A data limite não pode ser anterior à data programada.");
  }

  await dbRun(
    `UPDATE ordem_servico SET prioridade = ?, descricao = ?, responsavel_id = ?, equipe_id = ?, exige_parada_linha = ?, horas_estimadas = ?,
     ativo_id = ?, tipo = ?, data_programada = ?, data_limite = ? WHERE id = ?`,
    [
      dados.prioridade,
      dados.descricao?.trim() || null,
      dados.responsavel_id ?? null,
      dados.equipe_id ?? null,
      dados.exige_parada_linha ? 1 : 0,
      dados.horas_estimadas ?? anterior.horas_estimadas,
      dados.ativo_id ?? anterior.ativo_id,
      dados.tipo ?? anterior.tipo,
      dataProgramada,
      dataLimite,
      id,
    ]
  );

  const nova = (await buscarOSPorId(id))!;
  if (nova.responsavel_id && nova.responsavel_id !== anterior.responsavel_id) {
    await criarNotificacao({
      usuario_id: nova.responsavel_id,
      tipo: "os_atribuida",
      titulo: `Você foi atribuído à ${nova.codigo}`,
      mensagem: nova.descricao,
      entidade: "ordem_servico",
      entidade_id: nova.id,
    });
  } else if (nova.equipe_id && nova.equipe_id !== anterior.equipe_id) {
    for (const usuarioIdMembro of await usuariosDaEquipe(nova.equipe_id)) {
      await criarNotificacao({
        usuario_id: usuarioIdMembro,
        tipo: "os_atribuida",
        titulo: `Sua equipe foi atribuída à ${nova.codigo}`,
        mensagem: nova.descricao,
        entidade: "ordem_servico",
        entidade_id: nova.id,
      });
    }
  }
  await registrarAuditoria({ entidade: "ordem_servico", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export interface ResultadoAtribuicaoLote {
  atualizadas: number;
  falhas: { id: number; codigo: string | null; erro: string }[];
}

export type AtribuicaoEmLote = { responsavelId: number | null } | { equipeId: number | null };

/**
 * Atribuição em lote (Administrador/Coordenador de PCM/Supervisor de manutenção escolhem várias OS
 * de uma vez e mandam todas pro mesmo responsável OU pra mesma equipe — mutuamente exclusivo, como
 * na edição individual). Deliberadamente não reaproveita editarOS: esse método regrava TODOS os
 * campos a cada chamada (inclusive zerando descrição se não for passada de novo), o que seria
 * destrutivo rodado em loop — aqui o UPDATE toca só responsavel_id/equipe_id (e zera o outro campo,
 * mantendo a exclusividade mútua). OS que já estão concluídas/canceladas ou que não existem viram
 * "falha" da lista, sem derrubar o restante.
 */
export async function atribuirEmLote(
  ids: number[],
  atribuicao: AtribuicaoEmLote,
  usuarioId: number
): Promise<ResultadoAtribuicaoLote> {
  const responsavelId = "responsavelId" in atribuicao ? atribuicao.responsavelId : null;
  const equipeId = "equipeId" in atribuicao ? atribuicao.equipeId : null;

  if (responsavelId != null) {
    const usuario = await dbGet("SELECT id FROM usuario WHERE id = ? AND excluido_em IS NULL", [responsavelId]);
    if (!usuario) {
      throw new ErroValidacaoOS("O responsável selecionado não existe.");
    }
  }
  if (equipeId != null) {
    const equipe = await dbGet("SELECT id FROM equipe WHERE id = ? AND excluido_em IS NULL", [equipeId]);
    if (!equipe) {
      throw new ErroValidacaoOS("A equipe selecionada não existe.");
    }
  }

  const falhas: ResultadoAtribuicaoLote["falhas"] = [];
  let atualizadas = 0;

  for (const id of ids) {
    const anterior = await buscarOSPorId(id);
    if (!anterior) {
      falhas.push({ id, codigo: null, erro: "OS não encontrada." });
      continue;
    }
    if (anterior.status === "concluida" || anterior.status === "cancelada") {
      falhas.push({ id, codigo: anterior.codigo, erro: "OS concluída ou cancelada não pode ser reatribuída." });
      continue;
    }

    await dbRun(`UPDATE ordem_servico SET responsavel_id = ?, equipe_id = ? WHERE id = ?`, [responsavelId, equipeId, id]);
    const nova = (await buscarOSPorId(id))!;

    if (nova.responsavel_id && nova.responsavel_id !== anterior.responsavel_id) {
      await criarNotificacao({
        usuario_id: nova.responsavel_id,
        tipo: "os_atribuida",
        titulo: `Você foi atribuído à ${nova.codigo}`,
        mensagem: nova.descricao,
        entidade: "ordem_servico",
        entidade_id: nova.id,
      });
    } else if (nova.equipe_id && nova.equipe_id !== anterior.equipe_id) {
      for (const usuarioIdMembro of await usuariosDaEquipe(nova.equipe_id)) {
        await criarNotificacao({
          usuario_id: usuarioIdMembro,
          tipo: "os_atribuida",
          titulo: `Sua equipe foi atribuída à ${nova.codigo}`,
          mensagem: nova.descricao,
          entidade: "ordem_servico",
          entidade_id: nova.id,
        });
      }
    }
    await registrarAuditoria({ entidade: "ordem_servico", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: nova, usuario_id: usuarioId });
    atualizadas++;
  }

  return { atualizadas, falhas };
}

async function registrarTransicao(anterior: OrdemServico, id: number, usuarioId: number): Promise<OrdemServico> {
  const nova = (await buscarOSPorId(id))!;
  await registrarAuditoria({ entidade: "ordem_servico", entidade_id: id, acao: "status", valor_anterior: anterior, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

async function exigirOS(id: number): Promise<OrdemServico> {
  const os = await buscarOSPorId(id);
  if (!os) throw new ErroValidacaoOS("OS não encontrada.");
  return os;
}

export async function abrirOS(id: number, usuarioId: number): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (os.status !== "programada" && os.status !== "atrasada") {
    throw new ErroValidacaoOS('Somente uma OS "programada" pode ser aberta.');
  }
  await dbRun("UPDATE ordem_servico SET status = 'aberta' WHERE id = ?", [id]);
  return registrarTransicao(os, id, usuarioId);
}

export async function iniciarExecucaoOS(id: number, usuarioId: number, dataInicioExecucao?: string | null): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (!["aberta", "aguardando_peca", "atrasada"].includes(os.status)) {
    throw new ErroValidacaoOS("A OS precisa estar aberta ou aguardando peça para iniciar a execução.");
  }
  if (dataInicioExecucao && dataInicioExecucao < os.data_abertura) {
    throw new ErroValidacaoOS("O início da execução não pode ser anterior à abertura da OS.");
  }
  await dbRun(
    `UPDATE ordem_servico SET status = 'em_execucao', data_inicio_execucao = COALESCE(data_inicio_execucao, ?, to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS')) WHERE id = ?`,
    [dataInicioExecucao ?? null, id]
  );
  return registrarTransicao(os, id, usuarioId);
}

export async function aguardarPecaOS(id: number, usuarioId: number): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (os.status !== "em_execucao" && os.status !== "atrasada") {
    throw new ErroValidacaoOS('Somente uma OS "em execução" pode aguardar peça.');
  }
  await dbRun("UPDATE ordem_servico SET status = 'aguardando_peca' WHERE id = ?", [id]);
  return registrarTransicao(os, id, usuarioId);
}

export const CAUSAS_FALHA = ["eletrica", "mecanica", "operacional", "desgaste_natural", "falta_manutencao", "outro"] as const;
export type CausaFalha = (typeof CAUSAS_FALHA)[number];

export interface DadosConclusaoOS {
  horas_reais?: number | null;
  observacoes_execucao?: string | null;
  data_conclusao?: string | null;
  causa_falha?: CausaFalha | null;
  resultado_inspecao?: ResultadoInspecao | null;
}

/**
 * Concluir exige que todo item obrigatório do checklist esteja marcado e toda peça obrigatória
 * tenha baixa de consumo registrada (mesmo que "0", com justificativa) — regra citada na tela
 * de peças do plano ("a OS não conclui sem baixa desta peça") e reforçada aqui no lado do
 * servidor, não só como aviso na UI.
 */
export async function concluirOS(id: number, dados: DadosConclusaoOS, usuarioId: number): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (!["em_execucao", "aguardando_peca", "atrasada"].includes(os.status)) {
    throw new ErroValidacaoOS("A OS precisa estar em execução para ser concluída.");
  }

  // GLOBOPAC-VAL-01: OS aberta a partir de solicitação do GloboPac só pode ser concluída no Sigma
  // depois que o usuário do GloboPac der "conforme" na aba de acompanhamento de OS do painel dele
  // (webhook POST /integracoes/globopac/os/validacao, que grava globopac_validado_em).
  if (os.solicitacao_origem === "globopac" && !os.globopac_validado_em) {
    throw new ErroValidacaoOS(
      "Esta OS foi aberta a partir de uma solicitação do GloboPac e só pode ser concluída depois que o GloboPac validar (dar conforme) a execução no painel dele."
    );
  }

  // CHK-01: TODO item do checklist precisa ter resposta antes de concluir, obrigatório ou não —
  // antes só os obrigatórios travavam a conclusão; pedido explícito do usuário pra exigir o
  // checklist inteiro respondido.
  const tarefasPendentes = (await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM os_tarefa WHERE os_id = ? AND concluida = 0",
    [id]
  ))!;
  if (tarefasPendentes.n > 0) {
    throw new ErroValidacaoOS(`Existem ${tarefasPendentes.n} item(ns) do checklist ainda não respondido(s).`);
  }

  const pecasPendentes = (await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM os_peca WHERE os_id = ? AND obrigatoria = 1 AND quantidade_consumida IS NULL",
    [id]
  ))!;
  if (pecasPendentes.n > 0) {
    throw new ErroValidacaoOS(`Existem ${pecasPendentes.n} peça(s) obrigatória(s) sem baixa de consumo registrada.`);
  }

  // SERV-EXT-03: não deixa a OS fechar com um componente ainda fora da empresa (no torno, na
  // solda etc.) — sem essa trava, a OS conclui e o item de serviço externo fica "esquecido" sem
  // ninguém acompanhar o retorno nem o pagamento.
  const servicosExternosPendentes = (await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM servico_externo WHERE os_id = ? AND status_logistico IN ('pendente_envio','enviado') AND excluido_em IS NULL",
    [id]
  ))!;
  if (servicosExternosPendentes.n > 0) {
    throw new ErroValidacaoOS(
      `Existem ${servicosExternosPendentes.n} item(ns) em serviço externo ainda não retornado(s) ou cancelado(s).`
    );
  }

  // SERV-EXT-06: além de retornado, o pagamento do serviço externo tem que estar quitado antes de
  // concluir — depois que a OS fecha, o pagamento é travado (ver registrarPagamento), então essa é
  // a última chance de regularizar sem precisar reabrir a OS.
  const servicosExternosSemPagamento = (await dbGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM servico_externo
     WHERE os_id = ? AND excluido_em IS NULL AND status_logistico = 'retornado' AND status_pagamento != 'pago'`,
    [id]
  ))!;
  if (servicosExternosSemPagamento.n > 0) {
    throw new ErroValidacaoOS(
      `Existem ${servicosExternosSemPagamento.n} item(ns) em serviço externo com pagamento ainda não quitado.`
    );
  }

  const pecas = await dbAll<{ quantidade_consumida: number | null; custo_unitario_no_consumo: number | null }>(
    "SELECT quantidade_consumida, custo_unitario_no_consumo FROM os_peca WHERE os_id = ?",
    [id]
  );
  const custoPecas = pecas.reduce((soma, p) => soma + (p.quantidade_consumida ?? 0) * (p.custo_unitario_no_consumo ?? 0), 0);

  if (dados.data_conclusao && os.data_inicio_execucao && dados.data_conclusao < os.data_inicio_execucao) {
    throw new ErroValidacaoOS("A data de conclusão não pode ser anterior ao início da execução.");
  }

  const horasReais = dados.horas_reais ?? os.horas_estimadas;
  const custoMaoDeObra = await calcularCustoMaoDeObra(os.responsavel_id, horasReais);

  await dbRun(
    `UPDATE ordem_servico SET status = 'concluida', data_conclusao = COALESCE(?, (now() - interval '4 hours')), horas_reais = ?, observacoes_execucao = ?, custo_pecas = ?, custo_mao_obra = ?, causa_falha = COALESCE(?, causa_falha), resultado_inspecao = COALESCE(?, resultado_inspecao) WHERE id = ?`,
    [
      dados.data_conclusao ?? null,
      horasReais,
      dados.observacoes_execucao?.trim() || null,
      custoPecas,
      custoMaoDeObra,
      dados.causa_falha ?? null,
      dados.resultado_inspecao ?? null,
      id,
    ]
  );
  await verificarClassificacaoManutencao(os.ativo_id);
  const nova = await registrarTransicao(os, id, usuarioId);
  await notificarGlobopacSeAplicavel(nova);

  // ASSIN-01: assinatura digital é gerada para TODA OS concluída, não só pela rota
  // POST /ordens-servico/:id/concluir — concluirAuditoria (auditoriaOSService.ts, fluxo de
  // conferência de OS em campo) chama esta mesma função. Import dinâmico evita ciclo estático de
  // módulos (assinaturaService.ts importa buscarOSPorId/listarTarefasDaOS/listarPecasDaOS daqui).
  // gerarAssinaturaOS nunca lança — falha de TSA fica registrada na própria linha, não pode desfazer
  // uma conclusão que já aconteceu.
  const { gerarAssinaturaOS } = await import("./assinaturaService.js");
  await gerarAssinaturaOS(id, usuarioId);

  return nova;
}

async function checklistParaGlobopac(osId: number): Promise<ItemChecklistGlobopac[]> {
  const tarefas = (await dbAll("SELECT descricao, obrigatoria FROM os_tarefa WHERE os_id = ? ORDER BY ordem", [osId])) as {
    descricao: string;
    obrigatoria: number;
  }[];
  return tarefas.map((t) => ({ descricao: t.descricao, obrigatoria: t.obrigatoria === 1 }));
}

function formatarRespostaTarefaGlobopac(t: {
  tipo_resposta: TipoResposta;
  resposta: string | null;
  valor_numerico: number | null;
  unidade: string | null;
  concluida: number;
}): string {
  if (!t.concluida) return "não verificado";
  if (t.tipo_resposta === "ok_nok") return t.resposta === "ok" ? "OK" : t.resposta === "nok" ? "NOK" : "—";
  if (t.tipo_resposta === "numerico") return `${t.valor_numerico ?? "—"}${t.unidade ? ` ${t.unidade}` : ""}`;
  return t.resposta?.trim() || "—";
}

/**
 * Mesmo checklist de `checklistParaGlobopac`, mas como texto livre item a item já com a resposta
 * dada na execução (ou "não verificado" enquanto a tarefa não foi respondida) — é o
 * `sigma_checklist_execucao` mandado pro GloboPac, pra quem abriu a solicitação ver no painel dele
 * o que de fato foi checado/feito, sem precisar interpretar o array estruturado de `sigma_checklist`.
 */
export async function checklistExecucaoParaGlobopac(osId: number): Promise<string> {
  const tarefas = (await dbAll(
    "SELECT descricao, tipo_resposta, resposta, valor_numerico, unidade, concluida FROM os_tarefa WHERE os_id = ? ORDER BY ordem",
    [osId]
  )) as {
    descricao: string;
    tipo_resposta: TipoResposta;
    resposta: string | null;
    valor_numerico: number | null;
    unidade: string | null;
    concluida: number;
  }[];
  return tarefas.map((t) => `- ${t.descricao}: ${formatarRespostaTarefaGlobopac(t)}`).join("\n");
}

/**
 * SERV-EXT-GLOBOPAC: quando a OS concluída nasceu de uma solicitação do GloboPac, avisa o GloboPac
 * (mesmo endpoint/formato usado na programação — ver notificarGlobopacAtualizacaoOS). Best-effort:
 * a OS já foi concluída no Sigma quando esta função roda, então uma falha aqui só é logada.
 */
async function notificarGlobopacSeAplicavel(os: OrdemServico): Promise<void> {
  if (os.solicitacao_origem !== "globopac" || !os.solicitacao_id) return;
  const solicitacao = await dbGet<{ origem_externa_id: string | null }>(
    "SELECT origem_externa_id FROM solicitacao WHERE id = ?",
    [os.solicitacao_id]
  );
  if (!solicitacao?.origem_externa_id) return;
  notificarGlobopacAtualizacaoOS(solicitacao.origem_externa_id, {
    sigma_os_codigo: os.codigo,
    sigma_responsavel_nome: os.responsavel_nome,
    sigma_data_programada: os.data_programada,
    sigma_data_limite: os.data_limite,
    sigma_descricao_servico: os.descricao ?? "",
    sigma_checklist: await checklistParaGlobopac(os.id),
    sigma_checklist_execucao: await checklistExecucaoParaGlobopac(os.id),
  }).catch((erro) => console.error("Falha ao notificar o GloboPac sobre a conclusão da OS:", erro));
}

/**
 * GLOBOPAC-VAL-02: aviso explícito do usuário do Sigma de que a execução da OS terminou no campo —
 * é o gatilho pro usuário do GloboPac ir in loco validar e dar "conforme" (webhook POST
 * /integracoes/globopac/os/validacao), que por sua vez libera a conclusão da OS no Sigma (ver gate
 * em `concluirOS`). Não é uma transição de status: a OS continua em execução/aguardando peça até ser
 * concluída de fato. Diferente de `notificarGlobopacSeAplicavel` (best-effort, silenciosa): aqui a
 * notificação É o propósito da ação, então uma falha é reportada ao usuário, não só logada.
 */
export async function avisarGlobopacExecucaoOS(id: number, usuarioId: number): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (os.solicitacao_origem !== "globopac") {
    throw new ErroValidacaoOS("Esta OS não veio de uma solicitação do GloboPac.");
  }
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoOS("Esta OS já está concluída ou cancelada.");
  }
  if (os.globopac_validado_em) return os;

  const solicitacao = await dbGet<{ origem_externa_id: string | null }>(
    "SELECT origem_externa_id FROM solicitacao WHERE id = ?",
    [os.solicitacao_id]
  );
  if (!solicitacao?.origem_externa_id) {
    throw new ErroValidacaoOS("A solicitação de origem não tem um identificador do GloboPac (origem_externa_id).");
  }

  try {
    await notificarGlobopacAtualizacaoOS(solicitacao.origem_externa_id, {
      sigma_os_codigo: os.codigo,
      sigma_responsavel_nome: os.responsavel_nome,
      sigma_data_programada: os.data_programada,
      sigma_data_limite: os.data_limite,
      sigma_descricao_servico: os.descricao ?? "",
      sigma_checklist: await checklistParaGlobopac(os.id),
      sigma_checklist_execucao: await checklistExecucaoParaGlobopac(os.id),
    });
  } catch (erro) {
    throw new ErroValidacaoOS(`Não foi possível avisar o GloboPac: ${(erro as Error).message}`);
  }

  await dbRun(`UPDATE ordem_servico SET globopac_execucao_avisada_em = (now() - interval '4 hours') WHERE id = ?`, [id]);
  const nova = (await buscarOSPorId(id))!;
  await registrarAuditoria({ entidade: "ordem_servico", entidade_id: id, acao: "editar", valor_anterior: os, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

/**
 * BAIXA-01: Técnico não pode mais concluir/encerrar a OS (ver PERFIS_QUE_PODEM_CONCLUIR_OS em
 * routes/ordensServico.ts) — só sinalizar que o serviço foi realizado, pra quem tem permissão de
 * baixa (Administrador, Coordenador de PCM, Planejador, Supervisor de manutenção) saber que a OS
 * está pronta pra conclusão. Não é uma transição de status, igual a `avisarGlobopacExecucaoOS`, mas
 * genérica — não depende de a OS ter vindo do GloboPac nem dispara nenhuma notificação externa.
 * Idempotente: sinalizar de novo não sobrescreve a data/quem já registrado.
 */
export async function sinalizarExecucaoOS(id: number, usuarioId: number): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoOS("Esta OS já está concluída ou cancelada.");
  }
  if (os.execucao_sinalizada_em) return os;

  await dbRun(
    `UPDATE ordem_servico SET execucao_sinalizada_em = (now() - interval '4 hours'), execucao_sinalizada_por_id = ? WHERE id = ?`,
    [usuarioId, id]
  );
  const nova = (await buscarOSPorId(id))!;
  await registrarAuditoria({ entidade: "ordem_servico", entidade_id: id, acao: "editar", valor_anterior: os, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

/**
 * GLOBOPAC-VAL-01: registra que o usuário do GloboPac deu "conforme" (validou) a execução desta OS
 * na aba de acompanhamento de OS do painel dele — pré-requisito pra conclusão no Sigma, ver gate em
 * `concluirOS`. Chamada pelo webhook POST /integracoes/globopac/os/validacao (via
 * `validarOSGlobopac` em solicitacaoService.ts). Idempotente: um reenvio do webhook não sobrescreve
 * a data/nome já registrados.
 */
export async function registrarValidacaoGlobopac(
  osId: number,
  validadoPorNome: string | null,
  usuarioId: number
): Promise<OrdemServico> {
  const anterior = await exigirOS(osId);
  if (anterior.globopac_validado_em) return anterior;

  await dbRun(
    `UPDATE ordem_servico SET globopac_validado_em = (now() - interval '4 hours'), globopac_validado_por_nome = ? WHERE id = ?`,
    [validadoPorNome, osId]
  );

  const nova = (await buscarOSPorId(osId))!;
  await registrarAuditoria({ entidade: "ordem_servico", entidade_id: osId, acao: "editar", valor_anterior: anterior, valor_novo: nova, usuario_id: usuarioId });
  if (nova.responsavel_id) {
    await criarNotificacao({
      usuario_id: nova.responsavel_id,
      tipo: "os_validada_globopac",
      titulo: `${nova.codigo} foi validada pelo GloboPac`,
      mensagem: "Já é possível concluir esta OS.",
      entidade: "ordem_servico",
      entidade_id: nova.id,
    });
  }
  return nova;
}

/**
 * Reabrir desfaz uma conclusão ou cancelamento indevidos, devolvendo a OS para "aberta" (mesmo
 * estado de uma OS avulsa recém-criada) — pendente de nova execução. Limpa apenas os marcadores
 * do estado terminal que está sendo desfeito (data_conclusao, motivo_cancelamento); apontamentos
 * de execução já registrados (horas, custos, observações) são preservados como histórico e serão
 * sobrescritos naturalmente se a OS for concluída de novo. Restrita a quem tem a permissão
 * "reabrir" — perfis operacionais (Técnico) não podem desfazer uma conclusão/cancelamento.
 */
export async function reabrirOS(id: number, usuarioId: number): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (os.status !== "concluida" && os.status !== "cancelada") {
    throw new ErroValidacaoOS("Só é possível reabrir uma OS concluída ou cancelada.");
  }
  await dbRun(`UPDATE ordem_servico SET status = 'aberta', data_conclusao = NULL, motivo_cancelamento = NULL WHERE id = ?`, [id]);
  const nova = await registrarTransicao(os, id, usuarioId);

  // ASSIN-01: reabrir uma OS já assinada invalida a assinatura vigente (preserva no histórico) —
  // uma correção exige um novo ciclo completo de assinatura na próxima conclusão, nunca edição da
  // anterior. Import dinâmico pelo mesmo motivo de concluirOS, acima.
  const { invalidarAssinaturasDaOS } = await import("./assinaturaService.js");
  await invalidarAssinaturasDaOS(id);

  return nova;
}

// REPROG-01: mesma regra usada por sincronizarAtrasos (SQL) pra promover o status pra "atrasada" —
// extraída aqui como função pura, sem banco, pra poder ser testada isoladamente e reaproveitada na
// validação de reprogramarOS logo abaixo.
export function ehOSVencida(dataLimite: string, status: StatusOS, hojeISO: string): boolean {
  if (status === "concluida" || status === "cancelada") return false;
  return dataLimite.slice(0, 10) < hojeISO.slice(0, 10);
}

export interface OSReprogramacao {
  id: number;
  os_id: number;
  data_anterior: string;
  data_nova: string;
  motivo: string | null;
  usuario_id: number;
  usuario_nome: string | null;
  criado_em: string;
}

export async function listarReprogramacoesDaOS(osId: number): Promise<OSReprogramacao[]> {
  return (await dbAll(
    `SELECT r.id, r.os_id, r.data_anterior, r.data_nova, r.motivo, r.usuario_id, u.nome AS usuario_nome, r.criado_em
     FROM os_reprogramacao r LEFT JOIN usuario u ON u.id = r.usuario_id
     WHERE r.os_id = ? ORDER BY r.criado_em DESC, r.id DESC`,
    [osId]
  )) as unknown as OSReprogramacao[];
}

export interface DadosReprogramacaoOS {
  data_nova: string;
  motivo?: string | null;
}

/**
 * Reprograma uma OS vencida: mantém o mesmo número/ID (não cria uma nova OS), só desloca a data
 * limite pra uma data futura e registra o ciclo no histórico (os_reprogramacao) — permite múltiplas
 * reprogramações, cada uma com sua própria trilha. O status "atrasada" some (ele só existe enquanto
 * a data limite estiver no passado); a OS volta a "em_execucao" se já tinha sido iniciada
 * (data_inicio_execucao preenchida) ou "aberta" caso contrário — não há como saber com certeza se
 * estava "aguardando_peca" antes de atrasar, então esse caso cai em "aberta" também.
 */
export async function reprogramarOS(id: number, dados: DadosReprogramacaoOS, usuarioId: number): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (!ehOSVencida(os.data_limite, os.status, hojeSistema())) {
    throw new ErroValidacaoOS("Só é possível reprogramar uma OS vencida (com a data limite já ultrapassada).");
  }
  if (!dados.data_nova?.trim()) {
    throw new ErroValidacaoOS("Informe a nova data prevista.");
  }
  if (dados.data_nova.slice(0, 10) <= hojeSistema()) {
    throw new ErroValidacaoOS("A nova data prevista precisa ser posterior a hoje.");
  }

  const dataAnterior = os.data_limite;
  const novoStatus: StatusOS = os.data_inicio_execucao ? "em_execucao" : "aberta";

  await dbRun(
    `UPDATE ordem_servico SET
       data_prevista_original = COALESCE(data_prevista_original, data_limite),
       data_limite = ?,
       status = ?,
       reprogramada = 1,
       quantidade_reprogramacoes = quantidade_reprogramacoes + 1
     WHERE id = ?`,
    [dados.data_nova, novoStatus, id]
  );
  await dbRun(
    `INSERT INTO os_reprogramacao (os_id, data_anterior, data_nova, motivo, usuario_id) VALUES (?, ?, ?, ?, ?)`,
    [id, dataAnterior, dados.data_nova, dados.motivo?.trim() || null, usuarioId]
  );

  return registrarTransicao(os, id, usuarioId);
}

/**
 * `custo_hora_padrao` do responsável (Fase 11) × horas reais apontadas. null quando a OS não
 * tem responsável atribuído — sem tarifa não há como custear a mão de obra, então o campo fica
 * em branco em vez de assumir um valor arbitrário.
 */
async function calcularCustoMaoDeObra(responsavelId: number | null, horasReais: number): Promise<number | null> {
  if (responsavelId == null) return null;
  const responsavel = await dbGet<{ custo_hora_padrao: number }>(
    "SELECT custo_hora_padrao FROM usuario WHERE id = ?",
    [responsavelId]
  );
  if (!responsavel) return null;
  return horasReais * responsavel.custo_hora_padrao;
}

export async function cancelarOS(id: number, motivo: string, usuarioId: number): Promise<OrdemServico> {
  const os = await exigirOS(id);
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoOS("Esta OS já está concluída ou cancelada.");
  }
  if (!motivo.trim()) {
    throw new ErroValidacaoOS("Informe o motivo do cancelamento.");
  }
  await dbRun("UPDATE ordem_servico SET status = 'cancelada', motivo_cancelamento = ? WHERE id = ?", [motivo.trim(), id]);
  await liberarReservasDaOS(id);
  return registrarTransicao(os, id, usuarioId);
}

export async function excluirOS(id: number, usuarioId: number): Promise<void> {
  const os = await exigirOS(id);
  await dbRun("UPDATE ordem_servico SET excluido_em = (now() - interval '4 hours') WHERE id = ?", [id]);
  if (os.status !== "concluida") {
    await liberarReservasDaOS(id);
  }
  await registrarAuditoria({ entidade: "ordem_servico", entidade_id: id, acao: "excluir", valor_anterior: os, usuario_id: usuarioId });
}

export async function listarTarefasDaOS(osId: number): Promise<OSTarefa[]> {
  return (await dbAll("SELECT * FROM os_tarefa WHERE os_id = ? ORDER BY ordem", [osId])) as unknown as OSTarefa[];
}

export interface DadosTarefaOS {
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria?: boolean;
  valor_min?: number | null;
  valor_max?: number | null;
  unidade?: string | null;
  regime?: Regime | null;
}

async function exigirOSEditavel(osId: number, mensagem: string): Promise<OrdemServico> {
  const os = await exigirOS(osId);
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoOS(mensagem);
  }
  return os;
}

/** Cria um item de checklist direto na OS (fora do fluxo de copiar de um plano) — usado por OS avulsa/corretiva, que nasce sem checklist algum. */
export async function adicionarTarefaOS(osId: number, dados: DadosTarefaOS, usuarioId: number): Promise<OSTarefa> {
  await exigirOSEditavel(osId, "Não é possível alterar o checklist de uma OS concluída ou cancelada.");
  const maxOrdem = (await dbGet<{ maximo: number }>("SELECT COALESCE(MAX(ordem), 0) AS maximo FROM os_tarefa WHERE os_id = ?", [osId]))!;
  const info = await dbRun(
    `INSERT INTO os_tarefa (os_id, ordem, descricao, tipo_resposta, obrigatoria, valor_min, valor_max, unidade, regime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      osId,
      maxOrdem.maximo + 1,
      dados.descricao,
      dados.tipo_resposta,
      dados.obrigatoria === false ? 0 : 1,
      dados.valor_min ?? null,
      dados.valor_max ?? null,
      dados.unidade ?? null,
      dados.regime ?? null,
    ]
  );
  const nova = (await dbGet("SELECT * FROM os_tarefa WHERE id = ?", [info.id])) as unknown as OSTarefa;
  await registrarAuditoria({ entidade: "os_tarefa", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

/** Edita a definição do item (descrição/tipo/obrigatoriedade/faixa) — diferente de `responderTarefaOS`, que só grava a resposta dada na execução. */
export async function editarTarefaOS(osId: number, tarefaId: number, dados: DadosTarefaOS, usuarioId: number): Promise<OSTarefa> {
  await exigirOSEditavel(osId, "Não é possível alterar o checklist de uma OS concluída ou cancelada.");
  const anterior = await dbGet("SELECT * FROM os_tarefa WHERE id = ? AND os_id = ?", [tarefaId, osId]);
  if (!anterior) {
    throw new ErroValidacaoOS("Item do checklist não encontrado.");
  }
  await dbRun(
    `UPDATE os_tarefa SET descricao = ?, tipo_resposta = ?, obrigatoria = ?, valor_min = ?, valor_max = ?, unidade = ?, regime = ?
     WHERE id = ?`,
    [
      dados.descricao,
      dados.tipo_resposta,
      dados.obrigatoria === false ? 0 : 1,
      dados.valor_min ?? null,
      dados.valor_max ?? null,
      dados.unidade ?? null,
      dados.regime ?? null,
      tarefaId,
    ]
  );
  const nova = (await dbGet("SELECT * FROM os_tarefa WHERE id = ?", [tarefaId])) as unknown as OSTarefa;
  await registrarAuditoria({
    entidade: "os_tarefa",
    entidade_id: tarefaId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: nova,
    usuario_id: usuarioId,
  });
  return nova;
}

export async function removerTarefaOS(osId: number, tarefaId: number, usuarioId: number): Promise<void> {
  await exigirOSEditavel(osId, "Não é possível alterar o checklist de uma OS concluída ou cancelada.");
  const anterior = await dbGet("SELECT * FROM os_tarefa WHERE id = ? AND os_id = ?", [tarefaId, osId]);
  if (!anterior) {
    throw new ErroValidacaoOS("Item do checklist não encontrado.");
  }
  await dbRun("DELETE FROM os_tarefa WHERE id = ?", [tarefaId]);
  await registrarAuditoria({ entidade: "os_tarefa", entidade_id: tarefaId, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}

export interface DadosRespostaTarefa {
  resposta?: string | null;
  valor_numerico?: number | null;
  concluida: boolean;
}

export async function responderTarefaOS(osId: number, tarefaId: number, dados: DadosRespostaTarefa, usuarioId: number): Promise<OSTarefa> {
  const os = await exigirOS(osId);
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoOS("Não é possível alterar o checklist de uma OS concluída ou cancelada.");
  }
  const anterior = await dbGet("SELECT * FROM os_tarefa WHERE id = ? AND os_id = ?", [tarefaId, osId]);
  if (!anterior) {
    throw new ErroValidacaoOS("Item do checklist não encontrado.");
  }

  if (dados.concluida) {
    await dbRun(
      `UPDATE os_tarefa SET resposta = ?, valor_numerico = ?, concluida = 1, concluida_em = (now() - interval '4 hours'), concluida_por = ? WHERE id = ?`,
      [dados.resposta ?? null, dados.valor_numerico ?? null, usuarioId, tarefaId]
    );
  } else {
    await dbRun(
      `UPDATE os_tarefa SET resposta = ?, valor_numerico = ?, concluida = 0, concluida_em = NULL, concluida_por = NULL WHERE id = ?`,
      [dados.resposta ?? null, dados.valor_numerico ?? null, tarefaId]
    );
  }

  const nova = (await dbGet("SELECT * FROM os_tarefa WHERE id = ?", [tarefaId])) as unknown as OSTarefa;
  await registrarAuditoria({
    entidade: "os_tarefa",
    entidade_id: tarefaId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: nova,
    usuario_id: usuarioId,
  });
  return nova;
}

export async function listarPecasDaOS(osId: number): Promise<OSPeca[]> {
  return (await dbAll(
    `SELECT op.id, op.os_id, op.peca_id, op.quantidade_prevista, op.quantidade_reservada, op.quantidade_consumida,
            op.custo_unitario_no_consumo, op.justificativa_divergencia, op.origem, op.obrigatoria,
            p.codigo, p.descricao, p.unidade_medida, p.estoque_atual
     FROM os_peca op
     JOIN peca p ON p.id = op.peca_id
     WHERE op.os_id = ?
     ORDER BY p.descricao`,
    [osId]
  )) as unknown as OSPeca[];
}

export interface DadosPecaOS {
  peca_id: number;
  quantidade_prevista: number;
  obrigatoria?: boolean;
}

export async function adicionarPecaOS(osId: number, dados: DadosPecaOS, usuarioId: number): Promise<OSPeca> {
  const os = await exigirOS(osId);
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoOS("Não é possível alterar peças de uma OS concluída ou cancelada.");
  }
  if (!(await buscarPecaPorId(dados.peca_id))) {
    throw new ErroValidacaoOS("Peça não encontrada.");
  }

  const info = await dbRun(
    "INSERT INTO os_peca (os_id, peca_id, quantidade_prevista, origem, obrigatoria) VALUES (?, ?, ?, 'manual', ?) RETURNING id",
    [osId, dados.peca_id, dados.quantidade_prevista, dados.obrigatoria === false ? 0 : 1]
  );
  await criarReserva(osId, dados.peca_id, dados.quantidade_prevista);

  const nova = (await listarPecasDaOS(osId)).find((p) => p.id === info.id)!;
  await registrarAuditoria({ entidade: "os_peca", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export interface DadosConsumoPeca {
  quantidade_consumida: number;
  justificativa_divergencia?: string | null;
}

/**
 * Registra a baixa de consumo na OS e reflete no estoque físico (Fase 7): a diferença entre a
 * nova quantidade e a que já estava registrada vira uma saída (ou devolução, se reduziu) no
 * ledger de movimento_estoque, e a reserva desta linha passa de "reservada" para "consumida".
 * Só é permitido a partir de "aberta" em diante — uma OS ainda "programada" não foi liberada
 * para execução, então não faz sentido dar baixa em peça por ela ainda.
 */
export async function registrarConsumoPeca(osPecaId: number, dados: DadosConsumoPeca, usuarioId: number): Promise<OSPeca> {
  const anterior = (await dbGet(
    "SELECT * FROM os_peca WHERE id = ?",
    [osPecaId]
  )) as { os_id: number; peca_id: number; quantidade_consumida: number | null } | undefined;
  if (!anterior) {
    throw new ErroValidacaoOS("Item de peça da OS não encontrado.");
  }
  const os = await exigirOS(anterior.os_id);
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoOS("Não é possível registrar consumo em uma OS concluída ou cancelada.");
  }
  if (os.status === "programada") {
    throw new ErroValidacaoOS('Abra a OS antes de registrar consumo de peças.');
  }
  if (dados.quantidade_consumida < 0) {
    throw new ErroValidacaoOS("A quantidade consumida não pode ser negativa.");
  }
  const peca = await buscarPecaPorId(anterior.peca_id);

  await dbRun(
    "UPDATE os_peca SET quantidade_consumida = ?, custo_unitario_no_consumo = ?, justificativa_divergencia = ? WHERE id = ?",
    [dados.quantidade_consumida, peca?.custo_unitario_medio ?? null, dados.justificativa_divergencia?.trim() || null, osPecaId]
  );

  const delta = dados.quantidade_consumida - (anterior.quantidade_consumida ?? 0);
  await baixarConsumoOS(anterior.peca_id, delta, anterior.os_id, usuarioId);
  await consumirReserva(anterior.os_id, anterior.peca_id);

  const nova = (await listarPecasDaOS(anterior.os_id)).find((p) => p.id === osPecaId)!;
  await registrarAuditoria({
    entidade: "os_peca",
    entidade_id: osPecaId,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: nova,
    usuario_id: usuarioId,
  });
  return nova;
}

export async function removerPecaOS(osPecaId: number, usuarioId: number): Promise<void> {
  const anterior = (await dbGet(
    "SELECT * FROM os_peca WHERE id = ?",
    [osPecaId]
  )) as { os_id: number; peca_id: number; quantidade_consumida: number | null } | undefined;
  if (!anterior) {
    throw new ErroValidacaoOS("Item de peça não encontrado.");
  }
  if (anterior.quantidade_consumida != null) {
    throw new ErroValidacaoOS("Não é possível remover uma peça que já teve consumo registrado.");
  }
  const os = await exigirOS(anterior.os_id);
  if (os.status === "concluida" || os.status === "cancelada") {
    throw new ErroValidacaoOS("Não é possível alterar peças de uma OS concluída ou cancelada.");
  }
  await dbRun("DELETE FROM os_peca WHERE id = ?", [osPecaId]);
  await removerReservaDaLinha(anterior.os_id, anterior.peca_id);
  await registrarAuditoria({ entidade: "os_peca", entidade_id: osPecaId, acao: "excluir", valor_anterior: anterior, usuario_id: usuarioId });
}
