import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AlertaReposicao, MovimentoEstoque, Peca } from "../types";
import { MovimentoEstoqueModal, ROTULO_TIPO_MOVIMENTO } from "../components/MovimentoEstoqueModal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function formatarNumero(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatarSinal(n: number): string {
  if (n > 0) return `+${formatarNumero(n)}`;
  if (n < 0) return formatarNumero(n);
  return "0";
}

export function Almoxarifado() {
  const { pode } = useAuth();
  const [alertas, setAlertas] = useState<AlertaReposicao[] | null>(null);
  const [movimentos, setMovimentos] = useState<MovimentoEstoque[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [pecaFiltro, setPecaFiltro] = useState("");
  const [modalAberto, setModalAberto] = useState(false);

  function carregarAlertas() {
    api
      .get<{ alertas: AlertaReposicao[] }>("/almoxarifado/alertas")
      .then((r) => setAlertas(r.alertas))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os alertas de reposição."));
  }

  function carregarMovimentos() {
    const params = new URLSearchParams();
    if (tipoFiltro) params.set("tipo", tipoFiltro);
    if (pecaFiltro) params.set("pecaId", pecaFiltro);
    api
      .get<{ movimentos: MovimentoEstoque[] }>(`/almoxarifado/movimentos?${params.toString()}`)
      .then((r) => setMovimentos(r.movimentos))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as movimentações."));
  }

  useEffect(() => {
    api.get<{ pecas: Peca[] }>("/pecas").then((r) => setPecas(r.pecas));
    carregarAlertas();
  }, []);
  usePolling(carregarAlertas, INTERVALO_POLLING_PADRAO);

  useEffect(carregarMovimentos, [tipoFiltro, pecaFiltro]);
  usePolling(carregarMovimentos, INTERVALO_POLLING_PADRAO);

  function aoSalvarMovimento() {
    setModalAberto(false);
    carregarAlertas();
    carregarMovimentos();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Almoxarifado</h1>
          <div className="page-header__desc">Estoque de peças, movimentações e alertas de reposição</div>
        </div>
        {pode("almoxarifado", "criar") && (
          <button type="button" className="btn btn--primary" onClick={() => setModalAberto(true)}>
            Registrar movimento
          </button>
        )}
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="card" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "4px" }}>Alertas de reposição</h3>
        <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "16px" }}>
          Peças com estoque no ou abaixo do ponto de pedido
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Estoque atual</th>
                <th>Reservado</th>
                <th>Disponível</th>
                <th>Mínimo</th>
                <th>Ponto de pedido</th>
                <th>Lead time</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {alertas?.map((a) => (
                <tr key={a.id}>
                  <td className="mono">
                    <Link to={`/pecas/${a.id}`}>{a.codigo}</Link>
                  </td>
                  <td>{a.descricao}</td>
                  <td className="mono">
                    {formatarNumero(a.estoque_atual)} {a.unidade_medida}
                  </td>
                  <td className="mono">
                    {formatarNumero(a.quantidade_reservada_total)} {a.unidade_medida}
                  </td>
                  <td className="mono">
                    {formatarNumero(a.estoque_disponivel)} {a.unidade_medida}
                  </td>
                  <td className="mono">{formatarNumero(a.estoque_minimo)}</td>
                  <td className="mono">{formatarNumero(a.ponto_de_pedido)}</td>
                  <td>{a.lead_time_dias}d</td>
                  <td>
                    <span className={`badge ${a.nivel === "critico" ? "badge--status-atrasada" : "badge--estoque-baixo"}`}>
                      <span className="badge__dot" /> {a.nivel === "critico" ? "Crítico" : "Atenção"}
                    </span>
                  </td>
                </tr>
              ))}
              {alertas?.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-state">
                    Nenhuma peça abaixo do ponto de pedido no momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "16px" }}>Movimentações</h3>
        <div className="filters-bar" style={{ marginBottom: "16px" }}>
          <div className="field">
            <label htmlFor="f-peca">Peça</label>
            <select id="f-peca" className="input" value={pecaFiltro} onChange={(e) => setPecaFiltro(e.target.value)}>
              <option value="">Todas</option>
              {pecas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.descricao}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-tipo">Tipo</label>
            <select id="f-tipo" className="input" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ROTULO_TIPO_MOVIMENTO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Peça</th>
                <th>Tipo</th>
                <th>Quantidade</th>
                <th>Saldo após</th>
                <th>OS</th>
                <th>Motivo</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {movimentos?.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.data}</td>
                  <td>
                    <Link to={`/pecas/${m.peca_id}`}>{m.peca_codigo}</Link> — {m.peca_descricao}
                  </td>
                  <td>{ROTULO_TIPO_MOVIMENTO[m.tipo]}</td>
                  <td className="mono" style={{ color: m.quantidade > 0 ? "var(--c-success-700)" : m.quantidade < 0 ? "var(--c-n-700)" : undefined }}>
                    {formatarSinal(m.quantidade)} {m.unidade_medida}
                  </td>
                  <td className="mono">
                    {formatarNumero(m.saldo_apos)} {m.unidade_medida}
                  </td>
                  <td className="mono">{m.os_codigo ?? "—"}</td>
                  <td>{m.motivo ?? "—"}</td>
                  <td>{m.usuario_nome}</td>
                </tr>
              ))}
              {movimentos?.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-state">
                    Nenhuma movimentação encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalAberto && <MovimentoEstoqueModal onFechar={() => setModalAberto(false)} onSalvo={aoSalvarMovimento} />}
    </div>
  );
}
