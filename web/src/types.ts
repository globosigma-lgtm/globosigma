import type { MapaPermissoes } from "./lib/permissions";

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

export interface AtivoDetalhe extends Ativo {
  caminho: string;
  filhos: Ativo[];
}

export type UnidadeMedida = "un" | "m" | "kg" | "l" | "cx" | "par" | "rolo";

export interface Peca {
  id: number;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  categoria: string | null;
  fabricante: string | null;
  codigo_fabricante: string | null;
  estoque_atual: number;
  estoque_minimo: number;
  ponto_de_pedido: number;
  lead_time_dias: number;
  custo_unitario_medio: number;
  fornecedor_preferencial: string | null;
  localizacao_almoxarifado: string | null;
  ativa: number;
}

export interface VinculoAtivoPeca {
  id: number;
  peca_id: number;
  quantidade_padrao: number;
  aplicacao: string | null;
  posicao: string;
  troca_obrigatoria: number;
  observacao: string | null;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
  estoque_minimo: number;
}

export interface VinculoPecaAtivo {
  id: number;
  ativo_id: number;
  quantidade_padrao: number;
  aplicacao: string | null;
  posicao: string;
  troca_obrigatoria: number;
  codigo: string;
  nome: string;
  criticidade: CriticidadeAtivo;
  caminho: string;
}

export type TipoManutencao = "preventiva" | "preditiva_manual" | "inspecao" | "calibracao" | "lubrificacao" | "limpeza_tecnica";
export type Periodicidade =
  | "diaria"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "bimestral"
  | "trimestral"
  | "quadrimestral"
  | "semestral"
  | "anual"
  | "bienal"
  | "trienal"
  | "personalizada";
export type TipoResposta = "ok_nok" | "texto" | "numerico" | "selecao";

export interface UsuarioSimples {
  id: number;
  nome: string;
  matricula: string;
  setor: string | null;
}

export interface MembroEquipe {
  id: number;
  nome: string;
  matricula: string;
}

export interface Equipe {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: number;
  criado_em: string;
  membros: MembroEquipe[];
}

export interface EquipeSimples {
  id: number;
  nome: string;
}

export interface ResultadoBusca {
  tipo: "ativo" | "peca" | "plano" | "plano_inspecao" | "os" | "solicitacao" | "equipe" | "usuario";
  grupo: string;
  titulo: string;
  subtitulo?: string;
  caminho: string;
}

export interface Plano {
  id: number;
  codigo: string;
  nome: string;
  ativo_id: number;
  tipo_manutencao: TipoManutencao;
  periodicidade: Periodicidade;
  intervalo_customizado_dias: number | null;
  data_base: string;
  duracao_estimada_horas: number;
  responsavel_padrao_id: number | null;
  equipe_padrao: string | null;
  prioridade_padrao: CriticidadeAtivo;
  exige_parada_linha: number;
  instrucoes: string | null;
  ativo: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  tem_pecas: number;
}

export type Regime = "MP" | "MF";

export interface PlanoTarefa {
  id: number;
  plano_id: number;
  ordem: number;
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: number;
  valor_min: number | null;
  valor_max: number | null;
  unidade: string | null;
  regime: Regime | null;
}

export interface PlanoPeca {
  id: number;
  plano_id: number;
  peca_id: number;
  quantidade_prevista: number;
  obrigatoria: number;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
  estoque_minimo: number;
}

export type TipoOS = "preventiva" | "corretiva" | "inspecao" | "melhoria" | "calibracao" | "lubrificacao";
export type StatusLote = "simulado" | "confirmado" | "revertido" | "processando" | "erro";

export interface PlanoDaOcorrencia {
  id: number;
  codigo: string;
  nome: string;
  tipo_manutencao: TipoManutencao;
  periodicidade: Periodicidade;
}

export interface OcorrenciaSimulada {
  plano_id: number;
  plano_codigo: string;
  plano_nome: string;
  planos: PlanoDaOcorrencia[];
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  tipo_manutencao: TipoManutencao;
  periodicidade: Periodicidade;
  tipo_os: TipoOS;
  prioridade: CriticidadeAtivo;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  data_prevista: string;
  data_ajustada: string;
  data_limite: string;
  horas_estimadas: number;
  exige_parada_linha: number;
  chave_idempotencia: string;
  ja_gerada: boolean;
}

