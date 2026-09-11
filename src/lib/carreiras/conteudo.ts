const TITULOS = /^(?:💻|🔍|⭐|💰|💼)?\s*(?:o que (?:você fará|buscamos)|diferenciais|remuneração e benefícios)\s*:?$/i;
const CTA_CURRICULO = /envie (?:seu )?currículo/i;

export function normalizarItensConteudo(itens: string[]): string[] {
  return itens
    .flatMap((item) => item.split(/\r?\n/))
    .map((item) => item.replace(/^\s*>+\s*/, '').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').trim())
    .map((item) => item.replace(/\*/g, '').replace(/:$/, '').trim())
    .filter((item) => item && !TITULOS.test(item) && !CTA_CURRICULO.test(item));
}

export function normalizarDiferenciais(itens: string[]): string[] {
  const linhas = itens.flatMap((item) => item.split(/\r?\n/));
  const proximaSecao = linhas.findIndex((item) => /remuneração e benefícios/i.test(item));
  return normalizarItensConteudo(proximaSecao === -1 ? linhas : linhas.slice(0, proximaSecao));
}

export function normalizarTexto(texto: string): string {
  return normalizarItensConteudo([texto]).join('\n');
}
