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
    // Persona: para QUEM se escreve (dores, contexto, decisões) — guia Neil/RD: persona antes da keyword.
    persona:
      'morador de Minas Gerais com conta de luz acima de R$ 200, que já ouviu falar de energia solar mas acha que exige obra, telhado próprio ou dinheiro guardado — procura no Google se dá para economizar sem instalar nada',
    tone: 'claro, direto e acessível; sem jargão elétrico pesado; fala com quem não é técnico',
    // URL da newsletter — aparece no CTA fallback quando cta.url estiver vazio
    newsletterUrl: '',
    internalLinks: [
      {
        label: 'Simule sua economia',
        url: 'https://coesasolar.com.br/',
        description: 'Simulador oficial da Coesa Solar para calcular o desconto na conta de luz',
      },
    ],
    // Categorias do blog: o LLM escolhe UMA por artigo (arquitetura da informação — RD)
    categories: [
      { slug: 'guias', label: 'Guias' },
      { slug: 'comparativos', label: 'Comparativos' },
      { slug: 'faq', label: 'FAQ' },
      { slug: 'economia', label: 'Economia' },
    ] as Array<{ slug: string; label: string }>,
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
    // A/B de CTA: lista vazia = sem teste (usa title/subtitle/buttonLabel/url acima).
    // Com 2+ variantes, o sistema rotaciona por slug+semana (determinístico, sem
    // cookie) e mede os cliques por variante em /api/blog/metrics.
    variants: [] as Array<{ title: string; subtitle: string; buttonLabel: string; url: string }>,
  },
  theme: {
    // CTA em cor de contraste: primary forte sobre fundo claro converte mais (Neil Patel: +38%).
    primary: '#F97316',
    background: '#FFFFFF',
    foreground: '#1A1524',
    muted: '#5C5668',
    border: '#E7E3EE',
    card: '#FFFFFF',
    destructive: '#DC2626',
  },
  // Formulário de captura (aparece no fim do artigo e na listagem quando o plug está ativo)
  leadForm: {
    title: 'Receba os próximos guias de economia',
    subtitle: 'Conteúdo prático direto na sua caixa — sem spam.',
    buttonLabel: 'Receber conteúdo',
    successMessage: 'Pronto! Você receberá os próximos guias.',
  },
  integrations: {
    googleSearchConsoleEnabled: false,
    imageGenerationEnabled: true,
    // GA4 do site inteiro (layout): o ID oficial da Coesa Solar. Vazio desligaria
    // o gtag global — as métricas próprias (Redis/Upstash, ver src/lib/blog/metrics.ts)
    // continuam funcionando de forma independente.
    googleAnalyticsMeasurementId: 'G-TKZQ0VXJ61',
    // Opcional: gera outline validado antes do corpo (RD recomenda planejar antes de escrever).
    // Custo: 1 chamada extra de LLM por artigo.
    twoStageGenerationEnabled: false,
    // Captura de leads: entrega para um plug de CRM (nunca tabela própria).
    // destination 'trello' exige envs TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_LIST_ID.
    leadCapture: {
      enabled: false,
      destination: 'trello',
    },
    // Divulgação pós-publish: cada canal é um plug ativo aqui.
    // 'telegram' (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID),
    // 'email_digest' (EMAIL_DIGEST_WEBHOOK_URL — onde o MailMKT da família encaixa),
    // 'social_webhook' (SOCIAL_WEBHOOK_URL — entrega o post pronto p/ Zapier/n8n/Make).
    distribution: {
      enabled: false,
      channels: [] as string[],
    },
    // Mídia paga: hook reservado ("abrir a carteira"). Sem integração até o
    // dono escolher a plataforma — orçamento e canal viram config do perfil.
    paidPromotionEnabled: false,
    // Infográfico no fim do artigo (gpt-image-1 quadrado, sem texto).
    // Custo: 1 imagem extra por artigo — ligar junto com imageGenerationEnabled.
    infographicsEnabled: false,
  },
} as const;
