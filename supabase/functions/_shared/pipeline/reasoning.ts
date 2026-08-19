/**
 * SOFIA PIPELINE 2.0 - REASONING LAYER
 * 
 * Processa decisões usando LLM com Tool Calling estruturado
 * A LLM não retorna texto livre - usa ferramentas para todas as ações
 * 
 * Integrado com:
 * - Behavioral Profile (Sistema 2) - Adapta prompt baseado no perfil
 * - SOFIA.md Core Loader - Constituição comprimida (AGENTS.md-style)
 * - Rule Memory Injector - Regras ativas injetadas passivamente
 * - Passive RAG Prefetch - Contexto pré-carregado por estágio
 * - Context Compressor - Compressão 80% mantendo eficácia
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  FullContext,
  ReasoningResult,
  ToolCall,
  NewFact,
  DecisionType,
  MemorySource
} from "./types.ts";
import { getRelevantTools, validateToolCall, type ToolSchema } from "./tools.ts";
import { loadPersistedProfile, buildProfilePromptBlock } from "./behavioral-profile.ts";

// AGENTS.md-Style Passive Context Modules
import { 
  buildSofiaCorePromptBlock, 
  getRetrievalLedReasoningBlock,
  getClausulasPetreasBlock 
} from "../sofia-core-loader.ts";
import { buildRuleMemoryBlock, type RuleMemoryContext } from "../rule-memory-injector.ts";
import { prefetchPassiveRAG, getCategoriesForStage } from "../passive-rag-prefetch.ts";
import { compressContext, DEFAULT_COMPRESSION_CONFIG } from "../context-compressor.ts";

// Passive Context Metrics Tracking
import {
  trackPassiveContextMetrics,
  createMetricsTracker,
  estimateTokens,
  type PassiveContextMetrics
} from "../passive-context-metrics.ts";

// Unified Config Loader - Agent-specific configs with global fallback
import { getUnifiedConfigLoader } from "../unified-config-loader.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const LLM_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

// Feature flags for gradual rollout
const ENABLE_PASSIVE_CONTEXT = true;
const ENABLE_RULE_MEMORY_INJECTION = true;
const ENABLE_PASSIVE_RAG = true;
const ENABLE_CONTEXT_COMPRESSION = true;
const ENABLE_METRICS_TRACKING = true;

// ============================================
// MAIN REASONING EXECUTOR
// ============================================

export async function executeReasoning(
  context: FullContext,
  agentId: string = "sofia"
): Promise<ReasoningResult> {
  const startTime = Date.now();
  
  // Initialize metrics tracker (use intake.conversaId from context)
  const conversaId = context.intake?.conversaId || 'unknown';
  const metrics = ENABLE_METRICS_TRACKING 
    ? createMetricsTracker(conversaId, agentId)
    : null;
  
  try {
    // 1. Selecionar ferramentas relevantes para o contexto
    const tools = getRelevantTools(
      context.funnelState.stage,
      context.funnelState.hasProposal,
      context.funnelState.isQualified
    );
    
    // 2. Construir o prompt estruturado (agora async para carregar perfil)
    const contextBuildStart = Date.now();
    const { systemPrompt, promptMetrics } = await buildStructuredPromptWithMetrics(context, agentId);
    const contextBuildTime = Date.now() - contextBuildStart;
    
    // Update metrics with prompt info
    if (metrics) {
      metrics.promptSizeChars = systemPrompt.length;
      metrics.promptSizeTokensEstimate = estimateTokens(systemPrompt.length);
      metrics.contextBuildTimeMs = contextBuildTime;
      metrics.sofiaCoreSizeChars = promptMetrics.sofiaCoreSizeChars;
      metrics.ruleMemoryInjected = promptMetrics.rulesInjected;
      metrics.ruleMemorySizeChars = promptMetrics.rulesSizeChars;
      metrics.passiveRagChunks = promptMetrics.ragChunks;
      metrics.passiveRagSizeChars = promptMetrics.ragSizeChars;
      metrics.compressionRatio = promptMetrics.compressionRatio;
      metrics.ragMode = promptMetrics.ragMode;
      metrics.ragCacheHit = promptMetrics.ragCacheHit;
    }
    
    const messages = buildMessageHistory(context);
    
    // 3. Chamar a LLM com Tool Calling
    const llmStart = Date.now();
    const llmResponse = await callLLMWithTools(systemPrompt, messages, tools);
    const llmLatency = Date.now() - llmStart;
    
    // Update metrics with LLM info
    if (metrics) {
      metrics.llmLatencyMs = llmLatency;
      metrics.totalResponseTimeMs = Date.now() - startTime;
      metrics.fastPathUsed = false;
    }
    
    // 4. Processar a resposta
    const result = processLLMResponse(llmResponse, context, startTime);
    
    // Track rules applied (using toolCalls.name)
    if (metrics) {
      metrics.rulesApplied = result.toolCalls
        .filter(t => t.name === 'save_fact' || t.name === 'update_crm')
        .map(t => t.id);
      
      // Track metrics
      trackPassiveContextMetrics(metrics);
    }
    
    console.log(`[Reasoning] Decision: ${result.decision}, Tools: ${result.toolCalls.length}`);
    
    return result;
    
  } catch (error) {
    console.error("[Reasoning] Error:", error);
    
    // Fallback para resposta segura
    return createFallbackResult(context, error, startTime);
  }
}

// ============================================
// PROMPT BUILDING
// ============================================

interface PromptMetrics {
  sofiaCoreSizeChars: number;
  rulesInjected: number;
  rulesSizeChars: number;
  ragChunks: number;
  ragSizeChars: number;
  compressionRatio: number;
  ragMode: 'passive' | 'active' | 'hybrid';
  ragCacheHit: boolean;
}

interface PromptWithMetrics {
  systemPrompt: string;
  promptMetrics: PromptMetrics;
}

/**
 * Build structured prompt with metrics tracking for AGENTS.md-style architecture
 */
