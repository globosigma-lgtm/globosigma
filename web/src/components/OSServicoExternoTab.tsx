import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AtivoComArvore, Fornecedor, ServicoExterno, StatusPagamentoServicoExterno, TipoServicoExterno } from "../types";
import { ROTULO_STATUS_LOGISTICO_SERVICO_EXTERNO, ROTULO_STATUS_PAGAMENTO_SERVICO_EXTERNO, ROTULO_TIPO_SERVICO_EXTERNO } from "../types";
import { Modal } from "./Modal";
import { agoraSistemaDatetimeLocal, hojeSistema } from "../lib/horarioSistema";

const BADGE_STATUS_LOGISTICO: Record<string, string> = {
  pendente_envio: "badge--status-programada",
  enviado: "badge--status-aguardando_peca",
  retornado: "badge--status-concluida",
  cancelado: "badge--status-cancelada",
};

const BADGE_STATUS_PAGAMENTO: Record<string, string> = {
  pendente: "badge--status-aguardando_peca",
  parcial: "badge--status-em_execucao",
  pago: "badge--status-concluida",
};

function paraDatetimeLocal(valor?: string | null): string {
  return valor ? valor.replace(" ", "T").slice(0, 16) : agoraSistemaDatetimeLocal();
}

function deDatetimeLocal(valor: string): string {
  return `${valor.replace("T", " ")}:00`;
}

function formatarMoeda(valor: number | null): string {
  return valor != null ? `R$ ${valor.toFixed(2)}` : "—";
}

function NovoFornecedorInline({ onCriado }: { onCriado: (f: Fornecedor) => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contato, setContato] = useState("");
  const [telefone, setTelefone] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!aberto) {
    return (
      <button type="button" className="btn btn--ghost" onClick={() => setAberto(true)} style={{ marginTop: "4px" }}>
        + Novo fornecedor
      </button>
    );
  }

  async function salvar() {
    if (!nome.trim()) {
      setErro("Informe o nome do fornecedor.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<{ fornecedor: Fornecedor }>("/fornecedores", {
        nome: nome.trim(),
        cnpj: cnpj.trim() || null,
        contato: contato.trim() || null,
        telefone: telefone.trim() || null,
        especialidade: especialidade.trim() || null,
      });
      onCriado(r.fornecedor);
      setAberto(false);
      setNome("");
      setCnpj("");
      setContato("");
      setTelefone("");
      setEspecialidade("");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível cadastrar o fornecedor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ border: "1px solid var(--c-n-200)", borderRadius: "8px", padding: "12px", marginTop: "8px", display: "grid", gap: "8px" }}>
      {erro && (
        <div className="login-card__error" role="alert">
          {erro}
        </div>
      )}
      <div className="modal__grid">
        <div className="field">
          <label htmlFor="novo_fornecedor_nome">Nome</label>
          <input id="novo_fornecedor_nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="novo_fornecedor_cnpj">CNPJ</label>
          <input id="novo_fornecedor_cnpj" className="input" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="novo_fornecedor_contato">Contato</label>
          <input id="novo_fornecedor_contato" className="input" value={contato} onChange={(e) => setContato(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="novo_fornecedor_telefone">Telefone</label>
          <input id="novo_fornecedor_telefone" className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="novo_fornecedor_especialidade">Especialidade</label>
          <input
            id="novo_fornecedor_especialidade"
            className="input"
            placeholder="Ex.: usinagem, solda"
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
          />
        </div>
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn--secondary" onClick={() => setAberto(false)}>
          Cancelar
        </button>
        <button type="button" className="btn btn--primary" disabled={enviando} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar fornecedor"}
        </button>
      </div>
    </div>
  );
}