export interface AlertaSobrecarga {
  responsavel_id: number;
  responsavel_nome: string;
  data: string;
  horas_totais: number;
  limite_horas: number;
}

export interface ResultadoSimulacao {
  data_inicio: string;
  data_fim: string;
  tratamento_dia_nao_util: string;
  ocorrencias: OcorrenciaSimulada[];
  total_novas: number;
  total_ja_geradas: number;
  sobrecargas: AlertaSobrecarga[];
}

export interface LoteGeracao {
  id: number;
  codigo: string;
  data_inicio_periodo: string;
  data_fim_periodo: string;
  filtros_aplicados: string | null;
  quantidade_gerada: number;
  gerado_em: string;
  gerado_por: number;
  gerado_por_nome: string;
  status: StatusLote;
  revertido_em: string | null;
  revertido_por: number | null;
  erro_mensagem: string | null;
}

export type SituacaoLinhaImportacao = "atualizar" | "sem_alteracao" | "nao_encontrada" | "invalida";

export interface LinhaImportacaoEstoque {
  linha: number;
  codigo: string;
  quantidadePlanilha: number;
  pecaId: number | null;
  pecaDescricao: string | null;
  estoqueAtual: number | null;
  delta: number | null;
  situacao: SituacaoLinhaImportacao;
  erro?: string;
}

export interface ResultadoSimulacaoImportacao {
  nomeArquivo: string;
  abaUsada: string;
  colunaCodigo: string;
  colunaQuantidade: string;
  linhas: LinhaImportacaoEstoque[];
  resumo: { atualizar: number; semAlteracao: number; naoEncontradas: number; invalidas: number; total: number };
}

export interface ImportacaoEstoque {
  id: number;
  codigo: string;
  nome_arquivo: string;
  linhas_atualizadas: number;
  linhas_sem_alteracao: number;
  linhas_nao_encontradas: number;
  linhas_invalidas: number;
  criado_em: string;
  criado_por: number;
  criado_por_nome: string;
}

export type StatusOS = "programada" | "aberta" | "em_execucao" | "aguardando_peca" | "concluida" | "atrasada" | "cancelada";
export type OrigemOS =
  | "plano_lote"
  | "plano_manual"
  | "solicitacao"
  | "avulsa"
  | "lubrificacao_lote"
  | "inspecao_lote"
  | "inspecao_corretiva";
export type PrioridadeOS = CriticidadeAtivo;
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
  auditoria_status: AuditoriaStatusOS;
  resultado_inspecao: ResultadoInspecao | null;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  plano_codigo: string | null;
  causa_falha: string | null;
  tem_pecas: number;
  tem_checklist: number;
  solicitacao_origem: OrigemSolicitacao | null;
  solicitacao_criada_em: string | null;
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

export type StatusAssinatura = "aguardando_tsa" | "completa" | "falha_tsa" | "invalidada";

export interface AssinaturaDigital {
  id: number;
  os_id: number;
  hash_sha256: string;
  algoritmo_hash: string;
  dados_assinados: string;
  tsa_endpoint: string | null;
  tsa_emitido_em: string | null;
  status: StatusAssinatura;
  erro_tsa: string | null;
  criado_em: string;
  criado_por: number;
  criado_por_nome: string | null;
}

export const CAUSAS_FALHA = ["eletrica", "mecanica", "operacional", "desgaste_natural", "falta_manutencao", "outro"] as const;
export type CausaFalha = (typeof CAUSAS_FALHA)[number];
export const ROTULO_CAUSA_FALHA: Record<CausaFalha, string> = {
  eletrica: "Elétrica",
  mecanica: "Mecânica",
  operacional: "Operacional",
  desgaste_natural: "Desgaste natural",
  falta_manutencao: "Falta de manutenção",
  outro: "Outro",
};

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

export interface Anexo {
  id: number;
  entidade: string;
  entidade_id: number;
  nome_arquivo: string;
  caminho_relativo: string;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  criado_em: string;
  criado_por: number | null;
}

