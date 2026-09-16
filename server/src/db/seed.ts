import bcrypt from "bcryptjs";
import { dbGet, dbAll, dbRun, pool } from "./pg.js";
import { migrate } from "./migrate.js";
import type { MapaPermissoes } from "../permissions.js";

const TUDO: MapaPermissoes = {
  ativos: ["ver", "criar", "editar", "excluir", "exportar"],
  pecas: ["ver", "criar", "editar", "excluir", "exportar"],
  planos: ["ver", "criar", "editar", "excluir", "exportar"],
  geracao_lote: ["ver", "criar", "aprovar", "exportar"],
  lubrificacao: ["ver", "criar", "editar", "excluir", "aprovar", "exportar"],
  inspecoes: ["ver", "criar", "editar", "excluir", "aprovar", "exportar"],
  ordens_servico: ["ver", "criar", "editar", "editar_completo", "reabrir", "excluir", "aprovar", "exportar"],
  solicitacoes: ["ver", "criar", "editar", "aprovar", "exportar"],
  almoxarifado: ["ver", "criar", "editar", "exportar"],
  programacao_compras: ["ver", "criar", "aprovar", "exportar"],
  usuarios: ["ver", "criar", "editar", "excluir"],
  configuracoes: ["ver", "editar"],
  auditoria: ["ver", "exportar"],
  indicadores: ["ver", "exportar"],
};

const COORDENADOR: MapaPermissoes = { ...TUDO };
delete (COORDENADOR as any).usuarios;
delete (COORDENADOR as any).configuracoes;

const PERFIS: { nome: string; descricao: string; permissoes: MapaPermissoes; somente_leitura?: boolean }[] = [
  { nome: "Administrador", descricao: "Acesso total, incluindo configurações e auditoria", permissoes: TUDO },
  { nome: "Coordenador de PCM", descricao: "Tudo, exceto configurações de sistema e gestão de usuários", permissoes: COORDENADOR },
  {
    nome: "Planejador",
    descricao: "Planos, geração de lote, programação de compras, OS",
    permissoes: {
      ativos: ["ver", "editar"],
      pecas: ["ver"],
      planos: ["ver", "criar", "editar", "exportar"],
      geracao_lote: ["ver", "criar", "aprovar", "exportar"],
      lubrificacao: ["ver", "criar", "editar", "aprovar", "exportar"],
      inspecoes: ["ver", "criar", "editar", "aprovar", "exportar"],
      ordens_servico: ["ver", "criar", "editar", "editar_completo", "reabrir", "exportar"],
      solicitacoes: ["ver"],
      almoxarifado: ["ver"],
      programacao_compras: ["ver", "criar", "aprovar", "exportar"],
      indicadores: ["ver", "exportar"],
    },
  },
  {
    nome: "Supervisor de manutenção",
    descricao: "OS do seu setor, execução, apontamento",
    permissoes: {
      ativos: ["ver"],
      pecas: ["ver"],
      ordens_servico: ["ver", "editar", "editar_completo", "reabrir", "exportar"],
      solicitacoes: ["ver"],
      inspecoes: ["ver", "criar", "editar", "exportar"],
      indicadores: ["ver"],
    },
  },
  {
    nome: "Técnico",
    descricao: "Apenas OS atribuídas a ele, execução e apontamento",
    permissoes: {
      ordens_servico: ["ver", "editar"],
      ativos: ["ver"],
      pecas: ["ver"],
    },
  },
  {
    nome: "Inspetor",
    descricao: "Executa inspeções de equipamentos e conferências de OS atribuídas a ele",
    permissoes: {
      inspecoes: ["ver", "editar"],
      ordens_servico: ["ver", "editar"],
      ativos: ["ver"],
    },
  },
  {
    nome: "Almoxarife",
    descricao: "Peças, estoque, movimentos, requisições",
    permissoes: {
      pecas: ["ver", "criar", "editar", "exportar"],
      almoxarifado: ["ver", "criar", "editar", "exportar"],
      programacao_compras: ["ver", "criar"],
      ativos: ["ver"],
    },
  },
  {
    nome: "Solicitante",
    descricao: "Apenas abre solicitações e acompanha as próprias",
    permissoes: {
      solicitacoes: ["ver", "criar"],
      ativos: ["ver"],
      // "ver" (só leitura, sem editar/aprovar/excluir) para que quem abriu a solicitação consiga
      // acompanhar, na tela da OS gerada, a programação (data programada/limite) e o checklist de
      // serviços definidos na conversão — mesmo recorte amplo (sem restrição por linha) já aceito
      // para Técnico/Supervisor em ordens_servico, ver ressalva no README.
      ordens_servico: ["ver"],
    },
  },
  {
    nome: "Consulta",
    descricao: "Somente leitura, sem exportação",
    somente_leitura: true,
    permissoes: {
      ativos: ["ver"],
      pecas: ["ver"],
      planos: ["ver"],
      ordens_servico: ["ver"],
      solicitacoes: ["ver"],
      almoxarifado: ["ver"],
      programacao_compras: ["ver"],
      indicadores: ["ver"],
    },
  },
];

