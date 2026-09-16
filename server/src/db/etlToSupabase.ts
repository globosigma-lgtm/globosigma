/**
 * ETL único: copia os dados reais do sigma.db (SQLite, node:sqlite) para o Postgres do Supabase,
 * preservando os IDs originais (OVERRIDING SYSTEM VALUE) para não quebrar referências e códigos já
 * impressos/auditados. Roda uma única vez, no corte real — não faz parte do app em produção.
 *
 * Pré-requisitos antes de rodar:
 *   1. Backup fresco de server/data/sigma.db (timestamped .bak).
 *   2. O deploy de teste no Netlify já validado (login, CRUD, upload de anexo) com o schema vazio.
 *   3. server/.env com DATABASE_URL apontando pro Supabase real.
 *
 * Uso: node --env-file=.env --import tsx src/db/etlToSupabase.ts [caminho-do-sigma.db]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { pool } from "./pg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const caminhoSqlite = process.argv[2] ?? path.resolve(__dirname, "../../data/sigma.db");

console.log(`Lendo de: ${caminhoSqlite}`);
const sqlite = new DatabaseSync(caminhoSqlite, { readOnly: true });

function lerTudo<T = any>(sql: string): T[] {
  return sqlite.prepare(sql).all() as unknown as T[];
}

const TAMANHO_LOTE = 500;

/**
 * Insere `linhas` em lotes de TAMANHO_LOTE por INSERT (1 query com várias tuplas VALUES), em vez
 * de 1 query por linha — com milhares de linhas e cada round-trip de rede custando ~100ms+ até o
 * pooler do Supabase, inserir 1 a 1 levaria mais de uma hora; em lote leva segundos.
 */
