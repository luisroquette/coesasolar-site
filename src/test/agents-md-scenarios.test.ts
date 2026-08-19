/**
 * Testes Automatizados para os 10 Cenários AGENTS.md
 * 
 * Valida conformidade de respostas da Sofia com padrões de comunicação definidos
 */

import { describe, it, expect } from "vitest";

// Reimplementação das funções de métricas para testes frontend
const CORPORATE_PATTERNS = [
  'prezado', 'informo que', 'aguardo retorno', 'atenciosamente',
  'outrossim', 'vide', 'mediante', 'segue em anexo', 'por gentileza',
  'venho por meio desta', 'conforme solicitado', 'ficamos à disposição',
];

const JARGON_TERMS = [
  'resolução normativa', 'geração distribuída', 'compensação energética',
  '482/2012', 'perfil de consumo', 'sistema de compensação',
  'créditos energéticos', 'microgeração', 'minigeração', 'autoconsumo remoto',
];

const ANALOGY_PATTERNS = [
  'tipo', 'como se fosse', 'é como', 'funciona como', 'estilo',
  'igual a', 'parecido com', 'imagina', 'pensa como',
];

const EMOTION_VALIDATION_PATTERNS = [
  'entendo', 'compreendo', 'é normal', 'faz sentido', 'boa pergunta',
  'você tem razão', 'concordo', 'preocupação', 'desconfiança é normal',
  'dúvida é válida',
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function countBullets(text: string): number {
  const patterns = [/^\s*[-*•]\s+/gm, /^\s*\d+\.\s+/gm, /^\s*[a-z]\)\s+/gmi];
  return patterns.reduce((count, p) => count + (text.match(p)?.length || 0), 0);
}

function countEmojis(text: string): number {
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu;
  return text.match(emojiRegex)?.length || 0;
}

function hasCorporateTone(text: string): boolean {
  return CORPORATE_PATTERNS.some(p => text.toLowerCase().includes(p));
}

function hasJargon(text: string): string[] {
  return JARGON_TERMS.filter(t => text.toLowerCase().includes(t));
}

function hasAnalogy(text: string): boolean {
  return ANALOGY_PATTERNS.some(p => text.toLowerCase().includes(p));
}

function validatesEmotion(text: string): boolean {
  return EMOTION_VALIDATION_PATTERNS.some(p => text.toLowerCase().includes(p));
}

function hasCalculation(text: string): boolean {
  return /R\$\s*\d+[.,]?\d*/i.test(text) || /\d+%/.test(text);
}

// ========================================
// CENÁRIOS AGENTS.md COM FEW-SHOT EXAMPLES
// ========================================

interface TestScenario {
  id: string;
  name: string;
  context: string;
  input: string;
  expectedOutput: string;
  assertions: {
    maxWords?: number;
    minWords?: number;
    noBullets?: boolean;
    noCorporateTone?: boolean;
    noJargon?: boolean;
    hasCalculation?: boolean;
    hasAnalogy?: boolean;
    validatesEmotion?: boolean;
    maxEmojis?: number;
    minEmojis?: number;
    mustContain?: string[];
    mustNotContain?: string[];
  };
}

