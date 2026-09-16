import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { OrdemServico, OSPendenteAuditoria, PrioridadeOS, UsuarioSimples } from "../types";
import { ROTULO_CRITICIDADE } from "../components/AtivoFormModal";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { Modal } from "../components/Modal";
import { hojeSistema } from "../lib/horarioSistema";
import { usePolling, INTERVALO_POLLING_PADRAO } from "../lib/usePolling";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [data] = iso.split(" ");
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function AtribuirAuditoriaModal({
  os,
  onFechar,
  onSalvo,
}: {
  os: OSPendenteAuditoria;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [inspetores, setInspetores] = useState<UsuarioSimples[]>([]);
  const [inspetorId, setInspetorId] = useState("");
  const [dataProgramada, setDataProgramada] = useState(hojeSistema());
  const [dataLimite, setDataLimite] = useState(hojeSistema());
  const [prioridade, setPrioridade] = useState<PrioridadeOS>("media");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples?perfil=Inspetor").then((r) => setInspetores(r.usuarios));
  }, []);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post("/inspecoes/auditorias", {
        os_auditada_id: os.id,
        inspetor_id: Number(inspetorId),
        data_programada: dataProgramada,
        data_limite: dataLimite,
        prioridade,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível atribuir a conferência.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Atribuir conferência de ${os.codigo}`} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <p style={{ color: "var(--c-n-700)" }}>
          O inspetor verá o checklist original de <strong>{os.codigo}</strong> ({os.ativo_nome}) e marcará cada item
          como conforme ou divergente.
        </p>
        <div className="field">
          <label htmlFor="inspetor_id">Inspetor</label>
          <select id="inspetor_id" className="input" value={inspetorId} onChange={(e) => setInspetorId(e.target.value)} required>
            <option value="">Selecione…</option>
            {inspetores.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.matricula})
              </option>
            ))}
          </select>
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_programada">Data programada</label>
            <input id="data_programada" type="date" className="input" value={dataProgramada} onChange={(e) => setDataProgramada(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="data_limite">Data limite</label>
            <input id="data_limite" type="date" className="input" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="prioridade">Prioridade</label>
          <select id="prioridade" className="input" value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeOS)}>
            {Object.entries(ROTULO_CRITICIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando || !inspetorId}>
            {enviando ? "Atribuindo…" : "Atribuir conferência"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AuditoriasOS() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [pendentes, setPendentes] = useState<OSPendenteAuditoria[] | null>(null);
  const [emAndamento, setEmAndamento] = useState<OrdemServico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [modalOS, setModalOS] = useState<OSPendenteAuditoria | null>(null);

  const PERFIS_ATRIBUICAO_INSPECAO = ["Administrador", "Coordenador de PCM", "Planejador", "Supervisor de manutenção"];
  const podeAtribuir = !!usuario && PERFIS_ATRIBUICAO_INSPECAO.includes(usuario.perfil_nome);

  function carregar() {
    const params = new URLSearchParams();
    if (texto) params.set("texto", texto);
    api
      .get<{ pendentes: OSPendenteAuditoria[] }>(`/inspecoes/auditorias/pendentes?${params.toString()}`)
      .then((r) => setPendentes(r.pendentes))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar as OS pendentes de conferência."));
    api
      .get<{ ordens: OrdemServico[] }>(`/inspecoes?texto=`)
      .then((r) => setEmAndamento(r.ordens.filter((o) => o.subtipo_inspecao === "auditoria_os")))
      .catch(() => undefined);
  }

  useEffect(carregar, [texto]);
  usePolling(carregar, INTERVALO_POLLING_PADRAO);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Conferência de OS executadas</h1>
          <div className="page-header__desc">
            O inspetor verifica in loco se uma OS concluída por um técnico foi realmente executada como registrado
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder="Código ou descrição da OS" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
      </div>

      {erro && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erro}
        </div>
      )}

      <div className="card" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px" }}>OS concluídas pendentes de conferência</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Ativo</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Executada por</th>
                <th>Concluída em</th>
                {podeAtribuir && <th></th>}
              </tr>
            </thead>
            <tbody>
              {pendentes?.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.codigo}</td>
                  <td>{o.ativo_nome}</td>
                  <td>{ROTULO_TIPO_OS[o.tipo as keyof typeof ROTULO_TIPO_OS] ?? o.tipo}</td>
                  <td>{o.descricao ?? "—"}</td>
                  <td>{o.responsavel_nome ?? "—"}</td>
                  <td className="mono">{formatarData(o.data_conclusao)}</td>
                  {podeAtribuir && (
                    <td>
                      <button type="button" className="btn btn--ghost" onClick={() => setModalOS(o)}>
                        Atribuir conferência
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {pendentes?.length === 0 && (
                <tr>
                  <td colSpan={podeAtribuir ? 7 : 6} className="empty-state">
                    Nenhuma OS concluída pendente de conferência.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "12px" }}>Conferências em andamento ou concluídas</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Ativo</th>
                <th>Inspetor</th>
                <th>Status</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {emAndamento?.map((o) => (
                <tr key={o.id} onClick={() => navigate(`/inspecoes/auditorias/${o.id}`)} style={{ cursor: "pointer" }}>
                  <td className="mono">{o.codigo}</td>
                  <td>{o.ativo_nome}</td>
                  <td>{o.responsavel_nome ?? "—"}</td>
                  <td>
                    <span className={`badge badge--status-${o.status}`}>
                      <span className="badge__dot" /> {o.status}
                    </span>
                  </td>
                  <td>{o.resultado_inspecao ?? "—"}</td>
                </tr>
              ))}
              {emAndamento?.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Nenhuma conferência atribuída ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOS && (
        <AtribuirAuditoriaModal
          os={modalOS}
          onFechar={() => setModalOS(null)}
          onSalvo={() => {
            setModalOS(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}
