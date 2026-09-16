import * as XLSX from "xlsx";
import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { ErroValidacaoEstoque, registrarAjuste } from "./estoqueService.js";

export class ErroValidacaoImportacao extends Error {}

// Faixa Unicode dos sinais diacríticos combinantes (acentos) isolados por normalize("NFD").
// Construída a partir dos code points (0x0300-0x036f) em vez de caracteres literais no fonte,
// pra não depender do arquivo preservar bytes de combining marks corretamente.
const DIACRITICOS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

/**
 * O pacote "xlsx" publicado no registro do npm (0.18.5) tem duas vulnerabilidades de alta
 * severidade sem correção lá — prototype pollution e ReDoS (GHSA-4r6h-8v6p-xvw6 e
 * GHSA-5pgg-2g8v-p4x9), justamente no parsing de arquivo, que aqui é dado não confiável (upload
 * do usuário). A própria SheetJS parou de publicar no npm por causa de uma disputa com o
 * registro, mas segue lançando versões corrigidas no CDN oficial deles — é o pacote instalado
 * aqui (ver package.json: "xlsx" aponta pro tarball do cdn.sheetjs.com, não pro npm). A 0.20.3
 * já inclui as duas correções (CHANGELOG.md do pacote: v0.19.3 e v0.20.2).
 */
interface Aba {
  nomeAba: string;
  linhas: string[][];
}

/**
 * Lê TODAS as abas (não só a primeira) — é comum a planilha vir separada em "uma aba tem os
 * códigos com os nomes dos itens, a outra tem os códigos com as quantidades". A aba certa (a que
 * tem código + quantidade juntos) é escolhida depois, em `selecionarAba`.
 */
function parseBinario(buffer: Buffer): Aba[] {
  const livro = XLSX.read(buffer, { type: "buffer" });
  if (livro.SheetNames.length === 0) {
    throw new ErroValidacaoImportacao("A planilha não tem nenhuma aba com dados.");
  }
  return livro.SheetNames.map((nomeAba) => {
    const planilha = livro.Sheets[nomeAba];
    const linhasCru = XLSX.utils.sheet_to_json<unknown[]>(planilha, { header: 1, defval: "", raw: true, blankrows: false });
    const linhas = linhasCru.map((linha) => linha.map((celula) => (celula == null ? "" : String(celula))));
    return { nomeAba, linhas };
  });
}

