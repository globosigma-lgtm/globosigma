import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { ItemCurvaABC } from "../types";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

const COR_CLASSE: Record<ItemCurvaABC["classe"], string> = {
  A: "badge--prioridade-critica",
  B: "badge--prioridade-media",
  C: "badge--prioridade-baixa",
};

/** NOVO-05: classificação ABC por valor consumido — foca a atenção do Almoxarifado nos poucos itens que concentram a maior parte do valor movimentado. */
export function CurvaABC() {
  const [itens, setItens] = useState<ItemCurvaABC[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    api
      .get<{ itens: ItemCurvaABC[] }>("/indicadores/curva-abc")
      .then((r) => setItens(r.itens))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a curva ABC."));
  }

  useEffect(carregar, []);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  const resumo = itens
    ? (["A", "B", "C"] as const).map((classe) => ({
        classe,
        qtd: itens.filter((i) => i.classe === classe).length,
        valor: itens.filter((i) => i.classe === classe).reduce((s, i) => s + i.valor_consumido, 0),
      }))
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Curva ABC de peças</h1>
          <div className="page-header__desc">
            Classificação por valor consumido (saídas de estoque × custo unitário) — classe A concentra até 80% do valor, B até 95%, C o restante.
          </div>
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      {itens && (
        <div className="card-grid" style={{ marginBottom: "24px" }}>
          {resumo.map((r) => (
            <div className="card" key={r.classe}>
              <div className="stat-card__label">Classe {r.classe}</div>
              <div className="stat-card__value">{r.qtd}</div>
              <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>{formatarMoeda(r.valor)} consumidos</div>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Valor consumido</th>
              <th>% do total</th>
              <th>% acumulado</th>
              <th>Classe</th>
            </tr>
          </thead>
          <tbody>
            {itens?.map((i) => (
              <tr key={i.peca_id}>
                <td className="mono">
                  <Link to={`/pecas/${i.peca_id}`}>{i.codigo}</Link>
                </td>
                <td>{i.descricao}</td>
                <td className="mono">{formatarMoeda(i.valor_consumido)}</td>
                <td className="mono">{i.pct_do_total.toFixed(1)}%</td>
                <td className="mono">{i.pct_acumulado.toFixed(1)}%</td>
                <td>
                  <span className={`badge ${COR_CLASSE[i.classe]}`}>{i.classe}</span>
                </td>
              </tr>
            ))}
            {itens?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  Nenhuma saída de estoque com custo registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
