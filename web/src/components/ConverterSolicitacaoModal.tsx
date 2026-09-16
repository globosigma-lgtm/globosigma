import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { OrdemServico, PrioridadeOS, Solicitacao, TipoOS, TipoResposta, UsuarioSimples } from "../types";
import { ROTULO_TIPO_OS } from "./OSFormModal";
import { ROTULO_CRITICIDADE } from "./AtivoFormModal";
import { Modal } from "./Modal";
import { hojeSistema } from "../lib/horarioSistema";

const hoje = hojeSistema;

const ROTULO_TIPO_RESPOSTA: Record<TipoResposta, string> = {
  ok_nok: "Ok / Não ok",
  texto: "Texto",
  numerico: "Numérico",
  selecao: "Seleção",
};

interface ItemChecklistForm {
  chave: string;
  descricao: string;
  tipo_resposta: TipoResposta;
  obrigatoria: boolean;
}

function novoItemChecklist(): ItemChecklistForm {
  return { chave: Math.random().toString(36).slice(2), descricao: "", tipo_resposta: "ok_nok", obrigatoria: true };
}

export function ConverterSolicitacaoModal({
  solicitacao,
  onFechar,
  onSalvo,
}: {
  solicitacao: Solicitacao;
  onFechar: () => void;
  onSalvo: (resultado: { solicitacao: Solicitacao; os: OrdemServico }) => void;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);
  const [tipo, setTipo] = useState<TipoOS>("corretiva");
  const [prioridade, setPrioridade] = useState<PrioridadeOS>(solicitacao.prioridade_sugerida);
  const [descricaoServico, setDescricaoServico] = useState(solicitacao.descricao);
  const [checklist, setChecklist] = useState<ItemChecklistForm[]>([novoItemChecklist()]);
  const [dataProgramada, setDataProgramada] = useState(hoje());
  const [dataLimite, setDataLimite] = useState(hoje());
  const [responsavelId, setResponsavelId] = useState("");
  const [horasEstimadas, setHorasEstimadas] = useState("1");
  const [exigeParada, setExigeParada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuarios(r.usuarios));
  }, []);

  function alterarItem(chave: string, alteracao: Partial<ItemChecklistForm>) {
    setChecklist((itens) => itens.map((item) => (item.chave === chave ? { ...item, ...alteracao } : item)));
  }

  function removerItem(chave: string) {
    setChecklist((itens) => itens.filter((item) => item.chave !== chave));
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const itensValidos = checklist.filter((item) => item.descricao.trim());
    if (!itensValidos.length) {
      setErro("Adicione ao menos um item de serviço/checklist a ser realizado.");
      return;
    }
    setEnviando(true);
    try {
      const resultado = await api.post<{ solicitacao: Solicitacao; os: OrdemServico }>(`/solicitacoes/${solicitacao.id}/converter`, {
        tipo,
        prioridade,
        descricao: descricaoServico.trim(),
        checklist: itensValidos.map((item) => ({
          descricao: item.descricao.trim(),
          tipo_resposta: item.tipo_resposta,
          obrigatoria: item.obrigatoria,
        })),
        data_programada: dataProgramada,
        data_limite: dataLimite,
        responsavel_id: responsavelId ? Number(responsavelId) : null,
        horas_estimadas: Number(horasEstimadas) || 0,
        exige_parada_linha: exigeParada,
      });
      onSalvo(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível converter a solicitação em OS.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Converter em ordem de serviço" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
          A OS herda o ativo da solicitação <strong>{solicitacao.codigo}</strong> e já nasce "aberta". Descreva o serviço que
          será executado e monte o checklist com os itens/serviços a realizar — o solicitante vai acompanhar os dois na tela
          da OS.
        </p>
        <div className="field">
          <label htmlFor="descricao_servico">Descrição do serviço a ser realizado</label>
          <textarea
            id="descricao_servico"
            className="input"
            rows={3}
            value={descricaoServico}
            onChange={(e) => setDescricaoServico(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Checklist de serviços a realizar</label>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: "170px" }}>Tipo de resposta</th>
                  <th style={{ width: "90px" }}>Obrigatório</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((item) => (
                  <tr key={item.chave}>
                    <td>
                      <input
                        className="input"
                        placeholder="Ex.: Trocar rolamento do motor"
                        value={item.descricao}
                        onChange={(e) => alterarItem(item.chave, { descricao: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="input"
                        value={item.tipo_resposta}
                        onChange={(e) => alterarItem(item.chave, { tipo_resposta: e.target.value as TipoResposta })}
                      >
                        {Object.entries(ROTULO_TIPO_RESPOSTA).map(([valor, rotulo]) => (
                          <option key={valor} value={valor}>
                            {rotulo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.obrigatoria}
                        onChange={(e) => alterarItem(item.chave, { obrigatoria: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={checklist.length === 1}
                        onClick={() => removerItem(item.chave)}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ marginTop: "8px" }}
            onClick={() => setChecklist((itens) => [...itens, novoItemChecklist()])}
          >
            Adicionar item
          </button>
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOS)}>
              {Object.entries(ROTULO_TIPO_OS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
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
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_programada">Data programada</label>
            <input
              id="data_programada"
              type="date"
              className="input"
              value={dataProgramada}
              onChange={(e) => setDataProgramada(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="data_limite">Data limite</label>
            <input id="data_limite" type="date" className="input" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} required />
          </div>
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="responsavel_id">Responsável</label>
            <select id="responsavel_id" className="input" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              <option value="">Nenhum</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.matricula})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="horas_estimadas">Horas estimadas</label>
            <input
              id="horas_estimadas"
              type="number"
              step="0.5"
              min="0"
              className="input mono"
              value={horasEstimadas}
              onChange={(e) => setHorasEstimadas(e.target.value)}
            />
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={exigeParada} onChange={(e) => setExigeParada(e.target.checked)} />
          Exige parada de linha
        </label>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Convertendo…" : "Converter em OS"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
