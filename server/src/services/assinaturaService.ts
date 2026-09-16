import { createHash } from "crypto";
import { dbGet, dbAll, dbRun } from "../db/pg.js";
import { registrarAuditoria } from "./auditoriaService.js";
import { buscarOSPorId, listarPecasDaOS, listarTarefasDaOS, type OrdemServico } from "./osService.js";
import { listarServicosExternos } from "./servicoExternoService.js";

/**
 * Assinatura digital da OS — mesmo padrão em produção no GloboPac (tabela
 * assinaturas_os_eletronicas / utils/assinaturaEletronica.js): o hash SHA-256 é sobre um snapshot
 * JSON canônico dos dados substantivos da OS, não sobre um PDF renderizado — reproduzível a
 * qualquer momento sem depender de uma regeração de documento ser byte-a-byte idêntica. O carimbo
 * de tempo RFC 3161 é só um reforço de prova por cima desse hash: falha na Free TSA nunca bloqueia
 * a conclusão da OS (ver gerarAssinaturaOS, chamada dentro de concluirOS em osService.ts).
 */

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

const COLUNAS = `
  a.id, a.os_id, a.hash_sha256, a.algoritmo_hash, a.dados_assinados, a.tsa_endpoint, a.tsa_emitido_em,
  a.status, a.erro_tsa, a.criado_em, a.criado_por, u.nome AS criado_por_nome
`;

/**
 * Ordena recursivamente as chaves de um objeto antes de serializar — garante que o mesmo
 * conteúdo sempre produza o mesmo JSON (e portanto o mesmo hash), independente da ordem em que os
 * campos foram montados. Mesma técnica do replacerSorted no GloboPac.
 */
function ordenarChavesRecursivo(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarChavesRecursivo);
  if (valor && typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = ordenarChavesRecursivo(obj[k]);
        return acc;
      }, {});
  }
  return valor;
}

/**
 * Extrai os campos substantivos de uma OS pra fins de hash — o conteúdo que a assinatura atesta:
 * dados da ordem, checklist respondido, peças consumidas e itens de serviço externo. Exclui
 * metadados que não fazem parte do conteúdo auditável (ids de linha, timestamps de sistema).
 */
export async function montarDadosAssinaveisOS(os: OrdemServico): Promise<Record<string, unknown>> {
  const [tarefas, pecas, servicosExternos] = await Promise.all([
    listarTarefasDaOS(os.id),
    listarPecasDaOS(os.id),
    listarServicosExternos({ osId: os.id }),
  ]);

  return {
    codigo: os.codigo,
    ativo_id: os.ativo_id,
    ativo_codigo: os.ativo_codigo,
    tipo: os.tipo,
    prioridade: os.prioridade,
    descricao: os.descricao,
    data_programada: os.data_programada,
    data_limite: os.data_limite,
    data_inicio_execucao: os.data_inicio_execucao,
    data_conclusao: os.data_conclusao,
    responsavel_id: os.responsavel_id,
    horas_reais: os.horas_reais,
    custo_mao_obra: os.custo_mao_obra,
    custo_pecas: os.custo_pecas,
    causa_falha: os.causa_falha,
    resultado_inspecao: os.resultado_inspecao,
    observacoes_execucao: os.observacoes_execucao,
    checklist: tarefas.map((t) => ({
      descricao: t.descricao,
      resposta: t.resposta,
      valor_numerico: t.valor_numerico,
      concluida: t.concluida,
    })),
    pecas: pecas.map((p) => ({
      peca_id: p.peca_id,
      codigo: p.codigo,
      quantidade_consumida: p.quantidade_consumida,
    })),
    servicos_externos: servicosExternos.map((s) => ({
      codigo: s.codigo,
      status_logistico: s.status_logistico,
      item_ativo_id: s.item_ativo_id ?? null,
    })),
  };
}

/** Serialização determinística (chaves ordenadas) + SHA-256 nativo do Node — sem depender do navegador. */
export function calcularHashSha256(dados: Record<string, unknown>): { hash: string; jsonCanonico: string } {
  const jsonCanonico = JSON.stringify(ordenarChavesRecursivo(dados));
  const hash = createHash("sha256").update(jsonCanonico, "utf8").digest("hex");
  return { hash, jsonCanonico };
}

