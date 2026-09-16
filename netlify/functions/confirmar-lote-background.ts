// LOTE-BG-01: função separada da app Express principal (api.ts) porque o sufixo "-background" é
// o que faz o Netlify tratá-la como Background Function (até 15min, sem devolver corpo de
// resposta pra quem chamou) — não dá pra misturar isso com o resto das rotas síncronas.
// Disparada por dispararConfirmacaoBackground (loteGeracaoService.ts), nunca pelo navegador
// diretamente: por isso a autenticação aqui é um token compartilhado (SIGMA_INTERNAL_TOKEN), não
// o cookie de sessão do usuário.
import { confirmarLote, marcarErro } from "../../server/dist/services/loteGeracaoService.js";

export const handler = async (event: any) => {
  const token = event.headers?.["x-internal-token"] ?? event.headers?.["X-Internal-Token"];
  if (!process.env.SIGMA_INTERNAL_TOKEN || token !== process.env.SIGMA_INTERNAL_TOKEN) {
    console.error("confirmar-lote-background: token interno inválido ou ausente.");
    return { statusCode: 401, body: "" };
  }

  let loteId: number | undefined;
  let usuarioId: number | undefined;
  try {
    const body = JSON.parse(event.body || "{}");
    loteId = Number(body.loteId);
    usuarioId = Number(body.usuarioId);
  } catch {
    console.error("confirmar-lote-background: corpo da requisição inválido.");
    return { statusCode: 400, body: "" };
  }

  if (!loteId || !usuarioId) {
    console.error("confirmar-lote-background: loteId/usuarioId ausentes.");
    return { statusCode: 400, body: "" };
  }

  try {
    const resultado = await confirmarLote(loteId, usuarioId);
    console.log(
      `confirmar-lote-background: lote ${loteId} confirmado — ${resultado.ordens_criadas} criada(s), ${resultado.ocorrencias_ignoradas} ignorada(s).`
    );
  } catch (err) {
    console.error(`confirmar-lote-background: falha ao confirmar lote ${loteId}:`, err);
    await marcarErro(loteId, err instanceof Error ? err.message : "Erro desconhecido ao confirmar o lote.").catch(
      (e) => console.error("confirmar-lote-background: falha ao registrar erro no lote:", e)
    );
  }

  return { statusCode: 200, body: "" };
};