const USUARIOS: {
  nome: string;
  matricula: string;
  email: string;
  senha: string;
  perfil: string;
  setor: string;
  cargo: string;
  custoHoraPadrao?: number;
  ativo?: boolean;
}[] = [
  { nome: "Ana Beatriz Souza", matricula: "0001", email: "ana.souza@sigma.local", senha: "sigma123", perfil: "Administrador", setor: "TI/PCM", cargo: "Administradora do sistema" },
  { nome: "Carlos Eduardo Lima", matricula: "0002", email: "carlos.lima@sigma.local", senha: "sigma123", perfil: "Coordenador de PCM", setor: "PCM", cargo: "Coordenador de PCM" },
  { nome: "Fernanda Ribeiro", matricula: "0003", email: "fernanda.ribeiro@sigma.local", senha: "sigma123", perfil: "Planejador", setor: "PCM", cargo: "Planejadora de manutenção" },
  { nome: "João Paulo Nascimento", matricula: "0004", email: "joao.nascimento@sigma.local", senha: "sigma123", perfil: "Supervisor de manutenção", setor: "Sala de Máquinas", cargo: "Supervisor de manutenção", custoHoraPadrao: 65 },
  { nome: "Ricardo Alves", matricula: "0005", email: "ricardo.alves@sigma.local", senha: "sigma123", perfil: "Técnico", setor: "Evisceração", cargo: "Técnico de manutenção", custoHoraPadrao: 45 },
  { nome: "Marcos Vinícius Teixeira", matricula: "0006", email: "marcos.teixeira@sigma.local", senha: "sigma123", perfil: "Almoxarife", setor: "Almoxarifado", cargo: "Almoxarife" },
  { nome: "Patrícia Gomes", matricula: "0007", email: "patricia.gomes@sigma.local", senha: "sigma123", perfil: "Solicitante", setor: "Sala de Cortes", cargo: "Líder de produção" },
  { nome: "Sérgio Henrique Barros", matricula: "0008", email: "sergio.barros@sigma.local", senha: "sigma123", perfil: "Consulta", setor: "Qualidade (SIF)", cargo: "Analista de qualidade" },
  { nome: "Vanessa Cordeiro", matricula: "0010", email: "vanessa.cordeiro@sigma.local", senha: "sigma123", perfil: "Inspetor", setor: "PCM", cargo: "Inspetora de manutenção", custoHoraPadrao: 40 },
  {
    nome: "Integração GloboPac",
    matricula: "9000",
    email: "integracao.globopac@sigma.local",
    senha: "integracao-globopac-nao-faz-login-" + Math.random().toString(36).slice(2),
    perfil: "Administrador",
    setor: "Integrações",
    cargo: "Conta de sistema (não efetua login)",
    ativo: false,
  },
];

