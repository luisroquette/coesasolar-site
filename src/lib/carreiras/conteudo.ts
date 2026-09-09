const TITULOS = /^(?:💻|🔍|⭐|💰)?\s*(?:o que (?:você fará|buscamos)|diferenciais|remuneração e benefícios)\s*:?$/i;

export function normalizarItensConteudo(itens: string[]): string[] {
  return itens
    .flatMap((item) => item.split(/\r?\n/))
    .map((item) => item.replace(/^\s*>+\s*/, '').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').trim())
    .map((item) => item.replace(/\*/g, '').replace(/:$/, '').trim())
    .filter((item) => item && !TITULOS.test(item));
}

export function normalizarTexto(texto: string): string {
  return normalizarItensConteudo([texto]).join('\n');
}
