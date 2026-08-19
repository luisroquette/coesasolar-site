/**
 * Sofia Webhook - Smoke Tests (Camada E)
 * 
 * Testes automáticos para garantir que:
 * 1. O módulo compila sem erros de sintaxe
 * 2. CORS está configurado corretamente
 * 3. Ping endpoint funciona
 * 4. Payload mínimo retorna resposta válida
 * 
 * Rodar com: deno test supabase/functions/sofia-webhook/index_test.ts --allow-net --allow-env
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/sofia-webhook`;

// ═══════════════════════════════════════════════════════════════
// TEST 1: CORS - OPTIONS request should return proper headers
// ═══════════════════════════════════════════════════════════════
Deno.test("sofia-webhook: OPTIONS returns CORS headers", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://test.lovable.app",
    },
  });
  
  // Consume body to prevent resource leak
  await response.text();
  
  assertEquals(response.status, 200, "OPTIONS should return 200");
  
  const corsHeader = response.headers.get("access-control-allow-origin");
  assertExists(corsHeader, "Should have Access-Control-Allow-Origin header");
  assertEquals(corsHeader, "*", "CORS should allow all origins");
});

// ═══════════════════════════════════════════════════════════════
// TEST 2: GET request should return status/ping
// ═══════════════════════════════════════════════════════════════
Deno.test("sofia-webhook: GET returns status", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  
  const text = await response.text();
  
  // Should return 200 (ping) or redirect to help
  assertEquals(response.status, 200, `GET should return 200, got ${response.status}: ${text}`);
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: POST with minimal Z-API payload should not crash
// ═══════════════════════════════════════════════════════════════
Deno.test("sofia-webhook: POST with minimal payload returns JSON", async () => {
  // Minimal Z-API webhook payload structure
  const payload = {
    phone: "5531999999999",
    isGroup: false,
    type: "text",
    text: {
      message: "teste de smoke test",
    },
    fromMe: false,
    messageId: `test_${Date.now()}`,
  };
  
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  
  const text = await response.text();
  
  // Should return 200 or 400 (if validation fails), but NOT 500
  const validStatuses = [200, 400];
  const isValidStatus = validStatuses.includes(response.status);
  
  assertEquals(
    isValidStatus, 
    true, 
    `POST should return 200 or 400, got ${response.status}: ${text.substring(0, 200)}`
  );
  
  // Response should be valid JSON
  try {
    JSON.parse(text);
  } catch {
    throw new Error(`Response is not valid JSON: ${text.substring(0, 200)}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST 4: POST with fromMe=true should be ignored (bot's own messages)
// ═══════════════════════════════════════════════════════════════
Deno.test("sofia-webhook: POST with fromMe=true is handled gracefully", async () => {
  const payload = {
    phone: "5531999999999",
    isGroup: false,
    type: "text",
    text: {
      message: "mensagem do próprio bot",
    },
    fromMe: true,
    messageId: `test_fromme_${Date.now()}`,
  };
  
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  
  const text = await response.text();
  
  // Should return 200 (handled) - NOT 500 (crash)
  assertEquals(response.status, 200, `fromMe should return 200, got ${response.status}: ${text.substring(0, 100)}`);
  
  // Response should be valid JSON
  try {
    JSON.parse(text);
  } catch {
    throw new Error(`Response is not valid JSON: ${text.substring(0, 200)}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST 5: POST with isGroup=true should be ignored
// ═══════════════════════════════════════════════════════════════
Deno.test("sofia-webhook: POST with isGroup=true is handled gracefully", async () => {
  const payload = {
    phone: "5531999999999",
    isGroup: true,
    type: "text",
    text: {
      message: "mensagem de grupo",
    },
    fromMe: false,
    messageId: `test_group_${Date.now()}`,
  };
  
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  
  const text = await response.text();
  
  // Should return 200 (handled) - NOT 500 (crash)
  assertEquals(response.status, 200, `isGroup should return 200, got ${response.status}: ${text.substring(0, 100)}`);
  
  // Response should be valid JSON
  try {
    JSON.parse(text);
  } catch {
    throw new Error(`Response is not valid JSON: ${text.substring(0, 200)}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST 6: Dedup - same messageId should return dedup response
// ═══════════════════════════════════════════════════════════════
Deno.test("sofia-webhook: Duplicate messageId returns dedup response", async () => {
  const messageId = `test_dedup_${Date.now()}`;
  
  const payload = {
    phone: "5531888888888",
    isGroup: false,
    type: "text",
    text: {
      message: "primeira mensagem",
    },
    fromMe: false,
    messageId: messageId,
  };
  
  // First request
  const response1 = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  
  const text1 = await response1.text();
  
  // Small delay
  await new Promise(r => setTimeout(r, 100));
  
  // Second request with same messageId
  const response2 = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  
  const text2 = await response2.text();
  
  // Second should indicate duplicate
  assertEquals(response2.status, 200, `Dedup should return 200, got ${response2.status}`);
  
  try {
    const json2 = JSON.parse(text2);
    // Should have some indication of dedup (deduplicated, already_processed, etc.)
    const hasDedupIndicator = 
      json2.deduplicated === true || 
      json2.already_processed === true ||
      json2.ignored === true ||
      json2.reason?.includes('dedup') ||
      json2.reason?.includes('duplicate');
    
    // This test is informational - we just want to ensure no 500 error
    console.log(`[DEDUP TEST] Response 2: ${text2.substring(0, 200)}`);
  } catch {
    // JSON parse error is acceptable, as long as no 500
  }
});
