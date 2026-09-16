import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { VinculoPecaAtivo } from "../types";
import { ROTULO_CRITICIDADE } from "./AtivoFormModal";

export function PecaAtivosTab({ pecaId }: { pecaId: number }) {
  const [ativos, setAtivos] = useState<VinculoPecaAtivo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ ativos: VinculoPecaAtivo[] }>(`/pecas/${pecaId}/ativos`)
      .then((r) => setAtivos(r.ativos))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os equipamentos."));
  }, [pecaId]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Equipamentos que usam esta peça</h2>
          <div className="page-header__desc">
            Útil para avaliar o impacto de uma ruptura de estoque desta peça na planta
          </div>
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Equipamento</th>
              <th>Criticidade</th>
              <th>Aplicação</th>
              <th>Qtd. padrão</th>
              <th>Troca obrig.</th>
            </tr>
          </thead>
          <tbody>
            {ativos?.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.codigo}</td>
                <td>
                  <Link to={`/ativos/${a.ativo_id}`}>{a.caminho}</Link>
                </td>
                <td>
                  <span className={`badge badge--prioridade-${a.criticidade}`}>{ROTULO_CRITICIDADE[a.criticidade]}</span>
                </td>
                <td>{a.aplicacao}</td>
                <td className="mono">{a.quantidade_padrao}</td>
                <td>{a.troca_obrigatoria ? "Sim" : "Não"}</td>
              </tr>
            ))}
            {ativos?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  Nenhum equipamento usa esta peça ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
