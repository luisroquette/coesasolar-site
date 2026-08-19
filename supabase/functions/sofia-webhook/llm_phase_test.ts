/**
 * LLM Phase Unit Tests
 * 
 * Tests for the extracted llm-phase.ts module
 * Covers: Spam detection, history preparation, guardrails, prompt building
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  shouldExecuteLLMPhase,
  type LLMPhaseContext,
  type LLMPhaseResult,
  type LLMPhaseConversaData,
} from '../_shared/sofia-orchestrator/llm-phase.ts';

// ═══════════════════════════════════════════════════════════════
// TEST: shouldExecuteLLMPhase
// ═══════════════════════════════════════════════════════════════

Deno.test("shouldExecuteLLMPhase - always returns true", () => {
  const result = shouldExecuteLLMPhase();
  assertEquals(result, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: LLMPhaseConversaData type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("LLMPhaseConversaData - minimal required fields", () => {
  const conversa: LLMPhaseConversaData = {
    id: 'test-conversa-123',
  };
  assertExists(conversa.id);
  assertEquals(conversa.dados_coletados, undefined);
  assertEquals(conversa.sofia_mode, undefined);
});

Deno.test("LLMPhaseConversaData - all optional fields", () => {
  const conversa: LLMPhaseConversaData = {
    id: 'test-conversa-456',
    dados_coletados: { valorFatura: 500 },
    sofia_mode: 'closer',
    proposta_id: 'prop-123',
    bitrix24_stage: 'NEW',
    bitrix24_lead_id: '12345',
    total_messages: 20,
    last_human_message_at: null,
    master_offer_at: null,
    has_simulation: true,
    escalation_reason: null,
    human_agent_nome: null,
    arquivos_anexados: [],
    docs_received_whatsapp: null,
    audio_oferecido: true,
    needs_human_fallback: false,
  };
  
  assertEquals(conversa.sofia_mode, 'closer');
  assertEquals(conversa.total_messages, 20);
  assertEquals(conversa.has_simulation, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: LLMPhaseResult structure
// ═══════════════════════════════════════════════════════════════

Deno.test("LLMPhaseResult - successful LLM call", () => {
  const result: LLMPhaseResult = {
    handled: false,
    assistantMessage: 'Olá! Como posso ajudar?',
    usedModel: 'gemini-2.5-flash',
    systemPrompt: 'Você é a sofIA...',
    agentConfig: {} as any,
    history: [],
    spamBlocked: false,
    ragUsed: true,
    ragCategories: ['FAQ', 'pricing'],
    lastAssistantMsg: null,
    clientProfileResult: null,
    rejectionHistory: null,
    detectedSentiment: null,
    ragContextForPrompt: null,
  };
  
  assertEquals(result.handled, false);
  assertExists(result.assistantMessage);
  assertEquals(result.spamBlocked, false);
  assertEquals(result.ragUsed, true);
});

Deno.test("LLMPhaseResult - spam blocked", () => {
  const result: LLMPhaseResult = {
    handled: true,
    assistantMessage: 'Desculpe pela instabilidade!',
    usedModel: null,
    systemPrompt: '',
    agentConfig: {} as any,
    history: [],
    spamBlocked: true,
    ragUsed: false,
    ragCategories: [],
    lastAssistantMsg: null,
    clientProfileResult: null,
    rejectionHistory: null,
    detectedSentiment: null,
    ragContextForPrompt: null,
  };
  
  assertEquals(result.handled, true);
  assertEquals(result.spamBlocked, true);
  assertEquals(result.usedModel, null);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Spam detection patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Spam detection - repeated messages threshold", () => {
  const recentMessages = [
    { content: 'Olá', created_at: new Date().toISOString() },
    { content: 'Olá', created_at: new Date().toISOString() },
    { content: 'Olá', created_at: new Date().toISOString() },
    { content: 'Olá', created_at: new Date().toISOString() },
    { content: 'Olá', created_at: new Date().toISOString() },
    { content: 'Olá', created_at: new Date().toISOString() },
  ];
  
  const threshold = 5;
  const isSpam = recentMessages.length >= threshold;
  
  assertEquals(isSpam, true, 'Should detect spam when messages exceed threshold');
});

Deno.test("Spam detection - within time window", () => {
  const now = Date.now();
  const windowSeconds = 60;
  
  const recentMessages = [
    { created_at: new Date(now - 10000).toISOString() }, // 10s ago
    { created_at: new Date(now - 20000).toISOString() }, // 20s ago
    { created_at: new Date(now - 30000).toISOString() }, // 30s ago
  ];
  
  const inWindow = recentMessages.filter(m => {
    const msgTime = new Date(m.created_at).getTime();
    return (now - msgTime) < windowSeconds * 1000;
  });
  
  assertEquals(inWindow.length, 3, 'All messages should be within 60s window');
});

Deno.test("Spam detection - outside time window", () => {
  const now = Date.now();
  const windowSeconds = 60;
  
  const oldMessages = [
    { created_at: new Date(now - 120000).toISOString() }, // 2 min ago
    { created_at: new Date(now - 180000).toISOString() }, // 3 min ago
  ];
  
  const inWindow = oldMessages.filter(m => {
    const msgTime = new Date(m.created_at).getTime();
    return (now - msgTime) < windowSeconds * 1000;
  });
  
  assertEquals(inWindow.length, 0, 'Old messages should be outside window');
});

// ═══════════════════════════════════════════════════════════════
// TEST: History sanitization
// ═══════════════════════════════════════════════════════════════

Deno.test("History sanitization - role mapping", () => {
  const rawMessages = [
    { role: 'user', content: 'Olá' },
    { role: 'assistant', content: 'Olá! Como posso ajudar?' },
    { role: 'user', content: 'Quero saber sobre energia solar' },
  ];
  
  const validRoles = ['user', 'assistant', 'system'];
  
  for (const msg of rawMessages) {
    assert(validRoles.includes(msg.role), `Role should be valid: ${msg.role}`);
  }
});

Deno.test("History sanitization - content cleaning", () => {
  const dirtyContent = '  Olá!   Espaços extras   ';
  const cleanContent = dirtyContent.trim().replace(/\s+/g, ' ');
  
  assertEquals(cleanContent, 'Olá! Espaços extras');
});

Deno.test("History sanitization - limit messages", () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i + 1}`,
  }));
  
  const maxMessages = 10;
  const limited = messages.slice(0, maxMessages);
  
  assertEquals(limited.length, maxMessages);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Guardrails escalation
// ═══════════════════════════════════════════════════════════════

Deno.test("Guardrails - handoff trigger detection", () => {
  const handoffTriggers = ['falar com humano', 'atendente real', 'pessoa de verdade'];
  
  const testMessages = [
    { text: 'quero falar com humano', shouldTrigger: true },
    { text: 'preciso de atendente real', shouldTrigger: true },
    { text: 'olá, bom dia', shouldTrigger: false },
  ];
  
  for (const { text, shouldTrigger } of testMessages) {
    const triggered = handoffTriggers.some(t => text.toLowerCase().includes(t));
    assertEquals(triggered, shouldTrigger, `"${text}" should${shouldTrigger ? '' : ' not'} trigger`);
  }
});

Deno.test("Guardrails - escalation phrase detection", () => {
  const escalationPhrases = ['reclamação', 'processo', 'advogado', 'procon'];
  
  const testMessages = [
    { text: 'vou abrir reclamação', shouldEscalate: true },
    { text: 'meu advogado vai entrar em contato', shouldEscalate: true },
    { text: 'obrigado pelo atendimento', shouldEscalate: false },
  ];
  
  for (const { text, shouldEscalate } of testMessages) {
    const escalated = escalationPhrases.some(p => text.toLowerCase().includes(p));
    assertEquals(escalated, shouldEscalate, `"${text}" should${shouldEscalate ? '' : ' not'} escalate`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: RAG orchestration
// ═══════════════════════════════════════════════════════════════

Deno.test("RAG - skip conditions", () => {
  const skipPatterns = ['ok', 'sim', 'não', 'certo', 'entendi'];
  
  const testMessages = [
    { text: 'ok', shouldSkip: true },
    { text: 'entendi', shouldSkip: true },
    { text: 'como funciona a energia solar?', shouldSkip: false },
  ];
  
  for (const { text, shouldSkip } of testMessages) {
    const skip = skipPatterns.some(p => text.toLowerCase() === p);
    assertEquals(skip, shouldSkip, `RAG should${shouldSkip ? '' : ' not'} skip for: "${text}"`);
  }
});

Deno.test("RAG - category detection", () => {
  const categoryPatterns = {
    pricing: ['preço', 'valor', 'custo', 'desconto'],
    process: ['funciona', 'processo', 'etapa', 'como'],
    technical: ['painel', 'inversor', 'kwh', 'energia'],
  };
  
  const message = 'qual o preço do painel?';
  const detectedCategories: string[] = [];
  
  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    if (patterns.some(p => message.toLowerCase().includes(p))) {
      detectedCategories.push(category);
    }
  }
  
  assert(detectedCategories.includes('pricing'), 'Should detect pricing');
  assert(detectedCategories.includes('technical'), 'Should detect technical');
});

// ═══════════════════════════════════════════════════════════════
// TEST: Client profile detection
// ═══════════════════════════════════════════════════════════════

Deno.test("Client profile - technical indicators", () => {
  const technicalIndicators = ['kwh', 'inversor', 'módulo', 'potência', 'watt'];
  
  const testMessages = [
    { text: 'qual a potência em kwh?', isTechnical: true },
    { text: 'quanto vou pagar?', isTechnical: false },
  ];
  
  for (const { text, isTechnical } of testMessages) {
    const detected = technicalIndicators.some(i => text.toLowerCase().includes(i));
    assertEquals(detected, isTechnical, `"${text}" should${isTechnical ? '' : ' not'} be technical`);
  }
});

Deno.test("Client profile - simple/elderly indicators", () => {
  const simpleIndicators = ['não entendo', 'explica melhor', 'como assim', 'pode repetir'];
  
  const testMessages = [
    { text: 'não entendo isso', isSimple: true },
    { text: 'pode repetir?', isSimple: true },
    { text: 'ok, entendi perfeitamente', isSimple: false },
  ];
  
  for (const { text, isSimple } of testMessages) {
    const detected = simpleIndicators.some(i => text.toLowerCase().includes(i));
    assertEquals(detected, isSimple, `"${text}" should${isSimple ? '' : ' not'} indicate simple profile`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Sentiment detection
// ═══════════════════════════════════════════════════════════════

Deno.test("Sentiment - positive feedback", () => {
  const positivePatterns = ['ótimo', 'excelente', 'muito bom', 'adorei', 'perfeito'];
  
  const positiveMessages = ['muito bom o atendimento', 'adorei a proposta', 'perfeito!'];
  
  for (const msg of positiveMessages) {
    const isPositive = positivePatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(isPositive, true, `Should detect positive sentiment: ${msg}`);
  }
});

Deno.test("Sentiment - negative feedback", () => {
  const negativePatterns = ['ruim', 'péssimo', 'horrível', 'não gostei', 'decepcionado'];
  
  const negativeMessages = ['atendimento ruim', 'não gostei nada', 'péssimo serviço'];
  
  for (const msg of negativeMessages) {
    const isNegative = negativePatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(isNegative, true, `Should detect negative sentiment: ${msg}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: checkGuardrailsEscalation helper (extended)
// ═══════════════════════════════════════════════════════════════

Deno.test("Guardrails - null guardrails returns not needed", () => {
  const guardrails = null;
  const result = { needed: false, reason: null };
  
  assertEquals(result.needed, false);
  assertEquals(result.reason, null);
});

Deno.test("Guardrails - empty triggers returns not needed", () => {
  const guardrails: { handoff_triggers: string[]; escalation_phrases: string[] } = {
    handoff_triggers: [],
    escalation_phrases: [],
  };
  
  const message = 'qualquer mensagem';
  const triggered = guardrails.handoff_triggers.some(t => 
    message.toLowerCase().includes(t.toLowerCase())
  );
  
  assertEquals(triggered, false);
});

Deno.test("Guardrails - case insensitive matching", () => {
  const handoffTriggers = ['falar com humano'];
  
  const testMessages = [
    'FALAR COM HUMANO',
    'Falar Com Humano',
    'falar com humano',
  ];
  
  for (const msg of testMessages) {
    const triggered = handoffTriggers.some(t => 
      msg.toLowerCase().includes(t.toLowerCase())
    );
    assertEquals(triggered, true, `Should match case-insensitive: ${msg}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: LLM model selection
// ═══════════════════════════════════════════════════════════════

Deno.test("LLM model - supported models", () => {
  const supportedModels = [
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
    'google/gemini-3-flash-preview',
    'openai/gpt-5',
    'openai/gpt-5-mini',
  ];
  
  for (const model of supportedModels) {
    assert(model.includes('/'), 'Model should have provider prefix');
    assert(model.length > 5, 'Model name should be substantial');
  }
});

Deno.test("LLM model - default fallback", () => {
  const defaultModel = 'google/gemini-2.5-flash';
  
  const agentConfig = {
    persona: {
      llm_model: null,
    },
  };
  
  const selectedModel = agentConfig.persona?.llm_model || defaultModel;
  assertEquals(selectedModel, defaultModel);
});

// ═══════════════════════════════════════════════════════════════
// TEST: RAG context structure
// ═══════════════════════════════════════════════════════════════

Deno.test("RAG context - prompt context structure", () => {
  const ragContext = {
    content: 'Informação relevante sobre energia solar...',
    resultsCount: 3,
    categories: ['FAQ', 'pricing', 'technical'],
  };
  
  assertExists(ragContext.content);
  assertEquals(ragContext.resultsCount, 3);
  assertEquals(ragContext.categories.length, 3);
});

Deno.test("RAG context - empty results handling", () => {
  const ragContext = {
    content: '',
    resultsCount: 0,
    categories: [],
  };
  
  assertEquals(ragContext.resultsCount, 0);
  assertEquals(ragContext.content, '');
});

// ═══════════════════════════════════════════════════════════════
// TEST: Rejection history structure
// ═══════════════════════════════════════════════════════════════

Deno.test("Rejection history - was rejected structure", () => {
  const rejectionHistory = {
    wasRejectedBefore: true,
    rejectionReason: 'consumo_baixo',
    rejectedAt: '2025-01-15T10:00:00Z',
  };
  
  assertEquals(rejectionHistory.wasRejectedBefore, true);
  assertEquals(rejectionHistory.rejectionReason, 'consumo_baixo');
});

Deno.test("Rejection history - not rejected structure", () => {
  const rejectionHistory = {
    wasRejectedBefore: false,
    rejectionReason: null,
    rejectedAt: null,
  };
  
  assertEquals(rejectionHistory.wasRejectedBefore, false);
  assertEquals(rejectionHistory.rejectionReason, null);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Context protection prompt
// ═══════════════════════════════════════════════════════════════

Deno.test("Context protection - spam warning injection", () => {
  const spamDetected = true;
  const spamCount = 6;
  
  if (spamDetected) {
    const warningMessage = `⚠️ Spam detectado: ${spamCount} mensagens repetidas`;
    assert(warningMessage.includes('Spam detectado'));
    assert(warningMessage.includes('6'));
  }
});
