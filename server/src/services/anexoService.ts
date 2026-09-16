import { createClient } from "@supabase/supabase-js";
import { dbGet, dbAll, dbRun } from "../db/pg.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const BUCKET_ANEXOS = "anexos";

export const ENTIDADES_COM_ANEXO = ["ordem_servico", "solicitacao"] as const;
export type EntidadeComAnexo = (typeof ENTIDADES_COM_ANEXO)[number];

export interface Anexo {
  id: number;
  entidade: string;
  entidade_id: number;
  nome_arquivo: string;
  caminho_relativo: string;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  criado_em: string;
  criado_por: number | null;
}

export async function listarAnexos(entidade: EntidadeComAnexo, entidadeId: number): Promise<Anexo[]> {
  return (await dbAll(
    `SELECT * FROM anexo WHERE entidade = ? AND entidade_id = ? ORDER BY criado_em DESC`,
    [entidade, entidadeId]
  )) as unknown as Anexo[];
}

export async function buscarAnexoPorId(id: number): Promise<Anexo | null> {
  return ((await dbGet(`SELECT * FROM anexo WHERE id = ?`, [id])) as Anexo | undefined) ?? null;
}

export async function criarAnexo(
  dados: {
    entidade: EntidadeComAnexo;
    entidade_id: number;
    nome_arquivo: string;
    caminho_relativo: string;
    tipo_mime: string | null;
    tamanho_bytes: number | null;
  },
  usuarioId: number
): Promise<Anexo> {
  const info = await dbRun(
    `INSERT INTO anexo (entidade, entidade_id, nome_arquivo, caminho_relativo, tipo_mime, tamanho_bytes, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [dados.entidade, dados.entidade_id, dados.nome_arquivo, dados.caminho_relativo, dados.tipo_mime, dados.tamanho_bytes, usuarioId]
  );
  return (await buscarAnexoPorId(info.id!))!;
}

export async function uploadAnexoArquivo(nomeGerado: string, buffer: Buffer, tipoMime: string | null): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_ANEXOS).upload(nomeGerado, buffer, {
    contentType: tipoMime ?? undefined,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao enviar anexo: ${error.message}`);
}

export async function baixarAnexoArquivo(nomeGerado: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).download(nomeGerado);
  if (error || !data) throw new Error("Arquivo do anexo não encontrado no armazenamento.");
  return Buffer.from(await data.arrayBuffer());
}

export async function excluirAnexo(id: number): Promise<void> {
  const anexo = await buscarAnexoPorId(id);
  if (!anexo) return;
  await supabase.storage.from(BUCKET_ANEXOS).remove([anexo.caminho_relativo]);
  await dbRun(`DELETE FROM anexo WHERE id = ?`, [id]);
}
