/**
 * Prompt Context Injector
 * Shared module for injecting dynamic context sections into system prompts
 * Phase 43: Extracted from sofia-webhook/index.ts
 * Phase 3: Integrated context compression (AGENTS.md-Style)
 */

import { compressContext, type CompressionConfig } from './context-compressor.ts';

// ═══════════════════════════════════════════════════════════════
// COMPRESSION CONFIGURATION
// ═══════════════════════════════════════════════════════════════

// Feature flag for compression
const ENABLE_SECTION_COMPRESSION = true;

// Sections that should NEVER be compressed (critical rules)
const PROTECTED_SECTIONS = [
  'PROTEÇÃO DE CONTEXTO',
  'REGRAS ABSOLUTAS',
  'CLÁUSULAS PÉTREAS',
  'REGRA DE OURO',
];

// Default compression config for context sections
const SECTION_COMPRESSION_CONFIG: CompressionConfig = {
  maxChars: 1500, // Max chars per section
  preserveSections: PROTECTED_SECTIONS,
  aggressiveness: 'medium',
  removeEmojis: false, // Keep semantic emojis
  abbreviateTerms: true,
  collapseWhitespace: true,
  removeDuplicateLines: true,
};

// POST-HUMAN INTERVENTION CONTEXT (prevents funnel restart after human handback)

export interface PostHumanContext {
  wasRecentlyResolvedByHuman: boolean;
  escalationReason: string | null;
  humanAgentName: string | null;
  existingDistribuidora: string | null;
  existingValorFatura: string | number | null;
  existingEmail: string | null;
  existingNome: string | null;
}

/**
 * Build post-human intervention context - AGENTS.md-style compact format
 */
export function buildPostHumanContextSection(ctx: PostHumanContext): string {
  if (!ctx.wasRecentlyResolvedByHuman) {
    return '';
  }
  
  const agente = ctx.humanAgentName || 'atendente';
  const motivo = ctx.escalationReason || 'pendente';
  const nome = ctx.existingNome || '-';
  const dist = ctx.existingDistribuidora || '-';
  const valor = ctx.existingValorFatura || '-';
  const email = ctx.existingEmail || '-';
  
  // AGENTS.md-style: tabular compact format
  return `
## 🔄 PÓS-HUMANO (${agente})
Motivo:${motivo}

**DADOS (não repetir):** Nome:${nome}|Dist:${dist}|Valor:${valor}|Email:${email}

**REGRAS:** ❌Reiniciar|❌Triagem|❌Reapresentar → ✅Continuar|✅"Mais alguma coisa?"
`;
}

// ASSISTED MODE (human fallback active but Sofia continues)

export interface AssistedModeContext {
  needsHumanFallback: boolean;
  sofiaMode: string | null;
}

/**
 * Build assisted mode context - AGENTS.md-style compact format
 */
export function buildAssistedModeSection(ctx: AssistedModeContext): string {
  const isInAssistedMode = ctx.needsHumanFallback && ctx.sofiaMode !== 'paused_for_human';
  
  if (!isInAssistedMode) {
    return '';
  }
  
  console.log('[ASSISTED_MODE] Adding compact instructions');
  
  // AGENTS.md-style: pipe-delimited rules
  return `
## ⚠️ MODO ASSISTIDO
Atendente notificado. Questão técnica pendente.

✅FAZER: Responder dúvidas|Info empresa/CNPJ|Manter engajamento|"Verificando..."
❌NÃO: Pedir docs|Forçar fechamento|Mencionar atendente|Pressionar funil
TOM: Consultivo, prestativo
`;
}

// HESITATION MODE (client doubt/concern detected)

export interface HesitationModeContext {
  hesitationDetected: boolean;
  hesitationReason: string | null;
}

/**
 * Build hesitation mode context - AGENTS.md-style compact format
 */
