import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarAtivoPorId, caminhoAtivo } from "./ativoService.js";
import {
  adicionarTarefaOS,
  checklistExecucaoParaGlobopac,
  criarOSDeSolicitacao,
  registrarValidacaoGlobopac,
  type DadosOSAvulsa,
  type DadosTarefaOS,
  type OrdemServico,
} from "./osService.js";
import { criarNotificacao, usuariosComPermissao } from "./notificacaoService.js";
import { notificarGlobopacAtualizacaoOS } from "./integracaoGlobopacService.js";

export type StatusSolicitacao = "aberta" | "em_analise" | "convertida_em_os" | "recusada";
export type PrioridadeSolicitacao = "baixa" | "media" | "alta" | "critica";
export type OrigemSolicitacao = "interna" | "globopac";

export class ErroValidacaoSolicitacao extends Error {}

export interface Solicitacao {
  id: number;
  codigo: string;
  ativo_id: number | null;
  ativo_codigo: string | null;
  ativo_nome: string | null;
  ativo_caminho: string | null;
  solicitante_id: number;
  solicitante_nome: string;
  setor_solicitante: string | null;
  descricao: string;
  prioridade_sugerida: PrioridadeSolicitacao;
  status: StatusSolicitacao;
  os_id: number | null;
  os_codigo: string | null;
  motivo_recusa: string | null;
  criada_em: string;
  analisada_em: string | null;
  analisada_por: number | null;
  analisada_por_nome: string | null;
  origem: OrigemSolicitacao;
  origem_externa_id: string | null;
  origem_externa_codigo: string | null;
  solicitante_externo_nome: string | null;
}

const COLUNAS_SOLICITACAO = `
  s.id, s.codigo, s.ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
  s.solicitante_id, sol.nome AS solicitante_nome, s.setor_solicitante, s.descricao, s.prioridade_sugerida,
  s.status, s.os_id, os.codigo AS os_codigo, s.motivo_recusa, s.criada_em, s.analisada_em,
  s.analisada_por, an.nome AS analisada_por_nome, s.origem, s.origem_externa_id, s.origem_externa_codigo,
  s.solicitante_externo_nome
`;

export interface FiltrosSolicitacao {
  status?: StatusSolicitacao;
  ativoId?: number;
  solicitanteId?: number;
  texto?: string;
}

export async function listarSolicitacoes(filtros: FiltrosSolicitacao = {}): Promise<Solicitacao[]> {
  const condicoes: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filtros.status) {
    condicoes.push("s.status = ?");
    params.push(filtros.status);
  }
  if (filtros.ativoId) {
    condicoes.push("s.ativo_id = ?");
    params.push(filtros.ativoId);
  }
  if (filtros.solicitanteId) {
    condicoes.push("s.solicitante_id = ?");
    params.push(filtros.solicitanteId);
  }
  if (filtros.texto) {
    condicoes.push("(s.codigo ILIKE ? OR s.descricao ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  const sql = `
    SELECT ${COLUNAS_SOLICITACAO}
    FROM solicitacao s
    LEFT JOIN ativo a ON a.id = s.ativo_id
    JOIN usuario sol ON sol.id = s.solicitante_id
    LEFT JOIN usuario an ON an.id = s.analisada_por
    LEFT JOIN ordem_servico os ON os.id = s.os_id
    WHERE ${condicoes.join(" AND ")}
    ORDER BY
      CASE s.status WHEN 'aberta' THEN 0 WHEN 'em_analise' THEN 1 ELSE 2 END,
      CASE s.prioridade_sugerida WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
      s.criada_em DESC
  `;
  const rows = (await dbAll(sql, params)) as unknown as Solicitacao[];
  return Promise.all(rows.map(async (r) => ({ ...r, ativo_caminho: r.ativo_id != null ? await caminhoAtivo(r.ativo_id) : null })));
}

export async function buscarSolicitacaoPorId(id: number): Promise<Solicitacao | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS_SOLICITACAO}
     FROM solicitacao s
     LEFT JOIN ativo a ON a.id = s.ativo_id
     JOIN usuario sol ON sol.id = s.solicitante_id
     LEFT JOIN usuario an ON an.id = s.analisada_por
     LEFT JOIN ordem_servico os ON os.id = s.os_id
     WHERE s.id = ?`,
    [id]
  )) as Solicitacao | undefined;
  if (!row) return null;
  return { ...row, ativo_caminho: row.ativo_id != null ? await caminhoAtivo(row.ativo_id) : null };
}

export async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM solicitacao WHERE codigo LIKE 'SOL-%'")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("SOL-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `SOL-${String(maior + 1).padStart(4, "0")}`;
}