async function seed() {
  await migrate();

  for (const p of PERFIS) {
    await dbRun(
      `INSERT INTO perfil (nome, descricao, permissoes, somente_leitura) VALUES (?, ?, ?, ?)
       ON CONFLICT(nome) DO UPDATE SET descricao = excluded.descricao, permissoes = excluded.permissoes, somente_leitura = excluded.somente_leitura`,
      [p.nome, p.descricao, JSON.stringify(p.permissoes), p.somente_leitura ? 1 : 0]
    );
  }

  const perfilIdByNome = new Map<string, number>();
  for (const row of await dbAll<{ id: number; nome: string }>("SELECT id, nome FROM perfil")) {
    perfilIdByNome.set(row.nome, row.id);
  }

  for (const u of USUARIOS) {
    const perfilId = perfilIdByNome.get(u.perfil);
    if (!perfilId) continue;
    const hash = bcrypt.hashSync(u.senha, 10);
    await dbRun(
      `INSERT INTO usuario (nome, matricula, email, senha_hash, perfil_id, setor, cargo, ativo, custo_hora_padrao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (matricula) DO NOTHING`,
      [u.nome, u.matricula, u.email, hash, perfilId, u.setor, u.cargo, u.ativo === false ? 0 : 1, u.custoHoraPadrao ?? 0]
    );
  }

  const feriados = [
    ["2026-01-01", "Confraternização Universal"],
    ["2026-04-21", "Tiradentes"],
    ["2026-05-01", "Dia do Trabalho"],
    ["2026-09-07", "Independência do Brasil"],
    ["2026-11-15", "Proclamação da República"],
    ["2026-12-25", "Natal"],
  ];
  for (const [data, descricao] of feriados) {
    await dbRun("INSERT INTO feriado (data, descricao) VALUES (?, ?) ON CONFLICT (data) DO NOTHING", [data, descricao]);
  }

  await dbRun("INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO NOTHING", [
    "tratamento_dia_nao_util",
    JSON.stringify("gerar_na_data"),
  ]);
  await dbRun("INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO NOTHING", [
    "margem_seguranca_dias",
    JSON.stringify(7),
  ]);
  await dbRun("INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO NOTHING", [
    "limite_horas_dia_responsavel",
    JSON.stringify(8),
  ]);

  const admin = await dbGet<{ id: number }>("SELECT id FROM usuario WHERE matricula = '0001'");
  const adminId = admin?.id ?? null;

  const totalAtivos = await seedAtivos(adminId);
  const totalPecas = await seedPecas();
  const totalVinculos = await seedAtivoPeca();

  console.log(`Seed concluído: ${PERFIS.length} perfis, ${USUARIOS.length} usuários, ${feriados.length} feriados.`);
  console.log(`Ativos: ${totalAtivos} · Peças: ${totalPecas} · Vínculos peça↔ativo: ${totalVinculos}`);
  console.log("Login de exemplo: matrícula 0001 / senha sigma123 (Administrador)");
}

interface AtivoSeed {
  codigo: string;
  nome: string;
  paiCodigo: string | null;
  tipo: "instalacao" | "equipamento" | "componente";
  setor: string;
  criticidade: "baixa" | "media" | "alta" | "critica";
  status: "operando" | "parado" | "em_manutencao" | "desativado";
  fabricante?: string;
  modelo?: string;
}

