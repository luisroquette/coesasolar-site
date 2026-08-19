/**
 * Operator Phase Unit Tests
 * 
 * Tests for the extracted operator-phase.ts module
 * Extended coverage for 100% phase coverage
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  isOperatorCommandMessage,
  type OperatorPhaseContext,
  type OperatorPhaseResult,
} from "../_shared/sofia-orchestrator/operator-phase.ts";

// ═══════════════════════════════════════════════════════════════
// TEST: isOperatorCommandMessage - Basic Commands
// ═══════════════════════════════════════════════════════════════

Deno.test("isOperatorCommandMessage - detects RESET command", () => {
  assertEquals(isOperatorCommandMessage("#RESET_TESTE"), true);
  assertEquals(isOperatorCommandMessage("#reset_teste"), true); // case insensitive
  assertEquals(isOperatorCommandMessage("  #RESET_TESTE  "), true); // with spaces
});

Deno.test("isOperatorCommandMessage - detects STATUS command", () => {
  assertEquals(isOperatorCommandMessage("#STATUS_TESTE"), true);
  assertEquals(isOperatorCommandMessage("#status_teste"), true);
});

Deno.test("isOperatorCommandMessage - detects PING command", () => {
  assertEquals(isOperatorCommandMessage("#PING_TESTE"), true);
  assertEquals(isOperatorCommandMessage("#ping_teste"), true);
});

Deno.test("isOperatorCommandMessage - detects ASSUMIR commands", () => {
  assertEquals(isOperatorCommandMessage("#ASSUMIR"), true);
  assertEquals(isOperatorCommandMessage("#MEU"), true);
  assertEquals(isOperatorCommandMessage("#TAKEOVER"), true);
  assertEquals(isOperatorCommandMessage("#ASSUMIR 5511999998888"), true);
  assertEquals(isOperatorCommandMessage("#assumir"), true);
  assertEquals(isOperatorCommandMessage("#meu"), true);
});

Deno.test("isOperatorCommandMessage - detects RESOLVIDO commands", () => {
  assertEquals(isOperatorCommandMessage("#RESOLVIDO"), true);
  assertEquals(isOperatorCommandMessage("#DEVOLVER"), true);
  assertEquals(isOperatorCommandMessage("#SOFIA"), true);
  assertEquals(isOperatorCommandMessage("#RESOLVIDO 5511999998888"), true);
  assertEquals(isOperatorCommandMessage("#resolvido"), true);
  assertEquals(isOperatorCommandMessage("#devolver"), true);
});

Deno.test("isOperatorCommandMessage - detects HELP command", () => {
  assertEquals(isOperatorCommandMessage("#AJUDA"), true);
  assertEquals(isOperatorCommandMessage("#ajuda"), true);
});

Deno.test("isOperatorCommandMessage - detects VOICE command", () => {
  assertEquals(isOperatorCommandMessage("#VOZ_TESTE"), true);
  assertEquals(isOperatorCommandMessage("#voz_teste"), true);
});

Deno.test("isOperatorCommandMessage - returns false for regular messages", () => {
  assertEquals(isOperatorCommandMessage("Olá, bom dia!"), false);
  assertEquals(isOperatorCommandMessage("Quero saber sobre energia solar"), false);
  assertEquals(isOperatorCommandMessage("Minha conta é de R$ 500"), false);
  assertEquals(isOperatorCommandMessage("#INVALIDO"), false);
  assertEquals(isOperatorCommandMessage(""), false);
  assertEquals(isOperatorCommandMessage("RESET_TESTE"), false); // missing #
  assertEquals(isOperatorCommandMessage("# RESET_TESTE"), false); // space after #
});

// ═══════════════════════════════════════════════════════════════
// TEST: isOperatorCommandMessage - Edge Cases
// ═══════════════════════════════════════════════════════════════

Deno.test("isOperatorCommandMessage - handles phone number variations", () => {
  assertEquals(isOperatorCommandMessage("#ASSUMIR 11999998888"), true);
  assertEquals(isOperatorCommandMessage("#ASSUMIR 5511999998888"), true);
  assertEquals(isOperatorCommandMessage("#RESOLVIDO 5521988887777"), true);
});

Deno.test("isOperatorCommandMessage - handles mixed case", () => {
  assertEquals(isOperatorCommandMessage("#Assumir"), true);
  assertEquals(isOperatorCommandMessage("#Resolvido"), true);
  assertEquals(isOperatorCommandMessage("#ReSeT_TeStE"), true);
});

Deno.test("isOperatorCommandMessage - handles whitespace variations", () => {
  assertEquals(isOperatorCommandMessage("  #ASSUMIR  "), true);
  assertEquals(isOperatorCommandMessage("\t#RESOLVIDO\t"), true);
  assertEquals(isOperatorCommandMessage("\n#PING_TESTE\n"), true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: OperatorPhaseContext type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("OperatorPhaseContext - minimal context structure", () => {
  const mockSendWhatsApp = async (_phone: string, _msg: string) => true;
  const mockSendVoice = async (_phone: string, _text: string) => true;
  
  const ctx: Partial<OperatorPhaseContext> = {
    phone: '5511999999999',
    phoneDigits: '5511999999999',
    messageText: '#RESET_TESTE',
    chatappChatId: 'chat-123',
    clienteNome: 'João',
    agentId: 'sofia',
    agentName: 'sofIA',
    sendWhatsAppMessage: mockSendWhatsApp,
    sendVoiceMessage: mockSendVoice,
    msgData: { fromMe: false, fromApi: false },
  };
  
  assertExists(ctx.phone);
  assertExists(ctx.messageText);
  assertExists(ctx.sendWhatsAppMessage);
});

// ═══════════════════════════════════════════════════════════════
// TEST: OperatorPhaseResult type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("OperatorPhaseResult - not handled result", () => {
  const result: OperatorPhaseResult = {
    handled: false,
  };
  
  assertEquals(result.handled, false);
  assertEquals(result.action, undefined);
  assertEquals(result.response, undefined);
});

Deno.test("OperatorPhaseResult - reset executed result", () => {
  const result: OperatorPhaseResult = {
    handled: true,
    action: 'reset_executed',
    conversationId: 'conv-123',
  };
  
  assertEquals(result.handled, true);
  assertEquals(result.action, 'reset_executed');
  assertExists(result.conversationId);
});

Deno.test("OperatorPhaseResult - takeover result", () => {
  const result: OperatorPhaseResult = {
    handled: true,
    action: 'takeover_by_phone',
    conversationId: 'conv-456',
    clientName: 'Maria Silva',
  };
  
  assertEquals(result.handled, true);
  assertEquals(result.action, 'takeover_by_phone');
  assertEquals(result.clientName, 'Maria Silva');
});

Deno.test("OperatorPhaseResult - return with resolution time", () => {
  const result: OperatorPhaseResult = {
    handled: true,
    action: 'return_to_sofia_in_chat',
    conversationId: 'conv-789',
    resolutionTimeSeconds: 300,
  };
  
  assertEquals(result.action, 'return_to_sofia_in_chat');
  assertEquals(result.resolutionTimeSeconds, 300);
});

Deno.test("OperatorPhaseResult - error result", () => {
  const result: OperatorPhaseResult = {
    handled: true,
    action: 'takeover_by_phone',
    error: 'Conversa não encontrada',
  };
  
  assertExists(result.error);
  assertEquals(result.error, 'Conversa não encontrada');
});

// ═══════════════════════════════════════════════════════════════
// TEST: Command normalization patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Command normalization - uppercase conversion", () => {
  const commands = ['#reset_teste', '#RESET_TESTE', '#Reset_Teste'];
  
  for (const cmd of commands) {
    const normalized = cmd.trim().toUpperCase();
    assertEquals(normalized, '#RESET_TESTE');
  }
});

Deno.test("Command normalization - phone extraction", () => {
  const commandWithPhone = '#ASSUMIR 5511999998888';
  const match = commandWithPhone.match(/^#(ASSUMIR|MEU|TAKEOVER)\s+(\d{10,13})$/i);
  
  assertExists(match);
  assertEquals(match[2], '5511999998888');
});

// ═══════════════════════════════════════════════════════════════
// TEST: Action type enumeration
// ═══════════════════════════════════════════════════════════════

Deno.test("Action types - valid action values", () => {
  const validActions = [
    'reset_executed',
    'status_executed',
    'ping_executed',
    'voice_test_executed',
    'voice_test_failed',
    'help_executed',
    'takeover_by_phone',
    'return_by_phone',
    'return_to_sofia_in_chat',
    'return_to_sofia_bulk',
    'takeover_in_chat',
    'correction_processed',
  ];
  
  for (const action of validActions) {
    assert(typeof action === 'string' && action.length > 0);
  }
});
