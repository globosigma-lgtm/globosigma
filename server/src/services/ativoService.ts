import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { criarNotificacao, usuariosPorPerfis } from "./notificacaoService.js";

export type TipoAtivo = "equipamento" | "componente" | "instalacao" | "veiculo" | "ferramenta";
export type CriticidadeAtivo = "baixa" | "media" | "alta" | "critica";
export type StatusAtivo = "operando" | "parado" | "em_manutencao" | "desativado";

export interface Ativo {
  id: number;
  codigo: string;
  nome: string;
  ativo_pai_id: number | null;
  tipo: TipoAtivo;
  setor: string | null;
  localizacao: string | null;
  fabricante: string | null;
  modelo: string | null;
  numero_serie: string | null;
  data_aquisicao: string | null;
  data_instalacao: string | null;
  criticidade: CriticidadeAtivo;
  status: StatusAtivo;
  centro_custo: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string | null;
}

export interface AtivoComArvore extends Ativo {
  nivel: number;
  caminho: string;
}

export interface FiltrosAtivo {
  texto?: string;
  setor?: string;
  tipo?: string;
  criticidade?: string;
  status?: string;
}

const COLUNAS = `
  a.id, a.codigo, a.nome, a.ativo_pai_id, a.tipo, a.setor, a.localizacao, a.fabricante, a.modelo,
  a.numero_serie, a.data_aquisicao, a.data_instalacao, a.criticidade, a.status, a.centro_custo,
  a.observacoes, a.criado_em, a.atualizado_em
`;

function arvoreCompletaSql(): string {
  return `
    WITH RECURSIVE arvore AS (
      SELECT ${COLUNAS}, 0 AS nivel, a.nome AS caminho
      FROM ativo a
      WHERE a.ativo_pai_id IS NULL AND a.excluido_em IS NULL
      UNION ALL
      SELECT ${COLUNAS}, arvore.nivel + 1, arvore.caminho || ' › ' || a.nome
      FROM ativo a
      JOIN arvore ON a.ativo_pai_id = arvore.id
      WHERE a.excluido_em IS NULL
    )
  `;
}

