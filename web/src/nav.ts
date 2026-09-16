import type { Modulo } from "./lib/permissions";

export interface ItemNav {
  rotulo: string;
  caminho: string;
  icone: string;
  modulo: Modulo;
}

export interface GrupoNav {
  titulo: string;
  itens: ItemNav[];
}

export const NAVEGACAO: GrupoNav[] = [
  {
    titulo: "Visão geral",
    itens: [
      { rotulo: "Indicadores", caminho: "/", icone: "📊", modulo: "indicadores" },
      { rotulo: "BI", caminho: "/bi", icone: "📈", modulo: "indicadores" },
    ],
  },
  {
    titulo: "Ativos e peças",
    itens: [
      { rotulo: "Ativos", caminho: "/ativos", icone: "🏭", modulo: "ativos" },
      { rotulo: "Peças", caminho: "/pecas", icone: "🔩", modulo: "pecas" },
    ],
  },
  {
    titulo: "Manutenção",
    itens: [
      { rotulo: "Planos de manutenção", caminho: "/planos", icone: "🧰", modulo: "planos" },
      { rotulo: "Calendário anual", caminho: "/planos/calendario", icone: "📅", modulo: "planos" },
      { rotulo: "Ordens de serviço", caminho: "/ordens-servico", icone: "🧾", modulo: "ordens_servico" },
      { rotulo: "Calendário de OS", caminho: "/ordens-servico/calendario", icone: "🗓️", modulo: "ordens_servico" },
      { rotulo: "Gerar OS em lote", caminho: "/ordens-servico/gerar-lote", icone: "⚡", modulo: "geracao_lote" },
      { rotulo: "Solicitações", caminho: "/solicitacoes", icone: "✉️", modulo: "solicitacoes" },
      { rotulo: "Relatório PAC 001_1150", caminho: "/relatorios/pac-1150", icone: "📋", modulo: "ordens_servico" },
      { rotulo: "Relatório de OS realizadas", caminho: "/relatorios/os-realizadas", icone: "📄", modulo: "ordens_servico" },
    ],
  },
  {
    titulo: "Lubrificação",
    itens: [
      { rotulo: "Pontos de lubrificação", caminho: "/lubrificacao/pontos", icone: "🛢️", modulo: "lubrificacao" },
      { rotulo: "Calendário de lubrificação", caminho: "/lubrificacao/calendario", icone: "🗓️", modulo: "lubrificacao" },
      { rotulo: "Gerar OS em lote", caminho: "/lubrificacao/gerar-lote", icone: "⚡", modulo: "lubrificacao" },
      { rotulo: "Relatório PAC 001_1149", caminho: "/relatorios/pac-1149", icone: "📋", modulo: "lubrificacao" },
      {
        rotulo: "Relatório de OS realizadas",
        caminho: "/relatorios/os-realizadas?tipo=lubrificacao",
        icone: "📄",
        modulo: "lubrificacao",
      },
    ],
  },
  {
    titulo: "Inspeções",
    itens: [
      { rotulo: "Inspeções", caminho: "/inspecoes", icone: "🔍", modulo: "inspecoes" },
      { rotulo: "Planos de inspeção", caminho: "/inspecoes/planos", icone: "🗂️", modulo: "inspecoes" },
      { rotulo: "Calendário de inspeções", caminho: "/inspecoes/calendario", icone: "🗓️", modulo: "inspecoes" },
      { rotulo: "Gerar inspeções em lote", caminho: "/inspecoes/gerar-lote", icone: "⚡", modulo: "inspecoes" },
      { rotulo: "Conferência de OS", caminho: "/inspecoes/auditorias", icone: "✅", modulo: "inspecoes" },
    ],
  },
  {
    titulo: "Suprimentos",
    itens: [
      { rotulo: "Almoxarifado", caminho: "/almoxarifado", icone: "📦", modulo: "almoxarifado" },
      { rotulo: "Curva ABC de peças", caminho: "/almoxarifado/curva-abc", icone: "🔤", modulo: "almoxarifado" },
      { rotulo: "Importar estoque", caminho: "/almoxarifado/importar-estoque", icone: "📥", modulo: "almoxarifado" },
      { rotulo: "Programação de compras", caminho: "/programacao-compras", icone: "🛒", modulo: "programacao_compras" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { rotulo: "Usuários e perfis", caminho: "/usuarios", icone: "👥", modulo: "usuarios" },
      { rotulo: "Equipes", caminho: "/equipes", icone: "👷", modulo: "equipes" },
      { rotulo: "Configurações", caminho: "/configuracoes", icone: "⚙️", modulo: "configuracoes" },
      { rotulo: "Auditoria", caminho: "/auditoria", icone: "📜", modulo: "auditoria" },
    ],
  },
];
