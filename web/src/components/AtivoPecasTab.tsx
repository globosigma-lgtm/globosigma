import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { VinculoAtivoPeca } from "../types";
import { VincularPecaModal } from "./VincularPecaModal";
import { CopiarListaTecnicaModal } from "./CopiarListaTecnicaModal";

export function AtivoPecasTab({
  ativoId,
  qtdFilhosDiretos,
  podeEditar,
}: {
  ativoId: number;
  qtdFilhosDiretos: number;
  podeEditar: boolean;
}) {
  const [vinculos, setVinculos] = useState<VinculoAtivoPeca[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modalVincular, setModalVincular] = useState<{ vinculo: VinculoAtivoPeca | null } | null>(null);
  const [modalCopiar, setModalCopiar] = useState(false);
  const [removendo, setRemovendo] = useState<VinculoAtivoPeca | null>(null);

  function carregar() {
    api
      .get<{ pecas: VinculoAtivoPeca[] }>(`/ativos/${ativoId}/pecas`)
      .then((r) => setVinculos(r.pecas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as peças do ativo."));
  }

  useEffect(carregar, [ativoId]);

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await api.del(`/ativos/${ativoId}/pecas/${removendo.id}`);
      setRemovendo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível remover o vínculo.");
      setRemovendo(null);
    }
  }

  function aoSalvarVinculo() {
    setModalVincular(null);
    carregar();
  }

  function aoCopiar(resumo: { copiados: number; pulados: number }) {
    setModalCopiar(false);
    setAviso(
      resumo.pulados > 0
        ? `${resumo.copiados} peça(s) copiada(s). ${resumo.pulados} já estavam vinculadas e foram ignoradas.`
        : `${resumo.copiados} peça(s) copiada(s).`
    );
    carregar();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Peças deste equipamento</h2>
          <div className="page-header__desc">Lista técnica: peças que este ativo utiliza e o estoque disponível de cada uma</div>
        </div>
        {podeEditar && (
          <div className="row-actions">
            <button type="button" className="btn btn--secondary" onClick={() => setModalCopiar(true)}>
              Copiar lista técnica de outro ativo
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setModalVincular({ vinculo: null })}>
              Vincular peça
            </button>
          </div>
        )}
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}
      {aviso && (
        <div className="card" style={{ marginBottom: "16px", borderColor: "var(--c-primary-200)", background: "var(--c-primary-50)", color: "var(--c-primary-800)" }}>
          {aviso}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Aplicação</th>
              <th>Posição</th>
              <th>Qtd. padrão</th>
              <th>Troca obrig.</th>
              <th>Estoque</th>
              {podeEditar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {vinculos?.map((v) => {
              const abaixo = v.estoque_atual < v.estoque_minimo;
              return (
                <tr key={v.id}>
                  <td className="mono">{v.codigo}</td>
                  <td>{v.descricao}</td>
                  <td>{v.aplicacao}</td>
                  <td>{v.posicao}</td>
                  <td className="mono">
                    {v.quantidade_padrao} {v.unidade_medida}
                  </td>
                  <td>{v.troca_obrigatoria ? "Sim" : "Não"}</td>
                  <td>
                    <span className={`badge ${abaixo ? "badge--estoque-baixo" : "badge--estoque-ok"}`}>
                      <span className="badge__dot" /> {v.estoque_atual} {v.unidade_medida}
                    </span>
                  </td>
                  {podeEditar && (
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn--ghost" onClick={() => setModalVincular({ vinculo: v })}>
                          Editar
                        </button>
                        <button type="button" className="btn btn--ghost" onClick={() => setRemovendo(v)}>
                          Remover
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {vinculos?.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 8 : 7} className="empty-state">
                  Nenhuma peça vinculada a este ativo ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalVincular && (
        <VincularPecaModal
          ativoId={ativoId}
          vinculo={modalVincular.vinculo}
          qtdFilhosDiretos={qtdFilhosDiretos}
          onFechar={() => setModalVincular(null)}
          onSalvo={aoSalvarVinculo}
        />
      )}

      {modalCopiar && (
        <CopiarListaTecnicaModal
          ativoId={ativoId}
          pecaIdsJaVinculadas={new Set((vinculos ?? []).map((v) => v.peca_id))}
          onFechar={() => setModalCopiar(false)}
          onCopiado={aoCopiar}
        />
      )}

      {removendo && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setRemovendo(null)}>
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="modal__header">
              <h2 className="modal__title">Remover vínculo</h2>
            </div>
            <p style={{ color: "var(--c-n-700)", marginBottom: "8px" }}>
              Remover o vínculo com <strong>{removendo.descricao}</strong>?
            </p>
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setRemovendo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--destructive" onClick={confirmarRemocao}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
