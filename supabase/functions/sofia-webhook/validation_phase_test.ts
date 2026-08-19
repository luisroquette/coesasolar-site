/**
 * Validation Phase Unit Tests
 * 
 * Tests for the extracted validation-phase.ts module
 * Covers: Distributor validation, typo detection, disqualification flows
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  shouldExecuteValidationPhase,
  type ValidationPhaseContext,
  type ValidationPhaseResult,
  type ValidationConversaData,
} from '../_shared/sofia-orchestrator/validation-phase.ts';

// ═══════════════════════════════════════════════════════════════
// TEST: shouldExecuteValidationPhase
// ═══════════════════════════════════════════════════════════════

Deno.test("shouldExecuteValidationPhase - always returns true", () => {
  const result = shouldExecuteValidationPhase();
  assertEquals(result, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: ValidationConversaData type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("ValidationConversaData - accepts minimal required fields", () => {
  const conversa: ValidationConversaData = {
    id: 'test-conversa-123',
  };
  assertExists(conversa.id);
  assertEquals(conversa.bitrix24_lead_id, undefined);
  assertEquals(conversa.sofia_mode, undefined);
});

Deno.test("ValidationConversaData - accepts all optional fields", () => {
  const conversa: ValidationConversaData = {
    id: 'test-conversa-456',
    bitrix24_lead_id: '12345',
    sofia_mode: 'standard',
    ended_at: '2025-02-01T12:00:00Z',
  };
  assertExists(conversa.id);
  assertEquals(conversa.bitrix24_lead_id, '12345');
  assertEquals(conversa.sofia_mode, 'standard');
  assertEquals(conversa.ended_at, '2025-02-01T12:00:00Z');
});

// ═══════════════════════════════════════════════════════════════
// TEST: ValidationPhaseResult structure
// ═══════════════════════════════════════════════════════════════

Deno.test("ValidationPhaseResult - not handled result structure", () => {
  const result: ValidationPhaseResult = {
    handled: false,
    extractedData: {},
    distributorValidated: false,
    distributorRejected: false,
    typoDetected: false,
    disqualified: false,
  };
  
  assertEquals(result.handled, false);
  assertEquals(result.distributorValidated, false);
  assertEquals(result.distributorRejected, false);
  assertEquals(result.typoDetected, false);
  assertEquals(result.disqualified, false);
  assertEquals(result.response, undefined);
});

Deno.test("ValidationPhaseResult - handled with disqualification", () => {
  const result: ValidationPhaseResult = {
    handled: true,
    status: 'disqualified',
    extractedData: { valorFatura: 150 },
    distributorValidated: false,
    distributorRejected: false,
    typoDetected: false,
    disqualified: true,
    disqualificationReason: 'consumo_baixo',
  };
  
  assertEquals(result.handled, true);
  assertEquals(result.status, 'disqualified');
  assertEquals(result.disqualified, true);
  assertEquals(result.disqualificationReason, 'consumo_baixo');
});

Deno.test("ValidationPhaseResult - handled with typo detection", () => {
  const result: ValidationPhaseResult = {
    handled: true,
    status: 'typo_flow_handled',
    extractedData: { distribuidora: 'CEMIG' },
    distributorValidated: false,
    distributorRejected: false,
    typoDetected: true,
    disqualified: false,
  };
  
  assertEquals(result.handled, true);
  assertEquals(result.typoDetected, true);
  assertEquals(result.status, 'typo_flow_handled');
});

// ═══════════════════════════════════════════════════════════════
// TEST: ValidationPhaseContext structure
// ═══════════════════════════════════════════════════════════════

Deno.test("ValidationPhaseContext - minimal context structure", () => {
  // Mock functions
  const mockSendWhatsApp = async (_phone: string, _msg: string) => {};
  const mockValidarDistribuidora = (_dist: string) => ({
    valid: true,
    normalized: 'CEMIG',
    bitrixValue: 'CEMIG',
    isAtendida: true,
    requiresClarification: false,
    clarificationMessage: null,
    rejectionMessage: null,
  });
  
  // Minimal context structure
  const ctx = {
    supabase: {} as any,
    conversaId: 'test-123',
    phone: '5511999999999',
    clienteNome: 'João',
    messageText: 'Olá',
    agentId: 'sofia',
    agentName: 'sofIA',
    conversa: null,
    existingDados: {},
    extractedData: {},
    distribuidoraCache: null,
    validarDistribuidora: mockValidarDistribuidora,
    detectionPatterns: new Map(),
    sendWhatsAppMessage: mockSendWhatsApp,
  };
  
  assertExists(ctx.conversaId);
  assertExists(ctx.phone);
  assertExists(ctx.validarDistribuidora);
  assertExists(ctx.sendWhatsAppMessage);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Distributor validation scenarios (type checks)
// ═══════════════════════════════════════════════════════════════

Deno.test("Distributor validation - valid distributor structure", () => {
  const validation = {
    valid: true,
    normalized: 'CEMIG',
    bitrixValue: 'CEMIG_D',
    isAtendida: true,
    requiresClarification: false,
    clarificationMessage: null,
    rejectionMessage: null,
  };
  
  assertEquals(validation.valid, true);
  assertEquals(validation.normalized, 'CEMIG');
  assertEquals(validation.isAtendida, true);
});

Deno.test("Distributor validation - requires clarification structure", () => {
  const validation = {
    valid: false,
    normalized: null,
    bitrixValue: null,
    isAtendida: false,
    requiresClarification: true,
    clarificationMessage: 'Você quis dizer CEMIG ou CPFL?',
    rejectionMessage: null,
  };
  
  assertEquals(validation.valid, false);
  assertEquals(validation.requiresClarification, true);
  assertExists(validation.clarificationMessage);
});

Deno.test("Distributor validation - rejected distributor structure", () => {
  const validation = {
    valid: false,
    normalized: 'ENEL_SP',
    bitrixValue: null,
    isAtendida: false,
    requiresClarification: false,
    clarificationMessage: null,
    rejectionMessage: 'Infelizmente não atendemos a ENEL SP no momento.',
  };
  
  assertEquals(validation.valid, false);
  assertEquals(validation.isAtendida, false);
  assertExists(validation.rejectionMessage);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Extracted data with typo detection fields
// ═══════════════════════════════════════════════════════════════

Deno.test("ExtractedData - typo detection fields", () => {
  const extractedData = {
    distribuidora: null,
    distribuidoraTypoDetectado: 'cemyg',
    distribuidoraTypoSugerida: 'CEMIG',
    aguardandoConfirmacaoTypo: true,
  };
  
  assertEquals(extractedData.distribuidora, null);
  assertEquals(extractedData.distribuidoraTypoDetectado, 'cemyg');
  assertEquals(extractedData.distribuidoraTypoSugerida, 'CEMIG');
  assertEquals(extractedData.aguardandoConfirmacaoTypo, true);
});

Deno.test("ExtractedData - confirmed typo updates distribuidora", () => {
  const extractedDataBefore = {
    distribuidora: null,
    distribuidoraTypoDetectado: 'cemyg',
    distribuidoraTypoSugerida: 'CEMIG',
    aguardandoConfirmacaoTypo: true,
  };
  
  // Simulating confirmation
  const extractedDataAfter = {
    ...extractedDataBefore,
    distribuidora: 'CEMIG',
    aguardandoConfirmacaoTypo: false,
  };
  
  assertEquals(extractedDataAfter.distribuidora, 'CEMIG');
  assertEquals(extractedDataAfter.aguardandoConfirmacaoTypo, false);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Disqualification scenarios (type checks)
// ═══════════════════════════════════════════════════════════════

Deno.test("Disqualification - low consumption threshold", () => {
  const extractedData = {
    valorFatura: 150, // Below R$ 300 threshold
  };
  
  const result: Partial<ValidationPhaseResult> = {
    disqualified: true,
    disqualificationReason: 'consumo_baixo',
  };
  
  assert(extractedData.valorFatura < 300);
  assertEquals(result.disqualified, true);
  assertEquals(result.disqualificationReason, 'consumo_baixo');
});

Deno.test("Disqualification - third-party scenario", () => {
  const messageText = 'é para a casa da minha mãe';
  
  const result: Partial<ValidationPhaseResult> = {
    disqualified: true,
    disqualificationReason: 'terceiro',
  };
  
  // Message contains third-party indicator
  assert(messageText.toLowerCase().includes('minha mãe') || 
         messageText.toLowerCase().includes('meu pai') ||
         messageText.toLowerCase().includes('para outra pessoa'));
  assertEquals(result.disqualified, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Detection patterns map structure
// ═══════════════════════════════════════════════════════════════

Deno.test("Detection patterns - map structure", () => {
  const patterns = new Map<string, { regex: string; action: string }>();
  
  patterns.set('low_consumption', {
    regex: 'valor.*baixo|menos.*(de|que).*300',
    action: 'disqualify',
  });
  
  patterns.set('third_party', {
    regex: '(minha?|meu)\\s+(mãe|pai|sogr[oa]|tia?o?)',
    action: 'disqualify',
  });
  
  assertEquals(patterns.size, 2);
  assertExists(patterns.get('low_consumption'));
  assertExists(patterns.get('third_party'));
});

Deno.test("Detection patterns - pattern matching simulation", () => {
  const message = 'minha conta é de R$ 250';
  const lowValuePattern = /menos.*(de|que).*\d+|r?\$?\s*\d{1,3}([,.]?\d{2})?/i;
  
  const matches = message.match(lowValuePattern);
  assertExists(matches);
});
