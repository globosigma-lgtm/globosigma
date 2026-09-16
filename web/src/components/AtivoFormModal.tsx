import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Ativo, AtivoComArvore, CriticidadeAtivo, StatusAtivo, TipoAtivo } from "../types";
import { Modal } from "./Modal";

export const ROTULO_TIPO: Record<TipoAtivo, string> = {
  equipamento: "Equipamento",
  componente: "Componente",
  instalacao: "Instalação",
  veiculo: "Veículo",
  ferramenta: "Ferramenta",
};

export const ROTULO_CRITICIDADE: Record<CriticidadeAtivo, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const ROTULO_STATUS_ATIVO: Record<StatusAtivo, string> = {
  operando: "Operando",
  parado: "Parado",
  em_manutencao: "Em manutenção",
  desativado: "Desativado",
};

interface FormState {
  codigo: string;
  nome: string;
  ativo_pai_id: string;
  tipo: TipoAtivo;
  setor: string;
  localizacao: string;
  fabricante: string;
  modelo: string;
  numero_serie: string;
  data_aquisicao: string;
  data_instalacao: string;
  criticidade: CriticidadeAtivo;
  status: StatusAtivo;
  centro_custo: string;
  observacoes: string;
}

function estadoInicial(ativo: Ativo | null): FormState {
  return {
    codigo: ativo?.codigo ?? "",
    nome: ativo?.nome ?? "",
    ativo_pai_id: ativo?.ativo_pai_id ? String(ativo.ativo_pai_id) : "",
    tipo: ativo?.tipo ?? "equipamento",
    setor: ativo?.setor ?? "",
    localizacao: ativo?.localizacao ?? "",
    fabricante: ativo?.fabricante ?? "",
    modelo: ativo?.modelo ?? "",
    numero_serie: ativo?.numero_serie ?? "",
    data_aquisicao: ativo?.data_aquisicao ?? "",
    data_instalacao: ativo?.data_instalacao ?? "",
    criticidade: ativo?.criticidade ?? "media",
    status: ativo?.status ?? "operando",
    centro_custo: ativo?.centro_custo ?? "",
    observacoes: ativo?.observacoes ?? "",
  };
}

export function AtivoFormModal({
  ativo,
  onFechar,
  onSalvo,
}: {
  ativo: Ativo | null;
  onFechar: () => void;
  onSalvo: (ativo: Ativo) => void;
}) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(ativo));
  const [opcoesPai, setOpcoesPai] = useState<AtivoComArvore[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setOpcoesPai(r.ativos));
    if (!ativo) {
      api.get<{ codigo: string }>("/ativos/codigo-sugerido").then((r) =>
        setForm((f) => ({ ...f, codigo: r.codigo }))
      );
    }
  }, [ativo]);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const payload = {
      codigo: form.codigo.trim(),
      nome: form.nome.trim(),
      ativo_pai_id: form.ativo_pai_id ? Number(form.ativo_pai_id) : null,
      tipo: form.tipo,
      setor: form.setor.trim() || null,
      localizacao: form.localizacao.trim() || null,
      fabricante: form.fabricante.trim() || null,
      modelo: form.modelo.trim() || null,
      numero_serie: form.numero_serie.trim() || null,
      data_aquisicao: form.data_aquisicao || null,
      data_instalacao: form.data_instalacao || null,
      criticidade: form.criticidade,
      status: form.status,
      centro_custo: form.centro_custo.trim() || null,
      observacoes: form.observacoes.trim() || null,
    };
    try {
      const resultado = ativo
        ? await api.put<{ ativo: Ativo }>(`/ativos/${ativo.id}`, payload)
        : await api.post<{ ativo: Ativo }>("/ativos", payload);
      onSalvo(resultado.ativo);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o ativo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={ativo ? "Editar ativo" : "Novo ativo"} onFechar={onFechar}>
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
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" className="input" value={form.tipo} onChange={(e) => set("tipo", e.target.value as TipoAtivo)}>
              {Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="nome">Nome</label>
          <input id="nome" className="input" value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="ativo_pai_id">Ativo pai</label>
          <select id="ativo_pai_id" className="input" value={form.ativo_pai_id} onChange={(e) => set("ativo_pai_id", e.target.value)}>
            <option value="">Nenhum (topo da hierarquia)</option>
            {opcoesPai
              .filter((op) => !ativo || op.id !== ativo.id)
              .map((op) => (
                <option key={op.id} value={op.id}>
                  {op.caminho}
                </option>
              ))}
          </select>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="setor">Setor</label>
            <input id="setor" className="input" value={form.setor} onChange={(e) => set("setor", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="localizacao">Localização</label>
            <input id="localizacao" className="input" value={form.localizacao} onChange={(e) => set("localizacao", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="fabricante">Fabricante</label>
            <input id="fabricante" className="input" value={form.fabricante} onChange={(e) => set("fabricante", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="modelo">Modelo</label>
            <input id="modelo" className="input" value={form.modelo} onChange={(e) => set("modelo", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="numero_serie">Número de série</label>
            <input id="numero_serie" className="input mono" value={form.numero_serie} onChange={(e) => set("numero_serie", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="centro_custo">Centro de custo</label>
            <input id="centro_custo" className="input" value={form.centro_custo} onChange={(e) => set("centro_custo", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="data_aquisicao">Data de aquisição</label>
            <input id="data_aquisicao" type="date" className="input" value={form.data_aquisicao} onChange={(e) => set("data_aquisicao", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="data_instalacao">Data de instalação</label>
            <input id="data_instalacao" type="date" className="input" value={form.data_instalacao} onChange={(e) => set("data_instalacao", e.target.value)} />
          </div>
        </div>

        <div className="modal__grid">
          <div className="field">
            <label htmlFor="criticidade">Criticidade</label>
            <select id="criticidade" className="input" value={form.criticidade} onChange={(e) => set("criticidade", e.target.value as CriticidadeAtivo)}>
              {Object.entries(ROTULO_CRITICIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" className="input" value={form.status} onChange={(e) => set("status", e.target.value as StatusAtivo)}>
              {Object.entries(ROTULO_STATUS_ATIVO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="observacoes">Observações</label>
          <textarea id="observacoes" className="input" rows={3} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
        </div>

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
