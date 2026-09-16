import serverless from "serverless-http";
// Importa do build compilado (server/dist), não do TypeScript fonte — o deploy sempre roda
// `npm run build --workspace=server` antes de `netlify deploy` (sem integração com GitHub, o
// build é sempre local). Ver README/plano de deploy.
// @ts-ignore — resolvido em runtime a partir do JS compilado, não existe tipo aqui em dev.
import { createApp } from "../../server/dist/app.js";

let handlerPromise: ReturnType<typeof montarHandler> | null = null;

function montarHandler() {
  return createApp().then((app: any) =>
    serverless(app, {
      binary: ["multipart/form-data", "image/*", "application/pdf", "application/octet-stream"],
    })
  );
}

export const handler = async (event: any, context: any) => {
  if (!handlerPromise) handlerPromise = montarHandler();
  const h = await handlerPromise;
  return h(event, context);
};
