# SIGMA — Sistema Integrado de Gestão da Manutenção de Ativos

CMMS/EAM para PCM de uma planta de abate e processamento de aves. Ver especificação completa
em `prompt-sigma.md` (fornecida pelo usuário).

## Arquitetura

- `server/` — API REST em Express + TypeScript, persistência em SQLite via `node:sqlite`
  (módulo nativo do Node, sem dependência de compilação). Toda regra de negócio e cálculo
  (recorrência, estoque, custos) vive na camada de serviço do servidor — nunca no frontend.
- `web/` — Frontend em React + TypeScript + Vite, com o design system da Seção 4 do escopo
  aplicado via CSS custom properties (`web/src/styles/tokens.css`).

## Como rodar (desenvolvimento)

```bash
npm install
npm run seed --workspace=server   # cria o banco em server/data/sigma.db e popula perfis/usuários
npm run dev:server                # API em http://localhost:3333
npm run dev:web                   # Frontend em http://localhost:5173 (outro terminal)
```

Login de demonstração (Fase 1): matrícula `0001`, senha `sigma123` (perfil Administrador).
Outros perfis seedados: `0002` a `0008` (Coordenador de PCM, Planejador, Supervisor, Técnico,
Almoxarife, Solicitante, Consulta), todos com senha `sigma123`.

## Status — Fases 1 a 11 (entregues, roadmap completo)

- Design system aplicado (paleta, tipografia, espaçamento, badges de prioridade/status).
- Layout base: sidebar fixa escura, topbar, responsivo (sidebar colapsa < 900px).
- Autenticação por matrícula/senha (JWT em cookie httpOnly).
- Perfis com permissões granulares por módulo/ação; menu e rotas respeitam a permissão
  (item some do menu **e** a rota bloqueia acesso direto).
- Schema completo do banco (Seção 6 do escopo) já migrado, pronto para as próximas fases.
- Cadastro de ativos (árvore instalação/equipamento/componente) e peças, com vínculo peça↔ativo
  e cópia de lista técnica entre ativos.
- Planos de manutenção: periodicidade com motor de recorrência (`recorrenciaService`), checklist
  (plano_tarefa) e peças previstas (plano_peca).
- Geração de OS em lote (Fase 5): simula ocorrências de todos os planos ativos num período,
  alerta sobrecarga de responsável/dia, e confirma criando as OS (com checklist e peças
  copiados do plano). Lotes ficam com histórico e podem ser revertidos enquanto as OS geradas
  não saírem do status "programada". Idempotência por `plano_id + data`, então rodar a geração
  de novo sobre um período já processado não duplica OS.
- Execução de OS (Fase 6): lista e detalhe de ordens de serviço (`osService.ts`), criação de OS
  avulsa (origem="avulsa", nasce "aberta"), máquina de estados
  programada→aberta→em_execução⇄aguardando_peça→concluída, com cancelamento a partir de qualquer
  estado aberto. Status "atrasada" é sincronizado sob demanda (sem job agendado) comparando
  `data_limite` com a data atual a cada leitura. Checklist da OS (`os_tarefa`) é preenchido item a
  item (OK/NOK, texto ou numérico com faixa); baixa de consumo de peças fica em `os_peca`.
  Concluir uma OS exige, no servidor (não só na UI), que todo item obrigatório do checklist e
  toda peça obrigatória tenham resposta/baixa registradas — regra que já estava documentada como
  texto de ajuda na tela de peças do plano, mas não era aplicada em lugar nenhum antes desta fase.
- Almoxarifado (Fase 7): ledger de estoque (`estoqueService.ts`) com os cinco tipos de movimento
  do schema — entrada (recalcula custo médio ponderado), saída, devolução, ajuste (por contagem
  física, informando o saldo contado em vez do delta) e transferência (não mexe em quantidade, só
  em `localizacao_almoxarifado`, já que não há modelagem de múltiplos depósitos). `quantidade` no
  ledger é sempre o delta assinado aplicado ao saldo, então `SUM(quantidade)` até uma data
  reconstrói o saldo naquela data. Reserva de peça (`reserva_peca`) passou a ser criada de fato
  sempre que uma OS ganha uma linha de peça prevista (geração em lote ou adição manual na OS),
  consumida quando a baixa é registrada, e liberada quando a OS é cancelada/excluída — fechando a
  lacuna que a Fase 6 deixou registrada. Alerta de reposição mostra estoque atual, reservado e
  disponível lado a lado. Consumo registrado numa OS agora efetivamente baixa o estoque físico e
  gera lançamento no ledger; editar um consumo já registrado lança só a diferença (saída adicional
  ou devolução), nunca duplica o efeito.
