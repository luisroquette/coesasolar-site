/**
 * Regression Test: Delay Intent Blockers
 * 
 * Ensures that messages containing complaints about spam/repetition
 * are NOT classified as "delay intent" (which would trigger "Perfeito, fico no aguardo!")
 * 
 * Issue: ClawdBot conversation - "Pq vc me mandou 3 mensagens repetidas em uma janela de 5 minutos?"
 * Expected: NOT delay intent (it's a complaint)
 * Actual (before fix): Detected as delay intent due to "5 minutos"
 */

import { assertEquals, assertFalse } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { detectDelayIntent, detectMediaMention } from "../../media-message-processor.ts";

Deno.test("Delay Intent Blockers - Spam complaint should NOT trigger delay intent", () => {
  const spamComplaint = "Olá Sofia. Pq vc me mandou 3 mensagens repetidas em uma janela de 5 minutos?";
  const result = detectDelayIntent(spamComplaint);
  
  assertFalse(result, "Spam complaint should NOT be classified as delay intent");
});

Deno.test("Delay Intent Blockers - Question with 'minutos' should NOT trigger delay intent", () => {
  const question = "Por que você demorou 10 minutos para responder?";
  const result = detectDelayIntent(question);
  
  assertFalse(result, "Question about time should NOT be classified as delay intent");
});

Deno.test("Delay Intent Blockers - 'Por que mandou' should NOT trigger delay intent", () => {
  const complaint = "Por que mandou essa mensagem duas vezes?";
  const result = detectDelayIntent(complaint);
  
  assertFalse(result, "Complaint about duplicate messages should NOT be delay intent");
});

Deno.test("Delay Intent Blockers - 'pq' abbreviation should block", () => {
  const complaint = "pq vc me mandou 2 mensagens iguais?";
  const result = detectDelayIntent(complaint);
  
  assertFalse(result, "'pq' abbreviation should block delay intent detection");
});

Deno.test("Delay Intent Blockers - Error mention should block", () => {
  const errorMention = "Teve algum erro? Recebi a mesma mensagem 3 vezes em 5 minutos";
  const result = detectDelayIntent(errorMention);
  
  assertFalse(result, "Error mention should block delay intent detection");
});

Deno.test("Delay Intent Blockers - Question mark should block", () => {
  const questionWithMinutes = "Você vai demorar quantos minutos?";
  const result = detectDelayIntent(questionWithMinutes);
  
  assertFalse(result, "Question mark should block delay intent detection");
});

Deno.test("Delay Intent - Legitimate delay intent should still work", () => {
  const legitimateDelay = "espera um pouco que já vou mandar";
  const result = detectDelayIntent(legitimateDelay);
  
  assertEquals(result, true, "Legitimate delay intent should be detected");
});

Deno.test("Delay Intent - 'vou enviar em alguns minutos' should work", () => {
  const legitimateDelay = "vou enviar daqui a pouco";
  const result = detectDelayIntent(legitimateDelay);
  
  assertEquals(result, true, "Legitimate 'vou enviar' should be detected as delay intent");
});

Deno.test("Delay Intent - Long message should NOT trigger (>100 chars)", () => {
  const longMessage = "Olha, eu estou pensando muito sobre essa proposta e preciso de mais alguns minutos para decidir, mas gostaria de saber mais detalhes sobre como funciona o desconto e se realmente vale a pena para minha residência.";
  const result = detectDelayIntent(longMessage);
  
  assertFalse(result, "Long messages should not trigger delay intent");
});

Deno.test("Media Mention - 'mandei' should detect media mention", () => {
  const mediaMention = "mandei a foto da conta";
  const result = detectMediaMention(mediaMention);
  
  assertEquals(result, true, "'mandei' should detect media mention");
});

// ═══════════════════════════════════════════════════════════════
// NEW: Email/Data Context Blockers
// ═══════════════════════════════════════════════════════════════

Deno.test("Delay Intent Blockers - Email should NOT trigger delay intent", () => {
  const emailMessage = "galhadberserk@gmail.com esse";
  const result = detectDelayIntent(emailMessage);
  
  assertFalse(result, "Email should NOT be classified as delay intent");
});

Deno.test("Delay Intent Blockers - Money value should NOT trigger delay intent", () => {
  const moneyMessage = "r$ 300 por mês";
  const result = detectDelayIntent(moneyMessage);
  
  assertFalse(result, "Money value should NOT be classified as delay intent");
});

Deno.test("Delay Intent Blockers - Proposta context should NOT trigger delay intent", () => {
  const propostaMessage = "mais tarde vou ver a proposta";
  const result = detectDelayIntent(propostaMessage);
  
  assertFalse(result, "Proposta context should NOT be classified as delay intent");
});

Deno.test("Delay Intent - 'peraí que vou mandar' should work", () => {
  const legitimateDelay = "peraí que vou mandar";
  const result = detectDelayIntent(legitimateDelay);
  
  assertEquals(result, true, "'peraí que vou mandar' should be detected as delay intent");
});
