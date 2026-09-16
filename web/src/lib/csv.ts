/** BI-02: exporta a listagem já filtrada em tela para CSV — sem round-trip ao servidor, os dados já estão carregados. */
export function exportarCSV<T>(nomeArquivo: string, colunas: { titulo: string; valor: (linha: T) => string | number | null | undefined }[], linhas: T[]) {
  function escapar(valor: string): string {
    if (/[";\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
    return valor;
  }

  const cabecalho = colunas.map((c) => escapar(c.titulo)).join(";");
  const corpo = linhas.map((linha) => colunas.map((c) => escapar(String(c.valor(linha) ?? ""))).join(";")).join("\n");
  const conteudo = `﻿${cabecalho}\n${corpo}`; // BOM pra acentuação abrir certo no Excel

  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