/**
 * Monta o TimeStampReq (RFC 3161 §2.4.1) em DER/ASN.1 na mão — estrutura fixa de 59 bytes pra um
 * digest SHA-256, só os 32 bytes do hash mudam. Evita puxar uma lib de ASN.1 (pkijs/node-forge)
 * só pra isso; é o mesmo byte a byte usado em produção na Edge Function do GloboPac.
 */
export function montarTSQ(hashHex: string): Buffer {
  const hashBytes = Buffer.from(hashHex, "hex");
  if (hashBytes.length !== 32) {
    throw new Error("Hash SHA-256 inválido: esperado 32 bytes.");
  }
  return Buffer.from([
    0x30, 0x39,
    0x02, 0x01, 0x01,
    0x30, 0x31,
    0x30, 0x0d,
    0x06, 0x09,
    0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
    0x05, 0x00,
    0x04, 0x20,
    ...hashBytes,
    0x01, 0x01, 0xff,
  ]);
}

// Tenta a Free TSA primeiro; só recorre à Sectigo se a Free TSA estiver fora do ar. Dois
// endpoints (não os quatro do GloboPac) pra manter o tempo total dentro do limite de execução de
// uma function serverless — a Free TSA é a exigida pelo requisito original, a Sectigo é só reforço.
const TSA_ENDPOINTS: { url: string; timeoutMs: number }[] = [
  { url: "https://freetsa.org/tsr", timeoutMs: 5000 },
  { url: "http://timestamp.sectigo.com", timeoutMs: 4000 },
];

async function obterTSR(tsq: Buffer): Promise<{ tsr: Buffer; endpoint: string }> {
  const erros: string[] = [];
  for (const { url, timeoutMs } of TSA_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/timestamp-query" },
        body: tsq,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        erros.push(`${url} -> HTTP ${res.status}`);
        continue;
      }
      const tsr = Buffer.from(await res.arrayBuffer());
      return { tsr, endpoint: url };
    } catch (err) {
      clearTimeout(timeoutId);
      erros.push(`${url} -> ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Todos os servidores TSA falharam: ${erros.join("; ")}`);
}

/**
 * Gera a assinatura digital de uma OS recém-concluída: calcula o hash, grava a linha e tenta
 * obter o carimbo de tempo RFC 3161. Nunca lança exceção — falha na Free TSA (ou em qualquer
 * etapa depois do hash já estar salvo) só deixa a linha em status "falha_tsa"; o hash em si já é
 * prova suficiente e não pode travar a conclusão da OS, que já aconteceu.
 */
export async function gerarAssinaturaOS(osId: number, usuarioId: number): Promise<AssinaturaDigital | null> {
  try {
    const os = await buscarOSPorId(osId);
    if (!os) return null;

    const dados = await montarDadosAssinaveisOS(os);
    const { hash, jsonCanonico } = calcularHashSha256(dados);
    const tsq = montarTSQ(hash);

    const info = await dbRun(
      `INSERT INTO assinatura_digital (os_id, hash_sha256, algoritmo_hash, dados_assinados, tsq_query, status, criado_por)
       VALUES (?, ?, 'SHA-256', ?, ?, 'aguardando_tsa', ?) RETURNING id`,
      [osId, hash, jsonCanonico, tsq, usuarioId]
    );
    const assinaturaId = info.id!;

    try {
      const { tsr, endpoint } = await obterTSR(tsq);
      await dbRun(
        `UPDATE assinatura_digital SET tsr_token = ?, tsa_endpoint = ?, tsa_emitido_em = (now() - interval '4 hours'), status = 'completa' WHERE id = ?`,
        [tsr, endpoint, assinaturaId]
      );
    } catch (err) {
      await dbRun(`UPDATE assinatura_digital SET status = 'falha_tsa', erro_tsa = ? WHERE id = ?`, [
        err instanceof Error ? err.message : String(err),
        assinaturaId,
      ]);
    }

    await registrarAuditoria({
      entidade: "ordem_servico",
      entidade_id: osId,
      acao: "status",
      valor_novo: { assinatura_digital_id: assinaturaId, hash_sha256: hash },
      usuario_id: usuarioId,
    });

    return buscarAssinaturaPorId(assinaturaId);
  } catch (err) {
    console.error("[AssinaturaOS] Falha ao gerar assinatura:", err);
    return null;
  }
}

