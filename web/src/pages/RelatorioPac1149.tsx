import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AtivoComArvore } from "../types";
import { semanaDoAno } from "../lib/semanas";

export function RelatorioPac1149() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [semanaInicio, setSemanaInicio] = useState(1);
  const [semanaFim, setSemanaFim] = useState(1);
  const [setor, setSetor] = useState("");
  const [ativoId, setAtivoId] = useState("");
  const [setores, setSetores] = useState<string[]>([]);
  const [ativos, setAtivos] = useState<AtivoComArvore[]>([]);

  useEffect(() => {
    api.get<{ setores: string[] }>("/relatorios/setores").then((r) => setSetores(r.setores));
    api.get<{ ativos: AtivoComArvore[] }>("/ativos").then((r) => setAtivos(r.ativos));
  }, []);

  const totalSemanas = semanaDoAno(`${ano}-12-31`);
  const semanas = Array.from({ length: totalSemanas }, (_, i) => i + 1);

  function abrirRelatorio() {
    const params = new URLSearchParams({ ano: String(ano), semanaInicio: String(semanaInicio), semanaFim: String(semanaFim) });
    if (setor) params.set("setor", setor);
    if (ativoId) params.set("ativoId", ativoId);
    window.open(`/relatorios/pac-1149/imprimir?${params.toString()}`, "_blank");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>FORM PAC 001_1149 — Lubrificação</h1>
          <div className="page-header__desc">
            Relatório semanal auditável dos pontos de lubrificação executados via OS, com checklist de parâmetros por equipamento
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "12px" }}>Filtros</h3>
        <div className="filters-bar">
          <div className="field">
            <label htmlFor="ano">Ano</label>
            <input id="ano" type="number" className="input mono" value={ano} onChange={(e) => setAno(Number(e.target.value) || new Date().getFullYear())} />
          </div>
          <div className="field">
            <label htmlFor="semana-inicio">Semana inicial</label>
            <select id="semana-inicio" className="input" value={semanaInicio} onChange={(e) => setSemanaInicio(Number(e.target.value))}>
              {semanas.map((s) => (
                <option key={s} value={s}>
                  Semana {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="semana-fim">Semana final</label>
            <select id="semana-fim" className="input" value={semanaFim} onChange={(e) => setSemanaFim(Number(e.target.value))}>
              {semanas.map((s) => (
                <option key={s} value={s}>
                  Semana {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-setor">Setor</label>
            <select id="f-setor" className="input" value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">Todos</option>
              {setores.map((s) => (
                <option key={s} value={s}>
                  {s}
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
