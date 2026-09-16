/** BI-01: barra horizontal simples (rótulo + trilho + valor) — sem depender de biblioteca de gráficos. */
export function BarraHorizontal({
  itens,
  formatarValor,
  cor = "var(--c-primary-500)",
}: {
  itens: { chave: string | number; rotulo: string; valor: number }[];
  formatarValor: (v: number) => string;
  cor?: string;
}) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {itens.map((item) => (
        <div key={item.chave} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "var(--text-small)", color: "var(--c-n-700)", marginBottom: "3px" }}>{item.rotulo}</div>
            <div style={{ background: "var(--c-n-200)", borderRadius: "var(--radius-full)", height: "8px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${(item.valor / maximo) * 100}%`,
                  height: "100%",
                  background: cor,
                  borderRadius: "var(--radius-full)",
                }}
              />
            </div>
          </div>
          <div className="mono" style={{ fontSize: "var(--text-small)", color: "var(--c-n-800)", fontWeight: 600, whiteSpace: "nowrap" }}>
            {formatarValor(item.valor)}
          </div>
        </div>
      ))}
    </div>
  );
}
