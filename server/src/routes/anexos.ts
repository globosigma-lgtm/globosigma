import { Router } from "express";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { z } from "zod";
import { exigirAutenticacao } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { temPermissao, type Modulo } from "../permissions.js";
import {
  buscarAnexoPorId,
  criarAnexo,
  ENTIDADES_COM_ANEXO,
  excluirAnexo,
  listarAnexos,
  uploadAnexoArquivo,
  baixarAnexoArquivo,
  type EntidadeComAnexo,
} from "../services/anexoService.js";

export const anexosRouter = Router();

anexosRouter.use(exigirAutenticacao);

// DADOS-02: a coluna solicitacao.anexos (JSON) nunca teve upload nem UI atrás dela. Uma tabela
// genérica cobre OS e solicitação com o mesmo endpoint em vez de duplicar rota por entidade —
// o módulo de permissão a checar depende de qual entidade está sendo anexada.
const MODULO_POR_ENTIDADE: Record<EntidadeComAnexo, Modulo> = {
  ordem_servico: "ordens_servico",
  solicitacao: "solicitacoes",
};

function validarEntidade(valor: unknown): EntidadeComAnexo | null {
  return typeof valor === "string" && (ENTIDADES_COM_ANEXO as readonly string[]).includes(valor) ? (valor as EntidadeComAnexo) : null;
}

// 4 MB: teto de payload de requisição de funções serverless (Netlify Functions) é menor que os
// 15 MB usados quando o backend rodava como processo Node contínuo. Anexos aqui são evidência
// fotográfica, não arquivo de projeto, então essa margem cobre o uso real.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

anexosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entidade = validarEntidade(req.query.entidade);
    const entidadeId = Number(req.query.entidadeId);
    if (!entidade || !entidadeId) {
      return res.status(400).json({ erro: "Informe entidade e entidadeId válidos." });
    }
    if (!req.usuario || !temPermissao(req.usuario.permissoes, MODULO_POR_ENTIDADE[entidade], "ver")) {
      return res.status(403).json({ erro: "Acesso negado." });
    }
    res.json({ anexos: await listarAnexos(entidade, entidadeId) });
  })
);

const dadosUploadSchema = z.object({
  entidade: z.enum(ENTIDADES_COM_ANEXO),
  entidadeId: z.coerce.number().int(),
});

anexosRouter.post(
  "/",
  upload.single("arquivo"),
  asyncHandler(async (req, res) => {
    const parsed = dadosUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    }
    if (!req.file) {
      return res.status(400).json({ erro: "Nenhum arquivo enviado." });
    }
    const { entidade, entidadeId } = parsed.data;
    if (!req.usuario || !temPermissao(req.usuario.permissoes, MODULO_POR_ENTIDADE[entidade], "editar")) {
      return res.status(403).json({ erro: "Acesso negado." });
    }
    const extensao = path.extname(req.file.originalname).slice(0, 10);
    const nomeGerado = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extensao}`;
    await uploadAnexoArquivo(nomeGerado, req.file.buffer, req.file.mimetype);
    const anexo = await criarAnexo(
      {
        entidade,
        entidade_id: entidadeId,
        nome_arquivo: req.file.originalname,
        caminho_relativo: nomeGerado,
        tipo_mime: req.file.mimetype,
        tamanho_bytes: req.file.size,
      },
      req.usuario.id
    );
    res.status(201).json({ anexo });
  })
);

anexosRouter.get(
  "/:id/arquivo",
  asyncHandler(async (req, res) => {
    const anexo = await buscarAnexoPorId(Number(req.params.id));
    if (!anexo) return res.status(404).json({ erro: "Anexo não encontrado." });
    const entidade = anexo.entidade as EntidadeComAnexo;
    if (!req.usuario || !temPermissao(req.usuario.permissoes, MODULO_POR_ENTIDADE[entidade], "ver")) {
      return res.status(403).json({ erro: "Acesso negado." });
    }
    const buffer = await baixarAnexoArquivo(anexo.caminho_relativo);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(anexo.nome_arquivo)}"`);
    if (anexo.tipo_mime) res.setHeader("Content-Type", anexo.tipo_mime);
    res.send(buffer);
  })
);

anexosRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const anexo = await buscarAnexoPorId(Number(req.params.id));
    if (!anexo) return res.status(404).json({ erro: "Anexo não encontrado." });
    const entidade = anexo.entidade as EntidadeComAnexo;
    if (!req.usuario || !temPermissao(req.usuario.permissoes, MODULO_POR_ENTIDADE[entidade], "editar")) {
      return res.status(403).json({ erro: "Acesso negado." });
    }
    await excluirAnexo(anexo.id);
    res.json({ ok: true });
  })
);
