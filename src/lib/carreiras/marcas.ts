// Logomarcas de benefício via logo.dev — regra do COESA-DESIGN-SYSTEM.md §6:
// empresa citada nominalmente ganha a logo oficial (nunca recriada por IA).

const LOGO_DEV_TOKEN = 'pk_A3_K-y1HSoORzn7QksCwNA';

const MARCAS: Record<string, string> = {
  ifood: 'ifood.com.br',
  wellhub: 'wellhub.com',
  gympass: 'wellhub.com', // nome antigo do Wellhub
  uber: 'uber.com',
};

/** Devolve a URL da logo se o texto do benefício citar uma marca conhecida; null senão. */
export function logoDeMarca(textoBeneficio: string): string | null {
  const texto = textoBeneficio.toLowerCase();
  const dominio = Object.entries(MARCAS).find(([nome]) => texto.includes(nome))?.[1];
  if (!dominio) return null;
  return `https://img.logo.dev/${dominio}?token=${LOGO_DEV_TOKEN}&size=80&format=png`;
}