const ATIVOS: AtivoSeed[] = [
  // Instalações (nível 0)
  { codigo: "ATV-0001", nome: "Sala de Máquinas", paiCodigo: null, tipo: "instalacao", setor: "Sala de Máquinas", criticidade: "alta", status: "operando" },
  { codigo: "ATV-0002", nome: "Escaldagem e Depena", paiCodigo: null, tipo: "instalacao", setor: "Escaldagem e Depena", criticidade: "alta", status: "operando" },
  { codigo: "ATV-0003", nome: "Evisceração", paiCodigo: null, tipo: "instalacao", setor: "Evisceração", criticidade: "alta", status: "operando" },
  { codigo: "ATV-0004", nome: "Câmaras Frias", paiCodigo: null, tipo: "instalacao", setor: "Câmaras Frias", criticidade: "critica", status: "operando" },
  { codigo: "ATV-0005", nome: "Sala de Cortes", paiCodigo: null, tipo: "instalacao", setor: "Sala de Cortes", criticidade: "media", status: "operando" },
  { codigo: "ATV-0006", nome: "Utilidades", paiCodigo: null, tipo: "instalacao", setor: "Utilidades", criticidade: "alta", status: "operando" },

  // Equipamentos (nível 1)
  { codigo: "ATV-0007", nome: "Compressor de Amônia 01", paiCodigo: "ATV-0001", tipo: "equipamento", setor: "Sala de Máquinas", criticidade: "critica", status: "operando", fabricante: "Frick", modelo: "RXF-45" },
  { codigo: "ATV-0008", nome: "Compressor de Amônia 02", paiCodigo: "ATV-0001", tipo: "equipamento", setor: "Sala de Máquinas", criticidade: "critica", status: "operando", fabricante: "Frick", modelo: "RXF-45" },
  { codigo: "ATV-0009", nome: "Gerador Diesel de Emergência", paiCodigo: "ATV-0001", tipo: "equipamento", setor: "Sala de Máquinas", criticidade: "alta", status: "parado", fabricante: "Stemac" },
  { codigo: "ATV-0010", nome: "Escaldadeira 01", paiCodigo: "ATV-0002", tipo: "equipamento", setor: "Escaldagem e Depena", criticidade: "critica", status: "operando" },
  { codigo: "ATV-0011", nome: "Depenadeira 01", paiCodigo: "ATV-0002", tipo: "equipamento", setor: "Escaldagem e Depena", criticidade: "alta", status: "operando", fabricante: "Marel" },
  { codigo: "ATV-0012", nome: "Depenadeira 02", paiCodigo: "ATV-0002", tipo: "equipamento", setor: "Escaldagem e Depena", criticidade: "alta", status: "operando", fabricante: "Marel" },
  { codigo: "ATV-0013", nome: "Depenadeira 03", paiCodigo: "ATV-0002", tipo: "equipamento", setor: "Escaldagem e Depena", criticidade: "alta", status: "em_manutencao", fabricante: "Marel" },
  { codigo: "ATV-0014", nome: "Esteira de Evisceração 01", paiCodigo: "ATV-0003", tipo: "equipamento", setor: "Evisceração", criticidade: "alta", status: "operando" },
  { codigo: "ATV-0015", nome: "Esteira de Evisceração 02", paiCodigo: "ATV-0003", tipo: "equipamento", setor: "Evisceração", criticidade: "alta", status: "operando" },
  { codigo: "ATV-0016", nome: "Câmara Fria 01", paiCodigo: "ATV-0004", tipo: "equipamento", setor: "Câmaras Frias", criticidade: "critica", status: "operando" },
  { codigo: "ATV-0017", nome: "Câmara Fria 02", paiCodigo: "ATV-0004", tipo: "equipamento", setor: "Câmaras Frias", criticidade: "critica", status: "operando" },
  { codigo: "ATV-0018", nome: "Túnel de Congelamento 01", paiCodigo: "ATV-0004", tipo: "equipamento", setor: "Câmaras Frias", criticidade: "critica", status: "operando" },
  { codigo: "ATV-0019", nome: "Serra Fita 01", paiCodigo: "ATV-0005", tipo: "equipamento", setor: "Sala de Cortes", criticidade: "media", status: "operando" },
  { codigo: "ATV-0020", nome: "Serra Fita 02", paiCodigo: "ATV-0005", tipo: "equipamento", setor: "Sala de Cortes", criticidade: "media", status: "operando" },
  { codigo: "ATV-0021", nome: "Caldeira 01", paiCodigo: "ATV-0006", tipo: "equipamento", setor: "Utilidades", criticidade: "critica", status: "operando" },
  { codigo: "ATV-0022", nome: "ETA — Estação de Tratamento de Água", paiCodigo: "ATV-0006", tipo: "equipamento", setor: "Utilidades", criticidade: "alta", status: "operando" },
  { codigo: "ATV-0023", nome: "ETE — Estação de Tratamento de Efluentes", paiCodigo: "ATV-0006", tipo: "equipamento", setor: "Utilidades", criticidade: "alta", status: "operando" },

  // Componentes (nível 2)
  { codigo: "ATV-0024", nome: "Motor Elétrico Principal", paiCodigo: "ATV-0007", tipo: "componente", setor: "Sala de Máquinas", criticidade: "critica", status: "operando" },
  { codigo: "ATV-0025", nome: "Válvula de Expansão", paiCodigo: "ATV-0007", tipo: "componente", setor: "Sala de Máquinas", criticidade: "alta", status: "operando" },
  { codigo: "ATV-0026", nome: "Motor Elétrico Principal", paiCodigo: "ATV-0008", tipo: "componente", setor: "Sala de Máquinas", criticidade: "critica", status: "operando" },
  { codigo: "ATV-0027", nome: "Motor de Acionamento", paiCodigo: "ATV-0011", tipo: "componente", setor: "Escaldagem e Depena", criticidade: "alta", status: "operando" },
];

