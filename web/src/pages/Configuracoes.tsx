import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { definirSomAtivado, somAtivado, tocarSom } from "../lib/sons";
import type { Configuracoes as ConfiguracoesType, Feriado, TratamentoDiaNaoUtil } from "../types";

const ROTULO_TRATAMENTO: Record<TratamentoDiaNaoUtil, string> = {
  gerar_na_data: "Gerar na data (ignorar feriado)",
  antecipar: "Antecipar para o dia útil anterior",
  postergar: "Postergar para o próximo dia útil",
};

export function Configuracoes() {
  const { pode } = useAuth();
  const podeEditar = pode("configuracoes", "editar");

  const [config, setConfig] = useState<ConfiguracoesType | null>(null);
  const [tratamento, setTratamento] = useState<TratamentoDiaNaoUtil>("gerar_na_data");
  const [margem, setMargem] = useState("7");
  const [limiteHoras, setLimiteHoras] = useState("8");
  const [erroConfig, setErroConfig] = useState<string | null>(null);
  const [sucessoConfig, setSucessoConfig] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [feriados, setFeriados] = useState<Feriado[] | null>(null);
  const [novaData, setNovaData] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [erroFeriado, setErroFeriado] = useState<string | null>(null);
  const [enviandoFeriado, setEnviandoFeriado] = useState(false);

  const [somAtivo, setSomAtivo] = useState(() => somAtivado());

  function alternarSom(ativo: boolean) {
    setSomAtivo(ativo);
    definirSomAtivado(ativo);
    if (ativo) tocarSom("clique");
  }

  function carregarConfig() {
    api.get<{ configuracoes: ConfiguracoesType }>("/configuracoes").then((r) => {
      setConfig(r.configuracoes);
      setTratamento(r.configuracoes.tratamento_dia_nao_util);
      setMargem(String(r.configuracoes.margem_seguranca_dias));
      setLimiteHoras(String(r.configuracoes.limite_horas_dia_responsavel));
    });
  }

  function carregarFeriados() {
    api.get<{ feriados: Feriado[] }>("/configuracoes/feriados").then((r) => setFeriados(r.feriados));
  }

  useEffect(() => {
    carregarConfig();
    carregarFeriados();
  }, []);

  async function salvarConfig(e: FormEvent) {
    e.preventDefault();
    setErroConfig(null);
    setSucessoConfig(null);
    setSalvando(true);
    try {
      const r = await api.put<{ configuracoes: ConfiguracoesType }>("/configuracoes", {
        tratamento_dia_nao_util: tratamento,
        margem_seguranca_dias: Number(margem) || 0,
        limite_horas_dia_responsavel: Number(limiteHoras) || 0,
      });
      setConfig(r.configuracoes);
      setSucessoConfig("Configurações salvas.");
    } catch (err) {
      setErroConfig(err instanceof ApiError ? err.message : "Não foi possível salvar as configurações.");
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarFeriado(e: FormEvent) {
    e.preventDefault();
    setErroFeriado(null);
    setEnviandoFeriado(true);
    try {
      await api.post("/configuracoes/feriados", { data: novaData, descricao: novaDescricao.trim() });
      setNovaData("");
      setNovaDescricao("");
      carregarFeriados();
    } catch (err) {
      setErroFeriado(err instanceof ApiError ? err.message : "Não foi possível adicionar o feriado.");
    } finally {
      setEnviandoFeriado(false);
    }
  }

  async function removerFeriado(id: number) {
    try {
      await api.del(`/configuracoes/feriados/${id}`);
      carregarFeriados();
    } catch (err) {
      setErroFeriado(err instanceof ApiError ? err.message : "Não foi possível remover o feriado.");
    }
  }

  if (!config) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Configurações gerais</h1>
          <div className="page-header__desc">Parâmetros que afetam o cálculo de recorrência de planos e a geração de OS</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "4px", color: "var(--c-n-700)" }}>Preferências locais</h2>
        <div className="page-header__desc" style={{ marginBottom: "16px" }}>
          Válido apenas para este navegador/dispositivo
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input type="checkbox" checked={somAtivo} onChange={(e) => alternarSom(e.target.checked)} />
          <span>Efeitos sonoros (notificações, ações e cliques)</span>
        </label>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "16px", color: "var(--c-n-700)" }}>Recorrência e carga de trabalho</h2>
        <form onSubmit={salvarConfig} className="modal__body">
          {erroConfig && (
            <div className="login-card__error" role="alert">
              {erroConfig}
            </div>
          )}
          {sucessoConfig && <div className="alert alert--success">{sucessoConfig}</div>}

          <div className="field">
            <label htmlFor="tratamento">Tratamento de dia não útil (feriado)</label>
            <select
              id="tratamento"
              className="input"
              value={tratamento}
              onChange={(e) => setTratamento(e.target.value as TratamentoDiaNaoUtil)}
              disabled={!podeEditar}
            >
              {Object.entries(ROTULO_TRATAMENTO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="modal__grid">
            <div className="field">
              <label htmlFor="margem">Margem de segurança para data limite (dias)</label>
              <input
                id="margem"
                type="number"
                min="0"
                className="input mono"
                value={margem}
                onChange={(e) => setMargem(e.target.value)}
                disabled={!podeEditar}
              />
            </div>
            <div className="field">
              <label htmlFor="limite_horas">Limite de horas por dia por responsável</label>
              <input
                id="limite_horas"
                type="number"
                min="1"
                step="0.5"
                className="input mono"
                value={limiteHoras}
                onChange={(e) => setLimiteHoras(e.target.value)}
                disabled={!podeEditar}
              />
            </div>
          </div>

          {podeEditar && (
            <div className="modal__footer" style={{ justifyContent: "flex-start" }}>
              <button type="submit" className="btn btn--primary" disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar configurações"}
              </button>
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Feriados</h2>
            <div className="page-header__desc">Datas usadas para ajustar ocorrências que caem em dia não útil</div>
          </div>
        </div>

        {erroFeriado && (
          <div className="login-card__error" style={{ marginBottom: "16px" }}>
            {erroFeriado}
          </div>
        )}

        {podeEditar && (
          <form onSubmit={adicionarFeriado} className="filters-bar" style={{ marginBottom: "16px", alignItems: "flex-end" }}>
            <div className="field">
              <label htmlFor="nova_data">Data</label>
              <input id="nova_data" type="date" className="input" value={novaData} onChange={(e) => setNovaData(e.target.value)} required />
            </div>
            <div className="field" style={{ minWidth: "240px" }}>
              <label htmlFor="nova_descricao">Descrição</label>
              <input
                id="nova_descricao"
                className="input"
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn--primary" disabled={enviandoFeriado}>
              {enviandoFeriado ? "Adicionando…" : "Adicionar feriado"}
            </button>
          </form>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                {podeEditar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {feriados?.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.data}</td>
                  <td>{f.descricao}</td>
                  {podeEditar && (
                    <td>
                      <button type="button" className="btn btn--ghost" onClick={() => removerFeriado(f.id)}>
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {feriados?.length === 0 && (
                <tr>
                  <td colSpan={podeEditar ? 3 : 2} className="empty-state">
                    Nenhum feriado cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
