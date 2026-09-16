import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { migrate } from "./db/migrate.js";
import { dbGet } from "./db/pg.js";
import { authRouter } from "./routes/auth.js";
import { usuariosRouter } from "./routes/usuarios.js";
import { ativosRouter } from "./routes/ativos.js";
import { pecasRouter } from "./routes/pecas.js";
import { planosRouter } from "./routes/planos.js";
import { loteGeracaoRouter } from "./routes/loteGeracao.js";
import { lubrificacaoRouter } from "./routes/lubrificacao.js";
import { inspecoesRouter } from "./routes/inspecoes.js";
import { ordensServicoRouter } from "./routes/ordensServico.js";
import { almoxarifadoRouter } from "./routes/almoxarifado.js";
import { requisicoesCompraRouter } from "./routes/requisicoesCompra.js";
import { solicitacoesRouter } from "./routes/solicitacoes.js";
import { indicadoresRouter } from "./routes/indicadores.js";
import { configuracoesRouter } from "./routes/configuracoes.js";
import { auditoriaRouter } from "./routes/auditoria.js";
import { anexosRouter } from "./routes/anexos.js";
import { notificacoesRouter } from "./routes/notificacoes.js";
import { fornecedoresRouter } from "./routes/fornecedores.js";
import { equipesRouter } from "./routes/equipes.js";
import { buscaRouter } from "./routes/busca.js";
import { servicosExternosRouter } from "./routes/servicosExternos.js";
import { relatoriosPacRouter } from "./routes/relatoriosPac.js";
import { integracoesRouter } from "./routes/integracoes.js";

let migracaoFeita: Promise<void> | null = null;

/**
 * Constrói o app Express já com a migração do banco aplicada. Usado tanto pelo entrypoint de dev
 * local (index.ts) quanto pela Netlify Function (netlify/functions/api.ts) — nesta última o
 * handler é reaproveitado entre invocações (fora do cold start), então `migracaoFeita` garante que
 * `migrate()` roda uma única vez por instância da function, não a cada requisição.
 */
export async function createApp() {
  if (!migracaoFeita) migracaoFeita = migrate();
  await migracaoFeita;

  const app = express();
  const WEB_ORIGIN = process.env.SIGMA_WEB_ORIGIN || "http://localhost:5173";

  app.use(cors({ origin: WEB_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/auth", authRouter);
  app.use("/api/usuarios", usuariosRouter);
  app.use("/api/ativos", ativosRouter);
  app.use("/api/pecas", pecasRouter);
  app.use("/api/planos", planosRouter);
  app.use("/api/geracao-lote", loteGeracaoRouter);
  app.use("/api/lubrificacao", lubrificacaoRouter);
  app.use("/api/inspecoes", inspecoesRouter);
  app.use("/api/ordens-servico", ordensServicoRouter);
  app.use("/api/almoxarifado", almoxarifadoRouter);
  app.use("/api/requisicoes-compra", requisicoesCompraRouter);
  app.use("/api/solicitacoes", solicitacoesRouter);
  app.use("/api/indicadores", indicadoresRouter);
  app.use("/api/configuracoes", configuracoesRouter);
  app.use("/api/auditoria", auditoriaRouter);
  app.use("/api/anexos", anexosRouter);
  app.use("/api/notificacoes", notificacoesRouter);
  app.use("/api/fornecedores", fornecedoresRouter);
  app.use("/api/equipes", equipesRouter);
  app.use("/api/busca", buscaRouter);
  app.use("/api/servicos-externos", servicosExternosRouter);
  app.use("/api/integracoes", integracoesRouter);
  app.use("/api/relatorios", relatoriosPacRouter);

  app.get("/api/saude", async (_req, res) => {
    await dbGet("SELECT 1");
    res.json({ ok: true, sistema: "SIGMA" });
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ erro: "Erro interno do servidor." });
  });

  return app;
}