async function seedAtivos(adminId: number | null): Promise<number> {
  const idsByCodigo = new Map<string, number>();
  for (const a of ATIVOS) {
    const paiId = a.paiCodigo ? idsByCodigo.get(a.paiCodigo) ?? null : null;
    await dbRun(
      `INSERT INTO ativo (codigo, nome, ativo_pai_id, tipo, setor, criticidade, status, fabricante, modelo, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (codigo) DO NOTHING`,
      [a.codigo, a.nome, paiId, a.tipo, a.setor, a.criticidade, a.status, a.fabricante ?? null, a.modelo ?? null, adminId]
    );
    const row = (await dbGet<{ id: number }>("SELECT id FROM ativo WHERE codigo = ?", [a.codigo]))!;
    idsByCodigo.set(a.codigo, row.id);
  }
  return ATIVOS.length;
}

interface PecaSeed {
  codigo: string;
  descricao: string;
  categoria: string;
  unidade_medida: "un" | "m" | "kg" | "l" | "cx" | "par" | "rolo";
  lead_time_dias: number;
  estoque_atual: number;
  estoque_minimo: number;
  custo_unitario_medio: number;
}

const PECAS: PecaSeed[] = [
  { codigo: "PC-00001", descricao: "Rolamento 6205-2RS", categoria: "Rolamento", unidade_medida: "un", lead_time_dias: 10, estoque_atual: 12, estoque_minimo: 5, custo_unitario_medio: 38 },
  { codigo: "PC-00002", descricao: "Rolamento 6309-2Z", categoria: "Rolamento", unidade_medida: "un", lead_time_dias: 15, estoque_atual: 3, estoque_minimo: 5, custo_unitario_medio: 92 },
  { codigo: "PC-00003", descricao: "Correia em V A-58", categoria: "Correia", unidade_medida: "un", lead_time_dias: 7, estoque_atual: 8, estoque_minimo: 4, custo_unitario_medio: 45 },
  { codigo: "PC-00004", descricao: "Correia Dentada HTD 1200-8M", categoria: "Correia", unidade_medida: "un", lead_time_dias: 20, estoque_atual: 2, estoque_minimo: 4, custo_unitario_medio: 180 },
  { codigo: "PC-00005", descricao: "Retentor de Óleo 40x62x8", categoria: "Retentor", unidade_medida: "un", lead_time_dias: 12, estoque_atual: 20, estoque_minimo: 6, custo_unitario_medio: 22 },
  { codigo: "PC-00006", descricao: "Retentor de Óleo 60x85x10", categoria: "Retentor", unidade_medida: "un", lead_time_dias: 12, estoque_atual: 6, estoque_minimo: 6, custo_unitario_medio: 31 },
  { codigo: "PC-00007", descricao: "Filtro de Óleo do Compressor de Amônia", categoria: "Filtro", unidade_medida: "un", lead_time_dias: 25, estoque_atual: 15, estoque_minimo: 8, custo_unitario_medio: 210 },
  { codigo: "PC-00008", descricao: "Filtro de Ar Industrial", categoria: "Filtro", unidade_medida: "un", lead_time_dias: 10, estoque_atual: 10, estoque_minimo: 5, custo_unitario_medio: 65 },
  { codigo: "PC-00009", descricao: "Óleo de Compressor de Amônia ISO 68", categoria: "Lubrificante", unidade_medida: "l", lead_time_dias: 30, estoque_atual: 120, estoque_minimo: 40, custo_unitario_medio: 28 },
  { codigo: "PC-00010", descricao: "Graxa Industrial EP2", categoria: "Lubrificante", unidade_medida: "kg", lead_time_dias: 15, estoque_atual: 25, estoque_minimo: 10, custo_unitario_medio: 34 },
  { codigo: "PC-00011", descricao: "Faca Industrial de Corte Curva", categoria: "Faca", unidade_medida: "un", lead_time_dias: 20, estoque_atual: 30, estoque_minimo: 12, custo_unitario_medio: 55 },
  { codigo: "PC-00012", descricao: "Faca Industrial Reta Inox", categoria: "Faca", unidade_medida: "un", lead_time_dias: 20, estoque_atual: 18, estoque_minimo: 12, custo_unitario_medio: 48 },
  { codigo: "PC-00013", descricao: "Dedo de Borracha para Depenadeira", categoria: "Borracharia", unidade_medida: "un", lead_time_dias: 18, estoque_atual: 200, estoque_minimo: 100, custo_unitario_medio: 4.5 },
  { codigo: "PC-00014", descricao: "Dedo de Borracha Reforçado", categoria: "Borracharia", unidade_medida: "un", lead_time_dias: 22, estoque_atual: 40, estoque_minimo: 80, custo_unitario_medio: 6.2 },
  { codigo: "PC-00015", descricao: "Corrente Transportadora Passo 38,1mm", categoria: "Corrente", unidade_medida: "m", lead_time_dias: 35, estoque_atual: 50, estoque_minimo: 20, custo_unitario_medio: 62 },
  { codigo: "PC-00016", descricao: "Elo de Emenda para Corrente Transportadora", categoria: "Corrente", unidade_medida: "un", lead_time_dias: 15, estoque_atual: 40, estoque_minimo: 15, custo_unitario_medio: 12 },
  { codigo: "PC-00017", descricao: "Contator Tripolar 40A", categoria: "Elétrica", unidade_medida: "un", lead_time_dias: 10, estoque_atual: 6, estoque_minimo: 3, custo_unitario_medio: 140 },
  { codigo: "PC-00018", descricao: "Contator Tripolar 95A", categoria: "Elétrica", unidade_medida: "un", lead_time_dias: 18, estoque_atual: 2, estoque_minimo: 3, custo_unitario_medio: 320 },
  { codigo: "PC-00019", descricao: "Sensor de Temperatura PT100", categoria: "Instrumentação", unidade_medida: "un", lead_time_dias: 25, estoque_atual: 8, estoque_minimo: 4, custo_unitario_medio: 175 },
  { codigo: "PC-00020", descricao: "Gaxeta de Vedação para Válvula", categoria: "Gaxeta", unidade_medida: "un", lead_time_dias: 12, estoque_atual: 25, estoque_minimo: 10, custo_unitario_medio: 9 },
  { codigo: "PC-00021", descricao: "Válvula Solenoide de Amônia 3/4\"", categoria: "Válvula", unidade_medida: "un", lead_time_dias: 45, estoque_atual: 4, estoque_minimo: 3, custo_unitario_medio: 480 },
  { codigo: "PC-00022", descricao: "Válvula de Expansão Termostática", categoria: "Válvula", unidade_medida: "un", lead_time_dias: 50, estoque_atual: 2, estoque_minimo: 2, custo_unitario_medio: 620 },
  { codigo: "PC-00023", descricao: "Rolamento de Esferas 6003-2RS", categoria: "Rolamento", unidade_medida: "un", lead_time_dias: 8, estoque_atual: 15, estoque_minimo: 6, custo_unitario_medio: 29 },
  { codigo: "PC-00024", descricao: "Mancal Flangeado UCF 205", categoria: "Mancal", unidade_medida: "un", lead_time_dias: 20, estoque_atual: 5, estoque_minimo: 4, custo_unitario_medio: 88 },
  { codigo: "PC-00025", descricao: "Kit de Reparo para Compressor de Amônia", categoria: "Kit de Reparo", unidade_medida: "cx", lead_time_dias: 60, estoque_atual: 1, estoque_minimo: 2, custo_unitario_medio: 1450 },
];