- Programação de compras (Fase 8): requisição de compra (`requisicaoCompraService.ts`) com máquina
  de estados rascunho→emitida→aprovada→em_cotação→pedido_colocado→recebida, cancelável a qualquer
  momento antes de recebida. Itens só podem ser adicionados/editados/removidos em "rascunho".
  Receber uma requisição lança uma entrada de estoque de verdade para cada item (Fase 7),
  fechando o ciclo compra→estoque. Dois geradores automáticos de rascunho: um a partir dos
  alertas de reposição do almoxarifado (origem "ponto_de_pedido"), outro projetando a demanda de
  peças dos planos de manutenção ativos num período escolhido pelo usuário (origem
  "programacao_preventiva", reaproveita o motor de recorrência da Fase 5) — ambos só sugerem
  comprar a diferença entre a demanda e o estoque disponível (descontando reservas ativas).
- Solicitações de manutenção (Fase 9): qualquer perfil com permissão `criar` (inclusive o
  Solicitante, que não tem acesso a mais nada além disso e de `ver`) abre uma solicitação
  (`solicitacaoService.ts`), ligada a um ativo. Máquina de estados
  aberta→em_análise→convertida_em_os **ou** recusada, as duas últimas terminais. Converter em OS
  reaproveita a criação de OS avulsa da Fase 6 (`osService.criarOSDeSolicitacao`, extraído do
  mesmo `inserirOSAberta` que já servia `criarOSAvulsa`) — a OS nasce "aberta", com origem
  "solicitacao" e o vínculo nos dois sentidos (`ordem_servico.solicitacao_id` e
  `solicitacao.os_id`), herdando ativo e descrição mas com tipo/prioridade/datas escolhidos por
  quem aprova.
- Calendário anual de manutenção (Fase 10): visão clássica de PCM — uma linha por plano
  preventivo ativo, uma coluna por mês, dias do mês em que cai cada ocorrência
  (`calendarioService.ts`, reaproveita `calcularOcorrencias`/`ajustarDiaNaoUtil` da Fase 5 sobre
  a janela do ano inteiro). Cada dia mostra se já existe uma OS gerada para aquela ocorrência
  (mesma `chave_idempotencia` da geração em lote) ou se é só planejado — tela somente leitura,
  não cria nem altera nada.
- Indicadores, configurações e auditoria (Fase 11):
  - O Dashboard (`indicadoresService.ts`) deixou de ser um shell com "—": cumprimento do plano
    preventivo nos últimos 30 dias (das OS de origem plano com `data_limite` na janela, quantas
    concluíram com `data_conclusao <= data_limite`; `null`/"—" quando não havia nenhuma devida,
    para não mostrar 0% enganosamente), OS abertas e backlog em horas (soma de tudo que não é
    concluída/cancelada), e peças em ruptura (alertas críticos da Fase 7). Duas tabelas auxiliares
    (OS atrasadas, alertas de reposição) só aparecem para quem tem permissão no módulo de origem —
    o dashboard inteiro degrada com elegância conforme o perfil, já que a rota `/` continua aberta
    a qualquer usuário autenticado (nunca foi protegida por `RequirePermissao`, e mudar isso agora
    tiraria todo perfil sem `indicadores` de ter uma página inicial).
  - Configurações gerais (`configuracaoService.ts`) edita as três chaves de `configuracao`
    (tratamento de dia não útil, margem de segurança, limite de horas/dia) e o cadastro de
    feriados — os mesmos dados que a Fase 5/10 já liam, só que agora com uma tela para mudá-los em
    vez de só psql/seed.
  - Auditoria (`auditoriaService.listarAuditoria`) é só leitura sobre o `log_auditoria` que todo
    módulo já vem preenchendo desde a Fase 1 — filtros por entidade/ação/usuário/período, e um
    modal com o antes/depois de cada registro em formato de tabela campo a campo (trocado do JSON
    cru original depois de feedback do usuário — ver revisão pós-Fase-11). Usuário passou a ser
    auditado também nessa revisão, junto com o CRUD que faltava nesse módulo.

