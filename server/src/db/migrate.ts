import { pool, dbAll, dbRun } from "./pg.js";

/**
 * O schema fica embutido como string (não lido de schema.postgres.sql em runtime) porque este
 * módulo roda dentro da Netlify Function, empacotada pelo esbuild em formato CJS — nesse formato
 * `import.meta.url`/`__dirname` não funcionam (o bundler não traça `fs.readFileSync` de um
 * arquivo `.sql` de qualquer forma, então o arquivo nem iria parar no pacote da function).
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS perfil (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome              TEXT NOT NULL UNIQUE,
  descricao         TEXT,
  permissoes        TEXT NOT NULL DEFAULT '{}',
  somente_leitura   INTEGER NOT NULL DEFAULT 0,
  excluido_em       TEXT
);

CREATE TABLE IF NOT EXISTS usuario (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome              TEXT NOT NULL,
  matricula         TEXT NOT NULL UNIQUE,
  email             TEXT,
  senha_hash        TEXT NOT NULL,
  perfil_id         INTEGER NOT NULL REFERENCES perfil(id),
  setor             TEXT,
  cargo             TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  custo_hora_padrao DOUBLE PRECISION NOT NULL DEFAULT 0,
  ultimo_acesso     TEXT,
  criado_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  excluido_em       TEXT
);

CREATE TABLE IF NOT EXISTS log_auditoria (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade          TEXT NOT NULL,
  entidade_id       INTEGER,
  acao              TEXT NOT NULL CHECK (acao IN ('criar','editar','excluir','status')),
  valor_anterior    TEXT,
  valor_novo        TEXT,
  usuario_id        INTEGER REFERENCES usuario(id),
  data              TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  ip                TEXT
);

CREATE TABLE IF NOT EXISTS feriado (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data              TEXT NOT NULL UNIQUE,
  descricao         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracao (
  chave             TEXT PRIMARY KEY,
  valor             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ativo (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo            TEXT NOT NULL UNIQUE,
  nome              TEXT NOT NULL,
  ativo_pai_id      INTEGER REFERENCES ativo(id),
  tipo              TEXT NOT NULL CHECK (tipo IN ('equipamento','componente','instalacao','veiculo','ferramenta')),
  setor             TEXT,
  localizacao       TEXT,
  fabricante        TEXT,
  modelo            TEXT,
  numero_serie      TEXT,
  data_aquisicao    TEXT,
  data_instalacao   TEXT,
  criticidade       TEXT NOT NULL CHECK (criticidade IN ('baixa','media','alta','critica')),
  status            TEXT NOT NULL CHECK (status IN ('operando','parado','em_manutencao','desativado')),
  centro_custo      TEXT,
  observacoes       TEXT,
  classificacao_manutencao TEXT CHECK (classificacao_manutencao IN ('saudavel','atencao','critico','insuficiente')),
  criado_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  criado_por        INTEGER REFERENCES usuario(id),
  atualizado_em     TEXT,
  atualizado_por    INTEGER REFERENCES usuario(id),
  excluido_em       TEXT
);
CREATE INDEX IF NOT EXISTS idx_ativo_pai ON ativo(ativo_pai_id);

CREATE TABLE IF NOT EXISTS peca (
  id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                    TEXT NOT NULL UNIQUE,
  descricao                 TEXT NOT NULL,
  unidade_medida            TEXT NOT NULL CHECK (unidade_medida IN ('un','m','kg','l','cx','par','rolo')),
  categoria                 TEXT,
  fabricante                TEXT,
  codigo_fabricante         TEXT,
  estoque_atual             DOUBLE PRECISION NOT NULL DEFAULT 0,
  estoque_minimo            DOUBLE PRECISION NOT NULL DEFAULT 0,
  ponto_de_pedido           DOUBLE PRECISION NOT NULL DEFAULT 0,
  lead_time_dias            INTEGER NOT NULL DEFAULT 0,
  custo_unitario_medio      DOUBLE PRECISION NOT NULL DEFAULT 0,
  fornecedor_preferencial   TEXT,
  localizacao_almoxarifado  TEXT,
  ativa                     INTEGER NOT NULL DEFAULT 1,
  excluido_em               TEXT
);

CREATE TABLE IF NOT EXISTS ativo_peca (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ativo_id              INTEGER NOT NULL REFERENCES ativo(id),
  peca_id               INTEGER NOT NULL REFERENCES peca(id),
  quantidade_padrao     DOUBLE PRECISION NOT NULL DEFAULT 1,
  aplicacao             TEXT,
  posicao               TEXT NOT NULL DEFAULT '',
  troca_obrigatoria     INTEGER NOT NULL DEFAULT 0,
  observacao            TEXT,
  UNIQUE (ativo_id, peca_id, posicao)
);

CREATE TABLE IF NOT EXISTS plano_manutencao (
  id                          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                      TEXT NOT NULL UNIQUE,
  nome                        TEXT NOT NULL,
  ativo_id                    INTEGER NOT NULL REFERENCES ativo(id),
  tipo_manutencao             TEXT NOT NULL CHECK (tipo_manutencao IN ('preventiva','preditiva_manual','inspecao','calibracao','lubrificacao','limpeza_tecnica')),
  periodicidade               TEXT NOT NULL CHECK (periodicidade IN ('diaria','semanal','quinzenal','mensal','bimestral','trimestral','quadrimestral','semestral','anual','bienal','trienal','personalizada')),
  intervalo_customizado_dias  INTEGER,
  data_base                   TEXT NOT NULL,
  duracao_estimada_horas      DOUBLE PRECISION NOT NULL DEFAULT 0,
  responsavel_padrao_id       INTEGER REFERENCES usuario(id),
  equipe_padrao               TEXT,
  prioridade_padrao           TEXT NOT NULL CHECK (prioridade_padrao IN ('baixa','media','alta','critica')),
  exige_parada_linha          INTEGER NOT NULL DEFAULT 0,
  instrucoes                  TEXT,
  ativo                        INTEGER NOT NULL DEFAULT 1,
  data_inicio_vigencia        TEXT NOT NULL,
  data_fim_vigencia           TEXT,
  excluido_em                 TEXT
);

CREATE TABLE IF NOT EXISTS plano_tarefa (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plano_id          INTEGER NOT NULL REFERENCES plano_manutencao(id),
  ordem             INTEGER NOT NULL,
  descricao         TEXT NOT NULL,
  tipo_resposta     TEXT NOT NULL CHECK (tipo_resposta IN ('ok_nok','texto','numerico','selecao')),
  obrigatoria       INTEGER NOT NULL DEFAULT 1,
  valor_min         DOUBLE PRECISION,
  valor_max         DOUBLE PRECISION,
  unidade           TEXT,
  regime            TEXT CHECK (regime IN ('MP','MF'))
);

CREATE TABLE IF NOT EXISTS plano_peca (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plano_id              INTEGER NOT NULL REFERENCES plano_manutencao(id),
  peca_id               INTEGER NOT NULL REFERENCES peca(id),
  quantidade_prevista   DOUBLE PRECISION NOT NULL DEFAULT 1,
  obrigatoria           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lote_geracao (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                TEXT NOT NULL UNIQUE,
  data_inicio_periodo   TEXT NOT NULL,
  data_fim_periodo      TEXT NOT NULL,
  filtros_aplicados     TEXT,
  quantidade_gerada     INTEGER NOT NULL DEFAULT 0,
  gerado_em             TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  gerado_por            INTEGER NOT NULL REFERENCES usuario(id),
  status                TEXT NOT NULL CHECK (status IN ('simulado','confirmado','revertido')),
  revertido_em          TEXT,
  revertido_por         INTEGER REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS solicitacao (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                TEXT NOT NULL UNIQUE,
  ativo_id              INTEGER NOT NULL REFERENCES ativo(id),
  solicitante_id        INTEGER NOT NULL REFERENCES usuario(id),
  setor_solicitante     TEXT,
  descricao             TEXT NOT NULL,
  prioridade_sugerida   TEXT NOT NULL CHECK (prioridade_sugerida IN ('baixa','media','alta','critica')),
  anexos                TEXT,
  status                TEXT NOT NULL CHECK (status IN ('aberta','em_analise','convertida_em_os','recusada')),
  os_id                 INTEGER,
  motivo_recusa         TEXT,
  criada_em             TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  analisada_em          TEXT,
  analisada_por         INTEGER REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS ordem_servico (
  id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                    TEXT NOT NULL UNIQUE,
  ativo_id                  INTEGER NOT NULL REFERENCES ativo(id),
  plano_id                  INTEGER REFERENCES plano_manutencao(id),
  lote_geracao_id           INTEGER REFERENCES lote_geracao(id),
  solicitacao_id            INTEGER REFERENCES solicitacao(id),
  ponto_lubrificacao_id     INTEGER,
  lote_geracao_lubrificacao_id INTEGER,
  tipo                      TEXT NOT NULL CHECK (tipo IN ('preventiva','corretiva','inspecao','melhoria','calibracao','lubrificacao')),
  origem                    TEXT NOT NULL CHECK (origem IN ('plano_lote','plano_manual','solicitacao','avulsa','lubrificacao_lote')),
  prioridade                TEXT NOT NULL CHECK (prioridade IN ('baixa','media','alta','critica')),
  status                    TEXT NOT NULL CHECK (status IN ('programada','aberta','em_execucao','aguardando_peca','concluida','atrasada','cancelada')),
  descricao                 TEXT,
  data_programada           TEXT NOT NULL,
  data_limite               TEXT NOT NULL,
  data_abertura             TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  data_inicio_execucao      TEXT,
  data_conclusao            TEXT,
  responsavel_id            INTEGER REFERENCES usuario(id),
  horas_estimadas           DOUBLE PRECISION NOT NULL DEFAULT 0,
  horas_reais               DOUBLE PRECISION,
  custo_mao_obra            DOUBLE PRECISION,
  custo_pecas               DOUBLE PRECISION,
  exige_parada_linha        INTEGER NOT NULL DEFAULT 0,
  observacoes_execucao      TEXT,
  motivo_cancelamento       TEXT,
  causa_falha               TEXT,
  chave_idempotencia        TEXT UNIQUE,
  excluido_em               TEXT
);
CREATE INDEX IF NOT EXISTS idx_os_ativo ON ordem_servico(ativo_id);
CREATE INDEX IF NOT EXISTS idx_os_status ON ordem_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_data_programada ON ordem_servico(data_programada);

CREATE TABLE IF NOT EXISTS os_plano (
  os_id             INTEGER NOT NULL REFERENCES ordem_servico(id),
  plano_id          INTEGER NOT NULL REFERENCES plano_manutencao(id),
  PRIMARY KEY (os_id, plano_id)
);

CREATE TABLE IF NOT EXISTS os_tarefa (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  os_id             INTEGER NOT NULL REFERENCES ordem_servico(id),
  ordem             INTEGER NOT NULL,
  descricao         TEXT NOT NULL,
  tipo_resposta     TEXT NOT NULL CHECK (tipo_resposta IN ('ok_nok','texto','numerico','selecao')),
  obrigatoria       INTEGER NOT NULL DEFAULT 1,
  valor_min         DOUBLE PRECISION,
  valor_max         DOUBLE PRECISION,
  unidade           TEXT,
  resposta          TEXT,
  valor_numerico    DOUBLE PRECISION,
  concluida         INTEGER NOT NULL DEFAULT 0,
  concluida_em      TEXT,
  concluida_por     INTEGER REFERENCES usuario(id),
  regime            TEXT CHECK (regime IN ('MP','MF'))
);

CREATE TABLE IF NOT EXISTS os_peca (
  id                            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  os_id                         INTEGER NOT NULL REFERENCES ordem_servico(id),
  peca_id                       INTEGER NOT NULL REFERENCES peca(id),
  quantidade_prevista           DOUBLE PRECISION NOT NULL DEFAULT 0,
  quantidade_reservada          DOUBLE PRECISION NOT NULL DEFAULT 0,
  quantidade_consumida          DOUBLE PRECISION,
  custo_unitario_no_consumo     DOUBLE PRECISION,
  justificativa_divergencia     TEXT,
  origem                        TEXT NOT NULL CHECK (origem IN ('plano','lista_tecnica_ativo','manual')),
  obrigatoria                   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS movimento_estoque (
  id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  peca_id                   INTEGER NOT NULL REFERENCES peca(id),
  tipo                      TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste','transferencia','devolucao')),
  quantidade                DOUBLE PRECISION NOT NULL,
  saldo_apos                DOUBLE PRECISION NOT NULL,
  custo_unitario             DOUBLE PRECISION,
  os_id                     INTEGER REFERENCES ordem_servico(id),
  requisicao_compra_id      INTEGER,
  motivo                    TEXT,
  data                      TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  usuario_id                INTEGER NOT NULL REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS importacao_estoque (
  id                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                  TEXT NOT NULL UNIQUE,
  nome_arquivo            TEXT NOT NULL,
  linhas_atualizadas      INTEGER NOT NULL DEFAULT 0,
  linhas_sem_alteracao    INTEGER NOT NULL DEFAULT 0,
  linhas_nao_encontradas  INTEGER NOT NULL DEFAULT 0,
  linhas_invalidas        INTEGER NOT NULL DEFAULT 0,
  criado_em               TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  criado_por              INTEGER NOT NULL REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS reserva_peca (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  peca_id           INTEGER NOT NULL REFERENCES peca(id),
  os_id             INTEGER NOT NULL REFERENCES ordem_servico(id),
  quantidade        DOUBLE PRECISION NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('reservada','consumida','liberada')),
  criada_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  atualizada_em     TEXT
);

CREATE TABLE IF NOT EXISTS requisicao_compra (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                TEXT NOT NULL UNIQUE,
  origem                TEXT NOT NULL CHECK (origem IN ('programacao_preventiva','ponto_de_pedido','manual')),
  fornecedor            TEXT,
  data_necessidade      TEXT,
  data_limite_pedido    TEXT,
  status                TEXT NOT NULL CHECK (status IN ('rascunho','emitida','aprovada','em_cotacao','pedido_colocado','recebida','cancelada')),
  observacoes           TEXT,
  criada_em             TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  criada_por            INTEGER NOT NULL REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS requisicao_compra_item (
  id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requisicao_id             INTEGER NOT NULL REFERENCES requisicao_compra(id),
  peca_id                   INTEGER NOT NULL REFERENCES peca(id),
  quantidade                DOUBLE PRECISION NOT NULL,
  custo_unitario_estimado   DOUBLE PRECISION,
  data_necessidade          TEXT,
  os_vinculadas             TEXT
);

CREATE TABLE IF NOT EXISTS ativo_ocorrencia (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ativo_id          INTEGER NOT NULL REFERENCES ativo(id),
  status            TEXT NOT NULL CHECK (status IN ('operando','parado','em_manutencao','desativado')),
  inicio            TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  fim               TEXT,
  os_id             INTEGER REFERENCES ordem_servico(id),
  motivo            TEXT,
  registrado_por     INTEGER REFERENCES usuario(id)
);
CREATE INDEX IF NOT EXISTS idx_ativo_ocorrencia_ativo ON ativo_ocorrencia(ativo_id);

CREATE TABLE IF NOT EXISTS anexo (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade          TEXT NOT NULL,
  entidade_id       INTEGER NOT NULL,
  nome_arquivo      TEXT NOT NULL,
  caminho_relativo  TEXT NOT NULL,
  tipo_mime         TEXT,
  tamanho_bytes     INTEGER,
  criado_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  criado_por        INTEGER REFERENCES usuario(id)
);
CREATE INDEX IF NOT EXISTS idx_anexo_entidade ON anexo(entidade, entidade_id);

CREATE TABLE IF NOT EXISTS notificacao (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id        INTEGER NOT NULL REFERENCES usuario(id),
  tipo              TEXT NOT NULL,
  titulo            TEXT NOT NULL,
  mensagem          TEXT,
  entidade          TEXT,
  entidade_id       INTEGER,
  lida              INTEGER NOT NULL DEFAULT 0,
  criada_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_notificacao_usuario ON notificacao(usuario_id, lida);

CREATE TABLE IF NOT EXISTS fornecedor (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome              TEXT NOT NULL,
  cnpj              TEXT,
  contato           TEXT,
  telefone          TEXT,
  email             TEXT,
  especialidade     TEXT,
  observacoes       TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  excluido_em       TEXT
);

CREATE TABLE IF NOT EXISTS servico_externo (
  id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                    TEXT NOT NULL UNIQUE,
  os_id                     INTEGER NOT NULL REFERENCES ordem_servico(id),
  ativo_id                  INTEGER NOT NULL REFERENCES ativo(id),
  peca_id                   INTEGER REFERENCES peca(id),
  descricao_item            TEXT NOT NULL,
  quantidade                DOUBLE PRECISION NOT NULL DEFAULT 1,
  fornecedor_id             INTEGER NOT NULL REFERENCES fornecedor(id),
  tipo_servico              TEXT NOT NULL CHECK (tipo_servico IN ('usinagem','solda','retifica','calibracao','pintura','outro')),
  motivo                    TEXT,
  status_logistico          TEXT NOT NULL CHECK (status_logistico IN ('pendente_envio','enviado','retornado','cancelado')) DEFAULT 'pendente_envio',
  status_pagamento          TEXT NOT NULL CHECK (status_pagamento IN ('pendente','parcial','pago')) DEFAULT 'pendente',
  data_previsao_retorno     TEXT,
  data_envio                TEXT,
  data_retorno              TEXT,
  documento_saida           TEXT,
  devolvido_ao_estoque      INTEGER NOT NULL DEFAULT 0,
  valor_orcado              DOUBLE PRECISION,
  valor_cobrado             DOUBLE PRECISION,
  valor_pago                DOUBLE PRECISION,
  data_pagamento            TEXT,
  forma_pagamento           TEXT,
  motivo_cancelamento       TEXT,
  observacoes               TEXT,
  responsavel_id            INTEGER NOT NULL REFERENCES usuario(id),
  criado_em                 TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  criado_por                INTEGER NOT NULL REFERENCES usuario(id),
  excluido_em               TEXT
);
CREATE INDEX IF NOT EXISTS idx_servico_externo_os ON servico_externo(os_id);
CREATE INDEX IF NOT EXISTS idx_servico_externo_status ON servico_externo(status_logistico);

CREATE TABLE IF NOT EXISTS ponto_lubrificacao (
  id                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                  TEXT NOT NULL UNIQUE,
  ativo_id                INTEGER NOT NULL REFERENCES ativo(id),
  descricao               TEXT NOT NULL,
  especificacao           TEXT,
  componente              TEXT,
  periodicidade           TEXT NOT NULL CHECK (periodicidade IN ('semanal','quinzenal','mensal','bimestral','trimestral','semestral','anual')),
  semana_base             INTEGER NOT NULL CHECK (semana_base BETWEEN 1 AND 53),
  duracao_estimada_horas  DOUBLE PRECISION NOT NULL DEFAULT 0,
  responsavel_padrao_id   INTEGER REFERENCES usuario(id),
  prioridade_padrao       TEXT NOT NULL CHECK (prioridade_padrao IN ('baixa','media','alta','critica')) DEFAULT 'media',
  instrucoes              TEXT,
  ativo                   INTEGER NOT NULL DEFAULT 1,
  data_inicio_vigencia    TEXT NOT NULL,
  data_fim_vigencia       TEXT,
  excluido_em             TEXT
);

CREATE TABLE IF NOT EXISTS lote_geracao_lubrificacao (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                TEXT NOT NULL UNIQUE,
  ano                   INTEGER NOT NULL,
  semana_inicio         INTEGER NOT NULL,
  semana_fim            INTEGER NOT NULL,
  filtros_aplicados     TEXT,
  quantidade_gerada     INTEGER NOT NULL DEFAULT 0,
  gerado_em             TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  gerado_por            INTEGER NOT NULL REFERENCES usuario(id),
  status                TEXT NOT NULL CHECK (status IN ('simulado','confirmado','revertido')),
  revertido_em          TEXT,
  revertido_por         INTEGER REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS os_ponto_lubrificacao (
  os_id                   INTEGER NOT NULL REFERENCES ordem_servico(id),
  ponto_lubrificacao_id   INTEGER NOT NULL REFERENCES ponto_lubrificacao(id),
  PRIMARY KEY (os_id, ponto_lubrificacao_id)
);

CREATE TABLE IF NOT EXISTS ponto_lubrificacao_tarefa (
  id                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ponto_lubrificacao_id   INTEGER NOT NULL REFERENCES ponto_lubrificacao(id),
  ordem                   INTEGER NOT NULL,
  descricao               TEXT NOT NULL,
  tipo_resposta           TEXT NOT NULL CHECK (tipo_resposta IN ('ok_nok','texto','numerico','selecao')),
  obrigatoria             INTEGER NOT NULL DEFAULT 1,
  valor_min               DOUBLE PRECISION,
  valor_max               DOUBLE PRECISION,
  unidade                 TEXT,
  regime                  TEXT CHECK (regime IN ('MP','MF'))
);

DO $$
BEGIN
  ALTER TABLE ordem_servico ADD CONSTRAINT fk_os_ponto_lubrificacao
    FOREIGN KEY (ponto_lubrificacao_id) REFERENCES ponto_lubrificacao(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE ordem_servico ADD CONSTRAINT fk_os_lote_geracao_lubrificacao
    FOREIGN KEY (lote_geracao_lubrificacao_id) REFERENCES lote_geracao_lubrificacao(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS plano_inspecao (
  id                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                  TEXT NOT NULL UNIQUE,
  ativo_id                INTEGER NOT NULL REFERENCES ativo(id),
  tag                     TEXT NOT NULL,
  setor                   TEXT,
  classe_periodicidade    TEXT CHECK (classe_periodicidade IN ('A','B','C')),
  intervalo_semanas       INTEGER,
  semana_base             INTEGER CHECK (semana_base BETWEEN 1 AND 53),
  duracao_estimada_horas  DOUBLE PRECISION NOT NULL DEFAULT 0,
  responsavel_padrao_id   INTEGER REFERENCES usuario(id),
  prioridade_padrao       TEXT NOT NULL CHECK (prioridade_padrao IN ('baixa','media','alta','critica')) DEFAULT 'media',
  instrucoes              TEXT,
  ativo                   INTEGER NOT NULL DEFAULT 1,
  data_inicio_vigencia    TEXT NOT NULL,
  data_fim_vigencia       TEXT,
  excluido_em             TEXT
);

CREATE TABLE IF NOT EXISTS plano_inspecao_tarefa (
  id                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plano_inspecao_id       INTEGER NOT NULL REFERENCES plano_inspecao(id),
  ordem                   INTEGER NOT NULL,
  descricao               TEXT NOT NULL,
  tipo_resposta           TEXT NOT NULL CHECK (tipo_resposta IN ('ok_nok','texto','numerico','selecao')),
  obrigatoria             INTEGER NOT NULL DEFAULT 1,
  valor_min               DOUBLE PRECISION,
  valor_max               DOUBLE PRECISION,
  unidade                 TEXT
);

CREATE TABLE IF NOT EXISTS lote_geracao_inspecao (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                TEXT NOT NULL UNIQUE,
  ano                   INTEGER NOT NULL,
  semana_inicio         INTEGER NOT NULL,
  semana_fim            INTEGER NOT NULL,
  filtros_aplicados     TEXT,
  quantidade_gerada     INTEGER NOT NULL DEFAULT 0,
  gerado_em             TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  gerado_por            INTEGER NOT NULL REFERENCES usuario(id),
  status                TEXT NOT NULL CHECK (status IN ('simulado','confirmado','revertido')),
  revertido_em          TEXT,
  revertido_por         INTEGER REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS os_tarefa_auditoria (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  os_auditoria_id       INTEGER NOT NULL REFERENCES ordem_servico(id),
  os_tarefa_original_id INTEGER NOT NULL REFERENCES os_tarefa(id),
  conformidade          TEXT CHECK (conformidade IN ('conforme','divergente')),
  observacao            TEXT
);

ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS plano_inspecao_id INTEGER;
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS lote_geracao_inspecao_id INTEGER;
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS os_auditada_id INTEGER;
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS os_origem_inspecao_id INTEGER;
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS subtipo_inspecao TEXT CHECK (subtipo_inspecao IN ('periodica','auditoria_os'));
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS auditoria_status TEXT CHECK (auditoria_status IN ('nao_auditada','conforme','divergente')) DEFAULT 'nao_auditada';
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS resultado_inspecao TEXT CHECK (resultado_inspecao IN ('ok','atencao','critico'));

-- GLOBOPAC-VAL-01: uma OS aberta a partir de solicitação do GloboPac só pode ser concluída no Sigma
-- depois que o usuário do GloboPac der "conforme" (validar) na aba de acompanhamento de OS do painel
-- dele — ver gate em concluirOS (osService.ts) e o webhook POST /integracoes/globopac/os/validacao.
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS globopac_validado_em TEXT;
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS globopac_validado_por_nome TEXT;

-- GLOBOPAC-VAL-02: registra quando o usuário do Sigma avisou o GloboPac de que a execução terminou
-- (gatilho pro GloboPac ir in loco validar) — ver avisarGlobopacExecucaoOS em osService.ts.
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS globopac_execucao_avisada_em TEXT;

-- BAIXA-01: Técnico não pode mais concluir/encerrar a OS (só Administrador, Coordenador de PCM,
-- Planejador e Supervisor de manutenção — ver PERFIS_QUE_PODEM_CONCLUIR_OS em routes/ordensServico.ts),
-- então ganha esta sinalização de "serviço realizado" pra avisar que está pronta pra baixa — ver
-- sinalizarExecucaoOS em osService.ts. Independe de integração externa (diferente do par GLOBOPAC-VAL-02
-- acima, que só existe para OS de origem GloboPac); esta é genérica pra qualquer OS.
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS execucao_sinalizada_em TEXT;
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS execucao_sinalizada_por_id INTEGER;

DO $$
BEGIN
  ALTER TABLE ordem_servico ADD CONSTRAINT fk_os_plano_inspecao
    FOREIGN KEY (plano_inspecao_id) REFERENCES plano_inspecao(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE ordem_servico ADD CONSTRAINT fk_os_lote_geracao_inspecao
    FOREIGN KEY (lote_geracao_inspecao_id) REFERENCES lote_geracao_inspecao(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE ordem_servico ADD CONSTRAINT fk_os_auditada
    FOREIGN KEY (os_auditada_id) REFERENCES ordem_servico(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE ordem_servico ADD CONSTRAINT fk_os_origem_inspecao
    FOREIGN KEY (os_origem_inspecao_id) REFERENCES ordem_servico(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ordem_servico DROP CONSTRAINT IF EXISTS ordem_servico_origem_check;
ALTER TABLE ordem_servico ADD CONSTRAINT ordem_servico_origem_check
  CHECK (origem IN ('plano_lote','plano_manual','solicitacao','avulsa','lubrificacao_lote','inspecao_lote','inspecao_corretiva'));

ALTER TABLE solicitacao ALTER COLUMN ativo_id DROP NOT NULL;
ALTER TABLE solicitacao ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'interna';
ALTER TABLE solicitacao ADD COLUMN IF NOT EXISTS origem_externa_id TEXT;
ALTER TABLE solicitacao ADD COLUMN IF NOT EXISTS origem_externa_codigo TEXT;
ALTER TABLE solicitacao ADD COLUMN IF NOT EXISTS solicitante_externo_nome TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS solicitacao_origem_externa_id_uindex
  ON solicitacao (origem_externa_id) WHERE origem_externa_id IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE solicitacao ADD CONSTRAINT solicitacao_origem_check
    CHECK (origem IN ('interna','globopac'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- EXCL-ADM-01: log_auditoria passa a aceitar acao 'negado', usado quando um perfil sem autorização
-- (ex.: exclusão de OS fora do Administrador) tenta uma ação bloqueada — ver
-- PERFIS_QUE_PODEM_EXCLUIR_OS em routes/ordensServico.ts.
ALTER TABLE log_auditoria DROP CONSTRAINT IF EXISTS log_auditoria_acao_check;
ALTER TABLE log_auditoria ADD CONSTRAINT log_auditoria_acao_check
  CHECK (acao IN ('criar','editar','excluir','status','negado'));

-- REPROG-01: reprogramação de OS vencida mantém o mesmo número/ID (não gera nova OS) — só desloca
-- as datas e guarda o histórico completo em os_reprogramacao (ver reprogramarOS em osService.ts).
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS reprogramada INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS data_prevista_original TEXT;
ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS quantidade_reprogramacoes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS os_reprogramacao (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  os_id             INTEGER NOT NULL REFERENCES ordem_servico(id),
  data_anterior     TEXT NOT NULL,
  data_nova         TEXT NOT NULL,
  motivo            TEXT,
  usuario_id        INTEGER NOT NULL REFERENCES usuario(id),
  criado_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_os_reprogramacao_os ON os_reprogramacao(os_id);

-- SRVEXT-COMP-01: envio externo passa a apontar pra um Ativo ou Componente de Ativo (a própria
-- tabela ativo, self-referenciada por ativo_pai_id, já modela "componente" — ver tipo IN
-- (...,'componente',...) acima) em vez de uma peça de estoque. peca_id fica só pra histórico de
-- registros criados antes dessa mudança (leitura, sem novos vínculos) — ver servicoExternoService.ts.
ALTER TABLE servico_externo ADD COLUMN IF NOT EXISTS item_ativo_id INTEGER REFERENCES ativo(id);

-- ASSIN-01: assinatura digital da OS (hash SHA-256 + carimbo de tempo RFC 3161 via Free TSA),
-- gerada automaticamente ao concluir a OS — ver assinaturaService.ts. Mesmo padrão usado em
-- produção no GloboPac (tabela assinaturas_os_eletronicas): o hash é sobre um snapshot JSON
-- canônico dos dados substantivos da OS, não sobre um PDF — reproduzível a qualquer momento sem
-- depender de uma regeração de documento ser byte-a-byte idêntica. tsq_query/tsr_token ficam como
-- bytea porque são artefatos pequenos e imutáveis (o .tsr nunca é sobrescrito, só uma nova linha é
-- criada caso a OS seja reaberta e reconcluída — ver reabrirOS invalidando a anterior).
CREATE TABLE IF NOT EXISTS assinatura_digital (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  os_id             INTEGER NOT NULL REFERENCES ordem_servico(id),
  hash_sha256       TEXT NOT NULL,
  algoritmo_hash    TEXT NOT NULL DEFAULT 'SHA-256',
  dados_assinados   TEXT NOT NULL,
  tsq_query         BYTEA NOT NULL,
  tsr_token         BYTEA,
  tsa_endpoint      TEXT,
  tsa_emitido_em    TEXT,
  status            TEXT NOT NULL CHECK (status IN ('aguardando_tsa','completa','falha_tsa','invalidada')) DEFAULT 'aguardando_tsa',
  erro_tsa          TEXT,
  criado_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  criado_por        INTEGER NOT NULL REFERENCES usuario(id)
);
CREATE INDEX IF NOT EXISTS idx_assinatura_digital_os ON assinatura_digital(os_id);

-- LOTE-BG-01: confirmação de lote passou a rodar numa Netlify Background Function (até 15 min) em
-- vez de síncrona (limite de 10s da function normal) — ver confirmar-lote-background.ts e
-- dispararConfirmacaoBackground em loteGeracaoService.ts. "processando" cobre o intervalo entre o
-- disparo e a function terminar; "erro" registra falha (ex.: exceção na geração) pro usuário ver
-- em vez de o lote ficar "simulado" pra sempre.
ALTER TABLE lote_geracao DROP CONSTRAINT IF EXISTS lote_geracao_status_check;
ALTER TABLE lote_geracao ADD CONSTRAINT lote_geracao_status_check
  CHECK (status IN ('simulado','confirmado','revertido','processando','erro'));
ALTER TABLE lote_geracao ADD COLUMN IF NOT EXISTS erro_mensagem TEXT;

-- EQUIPE-01: atribuição de OS por equipe, mutuamente exclusiva com responsavel_id (ver
-- validarDadosCriacaoOS/editarOS em osService.ts) — só pra atribuição manual, a geração em lote a
-- partir de planos continua só com responsável individual.
CREATE TABLE IF NOT EXISTS equipe (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome              TEXT NOT NULL UNIQUE,
  descricao         TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT NOT NULL DEFAULT to_char(now() - interval '4 hours', 'YYYY-MM-DD HH24:MI:SS'),
  excluido_em       TEXT
);

CREATE TABLE IF NOT EXISTS equipe_membro (
  equipe_id   INTEGER NOT NULL REFERENCES equipe(id),
  usuario_id  INTEGER NOT NULL REFERENCES usuario(id),
  PRIMARY KEY (equipe_id, usuario_id)
);

ALTER TABLE ordem_servico ADD COLUMN IF NOT EXISTS equipe_id INTEGER REFERENCES equipe(id);
`;

/**
 * LUB-01: concede o módulo "lubrificacao" aos perfis que já administram planos/geração de lote —
 * necessário em bancos que já tinham perfis cadastrados antes desse módulo existir. Tolerante: só
 * mexe no perfil se a chave ainda não existir no JSON de permissões.
 */