export interface DadosSolicitacao {
  ativo_id?: number | null;
  descricao: string;
  prioridade_sugerida: PrioridadeSolicitacao;
  setor_solicitante?: string | null;
}

export async function criarSolicitacao(dados: DadosSolicitacao, usuarioId: number): Promise<Solicitacao> {
  if (dados.ativo_id != null && !(await buscarAtivoPorId(dados.ativo_id))) {
    throw new ErroValidacaoSolicitacao("Ativo não encontrado.");
  }
  if (!dados.descricao.trim()) {
    throw new ErroValidacaoSolicitacao("Descreva o problema ou serviço solicitado.");
  }

  const codigo = await codigoSugerido();
  const info = await dbRun(
    `INSERT INTO solicitacao (codigo, ativo_id, solicitante_id, setor_solicitante, descricao, prioridade_sugerida, status, criada_em)
     VALUES (?, ?, ?, ?, ?, ?, 'aberta', (now() - interval '4 hours'))
     RETURNING id`,
    [codigo, dados.ativo_id ?? null, usuarioId, dados.setor_solicitante?.trim() || null, dados.descricao.trim(), dados.prioridade_sugerida]
  );

  const nova = (await buscarSolicitacaoPorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "solicitacao", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

let idUsuarioIntegracaoGlobopac: number | null = null;

async function usuarioIntegracaoGlobopac(): Promise<number> {
  if (idUsuarioIntegracaoGlobopac != null) return idUsuarioIntegracaoGlobopac;
  const row = (await dbGet("SELECT id FROM usuario WHERE matricula = '9000'")) as { id: number } | undefined;
  if (!row) {
    throw new ErroValidacaoSolicitacao("Usuário de integração do GloboPac não está cadastrado (rode o seed).");
  }
  idUsuarioIntegracaoGlobopac = row.id;
  return row.id;
}

export interface DadosSolicitacaoExterna {
  origem_externa_id: string;
  origem_externa_codigo?: string | null;
  descricao: string;
  setor_solicitante?: string | null;
  solicitante_externo_nome?: string | null;
  prioridade_sugerida?: PrioridadeSolicitacao;
}

/**
 * Cria (ou, se já existir pelo mesmo `origem_externa_id`, apenas retorna) uma solicitação vinda de
 * um sistema externo (hoje só o GloboPac). Idempotente por design: um webhook reenviado não duplica
 * a solicitação. O ativo fica em aberto (`ativo_id = null`) — quem recebe no Sigma é quem sabe qual
 * equipamento corresponde ao defeito relatado, e define isso ao analisar, antes de converter em OS.
 */
export async function criarSolicitacaoExterna(dados: DadosSolicitacaoExterna): Promise<Solicitacao> {
  const existente = (await dbGet("SELECT id FROM solicitacao WHERE origem_externa_id = ?", [
    dados.origem_externa_id,
  ])) as { id: number } | undefined;
  if (existente) return (await buscarSolicitacaoPorId(existente.id))!;

  if (!dados.descricao.trim()) {
    throw new ErroValidacaoSolicitacao("Descreva o problema ou serviço solicitado.");
  }

  const usuarioIntegracaoId = await usuarioIntegracaoGlobopac();
  const codigo = await codigoSugerido();
  const info = await dbRun(
    `INSERT INTO solicitacao
       (codigo, ativo_id, solicitante_id, setor_solicitante, descricao, prioridade_sugerida, status,
        origem, origem_externa_id, origem_externa_codigo, solicitante_externo_nome, criada_em)
     VALUES (?, NULL, ?, ?, ?, ?, 'aberta', 'globopac', ?, ?, ?, (now() - interval '4 hours'))
     RETURNING id`,
    [
      codigo,
      usuarioIntegracaoId,
      dados.setor_solicitante?.trim() || null,
      dados.descricao.trim(),
      dados.prioridade_sugerida ?? "media",
      dados.origem_externa_id,
      dados.origem_externa_codigo?.trim() || null,
      dados.solicitante_externo_nome?.trim() || null,
    ]
  );

  const nova = (await buscarSolicitacaoPorId(Number(info.id)))!;
  await registrarAuditoria({ entidade: "solicitacao", entidade_id: nova.id, acao: "criar", valor_novo: nova, usuario_id: usuarioIntegracaoId });
  for (const usuarioId of await usuariosComPermissao("solicitacoes", "editar")) {
    await criarNotificacao({
      usuario_id: usuarioId,
      tipo: "solicitacao_externa",
      titulo: `Nova solicitação do GloboPac: ${nova.codigo}`,
      entidade: "solicitacao",
      entidade_id: nova.id,
    });
  }
  return nova;
}

async function exigirSolicitacao(id: number): Promise<Solicitacao> {
  const s = await buscarSolicitacaoPorId(id);
  if (!s) throw new ErroValidacaoSolicitacao("Solicitação não encontrada.");
  return s;
}

function exigirEmAberto(s: Solicitacao) {
  if (s.status !== "aberta" && s.status !== "em_analise") {
    throw new ErroValidacaoSolicitacao("Esta solicitação já foi convertida em OS ou recusada.");
  }
}

export interface DadosEdicaoSolicitacao {
  ativo_id?: number | null;
  descricao: string;
  prioridade_sugerida: PrioridadeSolicitacao;
  setor_solicitante?: string | null;
}

export async function editarSolicitacao(id: number, dados: DadosEdicaoSolicitacao, usuarioId: number): Promise<Solicitacao> {
  const anterior = await exigirSolicitacao(id);
  exigirEmAberto(anterior);
  if (dados.ativo_id != null && !(await buscarAtivoPorId(dados.ativo_id))) {
    throw new ErroValidacaoSolicitacao("Ativo não encontrado.");
  }
  if (!dados.descricao.trim()) {
    throw new ErroValidacaoSolicitacao("Descreva o problema ou serviço solicitado.");
  }

  await dbRun("UPDATE solicitacao SET ativo_id = ?, descricao = ?, prioridade_sugerida = ?, setor_solicitante = ? WHERE id = ?", [
    dados.ativo_id ?? null,
    dados.descricao.trim(),
    dados.prioridade_sugerida,
    dados.setor_solicitante?.trim() || null,
    id,
  ]);

  const nova = (await buscarSolicitacaoPorId(id))!;
  await registrarAuditoria({ entidade: "solicitacao", entidade_id: id, acao: "editar", valor_anterior: anterior, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export async function iniciarAnalise(id: number, usuarioId: number): Promise<Solicitacao> {
  const s = await exigirSolicitacao(id);
  if (s.status !== "aberta") {
    throw new ErroValidacaoSolicitacao('Somente uma solicitação "aberta" pode entrar em análise.');
  }
  await dbRun("UPDATE solicitacao SET status = 'em_analise' WHERE id = ?", [id]);
  const nova = (await buscarSolicitacaoPorId(id))!;
  await registrarAuditoria({ entidade: "solicitacao", entidade_id: id, acao: "status", valor_anterior: s, valor_novo: nova, usuario_id: usuarioId });
  return nova;
}

export interface DadosConversaoOS {
  tipo: DadosOSAvulsa["tipo"];
  prioridade?: DadosOSAvulsa["prioridade"];
  descricao: string;
  checklist: DadosTarefaOS[];
  data_programada: string;
  data_limite: string;
  responsavel_id?: number | null;
  horas_estimadas?: number;
  exige_parada_linha?: boolean;
}

/**
 * Converter uma solicitação cria a OS de verdade (origem="solicitacao", vinculada via
 * ordem_servico.solicitacao_id) e fecha o ciclo da solicitação em "convertida_em_os", com
 * solicitacao.os_id apontando de volta — os dois lados do vínculo ficam consistentes.
 *
 * Diferente das fases anteriores, a OS não herda mais a descrição da solicitação original
 * (que é só o relato do problema, escrito por quem pediu) — quem converte precisa descrever o
 * serviço que será executado e montar o checklist de itens/serviços a realizar, os dois
 * obrigatórios (validado aqui, não só na UI, igual ao padrão já usado em CHK-01 de osService.ts).
 * Vale para os dois tipos de origem (solicitação aberta no próprio Sigma ou vinda do GloboPac) —
 * é o mesmo código de conversão para ambas.
 */
export async function converterEmOS(id: number, dados: DadosConversaoOS, usuarioId: number): Promise<{ solicitacao: Solicitacao; os: OrdemServico }> {
  const s = await exigirSolicitacao(id);
  exigirEmAberto(s);
  if (s.ativo_id == null) {
    throw new ErroValidacaoSolicitacao("Defina o ativo desta solicitação antes de converter em OS.");
  }
  if (!dados.descricao.trim()) {
    throw new ErroValidacaoSolicitacao("Descreva o serviço que será realizado.");
  }
  if (!dados.checklist.length) {
    throw new ErroValidacaoSolicitacao("Adicione ao menos um item de serviço/checklist a ser realizado.");
  }
  if (dados.checklist.some((item) => !item.descricao.trim())) {
    throw new ErroValidacaoSolicitacao("Todo item do checklist precisa ter uma descrição.");
  }

  const os = await criarOSDeSolicitacao(
    id,
    {
      ativo_id: s.ativo_id,
      tipo: dados.tipo,
      prioridade: dados.prioridade ?? s.prioridade_sugerida,
      descricao: dados.descricao,
      data_programada: dados.data_programada,
      data_limite: dados.data_limite,
      responsavel_id: dados.responsavel_id,
      horas_estimadas: dados.horas_estimadas,
      exige_parada_linha: dados.exige_parada_linha,
    },
    usuarioId,
    s.origem === "globopac" ? s.origem_externa_codigo : null
  );
  for (const item of dados.checklist) {
    await adicionarTarefaOS(os.id, item, usuarioId);
  }

  await dbRun(
    `UPDATE solicitacao SET status = 'convertida_em_os', os_id = ?, analisada_em = (now() - interval '4 hours'), analisada_por = ? WHERE id = ?`,
    [os.id, usuarioId, id]
  );

  const nova = (await buscarSolicitacaoPorId(id))!;
  await registrarAuditoria({ entidade: "solicitacao", entidade_id: id, acao: "status", valor_anterior: s, valor_novo: nova, usuario_id: usuarioId });
  await criarNotificacao({
    usuario_id: s.solicitante_id,
    tipo: "solicitacao_convertida",
    titulo: `Sua solicitação ${s.codigo} virou a ${os.codigo}`,
    entidade: "solicitacao",
    entidade_id: id,
  });

  if (s.origem === "globopac" && s.origem_externa_id) {
    notificarGlobopacAtualizacaoOS(s.origem_externa_id, {
      sigma_os_codigo: os.codigo,
      sigma_responsavel_nome: os.responsavel_nome,
      sigma_data_programada: os.data_programada,
      sigma_data_limite: os.data_limite,
      sigma_descricao_servico: dados.descricao,
      sigma_checklist: dados.checklist.map((item) => ({ descricao: item.descricao, obrigatoria: item.obrigatoria !== false })),
      sigma_checklist_execucao: await checklistExecucaoParaGlobopac(os.id),
    }).catch((erro) => console.error("Falha ao notificar o GloboPac sobre a programação da OS:", erro));
  }

  return { solicitacao: nova, os };
}

export async function recusar(id: number, motivo: string, usuarioId: number): Promise<Solicitacao> {
  const s = await exigirSolicitacao(id);
  exigirEmAberto(s);
  if (!motivo.trim()) {
    throw new ErroValidacaoSolicitacao("Informe o motivo da recusa.");
  }
  await dbRun(
    `UPDATE solicitacao SET status = 'recusada', motivo_recusa = ?, analisada_em = (now() - interval '4 hours'), analisada_por = ? WHERE id = ?`,
    [motivo.trim(), usuarioId, id]
  );
  const nova = (await buscarSolicitacaoPorId(id))!;
  await registrarAuditoria({ entidade: "solicitacao", entidade_id: id, acao: "status", valor_anterior: s, valor_novo: nova, usuario_id: usuarioId });
  await criarNotificacao({
    usuario_id: s.solicitante_id,
    tipo: "solicitacao_recusada",
    titulo: `Sua solicitação ${s.codigo} foi recusada`,
    mensagem: motivo.trim(),
    entidade: "solicitacao",
    entidade_id: id,
  });
  return nova;
}

/**
 * GLOBOPAC-VAL-01: chamada pelo webhook POST /integracoes/globopac/os/validacao quando o usuário do
 * GloboPac dá "conforme" na aba de acompanhamento de OS do painel dele — a partir daí o Sigma libera
 * a conclusão da OS correspondente (ver gate em concluirOS, osService.ts). `manutencaoOsId` é o
 * mesmo `origem_externa_id` recebido na criação da solicitação original.
 */
export async function validarOSGlobopac(manutencaoOsId: string, validadoPorNome: string | null): Promise<OrdemServico> {
  const solicitacao = (await dbGet(
    "SELECT id, os_id, origem FROM solicitacao WHERE origem_externa_id = ?",
    [manutencaoOsId]
  )) as { id: number; os_id: number | null; origem: OrigemSolicitacao } | undefined;
  if (!solicitacao || solicitacao.origem !== "globopac") {
    throw new ErroValidacaoSolicitacao("Nenhuma solicitação do GloboPac encontrada com este manutencao_os_id.");
  }
  if (!solicitacao.os_id) {
    throw new ErroValidacaoSolicitacao("Esta solicitação ainda não foi convertida em OS no Sigma.");
  }

  const usuarioIntegracaoId = await usuarioIntegracaoGlobopac();
  return registrarValidacaoGlobopac(solicitacao.os_id, validadoPorNome, usuarioIntegracaoId);
}
