/**
 * Sofia Core Loader
 * Loads and caches the compressed SOFIA.md constitution
 * Part of AGENTS.md-Style Passive Context Architecture
 * 
 * @module _shared/sofia-core-loader
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SofiaCoreContent {
  fullContent: string;
  identity: string;
  principios: string;         // NEW v3.5: 5 core principles
  personalidade: string;      // NEW v3.5: Who is Sofia
  clausulasPetreas: string;
  fsmStates: string;
  retrievalLedReasoning: string;
  antiAlucinacao: string;
  quickReference: string;
  ragUsage: string;           // NEW v3.5: RAG usage guidelines
  reasoningExamples: string;  // DEPRECATED: Now via few-shot injection
  charCount: number;
  version: string;
  loadedAt: number;
}

export interface SofiaCoreLoaderOptions {
  includeIdentity?: boolean;
  includePrincipios?: boolean;        // NEW v3.5
  includePersonalidade?: boolean;     // NEW v3.5
  includeClausulasPetreas?: boolean;
  includeFSM?: boolean;
  includeRetrievalLed?: boolean;
  includeAntiAlucinacao?: boolean;
  includeQuickReference?: boolean;
  includeRagUsage?: boolean;          // NEW v3.5
  includeReasoningExamples?: boolean; // DEPRECATED
  maxChars?: number;
}

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════

// Cache the parsed SOFIA.md content (valid for 1 hour)
let cachedContent: SofiaCoreContent | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ═══════════════════════════════════════════════════════════════
// EMBEDDED SOFIA.md CONTENT
// ═══════════════════════════════════════════════════════════════

// Note: In production, this could be loaded from file or database
// For now, we embed the critical sections directly for performance

// ═══════════════════════════════════════════════════════════════
// AGENTS.MD-STYLE COMPRESSED INDEX v3.5 (~2.2KB total)
// Format: Tabular + Pipe-delimited + Principles + Personality
// Based on canonical AGENTS.md (Vercel-style)
// ═══════════════════════════════════════════════════════════════

const SOFIA_IDENTITY = `Você é **sofIA**, vendas da COESA Energia. Canal:WhatsApp | Papel:Qualificar→Assinatura | Tom:Profissional,empático,objetivo`;

// ═══════════════════════════════════════════════════════════════
// AGENTS.MD v3.5: PRINCÍPIOS NARRATIVOS (Como Sofia Pensa)
// Extraídos do AGENTS.md canônico para injeção compacta
// ═══════════════════════════════════════════════════════════════

const SOFIA_PRINCIPIOS = `## PRINCÍPIOS (Como Sofia Pensa)

| # | Princípio | Aplicação |
|---|-----------|-----------|
| 1 | Qualificação consultiva | Filtrar quem se beneficia, não convencer todo mundo |
| 2 | WhatsApp é conversa | 2-3 linhas, direto, humano (não email corporativo) |
| 3 | Números precisos | R$ exatos, não "uns 30%" ou "bem menos" |
| 4 | Contexto é memória | Não repetir perguntas, adaptar ritmo ao cliente |
| 5 | Ponte, não destino | Qualificar→Aquecer→Conectar (consultor fecha) |

↳ Cenários detalhados disponíveis via few-shot injection`;

// ═══════════════════════════════════════════════════════════════
// AGENTS.MD v3.5: PERSONALIDADE (Quem é Sofia)
// Perfil humano para respostas mais naturais
// ═══════════════════════════════════════════════════════════════

const SOFIA_PERSONALIDADE = `## QUEM É SOFIA

**Perfil:** Consultora 28-32 anos, BH, atendimento/vendas consultivas
**Tom:** Profissional-amigável | Simpática (não engraçadinha) | Direta (não seca)
**Usa:** Emojis ocasionais (☀️ 😊 🎉 máx 1-2/msg) | "tipo", "opa", "tranquilo" | R$ exatos
**NÃO usa:** Gírias excessivas | ALL CAPS | Emojis demais | "prezado", "outrossim"`;

// ═══════════════════════════════════════════════════════════════
// AGENTS.MD v3.5: HYBRID FORMAT (Table + Compact Narratives)
// Cada regra em tabela com "porquê" inline - 60% mais compacto
// ═══════════════════════════════════════════════════════════════

const SOFIA_CLAUSULAS_PETREAS = `## CLÁUSULAS PÉTREAS (INVIOLÁVEIS)

| CP | Regra | Porquê |
|---|-------|--------|
| 1 | TRIAGEM_ÚNICA | Repetir menu = robô burro = irritação |
| 2 | ORDEM_FUNIL | Sem dados = proposta errada = deal perdido |
| 3 | CORTE_R$50 | Valor simbólico mínimo para viabilidade |
| 4 | EMAIL_OBRIG | Proposta é PDF por email |
| 5 | DOCS_VIA_LINK | WhatsApp = risco LGPD |
| 6 | TERCEIROS_VÁLIDO | Conta do sogro = VENDA, não SAC |

↳ Narrativas expandidas na rule_memory quando necessário.`;

const SOFIA_FSM_STATES = `## FSM
TRIAGEM→QUALIFICAÇÃO→COLETA_DADOS→PROPOSTA_INICIAL→DOCS_PLATAFORMA→SOLICITAR_CONTRATO→ASSINATURA→FECHADO | Terminais:DESCARTADO,SAC_REDIRECT,PAUSADO`;

// AGENTS.md v3.5: Compact hierarchy (~500 chars)
const SOFIA_RETRIEVAL_LED = `## RETRIEVAL-LED (HIERARQUIA)

⚠️ ANTES de responder:
**P1:rule_memory** → P>90=BLOQUEANTE | Guardrails>tudo
**P2:RAG** → 📚CONHECIMENTO | Use exatamente
**P3:Dados cliente** → Apenas confirmados
**P4:Bom Senso** → Reclamação→desculpe | Erro→admita | Confusão→esclareça
**P5:Fallback** → Pergunte ou escale | NUNCA invente DADOS

❌ Inventar valores/prazos/links | ✅ Respostas humanas naturais`;

const SOFIA_ANTI_ALUCINACAO = `## ANTI-ALUCINAÇÃO
❌ Não invento: estados, links, prazos, descontos, consumo, valores
✅ Se não sei DADOS: pergunto ou escalo
✅ POSSO: desculpas, empatia, esclarecimentos, saudações`;

const SOFIA_QUICK_REFERENCE = `## QUICK
Ordem:Valor(min R$50)→Dist→Email→Nome | Escalar:Irritado,humano,jurídico`;

// ═══════════════════════════════════════════════════════════════
// AGENTS.MD v3.5: USO DO RAG (Orientações)
// Como usar chunks de conhecimento corretamente
// ═══════════════════════════════════════════════════════════════

const SOFIA_RAG_USAGE = `## USO DO RAG

**Busque quando:** Pergunta específica que você não sabe de cabeça
**NÃO busque quando:** Nome, conta, concessionária | Cálculo de economia | Saudações

**Como usar chunks:**
❌ ERRADO: Copiar "aviso prévio de 30 dias corridos mediante formulário TR-04"
✅ CERTO: Traduzir "Pode levar pro novo endereço, só avisar 30 dias antes"`;

// ═══════════════════════════════════════════════════════════════
// AGENTS.MD v3.5: REASONING EXAMPLES REMOVIDOS DO CORE
// Agora são injetados dinamicamente via few_shot_examples table
// Isso elimina duplicação e permite atualização sem redeploy
// ═══════════════════════════════════════════════════════════════

// DEPRECATED: Reasoning examples agora vêm do few-shot-injector.ts
// Mantido apenas para compatibilidade de interface
const SOFIA_REASONING_EXAMPLES = ``;

// Feature flag DESABILITADA - exemplos vêm do banco de dados
const ENABLE_REASONING_EXAMPLES = false;

// ═══════════════════════════════════════════════════════════════
// MAIN LOADER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Load the full SOFIA.md content with all sections parsed
 * Uses in-memory cache for performance
 */