async function seedPecas(): Promise<number> {
  for (const p of PECAS) {
    // Sem histórico de consumo pra calcular ponto de pedido de verdade (média diária × lead time),
    // usa uma folga simples de 50% sobre o mínimo — só pra o alerta de reposição (Fase 7) ter um
    // segundo patamar de aviso além do "abaixo do mínimo".
    const pontoDePedido = Math.ceil(p.estoque_minimo * 1.5);
    await dbRun(
      `INSERT INTO peca (codigo, descricao, unidade_medida, categoria, estoque_atual, estoque_minimo, ponto_de_pedido, lead_time_dias, custo_unitario_medio, ativa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT (codigo) DO NOTHING`,
      [p.codigo, p.descricao, p.unidade_medida, p.categoria, p.estoque_atual, p.estoque_minimo, pontoDePedido, p.lead_time_dias, p.custo_unitario_medio]
    );
  }
  return PECAS.length;
}

interface VinculoSeed {
  ativoCodigo: string;
  pecaCodigo: string;
  quantidade_padrao: number;
  aplicacao: string;
  trocaObrigatoria: boolean;
}

const VINCULOS: VinculoSeed[] = [
  { ativoCodigo: "ATV-0007", pecaCodigo: "PC-00009", quantidade_padrao: 15, aplicacao: "Carter do compressor", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0007", pecaCodigo: "PC-00007", quantidade_padrao: 1, aplicacao: "Linha de óleo", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0007", pecaCodigo: "PC-00021", quantidade_padrao: 1, aplicacao: "Linha de sucção", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0008", pecaCodigo: "PC-00009", quantidade_padrao: 15, aplicacao: "Carter do compressor", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0008", pecaCodigo: "PC-00007", quantidade_padrao: 1, aplicacao: "Linha de óleo", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0008", pecaCodigo: "PC-00021", quantidade_padrao: 1, aplicacao: "Linha de sucção", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0024", pecaCodigo: "PC-00005", quantidade_padrao: 2, aplicacao: "Eixo do motor", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0026", pecaCodigo: "PC-00005", quantidade_padrao: 2, aplicacao: "Eixo do motor", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0025", pecaCodigo: "PC-00022", quantidade_padrao: 1, aplicacao: "Corpo da válvula", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0011", pecaCodigo: "PC-00013", quantidade_padrao: 48, aplicacao: "Rolo de depenagem", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0012", pecaCodigo: "PC-00013", quantidade_padrao: 48, aplicacao: "Rolo de depenagem", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0013", pecaCodigo: "PC-00013", quantidade_padrao: 48, aplicacao: "Rolo de depenagem", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0011", pecaCodigo: "PC-00001", quantidade_padrao: 4, aplicacao: "Mancais do rolo", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0012", pecaCodigo: "PC-00001", quantidade_padrao: 4, aplicacao: "Mancais do rolo", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0013", pecaCodigo: "PC-00001", quantidade_padrao: 4, aplicacao: "Mancais do rolo", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0027", pecaCodigo: "PC-00003", quantidade_padrao: 2, aplicacao: "Transmissão do motor", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0014", pecaCodigo: "PC-00024", quantidade_padrao: 6, aplicacao: "Suportes da esteira", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0015", pecaCodigo: "PC-00024", quantidade_padrao: 6, aplicacao: "Suportes da esteira", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0014", pecaCodigo: "PC-00015", quantidade_padrao: 12, aplicacao: "Trecho de arraste", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0015", pecaCodigo: "PC-00015", quantidade_padrao: 12, aplicacao: "Trecho de arraste", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0014", pecaCodigo: "PC-00016", quantidade_padrao: 4, aplicacao: "Emendas da corrente", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0019", pecaCodigo: "PC-00011", quantidade_padrao: 3, aplicacao: "Lâmina de corte", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0020", pecaCodigo: "PC-00011", quantidade_padrao: 3, aplicacao: "Lâmina de corte", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0019", pecaCodigo: "PC-00012", quantidade_padrao: 2, aplicacao: "Faca auxiliar", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0016", pecaCodigo: "PC-00019", quantidade_padrao: 2, aplicacao: "Controle de temperatura", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0017", pecaCodigo: "PC-00019", quantidade_padrao: 2, aplicacao: "Controle de temperatura", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0018", pecaCodigo: "PC-00019", quantidade_padrao: 3, aplicacao: "Controle de temperatura", trocaObrigatoria: true },
  { ativoCodigo: "ATV-0021", pecaCodigo: "PC-00017", quantidade_padrao: 2, aplicacao: "Painel de comando", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0009", pecaCodigo: "PC-00018", quantidade_padrao: 1, aplicacao: "Painel de partida", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0009", pecaCodigo: "PC-00010", quantidade_padrao: 3, aplicacao: "Lubrificação geral", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0022", pecaCodigo: "PC-00020", quantidade_padrao: 6, aplicacao: "Válvulas de dosagem", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0023", pecaCodigo: "PC-00020", quantidade_padrao: 6, aplicacao: "Válvulas de dosagem", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0007", pecaCodigo: "PC-00025", quantidade_padrao: 1, aplicacao: "Manutenção geral do compressor", trocaObrigatoria: false },
  { ativoCodigo: "ATV-0008", pecaCodigo: "PC-00025", quantidade_padrao: 1, aplicacao: "Manutenção geral do compressor", trocaObrigatoria: false },
];

async function seedAtivoPeca(): Promise<number> {
  let total = 0;
  for (const v of VINCULOS) {
    const ativo = await dbGet<{ id: number }>("SELECT id FROM ativo WHERE codigo = ?", [v.ativoCodigo]);
    const peca = await dbGet<{ id: number }>("SELECT id FROM peca WHERE codigo = ?", [v.pecaCodigo]);
    if (!ativo || !peca) continue;
    await dbRun(
      `INSERT INTO ativo_peca (ativo_id, peca_id, quantidade_padrao, aplicacao, posicao, troca_obrigatoria)
       VALUES (?, ?, ?, ?, '', ?) ON CONFLICT (ativo_id, peca_id, posicao) DO NOTHING`,
      [ativo.id, peca.id, v.quantidade_padrao, v.aplicacao, v.trocaObrigatoria ? 1 : 0]
    );
    total++;
  }
  return total;
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
