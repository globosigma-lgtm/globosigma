/**
 * Importação única da planilha "INSPEÇÃO.xlsx" (programação de inspeção 2026) como cadastro real de
 * planos de inspeção. Rodar via: node --env-file=.env --import tsx src/scripts/importarInspecoes.ts
 * ["<caminho da planilha>"] (o caminho é opcional; usa o valor padrão abaixo se omitido).
 *
 * Idempotente por TAG (= ativo.codigo): rodar de novo sobre uma planilha já importada não duplica
 * planos — cada linha cujo TAG já tem um plano de inspeção correspondente é pulada. Não usa
 * transação (mesma convenção de seed.ts/migrate.ts, que também confiam em checagens idempotentes em
 * vez de BEGIN/COMMIT): uma falha no meio do processamento não desfaz linhas já inseridas, mas
 * rodar o script de novo completa o restante sem duplicar o que já entrou.
 */
import XLSX from "xlsx";
import fs from "node:fs";
import { dbGet, pool } from "../db/pg.js";
import { buscarAtivoPorId, criarAtivo, type CriticidadeAtivo, type StatusAtivo } from "../services/ativoService.js";
import { criarPlanoInspecao, type ClassePeriodicidadeInspecao } from "../services/planoInspecaoService.js";
import { dataInicioDaSemana } from "../lib/semanas.js";

const CAMINHO_PADRAO = "C:/Users/wande/OneDrive/Documentos/OneDrive/PLANILHAS MANUTENÇÃO/INSPEÇÃO.xlsx";
const ANO_PLANILHA = 2026;
const LINHA_INICIAL = 5; // 0-based: linha 6 da planilha (após cabeçalhos/legenda)
const COLUNA_SEMANA_1 = 5; // 0-based: coluna F = semana 1

const INTERVALO_SEMANAS_POR_CLASSE: Record<ClassePeriodicidadeInspecao, number> = { A: 2, B: 4, C: 6 };

function classificarSit(sit: string): ClassePeriodicidadeInspecao | null {
  const normalizado = sit.trim().toUpperCase();
  if (normalizado.startsWith("A")) return "A";
  if (normalizado.startsWith("B")) return "B";
  if (normalizado.startsWith("C")) return "C";
  return null; // "SEM CLASSE - DEFINIR" ou vazio
}

function primeiraSemanaMarcada(linha: unknown[]): number | null {
  for (let semana = 1; semana <= 53; semana++) {
    const valor = linha[COLUNA_SEMANA_1 + (semana - 1)];
    if (typeof valor === "string" && valor.trim().toUpperCase() === "X") return semana;
  }
  return null;
}

async function proximoCodigoPlano(usados: Set<string>): Promise<() => string> {
  const rows = await pool.query("SELECT codigo FROM plano_inspecao WHERE codigo LIKE 'INS-%'");
  let maior = 0;
  for (const { codigo } of rows.rows as { codigo: string }[]) {
    const numero = parseInt(codigo.replace("INS-", ""), 10);
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }
  let atual = maior;
  return () => {
    do {
      atual++;
    } while (usados.has(`INS-${String(atual).padStart(4, "0")}`));
    const codigo = `INS-${String(atual).padStart(4, "0")}`;
    usados.add(codigo);
    return codigo;
  };
}

async function main() {
  const caminho = process.argv[2] || CAMINHO_PADRAO;
  console.log(`Lendo planilha: ${caminho}`);
  // XLSX.readFile falha ("Cannot access file") com caminhos contendo acentos no Windows — lendo o
  // buffer com fs (que lida bem com esses caminhos) e passando para XLSX.read contorna o problema.
  const workbook = XLSX.read(fs.readFileSync(caminho), { type: "buffer" });
  const planilha = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(planilha, { header: 1, defval: "" });

  const admin = await dbGet<{ id: number }>("SELECT id FROM usuario WHERE matricula = '0001'");
  if (!admin) {
    throw new Error("Usuário administrador (matrícula 0001) não encontrado — rode o seed antes de importar.");
  }

  const codigosUsados = new Set<string>();
  const gerarCodigo = await proximoCodigoPlano(codigosUsados);

  let processadas = 0;
  let ativosExistentes = 0;
  let ativosCriados = 0;
  let planosInseridos = 0;
  let planosJaExistentes = 0;
  let semSemanaMarcada = 0;

  for (let i = LINHA_INICIAL; i < linhas.length; i++) {
    const linha = linhas[i];
    const equipamento = String(linha[1] ?? "").trim();
    if (!equipamento) continue; // fim da tabela ou linha em branco

    processadas++;
    const setor = String(linha[2] ?? "").trim() || null;
    const tag = String(linha[3] ?? "").trim();
    const sit = String(linha[4] ?? "").trim();
    const classe = classificarSit(sit);

    if (!tag) {
      console.warn(`Linha ${i + 1}: sem TAG, pulando ("${equipamento}").`);
      continue;
    }

    const planoExistente = await dbGet<{ id: number }>("SELECT id FROM plano_inspecao WHERE tag = ?", [tag]);
    if (planoExistente) {
      planosJaExistentes++;
      continue;
    }

    let ativo = await dbGet<{ id: number }>("SELECT id FROM ativo WHERE codigo = ?", [tag]);
    if (ativo) {
      ativosExistentes++;
    } else {
      const criticidade: CriticidadeAtivo = "media";
      const status: StatusAtivo = "operando";
      const novoAtivo = await criarAtivo(
        { codigo: tag, nome: equipamento, ativo_pai_id: null, tipo: "equipamento", setor, criticidade, status },
        admin.id
      );
      ativo = { id: novoAtivo.id };
      ativosCriados++;
    }

    let semanaBase: number | null = null;
    let dataInicioVigencia = `${ANO_PLANILHA}-01-01`;
    if (classe) {
      semanaBase = primeiraSemanaMarcada(linha);
      if (semanaBase == null) {
        semSemanaMarcada++;
        console.warn(`Linha ${i + 1}: classe "${sit}" sem nenhuma semana marcada com X, importando sem periodicidade ("${equipamento}" / ${tag}).`);
      } else {
        dataInicioVigencia = dataInicioDaSemana(ANO_PLANILHA, semanaBase);
      }
    }
    const classeEfetiva = semanaBase != null ? classe : null;

    await criarPlanoInspecao(
      {
        codigo: gerarCodigo(),
        ativo_id: ativo.id,
        tag,
        setor,
        classe_periodicidade: classeEfetiva,
        semana_base: classeEfetiva ? semanaBase : null,
        data_inicio_vigencia: dataInicioVigencia,
        responsavel_padrao_id: null,
        prioridade_padrao: "media",
      },
      admin.id
    );
    planosInseridos++;
  }

  console.log("\n--- Resumo da importação ---");
  console.log(`Linhas processadas:        ${processadas}`);
  console.log(`Ativos já existentes:      ${ativosExistentes}`);
  console.log(`Ativos criados:            ${ativosCriados}`);
  console.log(`Planos inseridos:          ${planosInseridos}`);
  console.log(`Planos já existentes (TAG duplicado, pulados): ${planosJaExistentes}`);
  console.log(`Sem semana marcada (classe definida mas sem X): ${semSemanaMarcada}`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Falha na importação:", err);
    pool.end().finally(() => process.exit(1));
  });
