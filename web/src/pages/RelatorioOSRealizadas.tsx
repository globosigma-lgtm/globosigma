import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { AtivoComArvore, UsuarioSimples } from "../types";
import { ROTULO_TIPO_OS } from "../components/OSFormModal";
import { hojeSistema } from "../lib/horarioSistema";

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function RelatorioOSRealizadas() {
  const [params] = useSearchParams();
  const tipoPadrao = params.get("tipo") ?? "";

  const hoje = hojeSistema();
  const [inicio, setInicio] = useState(somarDias(hoje, -30));
  const [fim, setFim] = useState(hoje);
  const [tipo, setTipo] = useState(tipoPadrao);
  const [ativoId, setAtivoId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSimples[]>([]);

  useEffect(() => {
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
    api.get<{ usuarios: UsuarioSimples[] }>("/usuarios/simples").then((r) => setUsuarios(r.usuarios));
  }, []);

  function abrirRelatorio() {
    const query = new URLSearchParams({ inicio, fim });
    if (tipo) query.set("tipo", tipo);
    if (ativoId) query.set("ativoId", ativoId);
    if (responsavelId) query.set("responsavelId", responsavelId);
    window.open(`/relatorios/os-realizadas/imprimir?${query.toString()}`, "_blank");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Relatório de OS realizadas</h1>
          <div className="page-header__desc">
            OS concluídas no período, com o checklist completo de cada uma — manutenção, lubrificação e inspeção
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "12px" }}>Filtros</h3>
        <div className="filters-bar">
          <div className="field">
            <label htmlFor="inicio">Concluídas de</label>
            <input id="inicio" type="date" className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="fim">até</label>
            <input id="fim" type="date" className="input" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-tipo">Tipo</label>
            <select id="f-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ROTULO_TIPO_OS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-ativo">Ativo</label>
            <select id="f-ativo" className="input" value={ativoId} onChange={(e) => setAtivoId(e.target.value)}>
              <option value="">Todos</option>
              {ativos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.caminho}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-responsavel">Responsável</label>
            <select id="f-responsavel" className="input" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.matricula})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: "12px" }}>
          <button type="button" className="btn btn--primary" onClick={abrirRelatorio}>
            Gerar relatório
          </button>
        </div>
      </div>
    </div>
  );
}