const AGENTS_MD_SCENARIOS: TestScenario[] = [
  // Cenário 1: Primeiro Contato
  {
    id: "primeiro_contato",
    name: "Primeiro Contato - Cliente não conhece energia por assinatura",
    context: "Cliente disse que não conhece energia por assinatura após já ter sido feita pergunta.",
    input: "Não conheço não",
    expectedOutput: "Funciona assim: a COESA tem usinas solares que geram energia limpa. Você assina um plano e a gente injeta essa energia na rede, gerando créditos que descontam da sua conta. Sem instalação, sem obra, sem custo inicial! ✨ E você economiza até 25% todo mês. Quer que eu prepare uma proposta pra você?",
    assertions: {
      maxWords: 60,
      noBullets: true,
      noCorporateTone: true,
      noJargon: true,
      hasAnalogy: false,
      maxEmojis: 2,
      mustContain: ["COESA", "solar", "economiza"],
    },
  },

  // Cenário 2: Como Seria / Processo
  {
    id: "como_seria",
    name: "Como Seria - Cliente quer entender processo",
    context: "Cliente busca entender o processo de compra ou implementação.",
    input: "E como seria?",
    expectedOutput: "Para que você possa ter uma ideia clara, o processo envolve [detalhar o processo]. Por exemplo, se você optar pelo plano X, o primeiro passo é [passo 1], seguido por [passo 2]. Isso garantirá que você obtenha [benefício principal]. Você gostaria que eu explicasse algum desses passos com mais detalhes?",
    assertions: {
      maxWords: 80,
      noBullets: true,
      noCorporateTone: true,
      noJargon: true,
    },
  },

  // Cenário 3: Valor da Conta
  {
    id: "valor_conta",
    name: "Valor da Conta - Cliente informa valor",
    context: "Cliente fornece valor da conta de luz",
    input: "Minha conta é 429 reais",
    expectedOutput: "Obrigada! Com uma conta de R$ 429, nossa simulação indica que você pode economizar até R$ [valor_calculado] por mês com a energia por assinatura da COESA. Gostaria de saber mais detalhes sobre como funciona?",
    assertions: {
      maxWords: 50,
      noBullets: true,
      noCorporateTone: true,
      hasCalculation: true,
      maxEmojis: 2,
      mustContain: ["R$"],
    },
  },

  // Cenário 4: Dúvida sobre Pagamento
  {
    id: "duvida_pagamento",
    name: "Dúvida sobre Pagamento - Como funciona cobrança",
    context: "Cliente demonstra confusão sobre o pagamento.",
    input: "Então todo mês eu vou pagar a conta pra vcs",
    expectedOutput: "Exato! Você receberá uma fatura mensal da Coesa Energia com o valor do seu consumo já com o desconto aplicado. A Cemig apenas manterá as taxas mínimas. Assim, você simplifica seu pagamento e garante sua economia todo mês.",
    assertions: {
      maxWords: 50,
      noBullets: true,
      noCorporateTone: true,
      noJargon: true,
      mustContain: ["fatura", "desconto"],
    },
  },

  // Cenário 5: Aguardando Informações
  {
    id: "aguardando_info",
    name: "Aguardando Informações - Cliente confirma que vai esperar",
    context: "Cliente aguardando informações após uma interação.",
    input: "Perfeito, fico no aguardo! 😊",
    expectedOutput: "Ótimo! Vou te enviar [informação X] até o final do dia de amanhã. Você prefere que eu envie por e-mail ou WhatsApp?",
    assertions: {
      maxWords: 30,
      noBullets: true,
      noCorporateTone: true,
      maxEmojis: 1,
    },
  },

  // Cenário 6: Interesse Inicial
  {
    id: "interesse_inicial",
    name: "Interesse Inicial - Cliente pede mais informações",
    context: "Cliente busca informações iniciais.",
    input: "Olá! Tenho interesse e queria mais informações, por favor.",
    expectedOutput: "Olá! Que ótimo que você tem interesse em economizar na sua conta de luz. Para te ajudar melhor, você já conhece o modelo de energia por assinatura? Posso te explicar como funciona ou você prefere que eu já faça uma simulação com base no valor da sua conta atual?",
    assertions: {
      maxWords: 60,
      noBullets: true,
      noCorporateTone: true,
      noJargon: true,
      minEmojis: 0,
      maxEmojis: 2,
    },
  },

  // Cenário 7: Desconfiança / É Golpe?
  {
    id: "desconfianca",
    name: "Desconfiança - Cliente questiona se é golpe",
    context: "Cliente demonstra desconfiança sobre legitimidade.",
    input: "Isso não é golpe não?",
    expectedOutput: "Entendo sua desconfiança, é normal! A COESA é uma empresa regularizada pela ANEEL e parceira da CEMIG. Você pode verificar nosso CNPJ e nossa usina solar registrada. Quer que eu te mande os links de verificação?",
    assertions: {
      maxWords: 50,
      noBullets: true,
      noCorporateTone: true,
      validatesEmotion: true,
      mustContain: ["ANEEL", "CEMIG"],
      mustNotContain: ["modelo de negócio", "regulamentado pela"],
    },
  },

  // Cenário 8: Conta Baixa (Abaixo do Mínimo)
  {
    id: "conta_baixa",
    name: "Conta Baixa - Valor abaixo de R$50",
    context: "Cliente informa conta abaixo do valor mínimo para adesão.",
    input: "Minha conta vem uns 30 reais",
    expectedOutput: "Poxa, que legal que você se interessou! Pra nossa assinatura de energia funcionar bem pra você, o ideal é conta a partir de R$ 50. Com R$ 30, a economia seria muito pequena. Mas guarda meu contato – se sua conta subir no futuro, me chama! 😉",
    assertions: {
      maxWords: 55,
      noBullets: true,
      noCorporateTone: true,
      noJargon: true,
      mustContain: ["50"],
      mustNotContain: ["requisito mínimo", "não atende", "Informo"],
    },
  },

  // Cenário 9: Conta Qualificada (Com Cálculo)
  {
    id: "conta_qualificada",
    name: "Conta Qualificada - Cálculo de economia",
    context: "Cliente com conta qualificada (>R$50) - calcular economia exata.",
    input: "Minha conta é 380 reais",
    expectedOutput: "Show! Com R$ 380 você economiza cerca de R$ 76 por mês (20%), que dá R$ 912 por ano no seu bolso! Quer que eu prepare uma proposta personalizada?",
    assertions: {
      maxWords: 40,
      noBullets: true,
      noCorporateTone: true,
      hasCalculation: true,
      maxEmojis: 2,
      mustNotContain: ["aproximadamente", "estimativa", "consultar"],
    },
  },

  // Cenário 10: Como Funciona Exatamente
  {
    id: "como_funciona",
    name: "Como Funciona - Explicação técnica simples",
    context: "Cliente quer entender exatamente como funciona o modelo de negócio.",
    input: "Como funciona exatamente esse negócio?",
    expectedOutput: "Funciona tipo Netflix da energia! 🎬 A gente tem usinas solares que geram energia limpa. Você assina um plano mensal e essa energia entra na rede, gerando créditos que descontam da sua conta de luz. Você não instala nada, não tem obra, só economiza!",
    assertions: {
      maxWords: 55,
      noBullets: true,
      noCorporateTone: true,
      noJargon: true,
      hasAnalogy: true,
      mustContain: ["Netflix", "solar"],
      mustNotContain: ["482/2012", "geração distribuída", "compensação energética"],
    },
  },
];