export async function listarAtivos(filtros: FiltrosAtivo = {}): Promise<AtivoComArvore[]> {
  const condicoes: string[] = [];
  const params: unknown[] = [];

  if (filtros.texto) {
    condicoes.push("(codigo ILIKE ? OR nome ILIKE ?)");
    params.push(`%${filtros.texto}%`, `%${filtros.texto}%`);
  }
  if (filtros.setor) {
    condicoes.push("setor = ?");
    params.push(filtros.setor);
  }
  if (filtros.tipo) {
    condicoes.push("tipo = ?");
    params.push(filtros.tipo);
  }
  if (filtros.criticidade) {
    condicoes.push("criticidade = ?");
    params.push(filtros.criticidade);
  }
  if (filtros.status) {
    condicoes.push("status = ?");
    params.push(filtros.status);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const sql = `${arvoreCompletaSql()} SELECT * FROM arvore ${where} ORDER BY caminho`;
  return (await dbAll(sql, params)) as unknown as AtivoComArvore[];
}

export async function caminhoAtivo(id: number): Promise<string> {
  const rows = (await dbAll(
    `WITH RECURSIVE subir(id, nome, ativo_pai_id, nivel) AS (
        SELECT id, nome, ativo_pai_id, 0 FROM ativo WHERE id = ?
        UNION ALL
        SELECT a.id, a.nome, a.ativo_pai_id, subir.nivel + 1
        FROM ativo a JOIN subir ON a.id = subir.ativo_pai_id
      )
      SELECT nome FROM subir ORDER BY nivel DESC`,
    [id]
  )) as { nome: string }[];
  return rows.map((r) => r.nome).join(" › ");
}

/**
 * PERF-01: variante em lote de caminhoAtivo — usada por serviços que precisam do caminho de
 * dezenas/centenas de ativos de uma vez (ex.: inspeções, com ~780 planos) e não podem pagar uma
 * consulta recursiva por id (seria centenas de round-trips seriais para o Postgres remoto). Busca
 * a árvore inteira de ativos de uma vez (tabela pequena, algumas milhares de linhas no máximo) e
 * monta os caminhos em memória.
 */
export async function caminhosAtivos(ids: number[]): Promise<Map<number, string>> {
  const todos = (await dbAll("SELECT id, nome, ativo_pai_id FROM ativo")) as { id: number; nome: string; ativo_pai_id: number | null }[];
  const porId = new Map(todos.map((a) => [a.id, a]));

  function caminho(id: number): string {
    const partes: string[] = [];
    let atual = porId.get(id);
    const visitados = new Set<number>();
    while (atual && !visitados.has(atual.id)) {
      partes.unshift(atual.nome);
      visitados.add(atual.id);
      atual = atual.ativo_pai_id != null ? porId.get(atual.ativo_pai_id) : undefined;
    }
    return partes.join(" › ");
  }

  const resultado = new Map<number, string>();
  for (const id of new Set(ids)) {
    resultado.set(id, caminho(id));
  }
  return resultado;
}

export async function filhosDiretos(id: number): Promise<Ativo[]> {
  return (await dbAll(
    `SELECT ${COLUNAS} FROM ativo a WHERE a.ativo_pai_id = ? AND a.excluido_em IS NULL ORDER BY a.nome`,
    [id]
  )) as unknown as Ativo[];
}

async function descendentesEProprio(id: number): Promise<Set<number>> {
  const rows = (await dbAll(
    `WITH RECURSIVE descendentes(id) AS (
        SELECT id FROM ativo WHERE id = ?
        UNION ALL
        SELECT a.id FROM ativo a JOIN descendentes d ON a.ativo_pai_id = d.id
      )
      SELECT id FROM descendentes`,
    [id]
  )) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

export async function buscarAtivoPorId(id: number): Promise<(Ativo & { caminho: string; filhos: Ativo[] }) | null> {
  const row = (await dbGet(`SELECT ${COLUNAS} FROM ativo a WHERE a.id = ? AND a.excluido_em IS NULL`, [id])) as
    | Ativo
    | undefined;
  if (!row) return null;
  const [caminho, filhos] = await Promise.all([caminhoAtivo(id), filhosDiretos(id)]);
  return { ...row, caminho, filhos };
}

export async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM ativo WHERE codigo LIKE 'ATV-%'")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("ATV-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `ATV-${String(maior + 1).padStart(4, "0")}`;
}

export interface DadosAtivo {
  codigo: string;
  nome: string;
  ativo_pai_id: number | null;
  tipo: TipoAtivo;
  setor?: string | null;
  localizacao?: string | null;
  fabricante?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  data_aquisicao?: string | null;
  data_instalacao?: string | null;
  criticidade: CriticidadeAtivo;
  status: StatusAtivo;
  centro_custo?: string | null;
  observacoes?: string | null;
}

export class ErroValidacaoAtivo extends Error {}

export interface AtivoOcorrencia {
  id: number;
  ativo_id: number;
  status: StatusAtivo;
  inicio: string;
  fim: string | null;
  os_id: number | null;
  motivo: string | null;
  registrado_por: number | null;
}

// DADOS-01: fecha a ocorrência de status em aberto (se houver) e abre uma nova — dá uma linha do
// tempo completa de por quais status o ativo passou, com duração de cada uma. MTBF/MTTR real (não
// só tempo de execução de OS) vira uma soma de duração onde status IN ('parado','em_manutencao').
async function registrarTransicaoStatusAtivo(ativoId: number, statusNovo: StatusAtivo, usuarioId: number, osId?: number, motivo?: string): Promise<void> {
  await dbRun(`UPDATE ativo_ocorrencia SET fim = (now() - interval '4 hours') WHERE ativo_id = ? AND fim IS NULL`, [ativoId]);
  await dbRun(
    `INSERT INTO ativo_ocorrencia (ativo_id, status, os_id, motivo, registrado_por) VALUES (?, ?, ?, ?, ?)`,
    [ativoId, statusNovo, osId ?? null, motivo ?? null, usuarioId]
  );
}

export async function listarOcorrenciasDoAtivo(ativoId: number): Promise<AtivoOcorrencia[]> {
  return (await dbAll(`SELECT * FROM ativo_ocorrencia WHERE ativo_id = ? ORDER BY inicio DESC`, [ativoId])) as unknown as AtivoOcorrencia[];
}

export type ClassificacaoManutencao = "saudavel" | "atencao" | "critico" | "insuficiente";

const ORDEM_CLASSIFICACAO: Record<ClassificacaoManutencao, number> = { insuficiente: 0, saudavel: 0, atencao: 1, critico: 2 };

const PERFIS_NOTIFICAR_MANUTENCAO = ["Administrador", "Coordenador de PCM", "Supervisor de manutenção"];

/**
 * NOVO-05: mesma classificação exibida na aba "Histórico de manutenções" do ativo (% de OS
 * concluídas que são corretivas — quanto menor, mais preventiva/proativa é a manutenção).
 * Faixas seguem referência usual de manutenção classe mundial: <=25% corretiva é boa prática,
 * >50% é predominantemente reativo. Reimplementada aqui (não só no cliente) porque o gatilho de
 * notificação precisa rodar no servidor, no momento em que uma OS é concluída.
 */
export async function avaliarClassificacaoManutencao(ativoId: number): Promise<{ classificacao: ClassificacaoManutencao; percentualCorretiva: number | null }> {
  const concluidas = (await dbAll(
    `SELECT tipo FROM ordem_servico WHERE ativo_id = ? AND status = 'concluida' AND excluido_em IS NULL`,
    [ativoId]
  )) as { tipo: string }[];
  if (concluidas.length < 2) {
    return { classificacao: "insuficiente", percentualCorretiva: null };
  }
  const corretivas = concluidas.filter((o) => o.tipo === "corretiva").length;
  const percentualCorretiva = (corretivas / concluidas.length) * 100;
  const classificacao: ClassificacaoManutencao = percentualCorretiva <= 25 ? "saudavel" : percentualCorretiva <= 50 ? "atencao" : "critico";
  return { classificacao, percentualCorretiva };
}

/**
 * Chamado a cada OS concluída (único evento que muda a proporção de corretivas). Só grava e
 * notifica quando a classificação muda; só notifica quando ela piora a ponto de entrar em
 * "atenção" ou "crítico" (não ao melhorar, nem enquanto permanece no mesmo status — evita
 * notificar de novo a cada OS concluída enquanto o ativo já está em atenção/crítico).
 */
export async function verificarClassificacaoManutencao(ativoId: number): Promise<void> {
  const ativo = (await dbGet(
    `SELECT id, codigo, nome, classificacao_manutencao FROM ativo WHERE id = ? AND excluido_em IS NULL`,
    [ativoId]
  )) as { id: number; codigo: string; nome: string; classificacao_manutencao: ClassificacaoManutencao | null } | undefined;
  if (!ativo) return;

  const { classificacao: nova, percentualCorretiva } = await avaliarClassificacaoManutencao(ativoId);
  const anterior = ativo.classificacao_manutencao;
  if (nova === anterior) return;

  await dbRun(`UPDATE ativo SET classificacao_manutencao = ? WHERE id = ?`, [nova, ativoId]);

  const piorou = ORDEM_CLASSIFICACAO[nova] > ORDEM_CLASSIFICACAO[anterior ?? "saudavel"];
  if (!piorou || ORDEM_CLASSIFICACAO[nova] === 0) return;

  const titulo =
    nova === "critico"
      ? `Ativo ${ativo.codigo} está em status crítico de manutenção`
      : `Ativo ${ativo.codigo} entrou em status de atenção na manutenção`;
  const mensagem = `${percentualCorretiva!.toFixed(0)}% das OS concluídas em "${ativo.nome}" são corretivas. Consulte o histórico de manutenções do ativo.`;

  for (const usuarioId of await usuariosPorPerfis(PERFIS_NOTIFICAR_MANUTENCAO)) {
    await criarNotificacao({
      usuario_id: usuarioId,
      tipo: nova === "critico" ? "ativo_manutencao_critico" : "ativo_manutencao_atencao",
      titulo,
      mensagem,
      entidade: "ativo",
      entidade_id: ativo.id,
    });
  }
}

export async function criarAtivo(dados: DadosAtivo, usuarioId: number): Promise<Ativo> {
  const existente = await dbGet("SELECT id FROM ativo WHERE codigo = ?", [dados.codigo]);
  if (existente) {
    throw new ErroValidacaoAtivo(`Já existe um ativo com o código "${dados.codigo}".`);
  }
  if (dados.ativo_pai_id != null) {
    const pai = await dbGet("SELECT id FROM ativo WHERE id = ? AND excluido_em IS NULL", [dados.ativo_pai_id]);
    if (!pai) {
      throw new ErroValidacaoAtivo("O ativo pai selecionado não existe.");
    }
  }

  const info = await dbRun(
    `INSERT INTO ativo (
        codigo, nome, ativo_pai_id, tipo, setor, localizacao, fabricante, modelo, numero_serie,
        data_aquisicao, data_instalacao, criticidade, status, centro_custo, observacoes, criado_por, criado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (now() - interval '4 hours')) RETURNING id`,
    [
      dados.codigo,
      dados.nome,
      dados.ativo_pai_id,
      dados.tipo,
      dados.setor ?? null,
      dados.localizacao ?? null,
      dados.fabricante ?? null,
      dados.modelo ?? null,
      dados.numero_serie ?? null,
      dados.data_aquisicao ?? null,
      dados.data_instalacao ?? null,
      dados.criticidade,
      dados.status,
      dados.centro_custo ?? null,
      dados.observacoes ?? null,
      usuarioId,
    ]
  );

  const novo = (await buscarAtivoPorId(info.id!))!;
  await registrarTransicaoStatusAtivo(novo.id, novo.status, usuarioId);
  await registrarAuditoria({ entidade: "ativo", entidade_id: novo.id, acao: "criar", valor_novo: novo, usuario_id: usuarioId });
  return novo;
}

export async function atualizarAtivo(id: number, dados: DadosAtivo, usuarioId: number): Promise<Ativo> {
  const anterior = await buscarAtivoPorId(id);
  if (!anterior) {
    throw new ErroValidacaoAtivo("Ativo não encontrado.");
  }

  const codigoEmUso = await dbGet("SELECT id FROM ativo WHERE codigo = ? AND id != ?", [dados.codigo, id]);
  if (codigoEmUso) {
    throw new ErroValidacaoAtivo(`Já existe um ativo com o código "${dados.codigo}".`);
  }

  if (dados.ativo_pai_id != null) {
    if (dados.ativo_pai_id === id) {
      throw new ErroValidacaoAtivo("Um ativo não pode ser pai de si mesmo.");
    }
    const pai = await dbGet("SELECT id FROM ativo WHERE id = ? AND excluido_em IS NULL", [dados.ativo_pai_id]);
    if (!pai) {
      throw new ErroValidacaoAtivo("O ativo pai selecionado não existe.");
    }
    const proibidos = await descendentesEProprio(id);
    if (proibidos.has(dados.ativo_pai_id)) {
      throw new ErroValidacaoAtivo(
        "Não é possível definir esse ativo pai: isso criaria um ciclo na hierarquia (o pai escolhido é um descendente deste ativo)."
      );
    }
  }

  await dbRun(
    `UPDATE ativo SET
      codigo = ?, nome = ?, ativo_pai_id = ?, tipo = ?, setor = ?, localizacao = ?, fabricante = ?,
      modelo = ?, numero_serie = ?, data_aquisicao = ?, data_instalacao = ?, criticidade = ?, status = ?,
      centro_custo = ?, observacoes = ?, atualizado_em = (now() - interval '4 hours'), atualizado_por = ?
    WHERE id = ?`,
    [
      dados.codigo,
      dados.nome,
      dados.ativo_pai_id,
      dados.tipo,
      dados.setor ?? null,
      dados.localizacao ?? null,
      dados.fabricante ?? null,
      dados.modelo ?? null,
      dados.numero_serie ?? null,
      dados.data_aquisicao ?? null,
      dados.data_instalacao ?? null,
      dados.criticidade,
      dados.status,
      dados.centro_custo ?? null,
      dados.observacoes ?? null,
      usuarioId,
      id,
    ]
  );

  const novo = (await buscarAtivoPorId(id))!;
  if (novo.status !== anterior.status) {
    await registrarTransicaoStatusAtivo(id, novo.status, usuarioId);
  }
  await registrarAuditoria({
    entidade: "ativo",
    entidade_id: id,
    acao: "editar",
    valor_anterior: anterior,
    valor_novo: novo,
    usuario_id: usuarioId,
  });
  return novo;
}

export async function excluirAtivo(id: number, usuarioId: number): Promise<void> {
  const ativo = await buscarAtivoPorId(id);
  if (!ativo) {
    throw new ErroValidacaoAtivo("Ativo não encontrado.");
  }
  const filhos = await filhosDiretos(id);
  if (filhos.length > 0) {
    throw new ErroValidacaoAtivo(
      `Não é possível excluir "${ativo.nome}": há ${filhos.length} ativo(s) filho(s) vinculado(s) a ele. Mova ou exclua os filhos primeiro.`
    );
  }
  await dbRun("UPDATE ativo SET excluido_em = (now() - interval '4 hours') WHERE id = ?", [id]);
  await registrarAuditoria({ entidade: "ativo", entidade_id: id, acao: "excluir", valor_anterior: ativo, usuario_id: usuarioId });
}
