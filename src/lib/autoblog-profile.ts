/** Dados públicos da instalação. Nunca coloque chaves, tokens ou dados de clientes aqui. */
export const AUTOBLOG_PROFILE = {
  brand: {
    name: 'Coesa Solar',
    siteUrl: 'https://coesasolar.com.br',
    logoUrl: 'https://coesasolar.com.br/favicon.png',
  },
  blog: {
    title: 'Blog | Coesa Solar',
    description: 'Conteúdo prático sobre energia solar por assinatura: como funciona, quanto economiza e como escolher sem investimento inicial.',
    heading: 'Energia solar sem dor de cabeça',
    intro: 'Guias, comparativos e explicações para quem quer economizar na conta de luz sem obras, sem instalação e sem investimento.',
  },
  editorial: {
    businessDescription:
      'Coesa Solar — energia solar por assinatura em Minas Gerais. O cliente economiza até 30% na conta de luz sem investimento inicial, sem obras e sem instalação própria: a energia vem das fazendas solares da Coesa. Planos de 15% a 30% de desconto conforme a faixa de consumo, contratados 100% digital.',
    audience:
      'donos de casa e pequenos empresários de Minas Gerais que pagam conta de luz acima de R$ 200 por mês e querem reduzir o custo sem obra e sem investimento',
    tone: 'claro, direto e acessível; sem jargão elétrico pesado; fala com quem não é técnico',
    internalLinks: [
      {
        label: 'Simule sua economia',
        url: 'https://coesasolar.com.br/',
        description: 'Simulador oficial da Coesa Solar para calcular o desconto na conta de luz',
      },
    ],
    seedKeywords: [
      'energia solar por assinatura como funciona',
      'economizar na conta de luz sem instalação',
      'geração distribuída compartilhada vale a pena',
      'quanto economiza energia solar por assinatura',
      'energia solar sem investimento inicial',
      'desconto na conta de luz Minas Gerais',
    ],
  },
  cta: {
    title: 'Quer saber quanto você economiza?',
    subtitle: 'Simule em menos de 1 minuto, sem compromisso.',
    buttonLabel: 'Simular economia',
    url: 'https://coesasolar.com.br/',
  },
  integrations: {
    googleSearchConsoleEnabled: false,
    imageGenerationEnabled: true,
  },
} as const;