export interface Notificacao {
  id: number;
  usuario_id: number;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  entidade: string | null;
  entidade_id: number | null;
  lida: number;
  criada_em: string;
}

export interface PontoBacklogSemanal {
  semana_fim: string;
  os_em_aberto: number;
  horas_em_aberto: number;
}

export interface CustoPorAtivo {
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  custo_pecas: number;
  custo_mao_obra: number;
  custo_total: number;
  os_concluidas: number;
}

export interface CumprimentoPorSetor {
  setor: string;
  preventivas_no_prazo: number;
  preventivas_devidas: number;
  cumprimento_pct: number | null;
}

export interface ItemCurvaABC {
  peca_id: number;
  codigo: string;
  descricao: string;
  valor_consumido: number;
  pct_do_total: number;
  pct_acumulado: number;
  classe: "A" | "B" | "C";
}

export interface TicketMedioTecnico {
  responsavel_id: number;
  responsavel_nome: string;
  os_concluidas: number;
  horas_totais: number;
  ticket_medio_horas: number;
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

export type TipoMovimento = "entrada" | "saida" | "ajuste" | "transferencia" | "devolucao";
export type StatusReserva = "reservada" | "consumida" | "liberada";

export interface MovimentoEstoque {
  id: number;
  peca_id: number;
  tipo: TipoMovimento;
  quantidade: number;
  saldo_apos: number;
  custo_unitario: number | null;
  os_id: number | null;
  os_codigo: string | null;
  requisicao_compra_id: number | null;
  motivo: string | null;
  data: string;
  usuario_id: number;
  usuario_nome: string;
  peca_codigo: string;
  peca_descricao: string;
  unidade_medida: UnidadeMedida;
}

export interface ReservaPeca {
  id: number;
  peca_id: number;
  os_id: number;
  os_codigo: string;
  quantidade: number;
  status: StatusReserva;
  criada_em: string;
  atualizada_em: string | null;
  peca_codigo: string;
  peca_descricao: string;
  unidade_medida: UnidadeMedida;
}

export interface AlertaReposicao {
  id: number;
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
  estoque_minimo: number;
  ponto_de_pedido: number;
  lead_time_dias: number;
  quantidade_reservada_total: number;
  estoque_disponivel: number;
  nivel: "critico" | "atencao";
}

export type OrigemRequisicao = "programacao_preventiva" | "ponto_de_pedido" | "manual";
export type StatusRequisicao = "rascunho" | "emitida" | "aprovada" | "em_cotacao" | "pedido_colocado" | "recebida" | "cancelada";

export interface RequisicaoCompra {
  id: number;
  codigo: string;
  origem: OrigemRequisicao;
  fornecedor: string | null;
  data_necessidade: string | null;
  data_limite_pedido: string | null;
  status: StatusRequisicao;
  observacoes: string | null;
  criada_em: string;
  criada_por: number;
  criada_por_nome: string;
}

export interface ItemRequisicao {
  id: number;
  requisicao_id: number;
  peca_id: number;
  quantidade: number;
  custo_unitario_estimado: number | null;
  data_necessidade: string | null;
  os_vinculadas: string[];
  peca_codigo: string;
  peca_descricao: string;
  unidade_medida: UnidadeMedida;
  estoque_atual: number;
}

export type TipoServicoExterno = "usinagem" | "solda" | "retifica" | "calibracao" | "pintura" | "outro";
export type StatusLogisticoServicoExterno = "pendente_envio" | "enviado" | "retornado" | "cancelado";
export type StatusPagamentoServicoExterno = "pendente" | "parcial" | "pago";

export interface Fornecedor {
  id: number;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  especialidade: string | null;
  observacoes: string | null;
  ativo: number;
  criado_em: string;
}

export interface ServicoExterno {
  id: number;
  codigo: string;
  os_id: number;
  os_codigo: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  // SRVEXT-COMP-01: peca_id/peca_codigo/peca_descricao só existem em registros criados antes da
  // mudança pra Ativo/Componente — leitura, histórico. item_ativo_id é o Ativo ou Componente
  // (ativo com item_ativo_pai_id preenchido) efetivamente enviado em todo registro novo.
  peca_id: number | null;
  peca_codigo: string | null;
  peca_descricao: string | null;
  unidade_medida: UnidadeMedida | null;
  item_ativo_id: number | null;
  item_ativo_codigo: string | null;
  item_ativo_nome: string | null;
  item_ativo_tipo: TipoAtivo | null;
  item_ativo_pai_id: number | null;
  item_ativo_pai_nome: string | null;
  descricao_item: string;
  quantidade: number;
  fornecedor_id: number;
  fornecedor_nome: string;
  tipo_servico: TipoServicoExterno;
  motivo: string | null;
  status_logistico: StatusLogisticoServicoExterno;
  status_pagamento: StatusPagamentoServicoExterno;
  data_previsao_retorno: string | null;
  data_envio: string | null;
  data_retorno: string | null;
  documento_saida: string | null;
  devolvido_ao_estoque: number;
  valor_orcado: number | null;
  valor_cobrado: number | null;
  valor_pago: number | null;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  motivo_cancelamento: string | null;
  observacoes: string | null;
  responsavel_id: number;
  responsavel_nome: string;
  criado_em: string;
  criado_por: number;
}

export const ROTULO_TIPO_SERVICO_EXTERNO: Record<TipoServicoExterno, string> = {
  usinagem: "Usinagem (torno)",
  solda: "Solda",
  retifica: "Retífica",
  calibracao: "Calibração",
  pintura: "Pintura",
  outro: "Outro",
};

export const ROTULO_STATUS_LOGISTICO_SERVICO_EXTERNO: Record<StatusLogisticoServicoExterno, string> = {
  pendente_envio: "Pendente de envio",
  enviado: "Enviado",
  retornado: "Retornado",
  cancelado: "Cancelado",
};

export const ROTULO_STATUS_PAGAMENTO_SERVICO_EXTERNO: Record<StatusPagamentoServicoExterno, string> = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
};