/** Parser de CSV escrito à mão — texto puro não precisa da lib acima, só divisão de campos/aspas. */
function parseCSV(textoOriginal: string): string[][] {
  const texto = textoOriginal.charCodeAt(0) === 0xfeff ? textoOriginal.slice(1) : textoOriginal;
  const primeiraLinha = texto.slice(0, texto.search(/\r?\n/) === -1 ? undefined : texto.search(/\r?\n/));
  const separador = (primeiraLinha.match(/;/g)?.length ?? 0) >= (primeiraLinha.match(/,/g)?.length ?? 0) ? ";" : ",";

  const linhas: string[][] = [];
  let campo = "";
  let linhaAtual: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      dentroDeAspas = true;
    } else if (c === separador) {
      linhaAtual.push(campo);
      campo = "";
    } else if (c === "\r") {
      continue;
    } else if (c === "\n") {
      linhaAtual.push(campo);
      linhas.push(linhaAtual);
      linhaAtual = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linhaAtual.length > 0) {
    linhaAtual.push(campo);
    linhas.push(linhaAtual);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

function normalizarNomeColuna(s: string): string {
  return s
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const ALIASES_CODIGO = ["codigo", "cod", "sku", "codigopeca", "codigodapeca"];
const ALIASES_QUANTIDADE = [
  "quantidade",
  "qtd",
  "qtde",
  "estoque",
  "estoqueatual",
  "quantidadeatual",
  "quantidadedisponivel",
  "saldo",
  "existencia",
  "existencias",
];

function encontrarColuna(cabecalho: string[], aliases: string[]): string | null {
  const normalizados = cabecalho.map((c) => [c, normalizarNomeColuna(c)] as const);
  for (const alias of aliases) {
    const achado = normalizados.find(([, norm]) => norm === alias);
    if (achado) return achado[0];
  }
  return null;
}

interface AbaEscolhida {
  nomeAba: string;
  cabecalho: string[];
  dados: string[][];
  colCodigo: string;
  colQuantidade: string;
}

/**
 * Primeira aba (na ordem em que aparecem no arquivo) que tem as duas colunas juntas — código e
 * quantidade. Uma aba só com código (ex.: cadastro de nomes dos itens) não serve sozinha: sem a
 * coluna de quantidade não dá pra saber o que atualizar, então ela é ignorada nessa varredura.
 */
function selecionarAba(abas: Aba[]): AbaEscolhida {
  const diagnostico: string[] = [];
  for (const aba of abas) {
    const [cabecalho, ...dados] = aba.linhas;
    if (!cabecalho || aba.linhas.length < 2) {
      diagnostico.push(`"${aba.nomeAba}" (vazia)`);
      continue;
    }
    const colCodigo = encontrarColuna(cabecalho, ALIASES_CODIGO);
    const colQuantidade = encontrarColuna(cabecalho, ALIASES_QUANTIDADE);
    if (colCodigo && colQuantidade) {
      return { nomeAba: aba.nomeAba, cabecalho, dados, colCodigo, colQuantidade };
    }
    diagnostico.push(`"${aba.nomeAba}" (${colCodigo ? "tem código, sem quantidade" : colQuantidade ? "tem quantidade, sem código" : "sem nenhuma das duas"})`);
  }
  throw new ErroValidacaoImportacao(
    `Nenhuma aba tem as colunas de código e quantidade juntas. Abas encontradas: ${diagnostico.join(", ")}.`
  );
}

export type SituacaoLinhaImportacao = "atualizar" | "sem_alteracao" | "nao_encontrada" | "invalida";

export interface LinhaImportacao {
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
  linhas: LinhaImportacao[];
  resumo: { atualizar: number; semAlteracao: number; naoEncontradas: number; invalidas: number; total: number };
}

export async function simularImportacao(buffer: Buffer, nomeArquivo: string): Promise<ResultadoSimulacaoImportacao> {
  const ehCSV = /\.csv$/i.test(nomeArquivo);
  let abas: Aba[];
  try {
    abas = ehCSV ? [{ nomeAba: nomeArquivo, linhas: parseCSV(buffer.toString("utf8")) }] : parseBinario(buffer);
  } catch (err) {
    if (err instanceof ErroValidacaoImportacao) throw err;
    throw new ErroValidacaoImportacao(
      "Não foi possível ler este arquivo. Verifique se é uma planilha válida (.xlsx, .xls, .xlsb ou .csv) e não está corrompida ou protegida por senha."
    );
  }
  const { nomeAba, cabecalho, dados, colCodigo, colQuantidade } = selecionarAba(abas);
  const idxCodigo = cabecalho.indexOf(colCodigo);
  const idxQuantidade = cabecalho.indexOf(colQuantidade);

  const linhas: LinhaImportacao[] = await Promise.all(dados.map(async (campos, i) => {
    const numeroLinha = i + 2;
    const codigo = (campos[idxCodigo] ?? "").trim();
    const quantidadeTexto = (campos[idxQuantidade] ?? "").trim().replace(",", ".");

    if (!codigo) {
      return {
        linha: numeroLinha,
        codigo: "",
        quantidadePlanilha: 0,
        pecaId: null,
        pecaDescricao: null,
        estoqueAtual: null,
        delta: null,
        situacao: "invalida",
        erro: "Código em branco.",
      };
    }
    const quantidade = Number(quantidadeTexto);
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      return {
        linha: numeroLinha,
        codigo,
        quantidadePlanilha: 0,
        pecaId: null,
        pecaDescricao: null,
        estoqueAtual: null,
        delta: null,
        situacao: "invalida",
        erro: `Quantidade inválida: "${campos[idxQuantidade] ?? ""}".`,
      };
    }
    const peca = (await dbGet("SELECT id, descricao, estoque_atual FROM peca WHERE codigo = ? AND excluido_em IS NULL", [codigo])) as
      | { id: number; descricao: string; estoque_atual: number }
      | undefined;
    if (!peca) {
      return {
        linha: numeroLinha,
        codigo,
        quantidadePlanilha: quantidade,
        pecaId: null,
        pecaDescricao: null,
        estoqueAtual: null,
        delta: null,
        situacao: "nao_encontrada",
      };
    }
    const delta = quantidade - peca.estoque_atual;
    return {
      linha: numeroLinha,
      codigo,
      quantidadePlanilha: quantidade,
      pecaId: peca.id,
      pecaDescricao: peca.descricao,
      estoqueAtual: peca.estoque_atual,
      delta,
      situacao: delta === 0 ? "sem_alteracao" : "atualizar",
    };
  }));

  const resumo = {
    atualizar: linhas.filter((l) => l.situacao === "atualizar").length,
    semAlteracao: linhas.filter((l) => l.situacao === "sem_alteracao").length,
    naoEncontradas: linhas.filter((l) => l.situacao === "nao_encontrada").length,
    invalidas: linhas.filter((l) => l.situacao === "invalida").length,
    total: linhas.length,
  };

  return { nomeArquivo, abaUsada: nomeAba, colunaCodigo: colCodigo, colunaQuantidade: colQuantidade, linhas, resumo };
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

const COLUNAS_IMPORTACAO = `
  i.id, i.codigo, i.nome_arquivo, i.linhas_atualizadas, i.linhas_sem_alteracao,
  i.linhas_nao_encontradas, i.linhas_invalidas, i.criado_em, i.criado_por, u.nome AS criado_por_nome
`;

async function buscarImportacaoPorId(id: number): Promise<ImportacaoEstoque | null> {
  const row = (await dbGet(
    `SELECT ${COLUNAS_IMPORTACAO} FROM importacao_estoque i JOIN usuario u ON u.id = i.criado_por WHERE i.id = ?`,
    [id]
  )) as ImportacaoEstoque | undefined;
  return row ?? null;
}

export async function listarImportacoes(): Promise<ImportacaoEstoque[]> {
  return (await dbAll(
    `SELECT ${COLUNAS_IMPORTACAO} FROM importacao_estoque i JOIN usuario u ON u.id = i.criado_por ORDER BY i.criado_em DESC LIMIT 50`
  )) as unknown as ImportacaoEstoque[];
}

async function codigoSugerido(): Promise<string> {
  const rows = (await dbAll("SELECT codigo FROM importacao_estoque")) as { codigo: string }[];
  let maior = 0;
  for (const { codigo } of rows) {
    const numero = parseInt(codigo.replace("IMP-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  return `IMP-${String(maior + 1).padStart(4, "0")}`;
}

/**
 * `itens` são só as linhas que o usuário optou por aplicar (normalmente as com situação
 * "atualizar"). `registrarAjuste` recalcula o delta contra o saldo atual de cada peça — se o
 * estoque mudou entre simular e confirmar, o resultado ainda sai correto (na pior hipótese, uma
 * linha que era "atualizar" na simulação vira "sem alteração" aqui, o que é tratado, não um erro).
 */
export async function confirmarImportacao(
  nomeArquivo: string,
  itens: { pecaId: number; quantidade: number }[],
  contagensInformativas: { naoEncontradas: number; invalidas: number },
  usuarioId: number
): Promise<ImportacaoEstoque> {
  const codigo = await codigoSugerido();
  let atualizadas = 0;
  let semAlteracao = 0;

  for (const item of itens) {
    try {
      registrarAjuste(item.pecaId, item.quantidade, `Importação de planilha de estoque (${codigo})`, usuarioId);
      atualizadas++;
    } catch (err) {
      if (err instanceof ErroValidacaoEstoque) {
        semAlteracao++;
        continue;
      }
      throw err;
    }
  }

  const info = await dbRun(
    `INSERT INTO importacao_estoque (codigo, nome_arquivo, linhas_atualizadas, linhas_sem_alteracao, linhas_nao_encontradas, linhas_invalidas, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [codigo, nomeArquivo, atualizadas, semAlteracao, contagensInformativas.naoEncontradas, contagensInformativas.invalidas, usuarioId]
  );

  return (await buscarImportacaoPorId(Number(info.id)))!;
}
