-- SIGMA — schema completo (SQLite). ENUMs são TEXT + CHECK.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS perfil (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nome              TEXT NOT NULL UNIQUE,
  descricao         TEXT,
  permissoes        TEXT NOT NULL DEFAULT '{}', -- JSON: { "<modulo>": ["ver","criar","editar","excluir","aprovar","exportar"] }
  somente_leitura   INTEGER NOT NULL DEFAULT 0,
  excluido_em       TEXT
);

CREATE TABLE IF NOT EXISTS usuario (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nome              TEXT NOT NULL,
  matricula         TEXT NOT NULL UNIQUE,
  email             TEXT,
  senha_hash        TEXT NOT NULL,
  perfil_id         INTEGER NOT NULL REFERENCES perfil(id),
  setor             TEXT,
  cargo             TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  custo_hora_padrao REAL NOT NULL DEFAULT 0,
  ultimo_acesso     TEXT,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  excluido_em       TEXT
);

CREATE TABLE IF NOT EXISTS log_auditoria (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade          TEXT NOT NULL,
  entidade_id       INTEGER,
  acao              TEXT NOT NULL CHECK (acao IN ('criar','editar','excluir','status')),
  valor_anterior    TEXT, -- JSON
  valor_novo        TEXT, -- JSON
  usuario_id        INTEGER REFERENCES usuario(id),
  data              TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  ip                TEXT
);

