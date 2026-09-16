-- SIGMA — schema completo (Postgres/Supabase). Tradução de schema.sql (SQLite).
-- ENUMs continuam TEXT + CHECK (não usa tipo ENUM nativo, pra minimizar diferença do original).
-- Datas continuam TEXT (ISO string), não TIMESTAMP, porque o código trata essas colunas como
-- string em toda parte (uso extensivo de dayjs) — ver plano de migração.
-- REAL (SQLite, sempre double de 8 bytes) vira DOUBLE PRECISION (não REAL de 4 bytes do Postgres),
-- pra não perder precisão em valores financeiros/quantidades.

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
  -- 'processando'/'erro': confirmação roda em background function (LOTE-BG-01, ver migrate.ts).
  status                TEXT NOT NULL CHECK (status IN ('simulado','confirmado','revertido','processando','erro')),
  revertido_em          TEXT,
  revertido_por         INTEGER REFERENCES usuario(id),
  erro_mensagem         TEXT
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

-- ponto_lubrificacao_id e lote_geracao_lubrificacao_id referenciam tabelas definidas mais abaixo
-- neste arquivo (Postgres exige que a tabela referenciada já exista, diferente do SQLite) — por
-- isso ficam sem REFERENCES inline aqui; as duas FKs são adicionadas no fim do arquivo.
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

-- FKs adiadas de ordem_servico (ver comentário acima da tabela).
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
