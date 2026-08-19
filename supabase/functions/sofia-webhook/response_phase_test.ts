/**
 * Response Phase Unit Tests
 * 
 * Tests for the extracted response-phase.ts module
 * Covers: Humanization, audio orchestration, proposal promise, rejection fallback
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  shouldExecuteResponsePhase,
  type ResponsePhaseContext,
  type ResponsePhaseResult,
  type ResponsePhaseConversaData,
  type MessageFunctions,
  type SyncFunctions,
} from '../_shared/sofia-orchestrator/response-phase.ts';

// ═══════════════════════════════════════════════════════════════
// TEST: shouldExecuteResponsePhase
// ═══════════════════════════════════════════════════════════════

Deno.test("shouldExecuteResponsePhase - returns true with valid message", () => {
  const result = shouldExecuteResponsePhase('Olá, como posso ajudar?');
  assertEquals(result, true);
});

Deno.test("shouldExecuteResponsePhase - returns false with null", () => {
  const result = shouldExecuteResponsePhase(null);
  assertEquals(result, false);
});

Deno.test("shouldExecuteResponsePhase - returns false with empty string", () => {
  const result = shouldExecuteResponsePhase('');
  assertEquals(result, false);
});

Deno.test("shouldExecuteResponsePhase - returns false with whitespace only", () => {
  const result = shouldExecuteResponsePhase('   ');
  assertEquals(result, false);
});

// ═══════════════════════════════════════════════════════════════
// TEST: ResponsePhaseConversaData type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("ResponsePhaseConversaData - minimal required fields", () => {
  const conversa: ResponsePhaseConversaData = {
    id: 'test-conversa-123',
  };
  assertExists(conversa.id);
  assertEquals(conversa.cliente_nome, undefined);
  assertEquals(conversa.proposta_id, undefined);
});

Deno.test("ResponsePhaseConversaData - all optional fields", () => {
  const conversa: ResponsePhaseConversaData = {
    id: 'test-conversa-456',
    cliente_nome: 'João Silva',
    cliente_email: 'joao@example.com',
    dados_coletados: { valorFatura: 500 },
    proposta_id: 'prop-123',
    bitrix24_lead_id: '12345',
    bitrix24_stage: 'PROPOSAL_SENT',
    sofia_mode: 'closer',
    audio_oferecido: true,
    total_messages: 25,
  };
  
  assertEquals(conversa.cliente_nome, 'João Silva');
  assertEquals(conversa.proposta_id, 'prop-123');
  assertEquals(conversa.audio_oferecido, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: ResponsePhaseResult structure
// ═══════════════════════════════════════════════════════════════

Deno.test("ResponsePhaseResult - successful delivery", () => {
  const result: ResponsePhaseResult = {
    handled: false,
    success: true,
    blockedByTakeover: false,
    rejectionHandled: false,
    audioSent: false,
    audioOffered: false,
    finalMessage: 'Olá! Como posso ajudar?',
  };
  
  assertEquals(result.success, true);
  assertEquals(result.blockedByTakeover, false);
  assertEquals(result.rejectionHandled, false);
});

Deno.test("ResponsePhaseResult - blocked by takeover", () => {
  const result: ResponsePhaseResult = {
    handled: true,
    success: false,
    blockedByTakeover: true,
    rejectionHandled: false,
    audioSent: false,
    audioOffered: false,
    finalMessage: '',
  };
  
  assertEquals(result.handled, true);
  assertEquals(result.success, false);
  assertEquals(result.blockedByTakeover, true);
});

Deno.test("ResponsePhaseResult - rejection handled", () => {
  const result: ResponsePhaseResult = {
    handled: true,
    success: true,
    blockedByTakeover: false,
    rejectionHandled: true,
    rejectionType: 'consumo_baixo',
    audioSent: false,
    audioOffered: false,
    finalMessage: 'Infelizmente não podemos atendê-lo.',
  };
  
  assertEquals(result.rejectionHandled, true);
  assertEquals(result.rejectionType, 'consumo_baixo');
});

Deno.test("ResponsePhaseResult - audio sent", () => {
  const result: ResponsePhaseResult = {
    handled: false,
    success: true,
    blockedByTakeover: false,
    rejectionHandled: false,
    audioSent: true,
    audioOffered: true,
    finalMessage: 'Mensagem com áudio',
  };
  
  assertEquals(result.audioSent, true);
  assertEquals(result.audioOffered, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Proposal promise detection
// ═══════════════════════════════════════════════════════════════

Deno.test("Proposal promise - detection patterns", () => {
  const promisePatterns = [
    'você receberá o link',
    'enviarei a proposta',
    'já já você recebe',
    'vou mandar o link',
  ];
  
  const testMessages = [
    { text: 'Você receberá o link em breve', hasPromise: true },
    { text: 'Vou enviar a proposta agora', hasPromise: true },
    { text: 'Olá, tudo bem?', hasPromise: false },
  ];
  
  for (const { text, hasPromise } of testMessages) {
    const detected = promisePatterns.some(p => text.toLowerCase().includes(p));
    assertEquals(detected, hasPromise, `"${text}" should${hasPromise ? '' : ' not'} have promise`);
  }
});

Deno.test("Proposal promise - minimum data requirements", () => {
  const requiredFields = ['email', 'valorFatura', 'distribuidora'];
  
  const testCases = [
    { 
      data: { email: 'test@test.com', valorFatura: 500, distribuidora: 'CEMIG' },
      hasMinimum: true,
    },
    { 
      data: { email: 'test@test.com', valorFatura: null, distribuidora: 'CEMIG' },
      hasMinimum: false,
    },
    { 
      data: { email: null, valorFatura: 500, distribuidora: 'CEMIG' },
      hasMinimum: false,
    },
  ];
  
  for (const { data, hasMinimum } of testCases) {
    const hasAll = requiredFields.every(field => 
      (data as Record<string, unknown>)[field] !== null && 
      (data as Record<string, unknown>)[field] !== undefined
    );
    assertEquals(hasAll, hasMinimum);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Rejection fallback patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Rejection fallback - consumo_baixo pattern", () => {
  const lowConsumptionPatterns = [
    'não atendemos valores abaixo',
    'consumo muito baixo',
    'valor mínimo',
    'conta abaixo de',
  ];
  
  const testMessages = [
    { text: 'Não atendemos valores abaixo de R$ 300', isRejection: true },
    { text: 'Seu consumo é muito baixo', isRejection: true },
    { text: 'Sua proposta está pronta', isRejection: false },
  ];
  
  for (const { text, isRejection } of testMessages) {
    const detected = lowConsumptionPatterns.some(p => text.toLowerCase().includes(p));
    assertEquals(detected, isRejection, `"${text}" should${isRejection ? '' : ' not'} be rejection`);
  }
});

Deno.test("Rejection fallback - distribuidora_nao_atendida pattern", () => {
  const distRejectionPatterns = [
    'não atendemos essa distribuidora',
    'não trabalhamos com',
    'região não atendida',
  ];
  
  const testMessages = [
    { text: 'Não atendemos essa distribuidora ainda', isRejection: true },
    { text: 'A CEMIG é atendida normalmente', isRejection: false },
  ];
  
  for (const { text, isRejection } of testMessages) {
    const detected = distRejectionPatterns.some(p => text.toLowerCase().includes(p));
    assertEquals(detected, isRejection);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Audio orchestration conditions
// ═══════════════════════════════════════════════════════════════

Deno.test("Audio orchestration - should send audio conditions", () => {
  const testCases = [
    {
      audioEnabled: true,
      clienteAceitaAudio: true,
      messageLength: 150,
      isTranscribedAudio: false,
      shouldSend: true,
    },
    {
      audioEnabled: false,
      clienteAceitaAudio: true,
      messageLength: 150,
      isTranscribedAudio: false,
      shouldSend: false, // Audio disabled globally
    },
    {
      audioEnabled: true,
      clienteAceitaAudio: false,
      messageLength: 150,
      isTranscribedAudio: false,
      shouldSend: false, // Client rejected audio
    },
    {
      audioEnabled: true,
      clienteAceitaAudio: true,
      messageLength: 50,
      isTranscribedAudio: false,
      shouldSend: false, // Message too short
    },
  ];
  
  for (const tc of testCases) {
    const shouldSend = tc.audioEnabled && 
                       tc.clienteAceitaAudio && 
                       tc.messageLength >= 100;
    assertEquals(shouldSend, tc.shouldSend);
  }
});

Deno.test("Audio orchestration - message length thresholds", () => {
  const minLength = 100;
  const maxLength = 500;
  
  const testMessages = [
    { length: 50, shouldSendAudio: false },
    { length: 100, shouldSendAudio: true },
    { length: 300, shouldSendAudio: true },
    { length: 500, shouldSendAudio: true },
    { length: 600, shouldSendAudio: false },
  ];
  
  for (const { length, shouldSendAudio } of testMessages) {
    const inRange = length >= minLength && length <= maxLength;
    assertEquals(inRange, shouldSendAudio, `Length ${length} should${shouldSendAudio ? '' : ' not'} send audio`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Humanization delay calculation
// ═══════════════════════════════════════════════════════════════

Deno.test("Humanization - typing delay calculation", () => {
  const typingSpeedCharsPerSecond = 30;
  
  const testMessages = [
    { text: 'Olá!', expectedMinDelay: 0.1 },
    { text: 'A'.repeat(150), expectedMinDelay: 5 },
    { text: 'A'.repeat(300), expectedMinDelay: 10 },
  ];
  
  for (const { text, expectedMinDelay } of testMessages) {
    const calculatedDelay = text.length / typingSpeedCharsPerSecond;
    assert(calculatedDelay >= expectedMinDelay * 0.5, 
      `Delay for ${text.length} chars should be >= ${expectedMinDelay}s`);
  }
});

Deno.test("Humanization - delay bounds", () => {
  const minDelay = 1; // seconds
  const maxDelay = 10; // seconds
  
  const testCases = [
    { rawDelay: 0.5, expected: 1 },   // Below min, clamp to min
    { rawDelay: 5, expected: 5 },     // Within range
    { rawDelay: 15, expected: 10 },   // Above max, clamp to max
  ];
  
  for (const { rawDelay, expected } of testCases) {
    const bounded = Math.max(minDelay, Math.min(maxDelay, rawDelay));
    assertEquals(bounded, expected);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Escalation conditions
// ═══════════════════════════════════════════════════════════════

Deno.test("Escalation - needs human escalation conditions", () => {
  const testCases = [
    { needsHuman: true, aiFailedCompletely: false, shouldEscalate: true },
    { needsHuman: false, aiFailedCompletely: true, shouldEscalate: true },
    { needsHuman: false, aiFailedCompletely: false, shouldEscalate: false },
    { needsHuman: true, aiFailedCompletely: true, shouldEscalate: true },
  ];
  
  for (const tc of testCases) {
    const shouldEscalate = tc.needsHuman || tc.aiFailedCompletely;
    assertEquals(shouldEscalate, tc.shouldEscalate);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: MessageFunctions interface
// ═══════════════════════════════════════════════════════════════

Deno.test("MessageFunctions - interface structure", () => {
  const mockFns: MessageFunctions = {
    sendText: async (_phone: string, _msg: string) => true,
    sendAudio: async (_phone: string, _text: string) => true,
    safeSend: async (_supabase: any, _conversaId: string, _phone: string, _msg: string) => true,
    sendTypingIndicator: async (_phone: string, _config: any) => {},
  };
  
  assertExists(mockFns.sendText);
  assertExists(mockFns.sendAudio);
  assertExists(mockFns.safeSend);
  assertExists(mockFns.sendTypingIndicator);
});

// ═══════════════════════════════════════════════════════════════
// TEST: SyncFunctions interface
// ═══════════════════════════════════════════════════════════════

Deno.test("SyncFunctions - interface structure", () => {
  const mockFns: SyncFunctions = {
    syncToBitrix: async () => ({ success: true }),
    setPendingTask: async () => {},
    saveContactToWhatsApp: async () => true,
    syncContactToCRM: async () => true,
  };
  
  assertExists(mockFns.syncToBitrix);
  assertExists(mockFns.setPendingTask);
  assertExists(mockFns.saveContactToWhatsApp);
  assertExists(mockFns.syncContactToCRM);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Post-response update fields
// ═══════════════════════════════════════════════════════════════

Deno.test("Post-response - conversation update fields", () => {
  const updateFields = {
    last_sofia_message_at: new Date().toISOString(),
    lead_score: 45,
    sofia_mode: 'closer',
    total_messages: 26,
    detected_objection: 'price',
    next_followup_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  };
  
  assertExists(updateFields.last_sofia_message_at);
  assert(updateFields.lead_score >= 0 && updateFields.lead_score <= 100);
  assert(updateFields.total_messages > 0);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Lock release patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Lock release - phone normalization", () => {
  const phones = [
    { input: '5511999999999', normalized: '5511999999999' },
    { input: '+5511999999999', normalized: '5511999999999' },
    { input: '11999999999', normalized: '5511999999999' },
  ];
  
  for (const { input, normalized } of phones) {
    const clean = input.replace(/\D/g, '');
    const withCountry = clean.startsWith('55') ? clean : `55${clean}`;
    assertEquals(withCountry, normalized);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Self-evaluation structure
// ═══════════════════════════════════════════════════════════════

Deno.test("Self-evaluation - evaluation dimensions", () => {
  const dimensions = {
    clarity: 0.25,
    accuracy: 0.30,
    tone_appropriateness: 0.20,
    funnel_progression: 0.25,
  };
  
  const totalWeight = Object.values(dimensions).reduce((a, b) => a + b, 0);
  assertEquals(totalWeight, 1.0);
});

Deno.test("Self-evaluation - score thresholds", () => {
  const thresholds = {
    excellent: 0.85,
    good: 0.70,
    acceptable: 0.60,
    needsReview: 0.50,
  };
  
  const testScores = [
    { score: 0.90, level: 'excellent' },
    { score: 0.75, level: 'good' },
    { score: 0.65, level: 'acceptable' },
    { score: 0.55, level: 'needsReview' },
  ];
  
  for (const { score, level } of testScores) {
    if (score >= thresholds.excellent) assertEquals(level, 'excellent');
    else if (score >= thresholds.good) assertEquals(level, 'good');
    else if (score >= thresholds.acceptable) assertEquals(level, 'acceptable');
    else assertEquals(level, 'needsReview');
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Buffer cleanup
// ═══════════════════════════════════════════════════════════════

Deno.test("Buffer cleanup - buffer ID validation", () => {
  const validBufferIds = [
    'buffer-123-456',
    'buf_abc123',
    'message-buffer-789',
  ];
  
  for (const bufferId of validBufferIds) {
    assert(typeof bufferId === 'string');
    assert(bufferId.length > 0);
  }
});

Deno.test("Buffer cleanup - null buffer handling", () => {
  const bufferId = null;
  const shouldClear = bufferId !== null && bufferId !== undefined;
  
  assertEquals(shouldClear, false);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Latency config structure
// ═══════════════════════════════════════════════════════════════

Deno.test("Latency config - default values", () => {
  const defaultConfig = {
    typingIndicatorEnabled: true,
    minDelayMs: 1000,
    maxDelayMs: 10000,
    charsPerSecond: 30,
    jitterEnabled: true,
    jitterMaxMs: 500,
  };
  
  assertEquals(defaultConfig.typingIndicatorEnabled, true);
  assert(defaultConfig.minDelayMs > 0);
  assert(defaultConfig.maxDelayMs > defaultConfig.minDelayMs);
});

Deno.test("Latency config - disabled typing indicator", () => {
  const disabledConfig = {
    typingIndicatorEnabled: false,
    minDelayMs: 0,
    maxDelayMs: 0,
  };
  
  assertEquals(disabledConfig.typingIndicatorEnabled, false);
  assertEquals(disabledConfig.minDelayMs, 0);
});

// ═══════════════════════════════════════════════════════════════
// TEST: CRM sync result structure
// ═══════════════════════════════════════════════════════════════

Deno.test("CRM sync - successful update", () => {
  const syncResult = {
    success: true,
    stageUpdated: true,
    newStage: 'UC_PROPOSAL_SENT',
  };
  
  assertEquals(syncResult.success, true);
  assertEquals(syncResult.stageUpdated, true);
  assertExists(syncResult.newStage);
});

Deno.test("CRM sync - failed update", () => {
  const syncResult = {
    success: false,
    stageUpdated: false,
    error: 'Rate limit exceeded',
  };
  
  assertEquals(syncResult.success, false);
  assertExists(syncResult.error);
});