export async function buscarAssinaturaPorId(id: number): Promise<AssinaturaDigital | null> {
  return (
    ((await dbGet(
      `SELECT ${COLUNAS} FROM assinatura_digital a LEFT JOIN usuario u ON u.id = a.criado_por WHERE a.id = ?`,
      [id]
    )) as AssinaturaDigital | undefined) ?? null
  );
}

/** Trilha completa de assinaturas da OS (inclui invalidadas, pra preservar o histórico ao reabrir/reassinar). */
export async function listarAssinaturasDaOS(osId: number): Promise<AssinaturaDigital[]> {
  return (await dbAll(
    `SELECT ${COLUNAS} FROM assinatura_digital a LEFT JOIN usuario u ON u.id = a.criado_por
     WHERE a.os_id = ? ORDER BY a.criado_em DESC, a.id DESC`,
    [osId]
  )) as unknown as AssinaturaDigital[];
}

/** A assinatura vigente é a mais recente que não foi invalidada por uma reabertura. */
export async function buscarAssinaturaVigenteDaOS(osId: number): Promise<AssinaturaDigital | null> {
  return (
    ((await dbGet(
      `SELECT ${COLUNAS} FROM assinatura_digital a LEFT JOIN usuario u ON u.id = a.criado_por
       WHERE a.os_id = ? AND a.status != 'invalidada' ORDER BY a.criado_em DESC, a.id DESC LIMIT 1`,
      [osId]
    )) as AssinaturaDigital | undefined) ?? null
  );
}

/**
 * Chamada ao reabrir uma OS já assinada (ver reabrirOS em osService.ts) — invalida a assinatura
 * vigente sem apagá-la, preservando hash/timestamp anteriores no histórico. Uma nova conclusão
 * dispara um novo ciclo completo de assinatura (requisito de imutabilidade — correção exige nova
 * assinatura, não edição da anterior).
 */
export async function invalidarAssinaturasDaOS(osId: number): Promise<void> {
  await dbRun(`UPDATE assinatura_digital SET status = 'invalidada' WHERE os_id = ? AND status != 'invalidada'`, [osId]);
}

export interface ResultadoVerificacaoAssinatura {
  assinatura: AssinaturaDigital;
  hash_atual: string;
  integro: boolean;
}

/**
 * Recalcula o hash sobre o estado atual da OS e compara com o hash gravado na assinatura vigente
 * — mesma lógica de comparação usada na página pública de verificação do GloboPac. Não valida
 * criptograficamente o token TSR em si (isso é feito offline, com openssl ou no verificador da
 * própria Free TSA, usando os arquivos .tsq/.tsr baixáveis).
 */
export async function verificarAssinaturaDaOS(osId: number): Promise<ResultadoVerificacaoAssinatura | null> {
  const assinatura = await buscarAssinaturaVigenteDaOS(osId);
  if (!assinatura) return null;
  const os = await buscarOSPorId(osId);
  if (!os) return null;
  const dadosAtuais = await montarDadosAssinaveisOS(os);
  const { hash: hashAtual } = calcularHashSha256(dadosAtuais);
  return { assinatura, hash_atual: hashAtual, integro: hashAtual === assinatura.hash_sha256 };
}

export async function baixarTSQDaAssinatura(id: number): Promise<Buffer | null> {
  const row = (await dbGet("SELECT tsq_query FROM assinatura_digital WHERE id = ?", [id])) as { tsq_query: Buffer } | undefined;
  return row?.tsq_query ?? null;
}

export async function baixarTSRDaAssinatura(id: number): Promise<Buffer | null> {
  const row = (await dbGet("SELECT tsr_token FROM assinatura_digital WHERE id = ?", [id])) as { tsr_token: Buffer | null } | undefined;
  return row?.tsr_token ?? null;
}