export function loadSofiaCore(): SofiaCoreContent {
  const now = Date.now();
  
  // Check cache - ensure it's valid before returning
  if (cachedContent && (now - cachedContent.loadedAt) < CACHE_TTL_MS) {
    return cachedContent;
  }
  
  // Build full content v3.5 with principles and personality
  const contentParts = [
    '# SOFIA - Constituição do Agente v3.5 (AGENTS.md-Style)',
    '',
    SOFIA_IDENTITY,
    '',
    SOFIA_PRINCIPIOS,
    '',
    SOFIA_PERSONALIDADE,
    '',
    SOFIA_CLAUSULAS_PETREAS,
    '',
    SOFIA_FSM_STATES,
    '',
    SOFIA_RETRIEVAL_LED,
    '',
    SOFIA_ANTI_ALUCINACAO,
    '',
    SOFIA_QUICK_REFERENCE,
    '',
    SOFIA_RAG_USAGE,
  ];
  
  // Add reasoning examples if feature flag enabled (DEPRECATED)
  if (ENABLE_REASONING_EXAMPLES) {
    contentParts.push('');
    contentParts.push(SOFIA_REASONING_EXAMPLES);
  }
  
  const fullContent = contentParts.join('\n');
  
  const newContent: SofiaCoreContent = {
    fullContent,
    identity: SOFIA_IDENTITY,
    principios: SOFIA_PRINCIPIOS,           // NEW v3.5
    personalidade: SOFIA_PERSONALIDADE,     // NEW v3.5
    clausulasPetreas: SOFIA_CLAUSULAS_PETREAS,
    fsmStates: SOFIA_FSM_STATES,
    retrievalLedReasoning: SOFIA_RETRIEVAL_LED,
    antiAlucinacao: SOFIA_ANTI_ALUCINACAO,
    quickReference: SOFIA_QUICK_REFERENCE,
    ragUsage: SOFIA_RAG_USAGE,              // NEW v3.5
    reasoningExamples: '',                   // DEPRECATED: vem do few-shot-injector
    charCount: fullContent.length,
    version: '3.5',
    loadedAt: now,
  };
  
  cachedContent = newContent;
  
  console.log(`[SofiaCoreLoader] Loaded SOFIA.md v3.5 (${fullContent.length} chars, hybrid_format=true, principles=true, personality=true)`);
  
  return newContent;
}

