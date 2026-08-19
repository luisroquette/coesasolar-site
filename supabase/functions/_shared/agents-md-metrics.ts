/**
 * AGENTS.md Compliance Metrics
 * Funções para medir conformidade de respostas com padrões AGENTS.md
 */

export interface AgentsMdMetrics {
  wordCount: number;
  lineCount: number;
  bulletPointCount: number;
  emojiCount: number;
  hasExactCalculation: boolean;
  hasCorporateTone: boolean;
  hasAnalogy: boolean;
  jargonTerms: string[];
  validatesEmotion: boolean;
  complianceScore: number;
}

/**
 * Padrões de tom corporativo a evitar
 */
const CORPORATE_PATTERNS = [
  'prezado',
  'informo que',
  'aguardo retorno',
  'atenciosamente',
  'outrossim',
  'vide',
  'mediante',
  'segue em anexo',
  'por gentileza',
  'venho por meio desta',
  'conforme solicitado',
  'ficamos à disposição',
];

/**
 * Termos técnicos/jargão a evitar
 */
const JARGON_TERMS = [
  'resolução normativa',
  'geração distribuída',
  'compensação energética',
  '482/2012',
  'perfil de consumo',
  'sistema de compensação',
  'créditos energéticos',
  'microgeração',
  'minigeração',
  'autoconsumo remoto',
];

/**
 * Padrões de analogias desejáveis
 */
const ANALOGY_PATTERNS = [
  'tipo',
  'como se fosse',
  'é como',
  'funciona como',
  'estilo',
  'igual a',
  'parecido com',
  'imagina',
  'pensa como',
];

/**
 * Padrões de validação emocional
 */
const EMOTION_VALIDATION_PATTERNS = [
  'entendo',
  'compreendo',
  'é normal',
  'faz sentido',
  'boa pergunta',
  'você tem razão',
  'concordo',
  'preocupação',
  'desconfiança é normal',
  'dúvida é válida',
];

/**
 * Conta palavras em um texto
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Conta linhas em um texto
 */
export function countLines(text: string): number {
  return text.trim().split(/\n/).filter(line => line.trim().length > 0).length;
}

/**
 * Conta bullet points (-, *, •, números seguidos de ponto)
 */
