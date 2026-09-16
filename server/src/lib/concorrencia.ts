/**
 * Processa `itens` com no máximo `limite` execuções de `fn` em paralelo, preservando a posição de
 * cada resultado (`resultados[i]` corresponde a `itens[i]`, na ordem original).
 *
 * Motivação (LOTE-PERF): os serviços de geração de OS em lote (planos, lubrificação, inspeção)
 * confirmavam uma ocorrência por vez, e cada ocorrência fazia de 10 a 25 round-trips sequenciais
 * ao Postgres (~50ms cada round-trip em produção). Um lote de poucas dezenas de OS já passava do
 * tempo limite da function serverless da Netlify, e o front-end recebia uma resposta sem corpo
 * JSON — daí o "Erro inesperado ao comunicar com o servidor" recorrente. O limite de concorrência
 * evita apenas estourar o pool de conexões do Postgres (padrão: 10) num lote muito grande.
 */
export async function processarComConcorrencia<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;

  async function worker(): Promise<void> {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker));
  return resultados;
}