/**
 * Build a customized prompt block from SOFIA.md sections
 * Allows selecting which sections to include based on context
 */
/**
 * Build a customized prompt block from SOFIA.md sections
 * AGENTS.md-Style: Minimal decoration, pipe-delimited format
 */
export function buildSofiaCorePromptBlock(options: SofiaCoreLoaderOptions = {}): string {
  const core = loadSofiaCore();
  const sections: string[] = [];
  
  // Default: include all critical sections (v3.5 with principles + personality)
  const {
    includeIdentity = true,
    includePrincipios = true,           // NEW v3.5
    includePersonalidade = true,        // NEW v3.5
    includeClausulasPetreas = true,
    includeFSM = false,                 // FSM compact, only if needed
    includeRetrievalLed = false,        // Already added separately in system-prompt-builder
    includeAntiAlucinacao = true,
    includeQuickReference = false,      // Already in context
    includeRagUsage = true,             // NEW v3.5
    includeReasoningExamples = false,   // DEPRECATED: use few-shot injection
    maxChars = 5000,                    // Increased for v3.5 content
  } = options;
  
  // AGENTS.md Format: Single header, no decorative separators
  sections.push('## SOFIA v3.5 (CONSTITUIÇÃO AGENTS.md-Style + Narrative Principles)');
  
  if (includeIdentity) {
    sections.push(core.identity);
  }
  
  // NEW v3.5: Principles block (5 core principles)
  if (includePrincipios) {
    sections.push(core.principios);
  }
  
  // NEW v3.5: Personality block (who is Sofia)
  if (includePersonalidade) {
    sections.push(core.personalidade);
  }
  
  if (includeClausulasPetreas) {
    sections.push(core.clausulasPetreas);
  }
  
  if (includeFSM) {
    sections.push(core.fsmStates);
  }
  
  if (includeRetrievalLed) {
    sections.push(core.retrievalLedReasoning);
  }
  
  if (includeAntiAlucinacao) {
    sections.push(core.antiAlucinacao);
  }
  
  if (includeQuickReference) {
    sections.push(core.quickReference);
  }
  
  // NEW v3.5: RAG usage guidelines
  if (includeRagUsage) {
    sections.push(core.ragUsage);
  }
  
  // DEPRECATED: reasoning examples now via few-shot injection
  if (includeReasoningExamples && ENABLE_REASONING_EXAMPLES) {
    sections.push(core.reasoningExamples);
  }
  
  let result = sections.join('\n\n');
  
  // Truncate if exceeds max chars (preserve last section marker)
  if (result.length > maxChars) {
    result = result.substring(0, maxChars - 30) + '\n[...TRUNCADO]';
  }
  
  return result;
}

/**
 * Get only the Retrieval-Led Reasoning block
 * AGENTS.md v3.4: Compact format (~400 chars)
 */
export function getRetrievalLedReasoningBlock(): string {
  return `## RETRIEVAL-LED (HIERARQUIA)

⚠️ ANTES de responder:
**P1:rule_memory** → P>90=BLOQUEANTE | Guardrails>tudo
**P2:RAG** → 📚CONHECIMENTO | Use exatamente
**P3:Dados cliente** → Apenas confirmados
**P4:Bom Senso** → Reclamação→desculpe | Erro→admita | Confusão→esclareça
**P5:Fallback** → Pergunte ou escale | NUNCA invente DADOS

❌ Inventar valores/prazos/links | ✅ Respostas humanas naturais`;
}

/**
 * Get only the Cláusulas Pétreas (immutable rules)
 */
export function getClausulasPetreasBlock(): string {
  const core = loadSofiaCore();
  // AGENTS.md-style: remove decorative separators
  return `## CLÁUSULAS PÉTREAS (INVIOLÁVEIS)\n\n${core.clausulasPetreas}`;
}

/**
 * Clear the cache (useful for testing or forced reload)
 */
export function clearSofiaCoreCache(): void {
  cachedContent = null;
  console.log('[SofiaCoreLoader] Cache cleared');
}

/**
 * Get cache status for debugging
 */
export function getSofiaCoreLoaderStatus(): { 
  cached: boolean; 
  cacheAge: number | null; 
  charCount: number | null;
  version: string | null;
} {
  if (!cachedContent) {
    return { cached: false, cacheAge: null, charCount: null, version: null };
  }
  
  return {
    cached: true,
    cacheAge: Date.now() - cachedContent.loadedAt,
    charCount: cachedContent.charCount,
    version: cachedContent.version,
  };
}
