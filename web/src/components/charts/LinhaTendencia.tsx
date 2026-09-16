/** BI-01: linha de tendência (área preenchida + grade + ponto final em destaque) para séries curtas — sem biblioteca de gráficos. */
export function LinhaTendencia({
  pontos,
  formatarValor,
  formatarRotulo,
  cor = "var(--c-primary-500)",
}: {
  pontos: { chave: string; valor: number }[];
  formatarValor: (v: number) => string;
  formatarRotulo: (chave: string) => string;
  cor?: string;
}) {
  const largura = 720;
  const altura = 220;
  // topo com espaço extra pra caber o rótulo de valor acima do ponto mais alto, sem cortar no
  // topo do viewBox quando o último ponto é o próprio máximo da série (caso comum: série subindo).
  const margem = { topo: 32, baixo: 32, esquerda: 8, direita: 8 };
  const areaLargura = largura - margem.esquerda - margem.direita;
  const areaAltura = altura - margem.topo - margem.baixo;

  const maximo = Math.max(1, ...pontos.map((p) => p.valor));
  const passoX = pontos.length > 1 ? areaLargura / (pontos.length - 1) : 0;
  const coordenadas = pontos.map((p, i) => ({
    x: margem.esquerda + i * passoX,
    y: margem.topo + areaAltura - (p.valor / maximo) * areaAltura,
    ...p,
  }));

  const linha = coordenadas.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const area = `${linha} L ${coordenadas[coordenadas.length - 1]?.x.toFixed(1)} ${margem.topo + areaAltura} L ${coordenadas[0]?.x.toFixed(1)} ${margem.topo + areaAltura} Z`;

  const gridY = [0, 0.5, 1].map((f) => margem.topo + areaAltura * f);
  // mostra só ~6 rótulos no eixo X pra não empilhar texto quando há muitos pontos
  const passoRotulo = Math.max(1, Math.ceil(coordenadas.length / 6));

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" role="img" aria-label="Backlog de OS em aberto ao longo das últimas semanas">
      {gridY.map((y) => (
        <line key={y} x1={margem.esquerda} y1={y} x2={largura - margem.direita} y2={y} stroke="var(--c-n-200)" strokeWidth={1} />
      ))}
      <path d={area} fill={cor} opacity={0.12} stroke="none" />
      <path d={linha} fill="none" stroke={cor} strokeWidth={2} />
      {coordenadas.map((c, i) => (
        <g key={c.chave}>
          {i === coordenadas.length - 1 && <circle cx={c.x} cy={c.y} r={4.5} fill={cor} />}
          {i % passoRotulo === 0 && (
            <text x={c.x} y={altura - margem.baixo + 18} textAnchor="middle" fontSize={11} fill="var(--c-n-500)" fontFamily="var(--font-mono)">
              {formatarRotulo(c.chave)}
            </text>
          )}
        </g>
      ))}
      {coordenadas.length > 0 && (
        <text
          x={coordenadas[coordenadas.length - 1].x}
          y={Math.max(14, coordenadas[coordenadas.length - 1].y - 10)}
          textAnchor="end"
          fontSize={13}
          fontWeight={700}
          fill={cor}
          fontFamily="var(--font-mono)"
        >
          {formatarValor(pontos[pontos.length - 1].valor)}
        </text>
      )}
    </svg>
  );
}
