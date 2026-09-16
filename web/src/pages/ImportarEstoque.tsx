import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { ImportacaoEstoque, ResultadoSimulacaoImportacao, SituacaoLinhaImportacao } from "../types";

const ROTULO_SITUACAO: Record<SituacaoLinhaImportacao, string> = {
  atualizar: "Vai atualizar",
  sem_alteracao: "Sem alteração",
  nao_encontrada: "Código não encontrado",
  invalida: "Linha inválida",
};

const BADGE_SITUACAO: Record<SituacaoLinhaImportacao, string> = {
  atualizar: "badge--status-em_execucao",
  sem_alteracao: "badge--status-cancelada",
  nao_encontrada: "badge--status-atrasada",
  invalida: "badge--status-atrasada",
};

function formatarQuantidade(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function ImportarEstoque() {
  const { pode } = useAuth();
  const podeImportar = pode("almoxarifado", "criar");
  const inputRef = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSimulacaoImportacao | null>(null);
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [historico, setHistorico] = useState<ImportacaoEstoque[] | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);

  function carregarHistorico() {
    api
      .get<{ importacoes: ImportacaoEstoque[] }>("/almoxarifado/importacoes")
      .then((r) => setHistorico(r.importacoes))
      .catch((e) => setErroHistorico(e instanceof ApiError ? e.message : "Não foi possível carregar o histórico de importações."));
  }

  useEffect(carregarHistorico, []);

  async function aoSimular() {
    if (!arquivo) return;
    setSimulando(true);
    setErroSimulacao(null);
    setSucesso(null);
    setResultado(null);
    setExcluidas(new Set());
    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      const r = await api.upload<ResultadoSimulacaoImportacao>("/almoxarifado/importacoes/simular", formData);
      setResultado(r);
    } catch (e) {
      setErroSimulacao(e instanceof ApiError ? e.message : "Não foi possível ler a planilha.");
    } finally {
      setSimulando(false);
    }
  }

  function alternarExclusao(linha: number) {
    setExcluidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(linha)) novo.delete(linha);
      else novo.add(linha);
      return novo;
    });
  }

  const itensParaAplicar = (resultado?.linhas ?? []).filter((l) => l.situacao === "atualizar" && !excluidas.has(l.linha));

  async function aoConfirmar() {
    if (!resultado || itensParaAplicar.length === 0) return;
    setConfirmando(true);
    setErroConfirmacao(null);
    try {
      await api.post<{ importacao: ImportacaoEstoque }>("/almoxarifado/importacoes/confirmar", {
        nome_arquivo: resultado.nomeArquivo,
        itens: itensParaAplicar.map((l) => ({ peca_id: l.pecaId, quantidade: l.quantidadePlanilha })),
        nao_encontradas: resultado.resumo.naoEncontradas,
        invalidas: resultado.resumo.invalidas,
      });
      setSucesso(`Estoque atualizado: ${itensParaAplicar.length} peça(s).`);
      setResultado(null);
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      carregarHistorico();
    } catch (e) {
      setErroConfirmacao(e instanceof ApiError ? e.message : "Não foi possível confirmar a importação.");
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Importar estoque</h1>
          <div className="page-header__desc">Suba a planilha diária de quantidades para atualizar o estoque das peças</div>
        </div>
      </div>

      {!podeImportar && (
        <div className="empty-state" style={{ marginBottom: "24px" }}>
          Seu perfil não tem permissão para importar estoque. Fale com o Administrador ou o Almoxarife.
        </div>
      )}

      {podeImportar && (
        <div className="card" style={{ marginBottom: "24px" }}>
          <div className="field" style={{ marginBottom: "12px" }}>
            <label htmlFor="arquivo-planilha">Arquivo (.xlsx, .xls, .xlsb, .ods ou .csv)</label>
            <input
              id="arquivo-planilha"
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsb,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "12px" }}>
            Se o arquivo tiver várias abas, o sistema usa automaticamente a que tiver uma coluna de código da peça (ex.: "Código")
            junto com uma de quantidade (ex.: "Quantidade" ou "Estoque atual") — abas só com nomes/descrições são ignoradas.
          </div>
          <button type="button" className="btn btn--primary" disabled={!arquivo || simulando} onClick={aoSimular}>
            {simulando ? "Lendo planilha…" : "Simular importação"}
          </button>
          {erroSimulacao && (
            <div className="login-card__error" style={{ marginTop: "12px" }}>
              {erroSimulacao}
            </div>
          )}
        </div>
      )}

      {sucesso && (
        <div className="alert alert--success" style={{ marginBottom: "16px" }}>
          {sucesso}
        </div>
      )}

      {resultado && (
        <div className="card" style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "4px", color: "var(--c-n-700)" }}>Prévia — {resultado.nomeArquivo}</h2>
          <div style={{ fontSize: "var(--text-small)", color: "var(--c-n-500)", marginBottom: "12px" }}>
            Aba usada: <strong>{resultado.abaUsada}</strong> (coluna de código: "{resultado.colunaCodigo}", coluna de quantidade: "
            {resultado.colunaQuantidade}")
          </div>
          <div className="row-actions" style={{ marginBottom: "16px", flexWrap: "wrap", fontSize: "var(--text-small)" }}>
            <span className="badge badge--status-em_execucao">
              <span className="badge__dot" /> {resultado.resumo.atualizar} vão atualizar
            </span>
            <span className="badge badge--status-cancelada">
              <span className="badge__dot" /> {resultado.resumo.semAlteracao} sem alteração
            </span>
            <span className="badge badge--status-atrasada">
              <span className="badge__dot" /> {resultado.resumo.naoEncontradas} não encontrada(s)
            </span>
            <span className="badge badge--status-atrasada">
              <span className="badge__dot" /> {resultado.resumo.invalidas} inválida(s)
            </span>
          </div>

          <div className="table-wrap" style={{ marginBottom: "16px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Linha</th>
                  <th>Código</th>
                  <th>Peça</th>
                  <th>Estoque atual</th>
                  <th>Planilha</th>
                  <th>Diferença</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l) => (
                  <tr key={l.linha}>
                    <td>
                      {l.situacao === "atualizar" && (
                        <input type="checkbox" checked={!excluidas.has(l.linha)} onChange={() => alternarExclusao(l.linha)} />
                      )}
                    </td>
                    <td className="mono">{l.linha}</td>
                    <td className="mono">{l.codigo || "—"}</td>
                    <td>{l.pecaDescricao ?? l.erro ?? "—"}</td>
                    <td className="mono">{formatarQuantidade(l.estoqueAtual)}</td>
                    <td className="mono">{l.situacao === "invalida" ? "—" : formatarQuantidade(l.quantidadePlanilha)}</td>
                    <td className="mono">
                      {l.delta != null ? (l.delta > 0 ? `+${formatarQuantidade(l.delta)}` : formatarQuantidade(l.delta)) : "—"}
                    </td>
                    <td>
                      <span className={`badge ${BADGE_SITUACAO[l.situacao]}`}>
                        <span className="badge__dot" /> {ROTULO_SITUACAO[l.situacao]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erroConfirmacao && (
            <div className="login-card__error" style={{ marginBottom: "12px" }}>
              {erroConfirmacao}
            </div>
          )}

          <button type="button" className="btn btn--primary" disabled={itensParaAplicar.length === 0 || confirmando} onClick={aoConfirmar}>
            {confirmando ? "Aplicando…" : `Confirmar importação (${itensParaAplicar.length} peça${itensParaAplicar.length === 1 ? "" : "s"})`}
          </button>
        </div>
      )}

      <h2 style={{ fontSize: "var(--text-h3)", marginBottom: "12px", color: "var(--c-n-700)" }}>Importações anteriores</h2>
      {erroHistorico && (
        <div className="login-card__error" style={{ marginBottom: "16px" }}>
          {erroHistorico}
        </div>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Arquivo</th>
              <th>Atualizadas</th>
              <th>Sem alteração</th>
              <th>Não encontradas</th>
              <th>Inválidas</th>
              <th>Quando</th>
              <th>Por</th>
            </tr>
          </thead>
          <tbody>
            {historico?.map((i) => (
              <tr key={i.id}>
                <td className="mono">{i.codigo}</td>
                <td>{i.nome_arquivo}</td>
                <td className="mono">{i.linhas_atualizadas}</td>
                <td className="mono">{i.linhas_sem_alteracao}</td>
                <td className="mono">{i.linhas_nao_encontradas}</td>
                <td className="mono">{i.linhas_invalidas}</td>
                <td className="mono">{i.criado_em}</td>
                <td>{i.criado_por_nome}</td>
              </tr>
            ))}
            {historico?.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  Nenhuma importação registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