**Decisões que merecem revisão ao validar contra a Seção 5 completa do escopo** (não estava
disponível no repositório ao implementar esta fase):
- Mapeamento `tipo_manutencao` do plano → `tipo` da OS: `preditiva_manual`, `lubrificacao` e
  `limpeza_tecnica` não têm correspondente exato no enum de OS, então caem em `inspecao` e
  `preventiva` respectivamente (ver comentário em `loteGeracaoService.ts`).
- `data_limite` da OS = data programada + `margem_seguranca_dias` (configuração já seedada com
  valor 7).
- Alerta de sobrecarga usa `limite_horas_dia_responsavel` (configuração já seedada com valor 8)
  somando `duracao_estimada_horas` dos planos por responsável/dia — é só um aviso, não bloqueia
  a geração.
- `os_peca` ganhou uma coluna `obrigatoria` (INTEGER, default 1) que não existia no schema.sql
  original — sem ela não dava para saber, na hora de concluir a OS, quais peças eram obrigatórias
  segundo o plano. Banco de desenvolvimento já existente recebe a coluna via `ALTER TABLE`
  tolerante em `migrate.ts` (não há sistema de migração incremental ainda).
- Custo de mão de obra (`ordem_servico.custo_mao_obra`) não era calculado — **corrigido**: adicionei
  `usuario.custo_hora_padrao` (coluna nova, mesmo padrão de `ALTER TABLE` tolerante do
  `os_peca.obrigatoria`) e `concluirOS` agora grava `horas_reais × custo_hora_padrao` do
  responsável (fica em branco quando a OS não tem responsável atribuído — sem tarifa não há como
  custear). Isso expôs uma lacuna maior: o módulo de Usuários (Fase 1) nunca teve CRUD, só
  listagem, apesar do mapa de permissões já prever `criar`/`editar`/`excluir` — implementei o CRUD
  completo (`usuarioService.ts` + `UsuarioFormModal.tsx`) junto, já que o campo de custo por hora
  não tinha onde ser editado sem isso. De quebra, `usuario` passou a ser auditado (não estava na
  lista de entidades que `registrarAuditoria` cobria antes). `custo_pecas` continua sendo calculado
  à parte, somando quantidade consumida × custo médio da peça no momento do registro.
- O perfil Técnico deveria (segundo a descrição do próprio seed) ver só "OS atribuídas a ele", e
  o Supervisor só "OS do seu setor" — isso não está implementado como restrição no servidor, só
  como filtro opcional "Somente minhas OS" na tela. Nenhum outro módulo já construído faz recorte
  por linha (só por módulo/ação), então não implementar isso aqui foi decisão consciente de manter
  consistência — mas é uma lacuna de segurança se o requisito for levado a sério.
- Registrar consumo de peça agora exige que a OS não esteja mais em "programada" (precisa ter
  sido aberta antes) — sem essa trava, uma OS nunca aberta podia acumular reserva "consumida" e
  movimento de estoque vinculado a ela, o que quebraria a reversão de lote (Fase 5) por violar a
  chave estrangeira ao excluir a OS. Reverter um lote sempre exclui as reservas da OS antes de
  excluir a própria OS, pelo mesmo motivo.
- `ponto_de_pedido` não era preenchido no seed de peças (ficava 0) — **corrigido**: `seed.ts` agora
  calcula `ceil(estoque_minimo × 1,5)` por falta de histórico de consumo pra um cálculo de
  verdade (média diária × lead time). O código do alerta de reposição continua considerando
  `ponto_de_pedido` só quando > 0 (defensivo pra peças cadastradas manualmente sem preencher o
  campo), mas agora o nível "atenção" do alerta (abaixo do ponto de pedido, ainda acima do
  mínimo) deixou de ser código morto na demo — hoje aparecem 5 peças nesse nível, antes nenhuma.
- "Transferência" registra a mudança de `localizacao_almoxarifado` e fica no ledger para
  auditoria, mas não reduz o saldo em nenhum lugar e não soma em outro — não há modelagem de
  múltiplos depósitos/saldos por local no schema, só um campo de texto livre por peça.