async function garantirPermissaoLubrificacao() {
  const ACOES_GESTAO = ["ver", "criar", "editar", "excluir", "aprovar", "exportar"];
  const ACOES_PLANEJADOR = ["ver", "criar", "editar", "aprovar", "exportar"];
  const perfis = await dbAll<{ id: number; nome: string; permissoes: string }>(
    "SELECT id, nome, permissoes FROM perfil"
  );
  for (const perfil of perfis) {
    if (!["Administrador", "Coordenador de PCM", "Planejador"].includes(perfil.nome)) continue;
    const permissoes = JSON.parse(perfil.permissoes || "{}");
    if (permissoes.lubrificacao) continue;
    permissoes.lubrificacao = perfil.nome === "Planejador" ? ACOES_PLANEJADOR : ACOES_GESTAO;
    await dbRun("UPDATE perfil SET permissoes = ? WHERE id = ?", [JSON.stringify(permissoes), perfil.id]);
  }
}

/**
 * INS-01: concede o módulo "inspecoes" aos perfis que planejam/coordenam/supervisionam manutenção
 * e ao Administrador — necessário em bancos que já tinham esses perfis cadastrados antes desse
 * módulo existir. Tolerante: só mexe no perfil se a chave ainda não existir no JSON de permissões.
 */