async function buildStructuredPromptWithMetrics(
  context: FullContext, 
  agentId: string
): Promise<PromptWithMetrics> {
  const { clientProfile, funnelState, activeRules, workingMemory, ragContext, metadata } = context;
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sections: string[] = [];
  
  // Initialize metrics
  const promptMetrics: PromptMetrics = {
    sofiaCoreSizeChars: 0,
    rulesInjected: 0,
    rulesSizeChars: 0,
    ragChunks: 0,
    ragSizeChars: 0,
    compressionRatio: 1,
    ragMode: 'passive',
    ragCacheHit: context.ragCacheHit || false,
  };
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: RETRIEVAL-LED REASONING (TOP OF PROMPT - CRITICAL)
  // AGENTS.md-style: Forces LLM to consult docs before answering
  // ═══════════════════════════════════════════════════════════════
  if (ENABLE_PASSIVE_CONTEXT) {
    sections.push(getRetrievalLedReasoningBlock());
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: SOFIA.md CORE (Compressed Constitution)
  // ═══════════════════════════════════════════════════════════════
  if (ENABLE_PASSIVE_CONTEXT) {
    const coreBlock = buildSofiaCorePromptBlock({
      includeIdentity: true,
      includeClausulasPetreas: true,
      includeFSM: false, // FSM details in dynamic context
      includeRetrievalLed: false, // Already injected above
      includeAntiAlucinacao: true,
      includeQuickReference: false,
      maxChars: 3000,
    });
    sections.push(coreBlock);
    promptMetrics.sofiaCoreSizeChars = coreBlock.length;
  } else {
    // Fallback: Original identity section
    const fallbackIdentity = `# IDENTIDADE
Você é sofIA, assistente virtual de vendas da COESA Energia.
Seu objetivo é qualificar leads e guiá-los até a assinatura do contrato de energia por assinatura.`;
    sections.push(fallbackIdentity);
    promptMetrics.sofiaCoreSizeChars = fallbackIdentity.length;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: RULE MEMORY INJECTION (Learned Rules)
  // ═══════════════════════════════════════════════════════════════
  if (ENABLE_RULE_MEMORY_INJECTION) {
    try {
      const ruleContext: RuleMemoryContext = {
        funnelStage: funnelState.stage,
        hasProposal: funnelState.hasProposal,
        detectedObjection: undefined, // Could be passed from intake
        clientDistribuidora: clientProfile.distribuidora || undefined,
        valorFatura: clientProfile.valorFatura || undefined,
      };
      
      const rulesBlock = await buildRuleMemoryBlock(supabase, agentId, ruleContext, {
        maxRules: 10,
        filterByContext: true,
        compressDescriptions: true,
        maxDescriptionLength: 80,
      });
      
      if (rulesBlock.rulesCount > 0) {
        sections.push(rulesBlock.content);
        promptMetrics.rulesInjected = rulesBlock.rulesCount;
        promptMetrics.rulesSizeChars = rulesBlock.charCount;
        console.log(`[Reasoning] Injected ${rulesBlock.rulesCount} rules (${rulesBlock.charCount} chars)`);
      }
    } catch (err) {
      console.warn('[Reasoning] Failed to inject rule memory:', err);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: PASSIVE RAG CONTEXT (Pre-fetched by Stage)
  // ═══════════════════════════════════════════════════════════════
  if (ENABLE_PASSIVE_RAG) {
    try {
      const passiveRAG = await prefetchPassiveRAG(supabase, agentId, funnelState.stage, {
        maxChunksPerCategory: 2,
        compressionEnabled: true,
        maxTotalChars: 1200,
        prioritizeExemplars: true,
      });
      
      if (passiveRAG.chunksUsed > 0) {
        sections.push(passiveRAG.content);
        promptMetrics.ragChunks = passiveRAG.chunksUsed;
        promptMetrics.ragSizeChars = passiveRAG.charCount;
        promptMetrics.ragMode = 'passive';
        console.log(`[Reasoning] Passive RAG: ${passiveRAG.chunksUsed} chunks, ${passiveRAG.charCount} chars`);
      }
    } catch (err) {
      console.warn('[Reasoning] Failed to prefetch passive RAG:', err);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: DYNAMIC CLIENT CONTEXT
  // ═══════════════════════════════════════════════════════════════
  const clientContext = `# CONTEXTO DO CLIENTE
- Nome: ${clientProfile.name || 'Não informado'}
- Telefone: ${clientProfile.phone}
- Distribuidora: ${clientProfile.distribuidora || 'Não identificada'}
- Valor Fatura: ${clientProfile.valorFatura ? `R$ ${clientProfile.valorFatura}` : 'Não informado'}
- Consumo: ${clientProfile.consumoKwh ? `${clientProfile.consumoKwh} kWh` : 'Não calculado'}
- Estágio: ${funnelState.stage}
- Modo: ${funnelState.mode}
- Tem Proposta: ${funnelState.hasProposal ? 'Sim' : 'Não'}
- Qualificado: ${funnelState.isQualified ? 'Sim' : 'Não'}`;
  sections.push(clientContext);

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: BEHAVIORAL PROFILE (Sistema 2)
  // ═══════════════════════════════════════════════════════════════
  try {
    const persistedProfile = await loadPersistedProfile(clientProfile.phone);
    if (persistedProfile && persistedProfile.profileConfidence >= 0.3) {
      sections.push(buildProfilePromptBlock(persistedProfile));
    }
  } catch (err) {
    console.warn('[Reasoning] Failed to load behavioral profile:', err);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: DELAYED RESPONSE CONTEXT (Pending Response Scheduler)
  // ═══════════════════════════════════════════════════════════════
  if (metadata?.isDelayedResponse) {
    const hoursDelayed = metadata.hoursDelayed || 0;
    const timeOfDay = getTimeOfDayGreeting();
    
    sections.push(`# CONTEXTO: RESPOSTA ATRASADA
Você está respondendo uma mensagem que chegou há ${hoursDelayed} hora${hoursDelayed !== 1 ? 's' : ''}.
- Reconheça o atraso de forma natural e amigável
- Use saudação apropriada: "${timeOfDay}! Vi sua mensagem agora cedo..."
- NÃO diga "desculpe a demora" ou peça desculpas excessivamente
- Se a mensagem era uma pergunta, responda diretamente
- Mantenha o tom positivo e prestativo
- Retome o contexto da conversa naturalmente`);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: WORKING MEMORY
  // ═══════════════════════════════════════════════════════════════
  if (workingMemory.length > 0) {
    sections.push(`# MEMÓRIA DA CONVERSA
${workingMemory.map(m => `- ${m.key}: ${JSON.stringify(m.value)} (confiança: ${m.confidence})`).join('\n')}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: ACTIVE RULES (Legacy - from activeRules array)
  // ═══════════════════════════════════════════════════════════════
  if (activeRules.length > 0 && !ENABLE_RULE_MEMORY_INJECTION) {
    sections.push(`# REGRAS ATIVAS (OBRIGATÓRIO SEGUIR)
${activeRules.map((r, i) => `${i + 1}. [${r.ruleType}] ${r.name}: ${r.description || ''}`).join('\n')}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 10: RAG CONTEXT (Legacy - from ragContext)
  // ═══════════════════════════════════════════════════════════════
  if (ragContext.length > 0 && !ENABLE_PASSIVE_RAG) {
    sections.push(`# CONHECIMENTO RELEVANTE
${ragContext.map(r => `[${r.category}] ${r.content}`).join('\n\n')}`);
    promptMetrics.ragMode = 'active';
    promptMetrics.ragChunks = ragContext.length;
  }

  // Seção de objeções anteriores
  if (clientProfile.objectionHistory.length > 0) {
    sections.push(`# OBJEÇÕES ANTERIORES
${clientProfile.objectionHistory.map(o => `- ${o}`).join('\n')}`);
  }

  // Seção de estilo de coleta de dados guiado (Formulário Livre Guiado)
  sections.push(`# ESTILO DE COLETA DE DADOS (FORMULÁRIO GUIADO)
Ao pedir dados do cliente, SEMPRE use formato guiado para facilitar extração:
- Para VALORES: "Qual o valor da conta? *RESPONDA APENAS COM UM NÚMERO* _Exemplo: 500_"
- Para DISTRIBUIDORA: Liste opções numeradas + "OUTRA"
- Para E-MAIL: "Qual seu e-mail? *RESPONDA APENAS O E-MAIL*"
- SEMPRE adicione exemplos de resposta esperada`);

  // Seção de estilo de coleta de DOCUMENTOS guiado (Fase 2)
  if (funnelState.hasProposal) {
    sections.push(`# ESTILO DE COLETA DE DOCUMENTOS
Ao solicitar documentos para proposta definitiva:
1. Direcione para o LINK da proposta (banner "QUERO MINHA PROPOSTA DEFINITIVA")
2. Reforce segurança LGPD: "🔐 Seguimos as melhores práticas da LGPD"
3. Requisitos: PF (RG/CNH + Fatura) | PJ (Docs PF + Alteração Social)`);
  }

  // Instruções de comportamento
  sections.push(`# INSTRUÇÕES DE COMPORTAMENTO
1. SEMPRE use as ferramentas disponíveis para responder - nunca retorne texto sem usar send_message
2. Use save_fact para guardar informações importantes
3. Se o cliente fornecer dados, salve-os imediatamente
4. Se houver ambiguidade, use request_clarification
5. Se o cliente pedir atendente humano, use escalate
6. NUNCA invente dados - se não souber, pergunte
7. NUNCA prometa enviar proposta se ainda não existe (hasProposal = false)
8. Mantenha respostas curtas e objetivas (máximo 3 parágrafos)
9. **REGRA FSM**: Quando pedir um dado, chame set_expected_field JUNTO com send_message`);

  // Documentos pendentes
  if (funnelState.documentsPending.length > 0) {
    sections.push(`# DOCUMENTOS PENDENTES
${funnelState.documentsPending.map(d => `- ${d}`).join('\n')}`);
  }

  // Join all sections
  let fullPrompt = sections.filter(Boolean).join('\n\n');
  const originalLength = fullPrompt.length;
  
  // ═══════════════════════════════════════════════════════════════
  // FINAL: APPLY COMPRESSION IF ENABLED
  // ═══════════════════════════════════════════════════════════════
  if (ENABLE_CONTEXT_COMPRESSION && fullPrompt.length > 8000) {
    const compressed = compressContext(fullPrompt, {
      maxChars: 8000,
      preserveSections: ['RETRIEVAL-LED', 'CLÁUSULA', 'REGRAS ATIVAS'],
      aggressiveness: 'medium',
    });
    
    promptMetrics.compressionRatio = compressed.compressionRatio;
    console.log(`[Reasoning] Compressed prompt: ${compressed.originalLength} → ${compressed.compressedLength} (${(compressed.compressionRatio * 100).toFixed(1)}%)`);
    fullPrompt = compressed.compressed;
  } else {
    promptMetrics.compressionRatio = 1;
  }
  
  return {
    systemPrompt: fullPrompt,
    promptMetrics,
  };
}

/**
 * Legacy function for backwards compatibility
 */
async function buildStructuredPrompt(context: FullContext, agentId: string): Promise<string> {
  const { systemPrompt } = await buildStructuredPromptWithMetrics(context, agentId);
  return systemPrompt;
}

/**
 * Retorna saudação apropriada baseada no horário (São Paulo)
 */
function getTimeOfDayGreeting(): string {
  const now = new Date();
  const saoPauloOffset = -3;
  const saoPauloHour = (now.getUTCHours() + saoPauloOffset + 24) % 24;
  
  if (saoPauloHour >= 6 && saoPauloHour < 12) {
    return 'Bom dia';
  } else if (saoPauloHour >= 12 && saoPauloHour < 18) {
    return 'Boa tarde';
  } else {
    return 'Boa noite';
  }
}

function buildMessageHistory(context: FullContext): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  
  // Adicionar histórico da conversa
  for (const msg of context.conversationHistory) {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    });
  }
  
  // Adicionar a mensagem atual do intake
  const currentMessage = context.intake.transcribedContent || 
                         context.intake.extractedText || 
                         context.intake.rawContent;
  
  // Adicionar contexto de mídia se aplicável
  let userContent = currentMessage;
  if (context.intake.mediaType !== 'text') {
    userContent = `[${context.intake.mediaType.toUpperCase()}] ${currentMessage}`;
  }
  
  // Adicionar análise de intenção
  if (context.intake.intent !== 'unknown') {
    userContent += `\n\n[Sistema: Intenção detectada: ${context.intake.intent} (${(context.intake.intentConfidence * 100).toFixed(0)}%)]`;
  }
  
  // Adicionar entidades extraídas
  if (context.intake.entities.length > 0) {
    const entities = context.intake.entities
      .map(e => `${e.type}: ${e.normalized || e.value}`)
      .join(', ');
    userContent += `\n[Sistema: Entidades: ${entities}]`;
  }
  
  messages.push({
    role: 'user',
    content: userContent
  });
  
  return messages;
}

// ============================================
// LLM CALLING
// ============================================

interface LLMMessage {
  role: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface LLMResponse {
  id: string;
  choices: Array<{
    message: LLMMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
}

async function callLLMWithTools(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  tools: ToolSchema[]
): Promise<LLMResponse> {
  const response = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      tools: tools,
      tool_choice: "auto", // Permite que a LLM escolha usar ferramentas
      temperature: 0.7,
      max_tokens: 2000
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Reasoning] LLM API Error:", response.status, errorText);
    throw new Error(`LLM API Error: ${response.status}`);
  }
  
  return await response.json() as LLMResponse;
}

// ============================================
// RESPONSE PROCESSING
// ============================================

function processLLMResponse(
  llmResponse: LLMResponse,
  context: FullContext,
  startTime: number
): ReasoningResult {
  const choice = llmResponse.choices?.[0];
  if (!choice) {
    throw new Error("No response from LLM");
  }
  
  const message = choice.message;
  const toolCalls: ToolCall[] = [];
  const newFacts: NewFact[] = [];
  let responseText: string | undefined;
  let decision: DecisionType = 'respond';
  
  // Processar tool calls
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      try {
        const params = JSON.parse(tc.function.arguments);
        
        // Validar tool call
        const validation = validateToolCall(tc.function.name, params);
        if (!validation.valid) {
          console.warn(`[Reasoning] Invalid tool call: ${validation.error}`);
          continue;
        }
        
        const toolCall: ToolCall = {
          id: tc.id,
          name: tc.function.name as ToolCall['name'],
          parameters: params
        };
        
        toolCalls.push(toolCall);
        
        // Extrair informações baseadas no tipo de tool
        switch (tc.function.name) {
          case 'send_message':
            responseText = params.text;
            break;
            
          case 'save_fact':
            newFacts.push({
              key: params.key,
              value: params.value,
              confidence: params.confidence || 0.8,
              source: 'inferred' as MemorySource,
              validUntilHours: params.valid_hours
            });
            break;
            
          case 'escalate':
            decision = 'escalate';
            break;
            
          case 'request_clarification':
            decision = 'clarify';
            responseText = params.question;
            break;
            
          case 'mark_disqualified':
            decision = 'disqualify';
            break;
            
          case 'collect_document':
            decision = 'collect';
            break;
            
          case 'calculate_economy':
            decision = 'calculate';
            break;
            
          case 'transfer_to_sac':
            decision = 'escalate';
            break;
        }
        
      } catch (err) {
        console.error(`[Reasoning] Error parsing tool call:`, err);
      }
    }
  }
  
  // Se não houver tool calls mas houver conteúdo, usar como resposta
  if (toolCalls.length === 0 && message.content) {
    responseText = message.content;
    // Criar tool call implícito de send_message
    toolCalls.push({
      id: crypto.randomUUID(),
      name: 'send_message',
      parameters: {
        text: message.content,
        tone: 'professional'
      }
    });
  }
  
  // Determinar tom baseado no contexto
  const responseTone = determineResponseTone(context, decision);
  
  return {
    decision,
    decisionConfidence: calculateDecisionConfidence(toolCalls, context),
    reasoning: `LLM chose ${decision} with ${toolCalls.length} tool calls`,
    responseText,
    responseTone,
    toolCalls,
    newFacts,
    updatedFacts: [],
    modelUsed: llmResponse.model || DEFAULT_MODEL,
    tokensIn: llmResponse.usage?.prompt_tokens || 0,
    tokensOut: llmResponse.usage?.completion_tokens || 0,
    reasoningDurationMs: Date.now() - startTime
  };
}

function determineResponseTone(
  context: FullContext,
  decision: DecisionType
): ReasoningResult['responseTone'] {
  // Se escalando ou desqualificando, tom calmo
  if (decision === 'escalate' || decision === 'disqualify') {
    return 'calm';
  }
  
  // Se cliente tem sentimento negativo, empático
  if (context.intake.sentiment < 0) {
    return 'empathetic';
  }
  
  // Se urgência alta, urgente
  if (context.intake.urgency === 'critical' || context.intake.urgency === 'high') {
    return 'urgent';
  }
  
  // Se cliente está avançando no funil, entusiasmado
  if (context.funnelState.hasProposal || context.intake.intent === 'confirmation') {
    return 'enthusiastic';
  }
  
  // Default: profissional
  return 'professional';
}

function calculateDecisionConfidence(toolCalls: ToolCall[], context: FullContext): number {
  // Base confidence
  let confidence = 0.7;
  
  // Aumenta se houver tool calls claros
  if (toolCalls.length > 0) {
    confidence += 0.1;
  }
  
  // Aumenta se intenção foi detectada com confiança
  if (context.intake.intentConfidence > 0.8) {
    confidence += 0.1;
  }
  
  // Diminui se houver ambiguidade
  if (context.intake.intent === 'unknown') {
    confidence -= 0.2;
  }
  
  // Diminui se sentimento muito negativo
  if (context.intake.sentiment < -0.5) {
    confidence -= 0.1;
  }
  
  return Math.max(0.1, Math.min(1.0, confidence));
}

// ============================================
// FALLBACK
// ============================================

function createFallbackResult(
  context: FullContext,
  error: unknown,
  startTime: number
): ReasoningResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Mensagem de fallback educada
  const fallbackText = context.clientProfile.name
    ? `${context.clientProfile.name}, estou processando sua solicitação. Um momento, por favor! 🙏`
    : `Estou processando sua solicitação. Um momento, por favor! 🙏`;
  
  return {
    decision: 'respond',
    decisionConfidence: 0.3,
    reasoning: `Fallback due to error: ${errorMessage}`,
    responseText: fallbackText,
    responseTone: 'calm',
    toolCalls: [{
      id: crypto.randomUUID(),
      name: 'send_message',
      parameters: {
        text: fallbackText,
        tone: 'calm'
      }
    }],
    newFacts: [],
    updatedFacts: [],
    modelUsed: 'fallback',
    tokensIn: 0,
    tokensOut: 0,
    reasoningDurationMs: Date.now() - startTime
  };
}

// ============================================
// EXPORTS
// ============================================

export { buildStructuredPrompt, buildMessageHistory };