export type StatusSolicitacao = "aberta" | "em_analise" | "convertida_em_os" | "recusada";
export type PrioridadeSolicitacao = CriticidadeAtivo;

export type OrigemSolicitacao = "interna" | "globopac";

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

export interface DiaCalendario {
  data: string;
  gerada: boolean;
}

export interface MesCalendario {
  mes: number;
  dias: DiaCalendario[];
}

export interface LinhaCalendarioAnual {
  plano_id: number;
  plano_codigo: string;
  plano_nome: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  tipo_manutencao: TipoManutencao;
  periodicidade: Periodicidade;
  prioridade_padrao: CriticidadeAtivo;
  meses: MesCalendario[];
  total_ano: number;
}

export interface IndicadoresDashboard {
  periodo_dias: number;
  cumprimento_plano_pct: number | null;
  preventivas_no_prazo: number;
  preventivas_devidas: number;
  os_abertas: number;
  backlog_horas: number;
  pecas_em_ruptura: number;
}

export interface TempoExecucaoPorTipo {
  tipo: TipoOS;
  amostras: number;
  media_horas: number;
}

export interface TempoExecucaoPorAtivo {
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  amostras: number;
  media_horas: number;
}

export interface IndicadorTempoExecucao {
  periodo_inicio: string;
  periodo_fim: string;
  amostras: number;
  media_horas: number | null;
  por_tipo: TempoExecucaoPorTipo[];
  por_ativo: TempoExecucaoPorAtivo[];
}

export type PeriodicidadeSemanal = "semanal" | "quinzenal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

export interface PontoLubrificacao {
  id: number;
  codigo: string;
  ativo_id: number;
  descricao: string;
  especificacao: string | null;
  componente: string | null;
  periodicidade: PeriodicidadeSemanal;
  semana_base: number;
  duracao_estimada_horas: number;
  responsavel_padrao_id: number | null;
  responsavel_padrao_nome: string | null;
  prioridade_padrao: CriticidadeAtivo;
  instrucoes: string | null;
  ativo: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
}

export type StatusLoteLubrificacao = "simulado" | "confirmado" | "revertido";

export interface LoteGeracaoLubrificacao {
  id: number;
  codigo: string;
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  filtros_aplicados: string | null;
  quantidade_gerada: number;
  gerado_em: string;
  gerado_por: number;
  gerado_por_nome: string;
  status: StatusLoteLubrificacao;
  revertido_em: string | null;
  revertido_por: number | null;
}