export function buildHesitationModeSection(ctx: HesitationModeContext): string {
  if (!ctx.hesitationDetected) {
    return '';
  }
  
  console.log('[HESITATION_MODE] Adding compact empathetic instructions');
  
  const motivo = ctx.hesitationReason || 'incerteza';
  
  // AGENTS.md-style: tabular technique format
  return `
## 🤝 MODO CONSULTIVO (Hesitação: ${motivo})

**TÉCNICA:** RECONHECER→ESCLARECER→EVIDENCIAR→ABRIR
✅FAZER: Empatia|Validar preocupação|Calma|Info clara|Espaço|Perguntas abertas
❌NÃO: Urgência|Forçar|Minimizar|Tom agressivo|Repetir argumentos
TOM: Consultivo, paciente
`;
}

// ANTI-REPETITION CONTEXT PROTECTION (prevents context amnesia)

export interface AntiRepetitionContext {
  propostaId: string | null;
  propostaLink: string | null;
  propostaStatus: string | null;
  valorFatura: string | number | null;
  distribuidora: string | null;
  consumo: string | number | null;
  tipoInstalacao: string | null;
  nome: string | null;
  email: string | null;
  cpfCnpj: string | null;
  telefone: string | null;
  messageCount: number;
  hasGreetedBefore: boolean;
  lastSofiaMessageAt: string | null;
  docsReceived: string[] | null;
  allDocsComplete: boolean;
}

/**
 * Build anti-repetition section - AGENTS.md-style tabular format
 * Critical for race condition protection
 */
export function buildAntiRepetitionSection(ctx: AntiRepetitionContext): string {
  const hasProposal = !!ctx.propostaId;
  const hasValueData = !!ctx.valorFatura || !!ctx.consumo;
  const hasDistribuidora = !!ctx.distribuidora;
  const hasPersonalData = !!ctx.nome || !!ctx.email || !!ctx.cpfCnpj;
  const hasTipoInstalacao = !!ctx.tipoInstalacao;
  const hasDocs = ctx.docsReceived && ctx.docsReceived.length > 0;
  
  const hasAnyData = hasProposal || hasValueData || hasDistribuidora || hasPersonalData;
  if (!hasAnyData && ctx.messageCount < 2) {
    return '';
  }
  
  console.log('[ANTI_REPETITION] Compact context protection');
  
  // AGENTS.md-style: tabular data format
  const dataLines: string[] = [];
  dataLines.push('\n## 🚫 DADOS COLETADOS (NÃO REPETIR)');

  // AGENTS.md-style: build compact data table
  if (hasProposal) {
    const linkStatus = ctx.propostaLink ? '✅enviado' : '⏳gerando';
    dataLines.push(`**PROPOSTA:** ID:${ctx.propostaId}|Link:${linkStatus}|Status:${ctx.propostaStatus || '-'}`);
    dataLines.push('→ ❌Simulação|❌Valor|❌Distribuidora → ✅Dúvidas proposta|✅Próximos passos');
  }
  
  if (hasValueData) {
    const valor = ctx.valorFatura ? `R$${ctx.valorFatura}` : '-';
    const consumo = ctx.consumo ? `${ctx.consumo}kWh` : '-';
    dataLines.push(`**CONSUMO:** Valor:${valor}|kWh:${consumo}`);
    dataLines.push('→ ❌Perguntar valor|❌"Quanto paga?"');
  }
  
  if (hasDistribuidora) {
    dataLines.push(`**DIST:** ${ctx.distribuidora}`);
    dataLines.push('→ ❌Perguntar distribuidora|❌Estado');
  }
  
  if (hasTipoInstalacao) {
    dataLines.push(`**TIPO:** ${ctx.tipoInstalacao}`);
  }
  
  if (hasPersonalData) {
    const nome = ctx.nome || '-';
    const email = ctx.email || '-';
    const doc = ctx.cpfCnpj || '-';
    dataLines.push(`**PESSOAL:** Nome:${nome}|Email:${email}|Doc:${doc}`);
    if (ctx.nome) dataLines.push(`→ Chamar de "${ctx.nome.split(' ')[0]}"`);
  }
  
  if (hasDocs) {
    const docsStr = ctx.docsReceived?.join(',') || '';
    const status = ctx.allDocsComplete ? '✅completos' : '⏳pendentes';
    dataLines.push(`**DOCS:** ${docsStr}|${status}`);
  }
  
  if (ctx.messageCount >= 2 || ctx.hasGreetedBefore) {
    dataLines.push(`**CONVERSA:** ${ctx.messageCount}msgs`);
    dataLines.push('→ ❌Reapresentar|❌Saudação inicial → ✅Continuar natural');
  }
  
  // Golden rule - compact
  dataLines.push('\n**REGRA:** Dado listado = JÁ EXISTE → USE, não pergunte');
  
  return dataLines.join('\n');
}