- Só `ver`, `criar` e `aprovar` são usados de fato em `programacao_compras` (nenhum perfil do seed
  tem `editar` ou `excluir` nesse módulo) — por isso o ciclo inteiro de uma requisição (emitir,
  avançar cotação/pedido colocado, receber) ficou atrás de `criar`, e só a aprovação em si e o
  cancelamento ficaram atrás de `aprovar`. É uma leitura razoável do mapa de permissões existente,
  mas a Seção 8 completa pode detalhar isso de outro jeito.
- A sugestão por ponto de pedido usa uma heurística simples (repor até o maior entre
  `estoque_minimo` e `ponto_de_pedido`) — não há campo de lote econômico de compra no schema.
- A sugestão por programação preventiva compara a demanda projetada com `estoque_disponivel`
  (atual − reservado), então uma OS já gerada dentro do período **é** descontada corretamente via
  a reserva que ela já tem (Fase 7) — não é a lacuna que uma nota anterior aqui sugeria. O que
  realmente não é considerado: uma OS gerada e já **concluída** dentro do período (a reserva vira
  "consumida" e some da soma, mas a ocorrência ainda conta na demanda projetada, então o cálculo
  fica levemente conservador nesse caso raro — nunca sugere comprar menos do que precisa, só
  possivelmente um pouco mais). Também não ajusta por feriado/dia não útil — é uma estimativa de
  planejamento, não uma data de OS.
- `requisicao_compra_item.os_vinculadas` guarda só os **códigos dos planos** de origem quando a
  requisição vem da programação preventiva (não há OS real ainda nesse ponto — a compra é
  proativa, antes da geração em lote) — o nome da coluna sugere OS, mas nada no fluxo atual liga
  o item a uma OS de fato.
- Iniciar análise fica atrás de `editar` e converter/recusar atrás de `aprovar` — no mapa de
  permissões do seed, só Administrador e Coordenador têm as duas para `solicitacoes` (Planejador e
  Supervisor só têm `ver`), então hoje só esses dois perfis processam uma solicitação de ponta a
  ponta. Parece intencional (é uma decisão que compromete OS e custo), mas vale confirmar contra a
  Seção 9 completa.
- Igual à ressalva já feita para OS (Fase 6): não há recorte por solicitante — o filtro "Somente
  minhas solicitações" na tela é conveniência de UI, não uma restrição do servidor.

As 11 fases do roadmap da Seção 15 estão implementadas. O que resta é validação: nenhuma foi
conferida contra a especificação original completa (`prompt-sigma.md`, não disponível no
repositório durante a implementação) — as decisões tomadas por inferência do schema e dos módulos
já existentes estão listadas acima, fase a fase, para revisão.

**Decisão técnica que merece revisão:** o escopo original sugeria PostgreSQL (ou SQLite em
dev) com `better-sqlite3`. O ambiente de desenvolvimento não tem toolchain de compilação nativa
(Python/MSVC) disponível, então foi usado `node:sqlite` (módulo nativo assíncrono/síncrono do
próprio Node 22+), que tem API quase idêntica e não depende de compilação. A camada de acesso a
dados está isolada em `server/src/db` e `server/src/services`, então trocar para PostgreSQL em
produção depois exige apenas reescrever essa camada, não a API nem o frontend.

## Módulo de Inspeções (adicionado após a Fase 11)

Módulo dedicado para os inspetores de manutenção, atribuído por Planejador/Coordenador de
PCM/Supervisor de manutenção/Administrador, cobrindo dois fluxos:

- **Inspeção periódica de equipamento** — `plano_inspecao` (equivalente ao `plano_manutencao`,
  mas com recorrência semanal `intervalo_semanas`/`semana_base` em vez de data-base, já que a
  planilha de origem é organizada por semana do ano, classes A/B/C = a cada 2/4/6 semanas).
  Checklist opcional (`plano_inspecao_tarefa`); sem itens, o inspetor registra só o resultado
  geral (OK/Atenção/Crítico) ao concluir. Geração em lote (`loteGeracaoInspecaoService.ts`,
  mesmo padrão de `loteGeracaoLubrificacaoService.ts`) cria OS com `tipo='inspecao'`,
  `subtipo_inspecao='periodica'` — a execução acontece na tela de OS já existente
  (`OrdemServicoDetalhe.tsx`), não numa tela própria.