async function garantirPermissaoInspecoes() {
  const ACOES_GESTAO = ["ver", "criar", "editar", "excluir", "aprovar", "exportar"];
  const ACOES_PLANEJADOR = ["ver", "criar", "editar", "aprovar", "exportar"];
  const ACOES_SUPERVISOR = ["ver", "criar", "editar", "exportar"];
  const perfis = await dbAll<{ id: number; nome: string; permissoes: string }>(
    "SELECT id, nome, permissoes FROM perfil"
  );
  for (const perfil of perfis) {
    if (!["Administrador", "Coordenador de PCM", "Planejador", "Supervisor de manutenção"].includes(perfil.nome)) continue;
    const permissoes = JSON.parse(perfil.permissoes || "{}");
    if (permissoes.inspecoes) continue;
    permissoes.inspecoes =
      perfil.nome === "Planejador" ? ACOES_PLANEJADOR :
      perfil.nome === "Supervisor de manutenção" ? ACOES_SUPERVISOR :
      ACOES_GESTAO;
    await dbRun("UPDATE perfil SET permissoes = ? WHERE id = ?", [JSON.stringify(permissoes), perfil.id]);
  }
}

/**
 * SOL-CONV-01: concede "ver" em ordens_servico ao perfil Solicitante — necessário em bancos que já
 * tinham esse perfil cadastrado antes de a conversão de solicitação passar a exigir descrição e
 * checklist do serviço (ver converterEmOS em solicitacaoService.ts), para que quem abriu a
 * solicitação consiga acompanhar a programação e o checklist na tela da OS gerada. Tolerante: só
 * mexe no perfil se a chave ainda não existir no JSON de permissões.
 */