export function countBullets(text: string): number {
  const bulletPatterns = [
    /^\s*[-*•]\s+/gm,           // -, *, •
    /^\s*\d+\.\s+/gm,           // 1. 2. 3.
    /^\s*[a-z]\)\s+/gmi,        // a) b) c)
  ];
  
  let count = 0;
  for (const pattern of bulletPatterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Conta emojis em um texto
 */
export function countEmojis(text: string): number {
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu;
  const matches = text.match(emojiRegex);
  return matches ? matches.length : 0;
}

/**
 * Verifica se contém cálculo exato (R$ seguido de números)
 */
export function checkExactCalculation(text: string): boolean {
  // Padrões de cálculo exato: R$ 123, R$123,45, economia de R$ X
  const calculationPatterns = [
    /R\$\s*\d+[.,]?\d*/i,        // R$ 123 ou R$ 123,45
    /\d+%/,                       // 30%
    /economia de R\$/i,           // "economia de R$..."
    /cai pra R\$/i,               // "cai pra R$..."
    /fica R\$/i,                  // "fica R$..."
  ];
  
  return calculationPatterns.some(pattern => pattern.test(text));
}

/**
 * Detecta tom corporativo
 */
export function detectCorporateTone(text: string): boolean {
  const lowerText = text.toLowerCase();
  return CORPORATE_PATTERNS.some(pattern => lowerText.includes(pattern));
}

/**
 * Detecta uso de analogias
 */
export function detectAnalogy(text: string): boolean {
  const lowerText = text.toLowerCase();
  return ANALOGY_PATTERNS.some(pattern => lowerText.includes(pattern));
}

/**
 * Detecta termos de jargão técnico
 */
export function detectJargon(text: string): string[] {
  const lowerText = text.toLowerCase();
  return JARGON_TERMS.filter(term => lowerText.includes(term));
}

/**
 * Detecta validação emocional
 */
export function detectEmotionValidation(text: string): boolean {
  const lowerText = text.toLowerCase();
  return EMOTION_VALIDATION_PATTERNS.some(pattern => lowerText.includes(pattern));
}

/**
 * Calcula score de conformidade com AGENTS.md (0-100)
 */
export function calculateComplianceScore(metrics: Omit<AgentsMdMetrics, 'complianceScore'>): number {
  let score = 100;
  
  // Penalidades
  
  // Muito longo (>60 palavras = -10, >80 = -20)
  if (metrics.wordCount > 80) {
    score -= 20;
  } else if (metrics.wordCount > 60) {
    score -= 10;
  }
  
  // Bullet points são proibidos (-15 por bullet)
  score -= metrics.bulletPointCount * 15;
  
  // Tom corporativo (-20)
  if (metrics.hasCorporateTone) {
    score -= 20;
  }
  
  // Jargão técnico (-10 por termo)
  score -= metrics.jargonTerms.length * 10;
  
  // Muitos emojis (>3 = -5)
  if (metrics.emojiCount > 3) {
    score -= 5;
  }
  
  // Zero emojis quando esperado pode ser neutro (não penaliza)
  
  // Bônus
  
  // Usa analogia (+10)
  if (metrics.hasAnalogy) {
    score += 10;
  }
  
  // Valida emoção quando apropriado (+5)
  if (metrics.validatesEmotion) {
    score += 5;
  }
  
  // Cálculo exato quando esperado (+10)
  if (metrics.hasExactCalculation) {
    score += 10;
  }
  
  // Normaliza para 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Mede conformidade completa de uma resposta com padrões AGENTS.md
 */
export function measureAgentsMdCompliance(response: string): AgentsMdMetrics {
  const wordCount = countWords(response);
  const lineCount = countLines(response);
  const bulletPointCount = countBullets(response);
  const emojiCount = countEmojis(response);
  const hasExactCalculation = checkExactCalculation(response);
  const hasCorporateTone = detectCorporateTone(response);
  const hasAnalogy = detectAnalogy(response);
  const jargonTerms = detectJargon(response);
  const validatesEmotion = detectEmotionValidation(response);
  
  const baseMetrics = {
    wordCount,
    lineCount,
    bulletPointCount,
    emojiCount,
    hasExactCalculation,
    hasCorporateTone,
    hasAnalogy,
    jargonTerms,
    validatesEmotion,
  };
  
  return {
    ...baseMetrics,
    complianceScore: calculateComplianceScore(baseMetrics),
  };
}

/**
 * Gera resumo de conformidade para logging
 */
export function getComplianceSummary(metrics: AgentsMdMetrics): string {
  const issues: string[] = [];
  const strengths: string[] = [];
  
  if (metrics.wordCount > 60) issues.push(`Longo demais (${metrics.wordCount} palavras)`);
  if (metrics.bulletPointCount > 0) issues.push(`Bullets detectados (${metrics.bulletPointCount})`);
  if (metrics.hasCorporateTone) issues.push('Tom corporativo');
  if (metrics.jargonTerms.length > 0) issues.push(`Jargão: ${metrics.jargonTerms.join(', ')}`);
  if (metrics.emojiCount > 3) issues.push(`Muitos emojis (${metrics.emojiCount})`);
  
  if (metrics.hasAnalogy) strengths.push('Usa analogia');
  if (metrics.validatesEmotion) strengths.push('Valida emoção');
  if (metrics.hasExactCalculation) strengths.push('Cálculo exato');
  if (metrics.wordCount <= 45) strengths.push('Conciso');
  
  return `Score: ${metrics.complianceScore}/100 | ✅ ${strengths.join(', ') || 'Nenhum'} | ⚠️ ${issues.join(', ') || 'Nenhum'}`;
}