- **Conferência de OS executada** — o inspetor verifica in loco se uma OS concluída por outra
  pessoa foi realmente executada como registrado. Cria uma OS de auditoria
  (`tipo='inspecao'`, `subtipo_inspecao='auditoria_os'`, `os_auditada_id`) com o checklist
  original copiado (somente leitura) para `os_tarefa_auditoria`, onde o inspetor marca cada item
  conforme/divergente; ao concluir, atualiza `auditoria_status` da OS original.

Reaproveita a máquina de estados de `ordem_servico` (abrir/iniciar/concluir/cancelar/reabrir)
em vez de duplicá-la — só ganham rotas/telas/permissão (`inspecoes`) e navegação próprias. Perfil
novo **Inspetor** (só vê as próprias inspeções/conferências, mesmo padrão de restrição já usado
para Técnico).

Dados reais importados de uma planilha de 783 equipamentos (`server/src/scripts/importarInspecoes.ts`,
script único, idempotente por TAG) — 780 planos criados, 59 ativos novos cadastrados, 151 sem
classe de periodicidade definida na planilha original ("SEM CLASSE - DEFINIR").

**Nota de performance:** com ~780 planos, o padrão ingênuo de "uma consulta por ocorrência"
(copiado inicialmente do módulo de Lubrificação, que tem muito menos pontos) chegava a travar o
calendário e a geração em lote por completo contra o Postgres remoto. Corrigido buscando
idempotência e caminho de ativos em lote (`caminhosAtivos` em `ativoService.ts`) em vez de por
linha — ver comentários `PERF-01` em `calendarioInspecaoService.ts` e
`loteGeracaoInspecaoService.ts`.

## Descrição e checklist obrigatórios na conversão de solicitação em OS

Converter uma solicitação em OS (`converterEmOS`, Fase 9) deixou de herdar a descrição da
solicitação original — que é só o relato do problema, escrito por quem pediu — e passou a exigir
que quem converte escreva a descrição do serviço que será executado e monte o checklist de
itens/serviços a realizar (reaproveitando `os_tarefa`/`adicionarTarefaOS` já usado pela Fase 6, só
que agora alimentado na própria conversão em vez de deixado vazio). Os dois campos são validados no
servidor (`ErroValidacaoSolicitacao`), não só no formulário (`ConverterSolicitacaoModal.tsx`) — pelo
menos um item de checklist, todos com descrição preenchida. Vale para os dois tipos de origem da
solicitação (aberta no próprio Globosigma ou vinda do GloboPac): é o mesmo código de conversão para
as duas, então não há tratamento especial por origem.

- **No Globosigma**, o perfil Solicitante ganhou `ordens_servico: ["ver"]` (antes só tinha acesso ao
  módulo de solicitações) para conseguir abrir a OS gerada a partir do link "OS gerada" que a tela
  de solicitação já mostrava, e ver lá a programação (datas) e o checklist — sem poder editar nada,
  já que não ganhou `editar`. Mesmo recorte amplo (sem restrição por linha, só por módulo/ação) já
  aceito para Técnico/Supervisor de manutenção (ver ressalva mais acima) — decisão de manter
  consistência, não uma reavaliação daquela ressalva. Banco já existente recebe a permissão via
  backfill tolerante em `migrate.ts` (`garantirPermissaoSolicitanteVerOS`, mesmo padrão de
  `garantirPermissaoLubrificacao`/`garantirPermissaoInspecoes`).
- **No GloboPac**, os três eventos que o Sigma já empurrava para lá via
  `notificarGlobopacAtualizacaoOS` (programação, aviso de execução concluída, conclusão) passaram a
  levar também `sigma_descricao_servico` e `sigma_checklist` (descrição + obrigatoriedade de cada
  item, sem resposta) — cabe ao GloboPac decidir como exibir isso na aba de acompanhamento do
  usuário que abriu a solicitação; o Sigma não controla a UI do lado de lá.

**Decisão que merece revisão:** o formulário de conversão só pede descrição e obrigatoriedade de
cada item do checklist (tipo de resposta ok/nok, texto, numérico ou seleção) — omite faixa
min/max, unidade e regime (MP/MF), que existem no schema de `os_tarefa` e no formulário completo de
edição de item (`OSChecklistTab.tsx`) mas não são comuns em checklist nascido de solicitação sem um
plano de origem. Quem converte pode complementar esses campos depois, editando o item na própria OS
(mesma tela/permissão de sempre), já que a OS nasce "aberta" e editável.
