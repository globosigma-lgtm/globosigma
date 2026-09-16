import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Peca, UnidadeMedida } from "../types";
import { Modal } from "./Modal";

export const ROTULO_UNIDADE: Record<UnidadeMedida, string> = {
  un: "Unidade (un)",
  m: "Metro (m)",
  kg: "Quilograma (kg)",
  l: "Litro (l)",
  cx: "Caixa (cx)",
  par: "Par",
  rolo: "Rolo",
};

interface FormState {
  codigo: string;
  descricao: string;
  unidade_medida: UnidadeMedida;
  categoria: string;
  fabricante: string;
  codigo_fabricante: string;
  estoque_atual: string;
  estoque_minimo: string;
  ponto_de_pedido: string;
  lead_time_dias: string;
  custo_unitario_medio: string;
  fornecedor_preferencial: string;
  localizacao_almoxarifado: string;
  ativa: boolean;
}

function estadoInicial(peca: Peca | null): FormState {
  return {
    codigo: peca?.codigo ?? "",
    descricao: peca?.descricao ?? "",
    unidade_medida: peca?.unidade_medida ?? "un",
    categoria: peca?.categoria ?? "",
    fabricante: peca?.fabricante ?? "",
    codigo_fabricante: peca?.codigo_fabricante ?? "",
    estoque_atual: peca ? String(peca.estoque_atual) : "0",
    estoque_minimo: peca ? String(peca.estoque_minimo) : "0",
    ponto_de_pedido: peca ? String(peca.ponto_de_pedido) : "0",
    lead_time_dias: peca ? String(peca.lead_time_dias) : "0",
    custo_unitario_medio: peca ? String(peca.custo_unitario_medio) : "0",
    fornecedor_preferencial: peca?.fornecedor_preferencial ?? "",
    localizacao_almoxarifado: peca?.localizacao_almoxarifado ?? "",
    ativa: peca ? peca.ativa === 1 : true,
  };
}

export function PecaFormModal({
  peca,
  onFechar,
  onSalvo,
}: {
  peca: Peca | null;
  onFechar: () => void;
  onSalvo: (peca: Peca) => void;
}) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(peca));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!peca) {
      api.get<{ codigo: string }>("/pecas/codigo-sugerido").then((r) => setForm((f) => ({ ...f, codigo: r.codigo })));
    }
  }, [peca]);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      codigo: form.codigo.trim(),
      descricao: form.descricao.trim(),
      unidade_medida: form.unidade_medida,
      categoria: form.categoria.trim() || null,
      fabricante: form.fabricante.trim() || null,
      codigo_fabricante: form.codigo_fabricante.trim() || null,
      estoque_atual: Number(form.estoque_atual) || 0,
      estoque_minimo: Number(form.estoque_minimo) || 0,
      ponto_de_pedido: Number(form.ponto_de_pedido) || 0,
      lead_time_dias: Number(form.lead_time_dias) || 0,
      custo_unitario_medio: Number(form.custo_unitario_medio) || 0,
      fornecedor_preferencial: form.fornecedor_preferencial.trim() || null,
      localizacao_almoxarifado: form.localizacao_almoxarifado.trim() || null,
      ativa: form.ativa,
    };
    try {
      const resultado = peca
        ? await api.put<{ peca: Peca }>(`/pecas/${peca.id}`, payload)
        : await api.post<{ peca: Peca }>("/pecas", payload);
      onSalvo(resultado.peca);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar a peça.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={peca ? "Editar peça" : "Nova peça"} onFechar={onFechar}>
      <form onSubmit={aoEnviar} className="modal__body">
        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="codigo">Código</label>
            <input id="codigo" className="input mono" value={form.codigo} onChange={(e) => set("codigo", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="unidade_medida">Unidade de medida</label>
            <select id="unidade_medida" className="input" value={form.unidade_medida} onChange={(e) => set("unidade_medida", e.target.value as UnidadeMedida)}>
              {Object.entries(ROTULO_UNIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="descricao">Descrição</label>
          <input id="descricao" className="input" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="categoria">Categoria</label>
            <input id="categoria" className="input" value={form.categoria} onChange={(e) => set("categoria", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="fabricante">Fabricante</label>
            <input id="fabricante" className="input" value={form.fabricante} onChange={(e) => set("fabricante", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="codigo_fabricante">Código do fabricante</label>
            <input id="codigo_fabricante" className="input mono" value={form.codigo_fabricante} onChange={(e) => set("codigo_fabricante", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="fornecedor_preferencial">Fornecedor preferencial</label>
            <input id="fornecedor_preferencial" className="input" value={form.fornecedor_preferencial} onChange={(e) => set("fornecedor_preferencial", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="estoque_atual">Estoque atual</label>
            <input id="estoque_atual" type="number" step="0.01" min="0" className="input mono" value={form.estoque_atual} onChange={(e) => set("estoque_atual", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="estoque_minimo">Estoque mínimo</label>
            <input id="estoque_minimo" type="number" step="0.01" min="0" className="input mono" value={form.estoque_minimo} onChange={(e) => set("estoque_minimo", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="ponto_de_pedido">Ponto de pedido</label>
            <input id="ponto_de_pedido" type="number" step="0.01" min="0" className="input mono" value={form.ponto_de_pedido} onChange={(e) => set("ponto_de_pedido", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="lead_time_dias">Lead time (dias)</label>
            <input id="lead_time_dias" type="number" min="0" className="input mono" value={form.lead_time_dias} onChange={(e) => set("lead_time_dias", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="custo_unitario_medio">Custo unitário médio (R$)</label>
            <input id="custo_unitario_medio" type="number" step="0.01" min="0" className="input mono" value={form.custo_unitario_medio} onChange={(e) => set("custo_unitario_medio", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="localizacao_almoxarifado">Localização no almoxarifado</label>
            <input id="localizacao_almoxarifado" className="input" value={form.localizacao_almoxarifado} onChange={(e) => set("localizacao_almoxarifado", e.target.value)} />
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-small)" }}>
          <input type="checkbox" checked={form.ativa} onChange={(e) => set("ativa", e.target.checked)} />
          Peça ativa
        </label>

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