// MODULAR PROMPTS INJECTION (from database)

/**
 * Build modular prompts section - AGENTS.md-style compact
 */
export function buildModularPromptsSection(modularPromptContent: string | null): string {
  if (!modularPromptContent || modularPromptContent.trim().length === 0) {
    return '';
  }
  
  console.log(`[prompt-context-injector] 🧩 Injecting ${modularPromptContent.length} chars modular prompts`);
  
  // AGENTS.md-style: minimal header, no decorative separators
  return `\n## 🧩 MÓDULOS (AI GYM)\n${modularPromptContent}\n`;
}

// UNIFIED CONTEXT INJECTOR (combines all sections)

export interface FullContextInjection {
  postHuman: PostHumanContext;
  assistedMode: AssistedModeContext;
  hesitation: HesitationModeContext;
  antiRepetition?: AntiRepetitionContext | null;
  modularPromptContent: string | null;
  aiGymPromptSection: string | null;
  enableCompression?: boolean; // Enable context compression
}

/**
 * Compress a section if compression is enabled and section is not protected
 */
function compressSectionIfEnabled(
  section: string,
  sectionName: string,
  enableCompression: boolean
): string {
  if (!enableCompression || !ENABLE_SECTION_COMPRESSION || !section) {
    return section;
  }
  
  // Check if section is protected
  const isProtected = PROTECTED_SECTIONS.some(ps => 
    section.includes(ps) || sectionName.includes(ps)
  );
  
  if (isProtected) {
    return section;
  }
  
  try {
    const result = compressContext(section, SECTION_COMPRESSION_CONFIG);
    if (result.compressionRatio > 0.1) { // Only log significant compressions
      console.log(`[COMPRESSION] ${sectionName}: ${result.originalLength} → ${result.compressedLength} chars (${Math.round(result.compressionRatio * 100)}% saved)`);
    }
    return result.compressed;
  } catch (e) {
    console.warn(`[COMPRESSION] Failed to compress ${sectionName}:`, e);
    return section;
  }
}

/**
 * Build all context sections and append to system prompt
 * Phase 3: Sections are compressed to reduce token usage
 */
export function injectAllContextSections(
  basePrompt: string,
  ctx: FullContextInjection
): string {
  let fullPrompt = basePrompt;
  const shouldCompress = ctx.enableCompression ?? true;
  
  // 1. Modular prompts from database
  const modularSection = buildModularPromptsSection(ctx.modularPromptContent);
  fullPrompt += compressSectionIfEnabled(modularSection, 'modular_prompts', shouldCompress);
  
  // 2. AI Gym static config
  if (ctx.aiGymPromptSection) {
    fullPrompt += compressSectionIfEnabled(ctx.aiGymPromptSection, 'ai_gym', shouldCompress);
  }
  
  // 3. Post-human intervention context (NOT compressed - critical)
  fullPrompt += buildPostHumanContextSection(ctx.postHuman);
  
  // 4. Assisted mode context (NOT compressed - critical)
  fullPrompt += buildAssistedModeSection(ctx.assistedMode);
  
  // 5. Hesitation mode context
  const hesitationSection = buildHesitationModeSection(ctx.hesitation);
  fullPrompt += compressSectionIfEnabled(hesitationSection, 'hesitation', shouldCompress);
  // 6. Anti-repetition context (CRITICAL for race condition protection)
  if (ctx.antiRepetition) {
    fullPrompt += buildAntiRepetitionSection(ctx.antiRepetition);
  }
  
  return fullPrompt;
}