CREATE TABLE IF NOT EXISTS feriado (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  data              TEXT NOT NULL UNIQUE, -- ISO YYYY-MM-DD
  descricao         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracao (
  chave             TEXT PRIMARY KEY,
  valor             TEXT NOT NULL -- JSON
);

CREATE TABLE IF NOT EXISTS ativo (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
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
  criado_em         TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  criado_por        INTEGER REFERENCES usuario(id),
  atualizado_em     TEXT,
  atualizado_por    INTEGER REFERENCES usuario(id),
  excluido_em       TEXT
);
CREATE INDEX IF NOT EXISTS idx_ativo_pai ON ativo(ativo_pai_id);

CREATE TABLE IF NOT EXISTS peca (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                    TEXT NOT NULL UNIQUE,
  descricao                 TEXT NOT NULL,
  unidade_medida            TEXT NOT NULL CHECK (unidade_medida IN ('un','m','kg','l','cx','par','rolo')),
  categoria                 TEXT,
  fabricante                TEXT,
  codigo_fabricante         TEXT,
  estoque_atual             REAL NOT NULL DEFAULT 0,
  estoque_minimo            REAL NOT NULL DEFAULT 0,
  ponto_de_pedido           REAL NOT NULL DEFAULT 0,
  lead_time_dias            INTEGER NOT NULL DEFAULT 0,
  custo_unitario_medio      REAL NOT NULL DEFAULT 0,
  fornecedor_preferencial   TEXT,
  localizacao_almoxarifado  TEXT,
  ativa                     INTEGER NOT NULL DEFAULT 1,
  excluido_em               TEXT
);

CREATE TABLE IF NOT EXISTS ativo_peca (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  ativo_id              INTEGER NOT NULL REFERENCES ativo(id),
  peca_id               INTEGER NOT NULL REFERENCES peca(id),
  quantidade_padrao     REAL NOT NULL DEFAULT 1,
  aplicacao             TEXT,
  posicao               TEXT NOT NULL DEFAULT '',
  troca_obrigatoria     INTEGER NOT NULL DEFAULT 0,
  observacao            TEXT,
  UNIQUE (ativo_id, peca_id, posicao)
);

CREATE TABLE IF NOT EXISTS plano_manutencao (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                      TEXT NOT NULL UNIQUE,
  nome                        TEXT NOT NULL,
  ativo_id                    INTEGER NOT NULL REFERENCES ativo(id),
  tipo_manutencao             TEXT NOT NULL CHECK (tipo_manutencao IN ('preventiva','preditiva_manual','inspecao','calibracao','lubrificacao','limpeza_tecnica')),
  periodicidade               TEXT NOT NULL CHECK (periodicidade IN ('diaria','semanal','quinzenal','mensal','bimestral','trimestral','quadrimestral','semestral','anual','bienal','trienal','personalizada')),
  intervalo_customizado_dias  INTEGER,
  data_base                   TEXT NOT NULL,
  duracao_estimada_horas      REAL NOT NULL DEFAULT 0,
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
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id          INTEGER NOT NULL REFERENCES plano_manutencao(id),
  ordem             INTEGER NOT NULL,
  descricao         TEXT NOT NULL,
  tipo_resposta     TEXT NOT NULL CHECK (tipo_resposta IN ('ok_nok','texto','numerico','selecao')),
  obrigatoria       INTEGER NOT NULL DEFAULT 1,
  valor_min         REAL,
  valor_max         REAL,
  unidade           TEXT,
  regime            TEXT CHECK (regime IN ('MP','MF'))
);

CREATE TABLE IF NOT EXISTS plano_peca (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id              INTEGER NOT NULL REFERENCES plano_manutencao(id),
  peca_id               INTEGER NOT NULL REFERENCES peca(id),
  quantidade_prevista   REAL NOT NULL DEFAULT 1,
  obrigatoria           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lote_geracao (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                TEXT NOT NULL UNIQUE,
  data_inicio_periodo   TEXT NOT NULL,
  data_fim_periodo      TEXT NOT NULL,
  filtros_aplicados     TEXT, -- JSON
  quantidade_gerada     INTEGER NOT NULL DEFAULT 0,
  gerado_em             TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  gerado_por            INTEGER NOT NULL REFERENCES usuario(id),
  status                TEXT NOT NULL CHECK (status IN ('simulado','confirmado','revertido')),
  revertido_em          TEXT,
  revertido_por         INTEGER REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS solicitacao (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                TEXT NOT NULL UNIQUE,
  ativo_id              INTEGER NOT NULL REFERENCES ativo(id),
  solicitante_id        INTEGER NOT NULL REFERENCES usuario(id),
  setor_solicitante     TEXT,
  descricao             TEXT NOT NULL,
  prioridade_sugerida   TEXT NOT NULL CHECK (prioridade_sugerida IN ('baixa','media','alta','critica')),
  anexos                TEXT, -- JSON
  status                TEXT NOT NULL CHECK (status IN ('aberta','em_analise','convertida_em_os','recusada')),
  os_id                 INTEGER,
  motivo_recusa         TEXT,
  criada_em             TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  analisada_em          TEXT,
  analisada_por         INTEGER REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS ordem_servico (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                    TEXT NOT NULL UNIQUE,
  ativo_id                  INTEGER NOT NULL REFERENCES ativo(id),
  plano_id                  INTEGER REFERENCES plano_manutencao(id),
  lote_geracao_id           INTEGER REFERENCES lote_geracao(id),
  solicitacao_id            INTEGER REFERENCES solicitacao(id),
  ponto_lubrificacao_id     INTEGER REFERENCES ponto_lubrificacao(id),
  lote_geracao_lubrificacao_id INTEGER REFERENCES lote_geracao_lubrificacao(id),
  tipo                      TEXT NOT NULL CHECK (tipo IN ('preventiva','corretiva','inspecao','melhoria','calibracao','lubrificacao')),
  origem                    TEXT NOT NULL CHECK (origem IN ('plano_lote','plano_manual','solicitacao','avulsa','lubrificacao_lote')),
  prioridade                TEXT NOT NULL CHECK (prioridade IN ('baixa','media','alta','critica')),
  status                    TEXT NOT NULL CHECK (status IN ('programada','aberta','em_execucao','aguardando_peca','concluida','atrasada','cancelada')),
  descricao                 TEXT,
  data_programada           TEXT NOT NULL,
  data_limite               TEXT NOT NULL,
  data_abertura             TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  data_inicio_execucao      TEXT,
  data_conclusao            TEXT,
  responsavel_id            INTEGER REFERENCES usuario(id),
  horas_estimadas           REAL NOT NULL DEFAULT 0,
  horas_reais               REAL,
  custo_mao_obra            REAL,
  custo_pecas               REAL,
  exige_parada_linha        INTEGER NOT NULL DEFAULT 0,
  observacoes_execucao      TEXT,
  motivo_cancelamento       TEXT,
  chave_idempotencia        TEXT UNIQUE,
  excluido_em               TEXT
);
CREATE INDEX IF NOT EXISTS idx_os_ativo ON ordem_servico(ativo_id);
CREATE INDEX IF NOT EXISTS idx_os_status ON ordem_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_data_programada ON ordem_servico(data_programada);

-- Uma OS gerada em lote pode consolidar várias atividades (planos) do mesmo ativo/data num só
-- checklist; ordem_servico.plano_id guarda o plano "principal" (o primeiro do grupo, por
-- compatibilidade com telas que só precisam de 1 código), e esta tabela guarda o conjunto
-- completo para rastreabilidade.
CREATE TABLE IF NOT EXISTS os_plano (
  os_id             INTEGER NOT NULL REFERENCES ordem_servico(id),
  plano_id          INTEGER NOT NULL REFERENCES plano_manutencao(id),
  PRIMARY KEY (os_id, plano_id)
);

CREATE TABLE IF NOT EXISTS os_tarefa (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id             INTEGER NOT NULL REFERENCES ordem_servico(id),
  ordem             INTEGER NOT NULL,
  descricao         TEXT NOT NULL,
  tipo_resposta     TEXT NOT NULL CHECK (tipo_resposta IN ('ok_nok','texto','numerico','selecao')),
  obrigatoria       INTEGER NOT NULL DEFAULT 1,
  valor_min         REAL,
  valor_max         REAL,
  unidade           TEXT,
  resposta          TEXT,
  valor_numerico    REAL,
  concluida         INTEGER NOT NULL DEFAULT 0,
  concluida_em      TEXT,
  concluida_por     INTEGER REFERENCES usuario(id),
  regime            TEXT CHECK (regime IN ('MP','MF'))
);

CREATE TABLE IF NOT EXISTS os_peca (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id                         INTEGER NOT NULL REFERENCES ordem_servico(id),
  peca_id                       INTEGER NOT NULL REFERENCES peca(id),
  quantidade_prevista           REAL NOT NULL DEFAULT 0,
  quantidade_reservada          REAL NOT NULL DEFAULT 0,
  quantidade_consumida          REAL,
  custo_unitario_no_consumo     REAL,
  justificativa_divergencia     TEXT,
  origem                        TEXT NOT NULL CHECK (origem IN ('plano','lista_tecnica_ativo','manual')),
  obrigatoria                   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS movimento_estoque (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  peca_id                   INTEGER NOT NULL REFERENCES peca(id),
  tipo                      TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste','transferencia','devolucao')),
  quantidade                REAL NOT NULL,
  saldo_apos                REAL NOT NULL,
  custo_unitario             REAL,
  os_id                     INTEGER REFERENCES ordem_servico(id),
  requisicao_compra_id      INTEGER,
  motivo                    TEXT,
  data                      TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  usuario_id                INTEGER NOT NULL REFERENCES usuario(id)
);

-- NOVO-07: histórico das importações de planilha de estoque — cada linha resume um upload
-- confirmado (planilha diária de quantidades). O efeito real em cada peça já fica registrado em
-- movimento_estoque (um "ajuste" por peça alterada); esta tabela só guarda o resumo do lote pra
-- exibir "quando/quem/quantas linhas" sem precisar somar movimento_estoque por motivo em texto.
CREATE TABLE IF NOT EXISTS importacao_estoque (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                  TEXT NOT NULL UNIQUE,
  nome_arquivo            TEXT NOT NULL,
  linhas_atualizadas      INTEGER NOT NULL DEFAULT 0,
  linhas_sem_alteracao    INTEGER NOT NULL DEFAULT 0,
  linhas_nao_encontradas  INTEGER NOT NULL DEFAULT 0,
  linhas_invalidas        INTEGER NOT NULL DEFAULT 0,
  criado_em               TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  criado_por              INTEGER NOT NULL REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS reserva_peca (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  peca_id           INTEGER NOT NULL REFERENCES peca(id),
  os_id             INTEGER NOT NULL REFERENCES ordem_servico(id),
  quantidade        REAL NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('reservada','consumida','liberada')),
  criada_em         TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  atualizada_em     TEXT
);

CREATE TABLE IF NOT EXISTS requisicao_compra (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                TEXT NOT NULL UNIQUE,
  origem                TEXT NOT NULL CHECK (origem IN ('programacao_preventiva','ponto_de_pedido','manual')),
  fornecedor            TEXT,
  data_necessidade      TEXT,
  data_limite_pedido    TEXT,
  status                TEXT NOT NULL CHECK (status IN ('rascunho','emitida','aprovada','em_cotacao','pedido_colocado','recebida','cancelada')),
  observacoes           TEXT,
  criada_em             TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  criada_por            INTEGER NOT NULL REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS requisicao_compra_item (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  requisicao_id             INTEGER NOT NULL REFERENCES requisicao_compra(id),
  peca_id                   INTEGER NOT NULL REFERENCES peca(id),
  quantidade                REAL NOT NULL,
  custo_unitario_estimado   REAL,
  data_necessidade          TEXT,
  os_vinculadas             TEXT -- JSON
);

-- DADOS-01: histórico de indisponibilidade do ativo. ativo.status registra o estado atual, mas
-- nada gravava quando cada transição acontecia — sem isso não dá para calcular MTBF/MTTR de
-- verdade, só o tempo de execução da OS. Uma linha aberta (fim IS NULL) é a parada em andamento.
CREATE TABLE IF NOT EXISTS ativo_ocorrencia (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ativo_id          INTEGER NOT NULL REFERENCES ativo(id),
  status            TEXT NOT NULL CHECK (status IN ('operando','parado','em_manutencao','desativado')),
  inicio            TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  fim               TEXT,
  os_id             INTEGER REFERENCES ordem_servico(id),
  motivo            TEXT,
  registrado_por     INTEGER REFERENCES usuario(id)
);
CREATE INDEX IF NOT EXISTS idx_ativo_ocorrencia_ativo ON ativo_ocorrencia(ativo_id);

-- DADOS-02: a coluna solicitacao.anexos (JSON) nunca teve upload nem UI por trás. Tabela genérica
-- para não precisar de uma coluna JSON por entidade — cobre OS e solicitação hoje, qualquer outra
-- entidade amanhã. Arquivo fica em disco (server/data/anexos), só o caminho é gravado aqui.
CREATE TABLE IF NOT EXISTS anexo (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade          TEXT NOT NULL,
  entidade_id       INTEGER NOT NULL,
  nome_arquivo      TEXT NOT NULL,
  caminho_relativo  TEXT NOT NULL,
  tipo_mime         TEXT,
  tamanho_bytes     INTEGER,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  criado_por        INTEGER REFERENCES usuario(id)
);
CREATE INDEX IF NOT EXISTS idx_anexo_entidade ON anexo(entidade, entidade_id);

-- CAMPO-01/NOVO-04: mecanismo interno de notificação (sino no topbar). Cobre atribuição de OS,
-- atraso, ruptura crítica de peça e solicitação recusada/convertida sem depender de e-mail/WhatsApp
-- (que exigem credenciais de envio ainda não configuradas) — quando essas credenciais existirem,
-- um envio externo pode ler desta mesma tabela em vez de duplicar o gatilho.
CREATE TABLE IF NOT EXISTS notificacao (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id        INTEGER NOT NULL REFERENCES usuario(id),
  tipo              TEXT NOT NULL,
  titulo            TEXT NOT NULL,
  mensagem          TEXT,
  entidade          TEXT,
  entidade_id       INTEGER,
  lida              INTEGER NOT NULL DEFAULT 0,
  criada_em         TEXT NOT NULL DEFAULT (datetime('now', '-4 hours'))
);
CREATE INDEX IF NOT EXISTS idx_notificacao_usuario ON notificacao(usuario_id, lida);

-- SERV-EXT-01: fornecedor de serviço externo (torno, solda, retífica etc.) — hoje `peca.fornecedor_preferencial`
-- e `requisicao_compra.fornecedor` são texto livre, o que basta para uma cotação avulsa, mas não dá para
-- somar "quanto já paguei para esse prestador" de forma confiável. Tabela nova e enxuta, sem migrar os
-- campos texto existentes (fora do escopo desta mudança).
CREATE TABLE IF NOT EXISTS fornecedor (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nome              TEXT NOT NULL,
  cnpj              TEXT,
  contato           TEXT,
  telefone          TEXT,
  email             TEXT,
  especialidade     TEXT,
  observacoes       TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  excluido_em       TEXT
);

-- SERV-EXT-02: controle de peça/componente que sai da empresa para serviço externo (usinagem, solda,
-- retífica, calibração...) durante a execução de uma OS. Sempre vinculado à OS que originou a necessidade
-- (é lá que o técnico constatou o problema). `peca_id` é opcional porque nem todo item enviado é uma peça
-- catalogada no almoxarifado — muitas vezes é um componente específico do próprio ativo (eixo, engrenagem)
-- que nunca foi comprado separadamente; `descricao_item` sempre descreve o item, catalogado ou não.
-- status_logistico (saída física) e status_pagamento (financeiro) evoluem de forma independente: o
-- fornecedor pode cobrar antes de devolver a peça, ou só depois.
CREATE TABLE IF NOT EXISTS servico_externo (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                    TEXT NOT NULL UNIQUE,
  os_id                     INTEGER NOT NULL REFERENCES ordem_servico(id),
  ativo_id                  INTEGER NOT NULL REFERENCES ativo(id),
  peca_id                   INTEGER REFERENCES peca(id),
  descricao_item            TEXT NOT NULL,
  quantidade                REAL NOT NULL DEFAULT 1,
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
  valor_orcado              REAL,
  valor_cobrado             REAL,
  valor_pago                REAL,
  data_pagamento            TEXT,
  forma_pagamento           TEXT,
  motivo_cancelamento       TEXT,
  observacoes               TEXT,
  responsavel_id            INTEGER NOT NULL REFERENCES usuario(id),
  criado_em                 TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  criado_por                INTEGER NOT NULL REFERENCES usuario(id),
  excluido_em               TEXT
);
CREATE INDEX IF NOT EXISTS idx_servico_externo_os ON servico_externo(os_id);
CREATE INDEX IF NOT EXISTS idx_servico_externo_status ON servico_externo(status_logistico);

-- LUB-01: módulo de lubrificação, deliberadamente separado do motor de planos de manutenção
-- (plano_manutencao + recorrenciaService, por data_base). A planilha de lubrificação organiza a
-- recorrência por NÚMERO DA SEMANA do ano (grade de 52/53 colunas), então ponto_lubrificacao usa
-- semana_base + periodicidade em semanas (recorrenciaSemanalService), não data_base — o ciclo
-- reinicia a cada ano-calendário em vez de somar dias/meses indefinidamente.
CREATE TABLE IF NOT EXISTS ponto_lubrificacao (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                  TEXT NOT NULL UNIQUE,
  ativo_id                INTEGER NOT NULL REFERENCES ativo(id),
  descricao               TEXT NOT NULL,
  especificacao           TEXT,
  componente              TEXT,
  periodicidade           TEXT NOT NULL CHECK (periodicidade IN ('semanal','quinzenal','mensal','bimestral','trimestral','semestral','anual')),
  semana_base             INTEGER NOT NULL CHECK (semana_base BETWEEN 1 AND 53),
  duracao_estimada_horas  REAL NOT NULL DEFAULT 0,
  responsavel_padrao_id   INTEGER REFERENCES usuario(id),
  prioridade_padrao       TEXT NOT NULL CHECK (prioridade_padrao IN ('baixa','media','alta','critica')) DEFAULT 'media',
  instrucoes              TEXT,
  ativo                   INTEGER NOT NULL DEFAULT 1,
  data_inicio_vigencia    TEXT NOT NULL,
  data_fim_vigencia       TEXT,
  excluido_em             TEXT
);

CREATE TABLE IF NOT EXISTS lote_geracao_lubrificacao (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                TEXT NOT NULL UNIQUE,
  ano                   INTEGER NOT NULL,
  semana_inicio         INTEGER NOT NULL,
  semana_fim            INTEGER NOT NULL,
  filtros_aplicados     TEXT,
  quantidade_gerada     INTEGER NOT NULL DEFAULT 0,
  gerado_em             TEXT NOT NULL DEFAULT (datetime('now', '-4 hours')),
  gerado_por            INTEGER NOT NULL REFERENCES usuario(id),
  status                TEXT NOT NULL CHECK (status IN ('simulado','confirmado','revertido')),
  revertido_em          TEXT,
  revertido_por         INTEGER REFERENCES usuario(id)
);

-- Mesmo papel de os_plano (Fase 5): quando um ativo tem mais de um ponto de lubrificação vencendo
-- na mesma semana, os pontos são consolidados numa OS só.
CREATE TABLE IF NOT EXISTS os_ponto_lubrificacao (
  os_id                   INTEGER NOT NULL REFERENCES ordem_servico(id),
  ponto_lubrificacao_id   INTEGER NOT NULL REFERENCES ponto_lubrificacao(id),
  PRIMARY KEY (os_id, ponto_lubrificacao_id)
);

-- PAC-01: checklist de execução por ponto de lubrificação — mesmo papel de plano_tarefa, mas pro
-- lado da lubrificação (que não tinha nenhum checklist granular até aqui). Alimenta os_tarefa na
-- geração da OS, igual planos já fazem.
CREATE TABLE IF NOT EXISTS ponto_lubrificacao_tarefa (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  ponto_lubrificacao_id   INTEGER NOT NULL REFERENCES ponto_lubrificacao(id),
  ordem                   INTEGER NOT NULL,
  descricao               TEXT NOT NULL,
  tipo_resposta           TEXT NOT NULL CHECK (tipo_resposta IN ('ok_nok','texto','numerico','selecao')),
  obrigatoria             INTEGER NOT NULL DEFAULT 1,
  valor_min               REAL,
  valor_max               REAL,
  unidade                 TEXT,
  regime                  TEXT CHECK (regime IN ('MP','MF'))
);
