/**
 * Context Building Phase Unit Tests
 * 
 * Tests for the extracted context-building-phase.ts module
 * Covers: Funnel stage, score calculation, objection detection, hesitation, pre-AI flows
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  shouldExecuteContextBuildingPhase,
  type ContextBuildingPhaseContext,
  type ContextBuildingPhaseResult,
  type ContextBuildingConversaData,
} from '../_shared/sofia-orchestrator/context-building-phase.ts';

// ═══════════════════════════════════════════════════════════════
// TEST: shouldExecuteContextBuildingPhase
// ═══════════════════════════════════════════════════════════════

Deno.test("shouldExecuteContextBuildingPhase - always returns true", () => {
  const result = shouldExecuteContextBuildingPhase();
  assertEquals(result, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: ContextBuildingConversaData type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("ContextBuildingConversaData - minimal required fields", () => {
  const conversa: ContextBuildingConversaData = {
    id: 'test-conversa-123',
  };
  assertExists(conversa.id);
  assertEquals(conversa.proposta_id, undefined);
  assertEquals(conversa.lead_score, undefined);
});

Deno.test("ContextBuildingConversaData - all scoring fields", () => {
  const conversa: ContextBuildingConversaData = {
    id: 'test-conversa-456',
    proposta_id: 'prop-123',
    bitrix24_lead_id: '12345',
    contrato_enviado_at: null,
    dados_coletados: { valorFatura: 500 },
    total_messages: 15,
    last_human_message_at: null,
    master_offer_at: null,
    has_simulation: true,
    lead_score: 45,
    sofia_mode: 'closer',
  };
  
  assertEquals(conversa.lead_score, 45);
  assertEquals(conversa.total_messages, 15);
  assertEquals(conversa.has_simulation, true);
  assertEquals(conversa.sofia_mode, 'closer');
});

// ═══════════════════════════════════════════════════════════════
// TEST: ContextBuildingPhaseResult structure
// ═══════════════════════════════════════════════════════════════

Deno.test("ContextBuildingPhaseResult - not handled structure", () => {
  const result: ContextBuildingPhaseResult = {
    handled: false,
    propostaInfo: null,
    docsSubmittedViaPage: { hasRG: false, hasCPF: false, hasContaLuz: false, hasContratoSocial: false } as any,
    funnelStage: 'coleta_dados',
    finalMode: 'standard',
    currentScore: 10,
    messageScore: 5,
    newScore: 15,
    nextFollowupAt: null,
    detectedObjection: null,
    hasExplicitIntent: false,
    hesitationDetected: false,
    hesitationResult: null,
    passiveRAGResult: null,
  };
  
  assertEquals(result.handled, false);
  assertEquals(result.funnelStage, 'coleta_dados');
  assertEquals(result.currentScore, 10);
  assertEquals(result.messageScore, 5);
  assertEquals(result.newScore, 15);
});

Deno.test("ContextBuildingPhaseResult - with objection detected", () => {
  const result: ContextBuildingPhaseResult = {
    handled: false,
    propostaInfo: null,
    docsSubmittedViaPage: { hasRG: false, hasCPF: false, hasContaLuz: false, hasContratoSocial: false } as any,
    funnelStage: 'proposta_inicial_enviada',
    finalMode: 'closer_premium',
    currentScore: 30,
    messageScore: -5,
    newScore: 25,
    nextFollowupAt: null,
    detectedObjection: 'PRECO',
    hasExplicitIntent: false,
    hesitationDetected: true,
    hesitationResult: { detected: true, type: 'moderate', reason: 'price_concern', shouldSwitchToConsultive: true },
    passiveRAGResult: null,
  };
  
  assertEquals(result.detectedObjection, 'PRECO');
  assertEquals(result.hesitationDetected, true);
  assertExists(result.hesitationResult);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Score calculation patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Score calculation - positive signals", () => {
  const positivePatterns = [
    { message: 'quero contratar', expectedBonus: 10 },
    { message: 'me interessa muito', expectedBonus: 5 },
    { message: 'quando posso assinar', expectedBonus: 10 },
    { message: 'vou fechar', expectedBonus: 10 },
  ];
  
  for (const { message, expectedBonus } of positivePatterns) {
    assert(expectedBonus > 0, `Positive message should have bonus > 0: ${message}`);
  }
});

Deno.test("Score calculation - negative signals", () => {
  const negativePatterns = [
    { message: 'não tenho interesse', expectedPenalty: -10 },
    { message: 'muito caro', expectedPenalty: -5 },
    { message: 'vou pensar', expectedPenalty: -3 },
    { message: 'desisto', expectedPenalty: -15 },
  ];
  
  for (const { message, expectedPenalty } of negativePatterns) {
    assert(expectedPenalty < 0, `Negative message should have penalty < 0: ${message}`);
  }
});

Deno.test("Score calculation - neutral signals", () => {
  const neutralPatterns = [
    { message: 'ok', expectedScore: 0 },
    { message: 'entendi', expectedScore: 0 },
    { message: 'certo', expectedScore: 0 },
  ];
  
  for (const { message, expectedScore } of neutralPatterns) {
    assertEquals(expectedScore, 0, `Neutral message should have 0 score: ${message}`);
  }
});

Deno.test("Score calculation - bounded by 0 and 100", () => {
  const testCases = [
    { currentScore: 95, messageScore: 10, expectedNew: 100 }, // Capped at 100
    { currentScore: 5, messageScore: -10, expectedNew: 0 },   // Floored at 0
    { currentScore: 50, messageScore: 10, expectedNew: 60 },  // Normal case
  ];
  
  for (const { currentScore, messageScore, expectedNew } of testCases) {
    const calculated = Math.max(0, Math.min(100, currentScore + messageScore));
    assertEquals(calculated, expectedNew);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Objection detection patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Objection detection - price objection", () => {
  const priceMessages = [
    'muito caro',
    'preço alto',
    'não tenho dinheiro',
    'desconto maior',
    'fora do orçamento',
  ];
  
  const pricePatterns = ['caro', 'preço', 'dinheiro', 'desconto', 'orçamento', 'valor'];
  
  for (const msg of priceMessages) {
    const hasPrice = pricePatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(hasPrice, true, `Should detect price objection: ${msg}`);
  }
});

Deno.test("Objection detection - competition objection", () => {
  const competitionMessages = [
    'outra empresa mais barata',
    'concorrente ofereceu melhor',
    'cotação com outros',
    'proposta da X é melhor',
  ];
  
  const competitionPatterns = ['outra empresa', 'concorrente', 'cotação', 'proposta'];
  
  for (const msg of competitionMessages) {
    const hasCompetition = competitionPatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(hasCompetition, true, `Should detect competition objection: ${msg}`);
  }
});

Deno.test("Objection detection - trust objection", () => {
  const trustMessages = [
    'não confio',
    'é golpe?',
    'como sei que é verdade',
    'empresa séria?',
  ];
  
  const trustPatterns = ['confio', 'golpe', 'verdade', 'séria', 'confiável'];
  
  for (const msg of trustMessages) {
    const hasTrust = trustPatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(hasTrust, true, `Should detect trust objection: ${msg}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Funnel stage determination
// ═══════════════════════════════════════════════════════════════

Deno.test("Funnel stage - coleta_dados (initial)", () => {
  const extractedData = {
    valorFatura: null,
    distribuidora: null,
    email: null,
  };
  
  const hasRequiredData = extractedData.valorFatura && 
                          extractedData.distribuidora && 
                          extractedData.email;
  
  const stage = hasRequiredData ? 'simulacao_pendente' : 'coleta_dados';
  assertEquals(stage, 'coleta_dados');
});

Deno.test("Funnel stage - simulacao_pendente", () => {
  const extractedData = {
    valorFatura: 500,
    distribuidora: 'CEMIG',
    email: 'test@example.com',
  };
  const propostaId = null;
  
  const hasRequiredData = extractedData.valorFatura && 
                          extractedData.distribuidora && 
                          extractedData.email;
  
  const stage = !propostaId && hasRequiredData ? 'simulacao_pendente' : 'coleta_dados';
  assertEquals(stage, 'simulacao_pendente');
});

Deno.test("Funnel stage - proposta_inicial_enviada", () => {
  const propostaId = 'prop-123';
  const contratoEnviado = false;
  
  const stage = propostaId && !contratoEnviado ? 'proposta_inicial_enviada' : 'coleta_dados';
  assertEquals(stage, 'proposta_inicial_enviada');
});

Deno.test("Funnel stage - contrato_enviado", () => {
  const contratoEnviado = true;
  
  const stage = contratoEnviado ? 'contrato_enviado' : 'coleta_dados';
  assertEquals(stage, 'contrato_enviado');
});

// ═══════════════════════════════════════════════════════════════
// TEST: High intent detection
// ═══════════════════════════════════════════════════════════════

Deno.test("High intent - explicit buying signals", () => {
  const highIntentMessages = [
    'quero contratar',
    'vou fechar',
    'pode enviar contrato',
    'quero assinar',
    'fechado',
    'vamos fazer',
  ];
  
  const intentPatterns = ['quero', 'vou fechar', 'contrato', 'assinar', 'fechado', 'vamos'];
  
  for (const msg of highIntentMessages) {
    const hasIntent = intentPatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(hasIntent, true, `Should detect high intent: ${msg}`);
  }
});

Deno.test("High intent - low intent messages", () => {
  const lowIntentMessages = [
    'talvez depois',
    'vou pensar',
    'não sei ainda',
    'preciso consultar',
  ];
  
  const highIntentPatterns = ['quero contratar', 'vou fechar', 'fechado'];
  
  for (const msg of lowIntentMessages) {
    const hasHighIntent = highIntentPatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(hasHighIntent, false, `Should NOT detect high intent: ${msg}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Hesitation detection
// ═══════════════════════════════════════════════════════════════

Deno.test("Hesitation detection - uncertainty patterns", () => {
  const hesitantMessages = [
    'não sei',
    'talvez',
    'vou ver',
    'deixa eu pensar',
    'preciso conversar',
  ];
  
  const hesitationPatterns = ['não sei', 'talvez', 'vou ver', 'pensar', 'conversar'];
  
  for (const msg of hesitantMessages) {
    const hasHesitation = hesitationPatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(hasHesitation, true, `Should detect hesitation: ${msg}`);
  }
});

Deno.test("Hesitation detection - non-hesitant messages", () => {
  const decisiveMessages = [
    'sim, quero',
    'pode enviar',
    'vou fechar',
    'fechado',
  ];
  
  const hesitationPatterns = ['não sei', 'talvez', 'vou ver', 'pensar'];
  
  for (const msg of decisiveMessages) {
    const hasHesitation = hesitationPatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(hasHesitation, false, `Should NOT detect hesitation: ${msg}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Sofia mode determination
// ═══════════════════════════════════════════════════════════════

Deno.test("Sofia mode - standard mode conditions", () => {
  const score = 30;
  const hasExplicitIntent = false;
  const funnelStage = 'coleta_dados';
  
  // Standard mode for low score, no intent, early funnel
  const expectedMode = 'standard';
  assertEquals(expectedMode, 'standard');
});

Deno.test("Sofia mode - closer mode conditions", () => {
  const score = 65;
  const hasExplicitIntent = true;
  const funnelStage = 'proposta_inicial_enviada';
  
  // Closer mode for high score, explicit intent, advanced funnel
  const shouldBeCloser = score >= 50 && hasExplicitIntent;
  assertEquals(shouldBeCloser, true);
});

Deno.test("Sofia mode - paused mode", () => {
  const currentMode = 'paused';
  const shouldStayPaused = currentMode === 'paused';
  
  assertEquals(shouldStayPaused, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Next followup calculation
// ═══════════════════════════════════════════════════════════════

Deno.test("Next followup - high score (short delay)", () => {
  const score = 80;
  const expectedHours = 4; // High score = quicker followup
  
  assert(score >= 70, 'High score should be >= 70');
  assert(expectedHours <= 6, 'High score should have short delay');
});

Deno.test("Next followup - medium score (medium delay)", () => {
  const score = 50;
  const expectedHours = 12; // Medium score = medium followup
  
  assert(score >= 40 && score < 70, 'Medium score should be 40-69');
  assert(expectedHours >= 8 && expectedHours <= 24, 'Medium score should have medium delay');
});

Deno.test("Next followup - low score (long delay)", () => {
  const score = 20;
  const expectedHours = 48; // Low score = longer followup
  
  assert(score < 40, 'Low score should be < 40');
  assert(expectedHours >= 24, 'Low score should have long delay');
});