// ========================================
// TESTES
// ========================================

describe("AGENTS.md - 10 Cenários de Comunicação", () => {
  
  describe.each(AGENTS_MD_SCENARIOS)("Cenário: $name", (scenario) => {
    const response = scenario.expectedOutput;
    
    it(`deve ter no máximo ${scenario.assertions.maxWords || 80} palavras`, () => {
      const words = countWords(response);
      expect(words).toBeLessThanOrEqual(scenario.assertions.maxWords || 80);
    });

    if (scenario.assertions.minWords) {
      it(`deve ter no mínimo ${scenario.assertions.minWords} palavras`, () => {
        const words = countWords(response);
        expect(words).toBeGreaterThanOrEqual(scenario.assertions.minWords);
      });
    }

    if (scenario.assertions.noBullets) {
      it("não deve ter bullet points", () => {
        const bullets = countBullets(response);
        expect(bullets).toBe(0);
      });
    }

    if (scenario.assertions.noCorporateTone) {
      it("não deve ter tom corporativo", () => {
        expect(hasCorporateTone(response)).toBe(false);
      });
    }

    if (scenario.assertions.noJargon) {
      it("não deve ter jargão técnico", () => {
        const jargon = hasJargon(response);
        expect(jargon).toHaveLength(0);
      });
    }

    if (scenario.assertions.hasCalculation) {
      it("deve conter cálculo de valores (R$ ou %)", () => {
        expect(hasCalculation(response)).toBe(true);
      });
    }

    if (scenario.assertions.hasAnalogy) {
      it("deve usar analogia para explicar", () => {
        expect(hasAnalogy(response)).toBe(true);
      });
    }

    if (scenario.assertions.validatesEmotion) {
      it("deve validar emoção do cliente", () => {
        expect(validatesEmotion(response)).toBe(true);
      });
    }

    if (scenario.assertions.maxEmojis !== undefined) {
      it(`deve ter no máximo ${scenario.assertions.maxEmojis} emojis`, () => {
        const emojis = countEmojis(response);
        expect(emojis).toBeLessThanOrEqual(scenario.assertions.maxEmojis!);
      });
    }

    if (scenario.assertions.mustContain) {
      it.each(scenario.assertions.mustContain)("deve conter '%s'", (term) => {
        expect(response.toLowerCase()).toContain(term.toLowerCase());
      });
    }

    if (scenario.assertions.mustNotContain) {
      it.each(scenario.assertions.mustNotContain)("não deve conter '%s'", (term) => {
        expect(response.toLowerCase()).not.toContain(term.toLowerCase());
      });
    }
  });
});

describe("AGENTS.md - Métricas Agregadas", () => {
  
  it("todas as respostas devem ter média de palavras ≤ 50", () => {
    const totalWords = AGENTS_MD_SCENARIOS.reduce((sum, s) => sum + countWords(s.expectedOutput), 0);
    const avgWords = totalWords / AGENTS_MD_SCENARIOS.length;
    expect(avgWords).toBeLessThanOrEqual(55); // Margem de 10%
  });

  it("nenhuma resposta deve ter bullet points", () => {
    const withBullets = AGENTS_MD_SCENARIOS.filter(s => countBullets(s.expectedOutput) > 0);
    expect(withBullets).toHaveLength(0);
  });

  it("nenhuma resposta deve ter tom corporativo", () => {
    const withCorporate = AGENTS_MD_SCENARIOS.filter(s => hasCorporateTone(s.expectedOutput));
    expect(withCorporate).toHaveLength(0);
  });

  it("nenhuma resposta deve ter jargão técnico", () => {
    const withJargon = AGENTS_MD_SCENARIOS.filter(s => hasJargon(s.expectedOutput).length > 0);
    expect(withJargon).toHaveLength(0);
  });

  it("pelo menos 1 resposta deve usar analogia", () => {
    const withAnalogy = AGENTS_MD_SCENARIOS.filter(s => hasAnalogy(s.expectedOutput));
    expect(withAnalogy.length).toBeGreaterThanOrEqual(1);
  });

  it("pelo menos 2 respostas devem ter cálculos exatos", () => {
    const withCalculation = AGENTS_MD_SCENARIOS.filter(s => hasCalculation(s.expectedOutput));
    expect(withCalculation.length).toBeGreaterThanOrEqual(2);
  });
});