export interface PontoDaOcorrenciaLubrificacao {
  id: number;
  codigo: string;
  descricao: string;
  especificacao: string | null;
  instrucoes: string | null;
  periodicidade: PeriodicidadeSemanal;
}

export interface OcorrenciaLubrificacaoSimulada {
  ponto_id: number;
  ponto_codigo: string;
  ponto_descricao: string;
  pontos: PontoDaOcorrenciaLubrificacao[];
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  prioridade: CriticidadeAtivo;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  data_prevista: string;
  data_ajustada: string;
  data_limite: string;
  horas_estimadas: number;
  chave_idempotencia: string;
  ja_gerada: boolean;
}

export interface AlertaSobrecargaLubrificacao {
  responsavel_id: number;
  responsavel_nome: string;
  data: string;
  horas_totais: number;
  limite_horas: number;
}

export interface ResultadoSimulacaoLubrificacao {
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  data_inicio: string;
  data_fim: string;
  tratamento_dia_nao_util: TratamentoDiaNaoUtil;
  ocorrencias: OcorrenciaLubrificacaoSimulada[];
  total_novas: number;
  total_ja_geradas: number;
  sobrecargas: AlertaSobrecargaLubrificacao[];
}

export interface SemanaCalendarioLubrificacao {
  semana: number;
  data: string;
  gerada: boolean;
}

export interface LinhaCalendarioLubrificacao {
  ponto_id: number;
  ponto_codigo: string;
  ponto_descricao: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  periodicidade: PeriodicidadeSemanal;
  prioridade_padrao: CriticidadeAtivo;
  semanas: SemanaCalendarioLubrificacao[];
  total_ano: number;
}

export interface PontoLubrificacaoTarefa {
  id: number;
  ponto_lubrificacao_id: number;
  ordem: number;
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: number;
  valor_min: number | null;
  valor_max: number | null;
  unidade: string | null;
  regime: Regime | null;
}

export type ClassePeriodicidadeInspecao = "A" | "B" | "C";
export type PrioridadePlanoInspecao = CriticidadeAtivo;

export interface PlanoInspecao {
  id: number;
  codigo: string;
  ativo_id: number;
  tag: string;
  setor: string | null;
  classe_periodicidade: ClassePeriodicidadeInspecao | null;
  intervalo_semanas: number | null;
  semana_base: number | null;
  duracao_estimada_horas: number;
  responsavel_padrao_id: number | null;
  responsavel_padrao_nome: string | null;
  prioridade_padrao: PrioridadePlanoInspecao;
  instrucoes: string | null;
  ativo: number;
  data_inicio_vigencia: string;
  data_fim_vigencia: string | null;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
}

export interface PlanoInspecaoTarefa {
  id: number;
  plano_inspecao_id: number;
  ordem: number;
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: number;
  valor_min: number | null;
  valor_max: number | null;
  unidade: string | null;
}

export type StatusLoteInspecao = "simulado" | "confirmado" | "revertido";

export interface LoteGeracaoInspecao {
  id: number;
  codigo: string;
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  filtros_aplicados: string | null;
  quantidade_gerada: number;
  gerado_em: string;
  gerado_por: number;
  gerado_por_nome: string;
  status: StatusLoteInspecao;
  revertido_em: string | null;
  revertido_por: number | null;
}

export interface OcorrenciaInspecaoSimulada {
  plano_id: number;
  plano_codigo: string;
  tag: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  classe_periodicidade: ClassePeriodicidadeInspecao | null;
  prioridade: CriticidadeAtivo;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  data_prevista: string;
  data_ajustada: string;
  data_limite: string;
  horas_estimadas: number;
  chave_idempotencia: string;
  ja_gerada: boolean;
}

export interface AlertaSobrecargaInspecao {
  responsavel_id: number;
  responsavel_nome: string;
  data: string;
  horas_totais: number;
  limite_horas: number;
}

export interface ResultadoSimulacaoInspecao {
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  data_inicio: string;
  data_fim: string;
  tratamento_dia_nao_util: TratamentoDiaNaoUtil;
  ocorrencias: OcorrenciaInspecaoSimulada[];
  total_novas: number;
  total_ja_geradas: number;
  sobrecargas: AlertaSobrecargaInspecao[];
}