function NovoServicoExternoModal({ osId, onFechar, onSalvo }: { osId: number; onFechar: () => void; onSalvo: () => void }) {
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [itemAtivoId, setItemAtivoId] = useState("");
  const [descricaoItem, setDescricaoItem] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [fornecedorId, setFornecedorId] = useState("");
  const [tipoServico, setTipoServico] = useState<TipoServicoExterno>("usinagem");
  const [motivo, setMotivo] = useState("");
  const [dataPrevisaoRetorno, setDataPrevisaoRetorno] = useState("");
  const [valorOrcado, setValorOrcado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    api.get<{ fornecedores: Fornecedor[] }>("/fornecedores").then((r) => setFornecedores(r.fornecedores));
  }, []);

  function aoEscolherAtivo(id: string) {
    setItemAtivoId(id);
    const ativo = ativos.find((a) => String(a.id) === id);
    if (ativo && !descricaoItem.trim()) {
      setDescricaoItem(ativo.tipo === "componente" ? `Componente — ${ativo.nome}` : `${ativo.codigo} — ${ativo.nome}`);
    }
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!fornecedorId) {
      setErro("Selecione o fornecedor / prestador do serviço.");
      return;
    }
    if (!itemAtivoId) {
      setErro("Selecione o Ativo ou Componente enviado.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await api.post("/servicos-externos", {
        os_id: osId,
        item_ativo_id: Number(itemAtivoId),
        descricao_item: descricaoItem.trim(),
        quantidade: Number(quantidade) || 1,
        fornecedor_id: Number(fornecedorId),
        tipo_servico: tipoServico,
        motivo: motivo.trim() || null,
        data_previsao_retorno: dataPrevisaoRetorno || null,
        valor_orcado: valorOrcado ? Number(valorOrcado) : null,
        observacoes: observacoes.trim() || null,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível registrar a saída para serviço externo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Enviar item para serviço externo" onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="item_ativo_id">Ativo ou Componente enviado</label>
          <select id="item_ativo_id" className="input" value={itemAtivoId} onChange={(e) => aoEscolherAtivo(e.target.value)} required>
            <option value="">Selecione…</option>
            {ativos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.caminho}
                {a.tipo === "componente" ? " (componente)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="descricao_item">Descrição do item enviado</label>
          <input
            id="descricao_item"
            className="input"
            value={descricaoItem}
            onChange={(e) => setDescricaoItem(e.target.value)}
            placeholder="Ex.: Eixo do redutor, patrimônio 00123"
            required
          />
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="quantidade">Quantidade</label>
            <input
              id="quantidade"
              type="number"
              step="0.01"
              min="0.01"
              className="input mono"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="tipo_servico">Tipo de serviço</label>
            <select id="tipo_servico" className="input" value={tipoServico} onChange={(e) => setTipoServico(e.target.value as TipoServicoExterno)}>
              {Object.entries(ROTULO_TIPO_SERVICO_EXTERNO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="fornecedor_id">Fornecedor / prestador do serviço</label>
          <select id="fornecedor_id" className="input" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">Selecione…</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          <NovoFornecedorInline
            onCriado={(f) => {
              setFornecedores((atual) => [...atual, f].sort((a, b) => a.nome.localeCompare(b.nome)));
              setFornecedorId(String(f.id));
            }}
          />
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_previsao_retorno">Previsão de retorno</label>
            <input
              id="data_previsao_retorno"
              type="date"
              className="input"
              value={dataPrevisaoRetorno}
              min={hojeSistema()}
              onChange={(e) => setDataPrevisaoRetorno(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="valor_orcado">Valor orçado (R$)</label>
            <input
              id="valor_orcado"
              type="number"
              step="0.01"
              min="0"
              className="input mono"
              value={valorOrcado}
              onChange={(e) => setValorOrcado(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="motivo">Motivo / o que foi constatado</label>
          <textarea id="motivo" className="input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="observacoes">Observações</label>
          <textarea id="observacoes" className="input" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Salvando…" : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EnviarModal({ item, onFechar, onSalvo }: { item: ServicoExterno; onFechar: () => void; onSalvo: () => void }) {
  const [dataEnvio, setDataEnvio] = useState(paraDatetimeLocal(null));
  const [documentoSaida, setDocumentoSaida] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/servicos-externos/${item.id}/enviar`, {
        data_envio: deDatetimeLocal(dataEnvio),
        documento_saida: documentoSaida.trim() || null,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível confirmar o envio.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Confirmar saída — ${item.descricao_item}`} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        {item.peca_id && (
          <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
            Ao confirmar, {item.quantidade} {item.unidade_medida} de <strong>{item.peca_descricao}</strong> dão baixa no estoque.
          </p>
        )}
        <div className="field">
          <label htmlFor="data_envio">Data e hora de saída</label>
          <input id="data_envio" type="datetime-local" className="input" value={dataEnvio} onChange={(e) => setDataEnvio(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="documento_saida">Documento de saída (nota de remessa, guia, etc.)</label>
          <input id="documento_saida" className="input" value={documentoSaida} onChange={(e) => setDocumentoSaida(e.target.value)} />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Confirmando…" : "Confirmar saída"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RetornarModal({ item, onFechar, onSalvo }: { item: ServicoExterno; onFechar: () => void; onSalvo: () => void }) {
  const [dataRetorno, setDataRetorno] = useState(paraDatetimeLocal(null));
  const [devolverAoEstoque, setDevolverAoEstoque] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/servicos-externos/${item.id}/retornar`, {
        data_retorno: deDatetimeLocal(dataRetorno),
        devolver_ao_estoque: devolverAoEstoque,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível confirmar o retorno.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Confirmar retorno — ${item.descricao_item}`} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="field">
          <label htmlFor="data_retorno">Data e hora de retorno</label>
          <input id="data_retorno" type="datetime-local" className="input" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} required />
        </div>
        {item.peca_id && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
            <input type="checkbox" checked={devolverAoEstoque} onChange={(e) => setDevolverAoEstoque(e.target.checked)} />
            Devolver ao estoque geral (desmarcado = volta direto para o equipamento, sem entrada no almoxarifado)
          </label>
        )}
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Confirmando…" : "Confirmar retorno"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelarModal({ item, onFechar, onSalvo }: { item: ServicoExterno; onFechar: () => void; onSalvo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/servicos-externos/${item.id}/cancelar`, { motivo: motivo.trim() });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível cancelar este registro.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Cancelar — ${item.descricao_item}`} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        {item.status_logistico === "enviado" && item.peca_id && (
          <p style={{ fontSize: "var(--text-small)", color: "var(--c-n-600)" }}>
            O estoque de <strong>{item.peca_descricao}</strong> é estornado automaticamente ao cancelar.
          </p>
        )}
        <div className="field">
          <label htmlFor="motivo_cancelamento">Motivo do cancelamento</label>
          <textarea id="motivo_cancelamento" className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Voltar
          </button>
          <button type="submit" className="btn btn--destructive" disabled={enviando || !motivo.trim()}>
            {enviando ? "Cancelando…" : "Cancelar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PagamentoModal({ item, onFechar, onSalvo }: { item: ServicoExterno; onFechar: () => void; onSalvo: () => void }) {
  const [statusPagamento, setStatusPagamento] = useState<StatusPagamentoServicoExterno>(item.status_pagamento);
  const [valorCobrado, setValorCobrado] = useState(item.valor_cobrado != null ? String(item.valor_cobrado) : "");
  const [valorPago, setValorPago] = useState(item.valor_pago != null ? String(item.valor_pago) : "");
  const [dataPagamento, setDataPagamento] = useState(item.data_pagamento ?? hojeSistema());
  const [formaPagamento, setFormaPagamento] = useState(item.forma_pagamento ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.put(`/servicos-externos/${item.id}/pagamento`, {
        status_pagamento: statusPagamento,
        valor_cobrado: valorCobrado ? Number(valorCobrado) : null,
        valor_pago: valorPago ? Number(valorPago) : null,
        data_pagamento: dataPagamento || null,
        forma_pagamento: formaPagamento.trim() || null,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o pagamento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Controle de pagamento — ${item.codigo}`} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="valor_orcado_ro">Valor orçado</label>
            <span className="mono" id="valor_orcado_ro">
              {formatarMoeda(item.valor_orcado)}
            </span>
          </div>
          <div className="field">
            <label htmlFor="status_pagamento">Situação do pagamento</label>
            <select
              id="status_pagamento"
              className="input"
              value={statusPagamento}
              onChange={(e) => setStatusPagamento(e.target.value as StatusPagamentoServicoExterno)}
            >
              {Object.entries(ROTULO_STATUS_PAGAMENTO_SERVICO_EXTERNO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="valor_cobrado">Valor cobrado pelo fornecedor (R$)</label>
            <input
              id="valor_cobrado"
              type="number"
              step="0.01"
              min="0"
              className="input mono"
              value={valorCobrado}
              onChange={(e) => setValorCobrado(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="valor_pago">Valor pago (R$)</label>
            <input id="valor_pago" type="number" step="0.01" min="0" className="input mono" value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
          </div>
        </div>
        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_pagamento">Data do pagamento</label>
            <input id="data_pagamento" type="date" className="input" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="forma_pagamento">Forma de pagamento</label>
            <input
              id="forma_pagamento"
              className="input"
              placeholder="Ex.: boleto, PIX, transferência"
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
            />
          </div>
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar pagamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function OSServicoExternoTab({ osId, podeEditar, bloqueado }: { osId: number; podeEditar: boolean; bloqueado: boolean }) {
  const [servicos, setServicos] = useState<ServicoExterno[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [modalEnviar, setModalEnviar] = useState<ServicoExterno | null>(null);
  const [modalRetornar, setModalRetornar] = useState<ServicoExterno | null>(null);
  const [modalCancelar, setModalCancelar] = useState<ServicoExterno | null>(null);
  const [modalPagamento, setModalPagamento] = useState<ServicoExterno | null>(null);

  function carregar() {
    api
      .get<{ servicos: ServicoExterno[] }>(`/servicos-externos?osId=${osId}`)
      .then((r) => setServicos(r.servicos))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os serviços externos desta OS."));
  }

  useEffect(carregar, [osId]);

  const podeAlterar = podeEditar && !bloqueado;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "var(--text-h3)", color: "var(--c-n-700)" }}>Serviço externo</h2>
          <div className="page-header__desc">Ativos e componentes enviados para usinagem, solda ou outro serviço fora da empresa</div>
        </div>
        {podeAlterar && (
          <button type="button" className="btn btn--primary" onClick={() => setModalNovo(true)}>
            Enviar item
          </button>
        )}
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
              <th>Item</th>
              <th>Fornecedor</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Pagamento</th>
              <th>Valores</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {servicos?.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.codigo}</td>
                <td>
                  {s.descricao_item}
                  {s.item_ativo_codigo && (
                    <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>
                      {s.item_ativo_tipo === "componente" ? "Componente de " : "Ativo "}
                      {s.item_ativo_codigo} — {s.item_ativo_tipo === "componente" ? s.item_ativo_pai_nome : s.item_ativo_nome}
                    </div>
                  )}
                  {s.data_previsao_retorno && s.status_logistico === "enviado" && (
                    <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>Previsão de retorno: {s.data_previsao_retorno}</div>
                  )}
                </td>
                <td>{s.fornecedor_nome}</td>
                <td>{ROTULO_TIPO_SERVICO_EXTERNO[s.tipo_servico]}</td>
                <td>
                  <span className={`badge ${BADGE_STATUS_LOGISTICO[s.status_logistico]}`}>
                    <span className="badge__dot" /> {ROTULO_STATUS_LOGISTICO_SERVICO_EXTERNO[s.status_logistico]}
                  </span>
                </td>
                <td>
                  <span className={`badge ${BADGE_STATUS_PAGAMENTO[s.status_pagamento]}`}>
                    <span className="badge__dot" /> {ROTULO_STATUS_PAGAMENTO_SERVICO_EXTERNO[s.status_pagamento]}
                  </span>
                </td>
                <td className="mono">
                  {formatarMoeda(s.valor_cobrado ?? s.valor_orcado)}
                  {s.valor_pago != null && <div style={{ fontSize: "var(--text-caption)", color: "var(--c-n-500)" }}>Pago: {formatarMoeda(s.valor_pago)}</div>}
                </td>
                <td>
                  <div className="row-actions">
                    <a className="btn btn--ghost" href={`/servicos-externos/${s.id}/imprimir`} target="_blank" rel="noreferrer">
                      Imprimir
                    </a>
                    {podeAlterar && s.status_logistico === "pendente_envio" && (
                      <>
                        <button type="button" className="btn btn--ghost" onClick={() => setModalEnviar(s)}>
                          Confirmar saída
                        </button>
                        <button type="button" className="btn btn--ghost" onClick={() => setModalCancelar(s)}>
                          Cancelar
                        </button>
                      </>
                    )}
                    {podeAlterar && s.status_logistico === "enviado" && (
                      <>
                        <button type="button" className="btn btn--ghost" onClick={() => setModalRetornar(s)}>
                          Confirmar retorno
                        </button>
                        <button type="button" className="btn btn--ghost" onClick={() => setModalCancelar(s)}>
                          Cancelar
                        </button>
                      </>
                    )}
                    {/* SERV-EXT-06: pagamento trava junto com a logística quando a OS encerra —
                        tudo tem que estar quitado ANTES de concluir (osService.ts bloqueia a
                        conclusão nesse caso); depois de encerrada, reabrir a OS é o caminho para
                        corrigir um pagamento. */}
                    {podeAlterar && s.status_logistico !== "cancelado" && (
                      <button type="button" className="btn btn--ghost" onClick={() => setModalPagamento(s)}>
                        Pagamento
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {servicos?.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  Nenhum item enviado para serviço externo nesta OS.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalNovo && (
        <NovoServicoExternoModal
          osId={osId}
          onFechar={() => setModalNovo(false)}
          onSalvo={() => {
            setModalNovo(false);
            carregar();
          }}
        />
      )}
      {modalEnviar && (
        <EnviarModal
          item={modalEnviar}
          onFechar={() => setModalEnviar(null)}
          onSalvo={() => {
            setModalEnviar(null);
            carregar();
          }}
        />
      )}
      {modalRetornar && (
        <RetornarModal
          item={modalRetornar}
          onFechar={() => setModalRetornar(null)}
          onSalvo={() => {
            setModalRetornar(null);
            carregar();
          }}
        />
      )}
      {modalCancelar && (
        <CancelarModal
          item={modalCancelar}
          onFechar={() => setModalCancelar(null)}
          onSalvo={() => {
            setModalCancelar(null);
            carregar();
          }}
        />
      )}
      {modalPagamento && (
        <PagamentoModal
          item={modalPagamento}
          onFechar={() => setModalPagamento(null)}
          onSalvo={() => {
            setModalPagamento(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}
