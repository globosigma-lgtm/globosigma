import { Router, type NextFunction, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { criarSolicitacaoExterna, validarOSGlobopac, ErroValidacaoSolicitacao } from "../services/solicitacaoService.js";
import { ErroValidacaoOS } from "../services/osService.js";

export const integracoesRouter = Router();

/**
 * Autenticação por segredo compartilhado — não é um usuário do Sigma, é outro sistema falando com
 * o Sigma. Por isso não usa `exigirAutenticacao`/cookie de sessão, só compara um header fixo contra
 * uma variável de ambiente. Cada integração externa tem seu próprio nome de variável.
 */
function exigirTokenIntegracao(nomeVariavelEnv: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const esperado = process.env[nomeVariavelEnv];
    const recebido = req.header("X-Integracao-Token");
    if (!esperado || recebido !== esperado) {
      return res.status(401).json({ erro: "Token de integração inválido." });
    }
    next();
  };
}

integracoesRouter.post(
  "/globopac/solicitacoes",
  exigirTokenIntegracao("GLOBOPAC_INTEGRACAO_TOKEN"),
  asyncHandler(async (req, res) => {
    const { origem_externa_id, os_codigo, descricao, setor, solicitante_nome } = req.body ?? {};
    if (typeof origem_externa_id !== "string" || !origem_externa_id.trim()) {
      return res.status(400).json({ erro: "Informe origem_externa_id." });
    }
    if (typeof descricao !== "string" || !descricao.trim()) {
      return res.status(400).json({ erro: "Informe descricao." });
    }
    try {
      const solicitacao = await criarSolicitacaoExterna({
        origem_externa_id: origem_externa_id.trim(),
        origem_externa_codigo: typeof os_codigo === "string" ? os_codigo : null,
        descricao,
        setor_solicitante: typeof setor === "string" ? setor : null,
        solicitante_externo_nome: typeof solicitante_nome === "string" ? solicitante_nome : null,
      });
      res.status(201).json({ solicitacao_id: solicitacao.id, solicitacao_codigo: solicitacao.codigo });
    } catch (erro) {
      if (erro instanceof ErroValidacaoSolicitacao) {
        return res.status(400).json({ erro: erro.message });
      }
      throw erro;
    }
  })
);

/**
 * GLOBOPAC-VAL-01: o usuário do GloboPac dá "conforme" (valida) a OS na aba de acompanhamento de OS
 * do painel dele — esse webhook libera a conclusão da OS correspondente no Sigma. Mesmo token da
 * criação de solicitações (GLOBOPAC_INTEGRACAO_TOKEN): direção GloboPac -> Sigma.
 */
integracoesRouter.post(
  "/globopac/os/validacao",
  exigirTokenIntegracao("GLOBOPAC_INTEGRACAO_TOKEN"),
  asyncHandler(async (req, res) => {
    const { manutencao_os_id, validado_por_nome } = req.body ?? {};
    if (typeof manutencao_os_id !== "string" || !manutencao_os_id.trim()) {
      return res.status(400).json({ erro: "Informe manutencao_os_id." });
    }
    try {
      const os = await validarOSGlobopac(
        manutencao_os_id.trim(),
        typeof validado_por_nome === "string" ? validado_por_nome.trim() || null : null
      );
      res.json({ os_id: os.id, os_codigo: os.codigo, globopac_validado_em: os.globopac_validado_em });
    } catch (erro) {
      if (erro instanceof ErroValidacaoSolicitacao || erro instanceof ErroValidacaoOS) {
        return res.status(400).json({ erro: erro.message });
      }
      throw erro;
    }
  })
);
