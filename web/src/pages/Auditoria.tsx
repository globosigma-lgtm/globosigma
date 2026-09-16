import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { AcaoAuditoria, RegistroAuditoria, UsuarioSimples } from "../types";
import { Modal } from "../components/Modal";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  criar: "Criação",
  editar: "Edição",
  excluir: "Exclusão",
  status: "Mudança de status",
};

const BADGE_ACAO: Record<AcaoAuditoria, string> = {
  criar: "badge--estoque-ok",
  editar: "badge--status-em_execucao",
  excluir: "badge--status-cancelada",
  status: "badge--status-aberta",
};

function rotularCampo(campo: string): string {
  const rotulado = campo.replace(/_/g, " ");
  return rotulado.charAt(0).toUpperCase() + rotulado.slice(1);
}

function formatarValorCampo(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function ehRegistroSimples(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function DetalhesModal({ registro, onFechar }: { registro: RegistroAuditoria; onFechar: () => void }) {
  const anterior = ehRegistroSimples(registro.valor_anterior) ? registro.valor_anterior : null;
  const novo = ehRegistroSimples(registro.valor_novo) ? registro.valor_novo : null;
  const campos = Array.from(new Set([...(anterior ? Object.keys(anterior) : []), ...(novo ? Object.keys(novo) : [])]));

  return (
    <Modal titulo={`${registro.entidade} #${registro.entidade_id ?? "—"} — ${ROTULO_ACAO[registro.acao]}`} onFechar={onFechar}>
      <div className="modal__body">
        <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
          {!anterior && novo && "Registro criado com os dados abaixo."}
          {anterior && !novo && "Registro removido — estes eram os dados no momento da exclusão."}
          {anterior && novo && "Campos alterados aparecem em destaque."}
        </p>

        {campos.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campo</th>
                  {anterior && <th>Antes</th>}
                  {novo && <th>Depois</th>}
                </tr>
              </thead>
              <tbody>
                {campos.map((campo) => {
                  const valorAnterior = anterior ? anterior[campo] : undefined;
                  const valorNovo = novo ? novo[campo] : undefined;
                  const mudou = !!anterior && !!novo && JSON.stringify(valorAnterior) !== JSON.stringify(valorNovo);
                  return (
                    <tr key={campo}>
                      <td>{rotularCampo(campo)}</td>
                      {anterior && (
                        <td style={{ color: mudou ? "var(--c-n-500)" : undefined }}>{formatarValorCampo(valorAnterior)}</td>
                      )}
                      {novo && (
                        <td style={{ color: mudou ? "var(--c-primary-700)" : undefined, fontWeight: mudou ? 600 : undefined }}>
                          {formatarValorCampo(valorNovo)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">Nenhum detalhe adicional registrado.</p>
        )}

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Auditoria() {
  const [registros, setRegistros] = useState<RegistroAuditoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [entidades, setEntidades] = useState<string[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);
  const [entidade, setEntidade] = useState("");
  const [acao, setAcao] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [selecionado, setSelecionado] = useState<RegistroAuditoria | null>(null);

  useEffect(() => {
    api.get<{ entidades: string[] }>("/auditoria/entidades").then((r) => setEntidades(r.entidades));
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuarios(r.usuarios));
  }, []);

  function carregar() {
    const params = new URLSearchParams();
    if (entidade) params.set("entidade", entidade);
    if (acao) params.set("acao", acao);
    if (usuarioId) params.set("usuarioId", usuarioId);
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);
    api
      .get<{ registros: RegistroAuditoria[] }>(`/auditoria?${params.toString()}`)
      .then((r) => setRegistros(r.registros))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar a trilha de auditoria."));
  }

  useEffect(carregar, [entidade, acao, usuarioId, dataInicio, dataFim]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Trilha de auditoria</h1>
          <div className="page-header__desc">Histórico de criação, edição, exclusão e mudança de status em todos os módulos</div>
        </div>
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="f-entidade">Entidade</label>
          <select id="f-entidade" className="input" value={entidade} onChange={(e) => setEntidade(e.target.value)}>
            <option value="">Todas</option>
            {entidades.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-acao">Ação</label>
          <select id="f-acao" className="input" value={acao} onChange={(e) => setAcao(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_ACAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-usuario">Usuário</label>
          <select id="f-usuario" className="input" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-inicio">De</label>
          <input id="f-inicio" type="date" className="input" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-fim">Até</label>
          <input id="f-fim" type="date" className="input" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
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
              <th>Data</th>
              <th>Entidade</th>
              <th>ID</th>
              <th>Ação</th>
              <th>Usuário</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {registros?.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.data}</td>
                <td>{r.entidade}</td>
                <td className="mono">{r.entidade_id ?? "—"}</td>
                <td>
                  <span className={`badge ${BADGE_ACAO[r.acao]}`}>
                    <span className="badge__dot" /> {ROTULO_ACAO[r.acao]}
                  </span>
                </td>
                <td>{r.usuario_nome ?? "—"}</td>
                <td>
                  <button type="button" className="btn btn--ghost" onClick={() => setSelecionado(r)}>
                    Ver detalhes
                  </button>
                </td>
              </tr>
            ))}
            {registros?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  Nenhum registro de auditoria encontrado com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {registros && registros.length >= 500 && (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)", marginTop: "8px" }}>
          Mostrando os 500 registros mais recentes — refine os filtros para ver um período menor.
        </p>
      )}

      {selecionado && <DetalhesModal registro={selecionado} onFechar={() => setSelecionado(null)} />}
    </div>
  );
}