async function inserirEmLotes(nomeTabela: string, colunas: string[], linhas: any[], temIdentity: boolean): Promise<number> {
  if (linhas.length === 0) return 0;
  const overriding = temIdentity ? "OVERRIDING SYSTEM VALUE" : "";
  let inseridas = 0;
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const bloco = linhas.slice(i, i + TAMANHO_LOTE);
    const valores: unknown[] = [];
    const grupos = bloco.map((linha) => {
      const placeholders = colunas.map((c) => {
        valores.push(linha[c]);
        return `$${valores.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const sql = `INSERT INTO ${nomeTabela} (${colunas.join(", ")}) ${overriding} VALUES ${grupos.join(", ")} ON CONFLICT DO NOTHING`;
    const res = await pool.query(sql, valores);
    inseridas += res.rowCount ?? 0;
  }
  return inseridas;
}

/** Migra uma tabela simples (sem auto-referência), na ordem em que as linhas vierem do SQLite. */
async function migrarTabela(nomeTabela: string, colunas: string[], temIdentity = true) {
  const linhas = lerTudo(`SELECT ${colunas.join(", ")} FROM ${nomeTabela}`);
  if (linhas.length === 0) {
    console.log(`${nomeTabela}: 0 linhas (nada a fazer)`);
    return 0;
  }
  const inseridas = await inserirEmLotes(nomeTabela, colunas, linhas, temIdentity);
  console.log(`${nomeTabela}: ${inseridas}/${linhas.length} linhas inseridas`);
  return inseridas;
}

/**
 * `ativo` tem auto-referência (ativo_pai_id) — insere em passes: primeiro as raízes
 * (ativo_pai_id IS NULL), depois qualquer linha cujo pai já esteja inserido, repetindo até não
 * haver mais nada pendente. Evita depender de session_replication_role (precisa de superusuário,
 * que o usuário de conexão do pooler do Supabase não tem).
 */
async function migrarAtivos() {
  const colunas = [
    "id", "codigo", "nome", "ativo_pai_id", "tipo", "setor", "localizacao", "fabricante", "modelo",
    "numero_serie", "data_aquisicao", "data_instalacao", "criticidade", "status", "centro_custo",
    "observacoes", "classificacao_manutencao", "criado_em", "criado_por", "atualizado_em",
    "atualizado_por", "excluido_em",
  ];
  const linhas = lerTudo<any>(`SELECT ${colunas.join(", ")} FROM ativo`);
  if (linhas.length === 0) {
    console.log("ativo: 0 linhas");
    return;
  }
  const pendentes = new Map(linhas.map((l) => [l.id as number, l]));
  const inseridos = new Set<number>();

  let total = 0;
  let progresso = true;
  while (pendentes.size > 0 && progresso) {
    const prontos: any[] = [];
    for (const [, linha] of pendentes) {
      if (linha.ativo_pai_id != null && !inseridos.has(linha.ativo_pai_id)) continue;
      prontos.push(linha);
    }
    progresso = prontos.length > 0;
    if (progresso) {
      total += await inserirEmLotes("ativo", colunas, prontos, true);
      for (const linha of prontos) {
        inseridos.add(linha.id);
        pendentes.delete(linha.id);
      }
    }
  }
  if (pendentes.size > 0) {
    throw new Error(`ativo: ${pendentes.size} linha(s) com ativo_pai_id órfão (referência que não existe) — corrigir antes de prosseguir.`);
  }
  console.log(`ativo: ${total}/${linhas.length} linhas inseridas`);
}

/** Ajusta a sequência de cada coluna identity para o maior id migrado, senão o próximo INSERT real colide. */
async function ajustarSequencias(tabelas: string[]) {
  for (const tabela of tabelas) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), COALESCE((SELECT MAX(id) FROM ${tabela}), 1))`
    );
  }
  console.log(`Sequências ajustadas: ${tabelas.join(", ")}`);
}

async function main() {
  // Ordem de dependência de FK — tabelas referenciadas antes de quem as referencia.
  await migrarTabela("perfil", ["id", "nome", "descricao", "permissoes", "somente_leitura", "excluido_em"]);
  await migrarTabela("feriado", ["id", "data", "descricao"]);
  await migrarTabela("configuracao", ["chave", "valor"], false);
  await migrarTabela("peca", [
    "id", "codigo", "descricao", "unidade_medida", "categoria", "fabricante", "codigo_fabricante",
    "estoque_atual", "estoque_minimo", "ponto_de_pedido", "lead_time_dias", "custo_unitario_medio",
    "fornecedor_preferencial", "localizacao_almoxarifado", "ativa", "excluido_em",
  ]);
  await migrarTabela("fornecedor", [
    "id", "nome", "cnpj", "contato", "telefone", "email", "especialidade", "observacoes", "ativo",
    "criado_em", "excluido_em",
  ]);
  await migrarTabela("usuario", [
    "id", "nome", "matricula", "email", "senha_hash", "perfil_id", "setor", "cargo", "ativo",
    "custo_hora_padrao", "ultimo_acesso", "criado_em", "excluido_em",
  ]);
  await migrarAtivos();
  await migrarTabela("ativo_peca", [
    "id", "ativo_id", "peca_id", "quantidade_padrao", "aplicacao", "posicao", "troca_obrigatoria", "observacao",
  ]);
  await migrarTabela("plano_manutencao", [
    "id", "codigo", "nome", "ativo_id", "tipo_manutencao", "periodicidade", "intervalo_customizado_dias",
    "data_base", "duracao_estimada_horas", "responsavel_padrao_id", "equipe_padrao", "prioridade_padrao",
    "exige_parada_linha", "instrucoes", "ativo", "data_inicio_vigencia", "data_fim_vigencia", "excluido_em",
  ]);
  await migrarTabela("plano_tarefa", [
    "id", "plano_id", "ordem", "descricao", "tipo_resposta", "obrigatoria", "valor_min", "valor_max",
    "unidade", "regime",
  ]);
  await migrarTabela("plano_peca", ["id", "plano_id", "peca_id", "quantidade_prevista", "obrigatoria"]);
  await migrarTabela("lote_geracao", [
    "id", "codigo", "data_inicio_periodo", "data_fim_periodo", "filtros_aplicados", "quantidade_gerada",
    "gerado_em", "gerado_por", "status", "revertido_em", "revertido_por",
  ]);
  await migrarTabela("solicitacao", [
    "id", "codigo", "ativo_id", "solicitante_id", "setor_solicitante", "descricao", "prioridade_sugerida",
    "anexos", "status", "os_id", "motivo_recusa", "criada_em", "analisada_em", "analisada_por",
  ]);
  await migrarTabela("ponto_lubrificacao", [
    "id", "codigo", "ativo_id", "descricao", "especificacao", "componente", "periodicidade", "semana_base",
    "duracao_estimada_horas", "responsavel_padrao_id", "prioridade_padrao", "instrucoes", "ativo",
    "data_inicio_vigencia", "data_fim_vigencia", "excluido_em",
  ]);
  await migrarTabela("lote_geracao_lubrificacao", [
    "id", "codigo", "ano", "semana_inicio", "semana_fim", "filtros_aplicados", "quantidade_gerada",
    "gerado_em", "gerado_por", "status", "revertido_em", "revertido_por",
  ]);
  await migrarTabela("ponto_lubrificacao_tarefa", [
    "id", "ponto_lubrificacao_id", "ordem", "descricao", "tipo_resposta", "obrigatoria", "valor_min",
    "valor_max", "unidade", "regime",
  ]);
  await migrarTabela("ordem_servico", [
    "id", "codigo", "ativo_id", "plano_id", "lote_geracao_id", "solicitacao_id", "ponto_lubrificacao_id",
    "lote_geracao_lubrificacao_id", "tipo", "origem", "prioridade", "status", "descricao",
    "data_programada", "data_limite", "data_abertura", "data_inicio_execucao", "data_conclusao",
    "responsavel_id", "horas_estimadas", "horas_reais", "custo_mao_obra", "custo_pecas",
    "exige_parada_linha", "observacoes_execucao", "motivo_cancelamento", "causa_falha",
    "chave_idempotencia", "excluido_em",
  ]);
  await migrarTabela("os_plano", ["os_id", "plano_id"], false);
  await migrarTabela("os_ponto_lubrificacao", ["os_id", "ponto_lubrificacao_id"], false);
  await migrarTabela("os_tarefa", [
    "id", "os_id", "ordem", "descricao", "tipo_resposta", "obrigatoria", "valor_min", "valor_max",
    "unidade", "resposta", "valor_numerico", "concluida", "concluida_em", "concluida_por", "regime",
  ]);
  await migrarTabela("os_peca", [
    "id", "os_id", "peca_id", "quantidade_prevista", "quantidade_reservada", "quantidade_consumida",
    "custo_unitario_no_consumo", "justificativa_divergencia", "origem", "obrigatoria",
  ]);
  await migrarTabela("movimento_estoque", [
    "id", "peca_id", "tipo", "quantidade", "saldo_apos", "custo_unitario", "os_id",
    "requisicao_compra_id", "motivo", "data", "usuario_id",
  ]);
  await migrarTabela("importacao_estoque", [
    "id", "codigo", "nome_arquivo", "linhas_atualizadas", "linhas_sem_alteracao",
    "linhas_nao_encontradas", "linhas_invalidas", "criado_em", "criado_por",
  ]);
  await migrarTabela("reserva_peca", ["id", "peca_id", "os_id", "quantidade", "status", "criada_em", "atualizada_em"]);
  await migrarTabela("requisicao_compra", [
    "id", "codigo", "origem", "fornecedor", "data_necessidade", "data_limite_pedido", "status",
    "observacoes", "criada_em", "criada_por",
  ]);
  await migrarTabela("requisicao_compra_item", [
    "id", "requisicao_id", "peca_id", "quantidade", "custo_unitario_estimado", "data_necessidade", "os_vinculadas",
  ]);
  await migrarTabela("ativo_ocorrencia", [
    "id", "ativo_id", "status", "inicio", "fim", "os_id", "motivo", "registrado_por",
  ]);
  await migrarTabela("anexo", [
    "id", "entidade", "entidade_id", "nome_arquivo", "caminho_relativo", "tipo_mime", "tamanho_bytes",
    "criado_em", "criado_por",
  ]);
  await migrarTabela("notificacao", [
    "id", "usuario_id", "tipo", "titulo", "mensagem", "entidade", "entidade_id", "lida", "criada_em",
  ]);
  await migrarTabela("servico_externo", [
    "id", "codigo", "os_id", "ativo_id", "peca_id", "descricao_item", "quantidade", "fornecedor_id",
    "tipo_servico", "motivo", "status_logistico", "status_pagamento", "data_previsao_retorno",
    "data_envio", "data_retorno", "documento_saida", "devolvido_ao_estoque", "valor_orcado",
    "valor_cobrado", "valor_pago", "data_pagamento", "forma_pagamento", "motivo_cancelamento",
    "observacoes", "responsavel_id", "criado_em", "criado_por", "excluido_em",
  ]);
  await migrarTabela("log_auditoria", [
    "id", "entidade", "entidade_id", "acao", "valor_anterior", "valor_novo", "usuario_id", "data", "ip",
  ]);

  await ajustarSequencias([
    "perfil", "feriado", "peca", "fornecedor", "usuario", "ativo", "ativo_peca", "plano_manutencao",
    "plano_tarefa", "plano_peca", "lote_geracao", "solicitacao", "ponto_lubrificacao",
    "lote_geracao_lubrificacao", "ponto_lubrificacao_tarefa", "ordem_servico", "os_tarefa", "os_peca",
    "movimento_estoque", "importacao_estoque", "reserva_peca", "requisicao_compra",
    "requisicao_compra_item", "ativo_ocorrencia", "anexo", "notificacao", "servico_externo", "log_auditoria",
  ]);

  console.log("ETL concluído.");
  sqlite.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
