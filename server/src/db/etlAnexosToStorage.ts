/**
 * Sobe os arquivos de server/data/anexos/* para o bucket "anexos" do Supabase Storage, mantendo o
 * mesmo nome de arquivo (que é a chave já gravada em anexo.caminho_relativo no banco — rodar
 * etlToSupabase.ts antes, senão os registros da tabela `anexo` ainda não existem no Postgres).
 *
 * Uso: node --env-file=.env --import tsx src/db/etlAnexosToStorage.ts
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_ANEXOS = path.resolve(__dirname, "../../data/anexos");
const BUCKET = "anexos";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  if (!fs.existsSync(DIR_ANEXOS)) {
    console.log(`Pasta ${DIR_ANEXOS} não existe — nada a migrar.`);
    return;
  }
  const arquivos = fs.readdirSync(DIR_ANEXOS).filter((f) => fs.statSync(path.join(DIR_ANEXOS, f)).isFile());
  console.log(`${arquivos.length} arquivo(s) encontrado(s) em ${DIR_ANEXOS}`);

  let enviados = 0;
  let falhas = 0;
  for (const nome of arquivos) {
    const buffer = fs.readFileSync(path.join(DIR_ANEXOS, nome));
    const { error } = await supabase.storage.from(BUCKET).upload(nome, buffer, { upsert: true });
    if (error) {
      console.error(`Falha ao enviar ${nome}: ${error.message}`);
      falhas++;
    } else {
      enviados++;
    }
  }
  console.log(`Concluído: ${enviados} enviados, ${falhas} falha(s).`);
  if (falhas > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