export interface SemanaCalendarioInspecao {
  semana: number;
  data: string;
  gerada: boolean;
}

export interface LinhaCalendarioInspecao {
  plano_id: number;
  plano_codigo: string;
  tag: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  classe_periodicidade: ClassePeriodicidadeInspecao | null;
  prioridade_padrao: CriticidadeAtivo;
  semanas: SemanaCalendarioInspecao[];
  total_ano: number;
}

export interface OSPendenteAuditoria {
  id: number;
  codigo: string;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  tipo: string;
  descricao: string | null;
  responsavel_nome: string | null;
  data_conclusao: string | null;
}

export interface ItemAuditoria {
  id: number;
  os_auditoria_id: number;
  os_tarefa_original_id: number;
  conformidade: "conforme" | "divergente" | null;
  observacao: string | null;
  descricao: string;
  tipo_resposta: TipoResposta;
  resposta: string | null;
  valor_numerico: number | null;
  concluida: number;
}

export type SituacaoOcorrenciaPac = "normal" | "nao_realizada" | "reprogramada";

export interface ItemChecklistPac {
  descricao: string;
  regime: Regime | null;
  resposta: "Conforme" | "Não Conforme" | "Pendente";
}

export interface ExecucaoPac {
  situacao: SituacaoOcorrenciaPac;
  data_prevista: string;
  os_codigo: string | null;
  tipo: string | null;
  data_execucao: string | null;
  nova_data: string | null;
  checklist: ItemChecklistPac[];
}

export interface SecaoEquipamentoPac {
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  setor: string;
  origem_codigo: string;
  origem_descricao: string;
  execucoes: ExecucaoPac[];
}

export interface FiltrosRelatorioPac {
  setor?: string;
  ativoId?: number;
  ano: number;
  semanaInicio: number;
  semanaFim: number;
}

export interface RelatorioPac {
  codigo_documento: string;
  data_emissao: string;
  ano: number;
  semana_inicio: number;
  semana_fim: number;
  data_inicio: string;
  data_fim: string;
  filtros: FiltrosRelatorioPac;
  secoes: SecaoEquipamentoPac[];
}

export interface ItemChecklistOSRealizada {
  descricao: string;
  tipo_resposta: TipoResposta;
  resposta: string | null;
  valor_numerico: number | null;
  unidade: string | null;
  concluida: number;
  obrigatoria: number;
  regime: Regime | null;
}

export interface OSRealizada {
  id: number;
  codigo: string;
  tipo: TipoOS;
  origem: OrigemOS;
  ativo_id: number;
  ativo_codigo: string;
  ativo_nome: string;
  ativo_caminho: string;
  responsavel_nome: string | null;
  data_programada: string;
  data_conclusao: string | null;
  horas_reais: number | null;
  custo_mao_obra: number | null;
  custo_pecas: number | null;
  observacoes_execucao: string | null;
  resultado_inspecao: ResultadoInspecao | null;
  causa_falha: string | null;
  checklist: ItemChecklistOSRealizada[];
}

export type TratamentoDiaNaoUtil = "gerar_na_data" | "antecipar" | "postergar";

export interface Configuracoes {
  tratamento_dia_nao_util: TratamentoDiaNaoUtil;
  margem_seguranca_dias: number;
  limite_horas_dia_responsavel: number;
}

export interface Feriado {
  id: number;
  data: string;
  descricao: string;
}

export type AcaoAuditoria = "criar" | "editar" | "excluir" | "status";

export interface RegistroAuditoria {
  id: number;
  entidade: string;
  entidade_id: number | null;
  acao: AcaoAuditoria;
  valor_anterior: unknown;
  valor_novo: unknown;
  usuario_id: number | null;
  usuario_nome: string | null;
  data: string;
  ip: string | null;
}

export interface Usuario {
  id: number;
  nome: string;
  matricula: string;
  email: string | null;
  setor: string | null;
  cargo: string | null;
  ativo: number;
  custo_hora_padrao: number;
  perfil_id: number;
  perfil_nome: string;
  permissoes: MapaPermissoes;
  somente_leitura: number;
}