async function garantirPermissaoSolicitanteVerOS() {
  const perfis = await dbAll<{ id: number; nome: string; permissoes: string }>(
    "SELECT id, nome, permissoes FROM perfil"
  );
  for (const perfil of perfis) {
    if (perfil.nome !== "Solicitante") continue;
    const permissoes = JSON.parse(perfil.permissoes || "{}");
    if (permissoes.ordens_servico) continue;
    permissoes.ordens_servico = ["ver"];
    await dbRun("UPDATE perfil SET permissoes = ? WHERE id = ?", [JSON.stringify(permissoes), perfil.id]);
  }
}

/**
 * EQUIPE-01: concede o módulo "equipes" a quem já planeja/coordena manutenção — necessário em
 * bancos que já tinham esses perfis cadastrados antes desse módulo existir. Tolerante: só mexe no
 * perfil se a chave ainda não existir no JSON de permissões.
 */
async function garantirPermissaoEquipes() {
  const ACOES_GESTAO = ["ver", "criar", "editar", "excluir"];
  const ACOES_PLANEJADOR = ["ver", "criar", "editar"];
  const perfis = await dbAll<{ id: number; nome: string; permissoes: string }>(
    "SELECT id, nome, permissoes FROM perfil"
  );
  for (const perfil of perfis) {
    if (!["Administrador", "Coordenador de PCM", "Planejador"].includes(perfil.nome)) continue;
    const permissoes = JSON.parse(perfil.permissoes || "{}");
    if (permissoes.equipes) continue;
    permissoes.equipes = perfil.nome === "Planejador" ? ACOES_PLANEJADOR : ACOES_GESTAO;
    await dbRun("UPDATE perfil SET permissoes = ? WHERE id = ?", [JSON.stringify(permissoes), perfil.id]);
  }
}

export async function migrate() {
  await pool.query(SCHEMA_SQL);
  await garantirPermissaoLubrificacao();
  await garantirPermissaoInspecoes();
  await garantirPermissaoSolicitanteVerOS();
  await garantirPermissaoEquipes();
  console.log("Migração aplicada com sucesso.");
}

// Permite `node --env-file=.env --import tsx src/db/migrate.ts` continuar funcionando localmente.
// Não usa import.meta.url (quebra no bundle CJS da Netlify Function) — process.argv[1] já basta:
// dentro do runtime da function ele nunca termina em "migrate.ts", então este bloco nunca roda lá.
if (process.argv[1]?.endsWith("migrate.ts")) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
