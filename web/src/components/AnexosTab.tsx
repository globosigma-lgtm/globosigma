import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Anexo } from "../types";

function formatarTamanho(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** DADOS-02: upload de foto/documento (evidência de defeito, comprovante de reparo) — reutilizável por qualquer entidade que tenha anexos (OS, solicitação). */
export function AnexosTab({
  entidade,
  entidadeId,
  podeEditar,
}: {
  entidade: "ordem_servico" | "solicitacao";
  entidadeId: number;
  podeEditar: boolean;
}) {
  const [anexos, setAnexos] = useState<Anexo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function carregar() {
    api
      .get<{ anexos: Anexo[] }>(`/anexos?entidade=${entidade}&entidadeId=${entidadeId}`)
      .then((r) => setAnexos(r.anexos))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os anexos."));
  }

  useEffect(carregar, [entidade, entidadeId]);

  async function aoSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      formData.append("entidade", entidade);
      formData.append("entidadeId", String(entidadeId));
      await api.upload("/anexos", formData);
      carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível enviar o arquivo.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function aoExcluir(id: number) {
    if (!confirm("Excluir este anexo?")) return;
    try {
      await api.del(`/anexos/${id}`);
      carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível excluir o anexo.");
    }
  }

  return (
    <div>
      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      {podeEditar && (
        <div style={{ marginBottom: "16px" }}>
          <input ref={inputRef} type="file" onChange={aoSelecionarArquivo} disabled={enviando} accept="image/*,.pdf,.doc,.docx" />
          {enviando && <span style={{ marginLeft: "8px", fontSize: "var(--text-small)", color: "var(--c-n-500)" }}>Enviando…</span>}
        </div>
      )}

      {anexos == null ? (
        <p style={{ color: "var(--c-n-500)" }}>Carregando…</p>
      ) : anexos.length === 0 ? (
        <div className="empty-state">Nenhum anexo enviado.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tamanho</th>
                <th>Enviado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {anexos.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a href={`/api/anexos/${a.id}/arquivo`} target="_blank" rel="noreferrer">
                      {a.nome_arquivo}
                    </a>
                  </td>
                  <td className="mono">{formatarTamanho(a.tamanho_bytes)}</td>
                  <td className="mono">{a.criado_em}</td>
                  <td>
                    {podeEditar && (
                      <button type="button" className="btn btn--ghost" onClick={() => aoExcluir(a.id)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
