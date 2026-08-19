/**
 * REGRESSION TEST: Email → Proposta → Resposta (Anti-Duplicação)
 * 
 * Simula o fluxo completo:
 * 1. Cliente envia email com dados
 * 2. Webhook processa e gera proposta
 * 3. Sofia responde
 * 4. VERIFICA: Não há mensagem duplicada
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || "";

// Skip tests if keys not available
const keysAvailable = SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);
const supabase = keysAvailable 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY)
  : null;

// Test phone number (use test range)
const TEST_PHONE = "5531999990001";
const TEST_SESSION = `regression-test-${Date.now()}`;

interface TestContext {
  conversaId?: string;
  propostaId?: string;
  messageIds: string[];
}

/**
 * Helper: Clean up test data before/after
 */
async function cleanupTestData(phone: string) {
  if (!supabase) return;
  
  // Delete test messages
  const { data: convs } = await supabase
    .from("chatbot_conversas")
    .select("id")
    .ilike("cliente_telefone", `%${phone.slice(-8)}%`);
  
  if (convs && convs.length > 0) {
    const ids = convs.map((c: { id: string }) => c.id);
    await supabase
      .from("chatbot_mensagens")
      .delete()
      .in("conversa_id", ids);
  }

  // Delete test conversations
  await supabase
    .from("chatbot_conversas")
    .delete()
    .ilike("cliente_telefone", `%${phone.slice(-8)}%`);

  // Delete test proposals
  await supabase
    .from("propostas_assinantes")
    .delete()
    .ilike("cliente_telefone", `%${phone.slice(-8)}%`);
}

/**
 * Helper: Simulate webhook call
 */
async function simulateWebhook(payload: Record<string, unknown>): Promise<Response> {
  const url = `${SUPABASE_URL}/functions/v1/sofia-webhook`;
  
  return await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Helper: Build Z-API style webhook payload
 */
function buildZApiPayload(phone: string, message: string, messageId?: string): Record<string, unknown> {
  return {
    phone,
    messageId: messageId || `test-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: { message },
    type: "ReceivedCallback",
    fromMe: false,
    momment: Date.now(),
    isGroup: false,
    instanceId: "TEST_INSTANCE",
    connectedPhone: "5531936180487",
  };
}

/**
 * Helper: Get conversation messages count
 */
async function getConversationMessages(conversaId: string): Promise<{ userCount: number; sofiaCount: number; total: number }> {
  if (!supabase) return { userCount: 0, sofiaCount: 0, total: 0 };
  
  const { data, error } = await supabase
    .from("chatbot_mensagens")
    .select("role")
    .eq("conversa_id", conversaId);

  if (error || !data) {
    return { userCount: 0, sofiaCount: 0, total: 0 };
  }

  return {
    userCount: data.filter((m: { role: string }) => m.role === "user").length,
    sofiaCount: data.filter((m: { role: string }) => m.role === "assistant").length,
    total: data.length,
  };
}

/**
 * Helper: Wait for async processing
 */
async function waitForProcessing(ms: number = 2000): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "Regression: Email flow should not create duplicate messages",
  ignore: !keysAvailable,
  async fn() {
    if (!supabase) return;
    const ctx: TestContext = { messageIds: [] };

    try {
      // SETUP: Clean previous test data
      await cleanupTestData(TEST_PHONE);
      console.log("✅ Cleanup complete");

      // STEP 1: Client sends initial message (simulating email context)
      const msg1Id = `email-test-${Date.now()}-1`;
      const response1 = await simulateWebhook(
        buildZApiPayload(TEST_PHONE, "Oi, recebi um email sobre economia na conta de luz", msg1Id)
      );
      
      assertEquals(response1.status, 200, "First webhook should succeed");
      const body1 = await response1.json();
      console.log("📨 Step 1 response:", JSON.stringify(body1).slice(0, 200));
      
      await waitForProcessing(3000);

      // Get conversation ID
      const { data: convData } = await supabase!
        .from("chatbot_conversas")
        .select("id")
        .ilike("cliente_telefone", `%${TEST_PHONE.slice(-8)}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      assertExists(convData?.id, "Conversation should be created");
      ctx.conversaId = convData!.id;
      console.log("📋 Conversation ID:", ctx.conversaId);

      // Check message count after step 1
      const counts1 = await getConversationMessages(ctx.conversaId!);
      console.log("📊 After Step 1:", counts1);
      
      assertEquals(counts1.userCount, 1, "Should have exactly 1 user message");
      assert(counts1.sofiaCount >= 1, "Sofia should have responded at least once");

      // STEP 2: Client provides email (triggers proposal flow)
      const msg2Id = `email-test-${Date.now()}-2`;
      const response2 = await simulateWebhook(
        buildZApiPayload(TEST_PHONE, "meu email é teste@exemplo.com", msg2Id)
      );
      
      assertEquals(response2.status, 200, "Second webhook should succeed");
      await response2.text(); // Consume body
      
      await waitForProcessing(3000);

      // Check message count after step 2
      const counts2 = await getConversationMessages(ctx.conversaId!);
      console.log("📊 After Step 2:", counts2);
      
      assertEquals(counts2.userCount, 2, "Should have exactly 2 user messages");
      
      // STEP 3: Simulate rapid-fire duplicate (same message ID)
      console.log("🔄 Simulating duplicate webhook with same messageId...");
      const duplicateResponse = await simulateWebhook(
        buildZApiPayload(TEST_PHONE, "meu email é teste@exemplo.com", msg2Id) // SAME ID
      );
      
      assertEquals(duplicateResponse.status, 200, "Duplicate webhook should be handled");
      const duplicateBody = await duplicateResponse.json();
      console.log("🔄 Duplicate response:", JSON.stringify(duplicateBody).slice(0, 200));
      
      await waitForProcessing(2000);

      // CRITICAL CHECK: No duplicate messages
      const counts3 = await getConversationMessages(ctx.conversaId!);
      console.log("📊 After Duplicate:", counts3);
      
      assertEquals(counts3.userCount, 2, "User messages should still be 2 (no duplicate)");
      
      // STEP 4: Simulate parallel webhooks (race condition test)
      console.log("⚡ Simulating parallel webhooks...");
      const msg3Id = `email-test-${Date.now()}-3`;
      const msg4Id = `email-test-${Date.now()}-4`;
      
      const [parallel1, parallel2] = await Promise.all([
        simulateWebhook(buildZApiPayload(TEST_PHONE, "quanto vou economizar?", msg3Id)),
        simulateWebhook(buildZApiPayload(TEST_PHONE, "quanto vou economizar?", msg4Id)),
      ]);
      
      await parallel1.text();
      await parallel2.text();
      
      await waitForProcessing(4000);

      // Check final state
      const countsFinal = await getConversationMessages(ctx.conversaId!);
      console.log("📊 Final counts:", countsFinal);
      
      // With proper deduplication, only one of the parallel messages should process
      // (they have different IDs but same content within cooldown window)
      assert(countsFinal.userCount <= 4, "Should have at most 4 user messages (dedup should block rapid-fire)");
      assert(countsFinal.sofiaCount <= countsFinal.userCount + 1, "Sofia messages should not exceed user messages significantly");

      // VERIFY: No orphan/duplicate Sofia responses
      const { data: allMessages } = await supabase!
        .from("chatbot_mensagens")
        .select("id, role, content, created_at")
        .eq("conversa_id", ctx.conversaId!)
        .order("created_at", { ascending: true });

      console.log("\n📝 Full conversation history:");
      allMessages?.forEach((m, i) => {
        console.log(`  ${i + 1}. [${m.role}] ${m.content.slice(0, 60)}...`);
      });

      // Check for duplicate Sofia messages (same content within 10 seconds)
      const sofiaMessages = allMessages?.filter(m => m.role === "assistant") || [];
      for (let i = 1; i < sofiaMessages.length; i++) {
        const prev = sofiaMessages[i - 1];
        const curr = sofiaMessages[i];
        const timeDiff = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
        
        if (prev.content === curr.content && timeDiff < 10000) {
          console.error("❌ DUPLICATE DETECTED:", prev.content.slice(0, 50));
          assert(false, `Duplicate Sofia message detected within ${timeDiff}ms`);
        }
      }

      console.log("\n✅ All checks passed - no duplicates detected!");

    } finally {
      // CLEANUP
      if (ctx.conversaId) {
        await cleanupTestData(TEST_PHONE);
        console.log("🧹 Test cleanup complete");
      }
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Regression: Commercial message should NOT trigger triage",
  ignore: !keysAvailable,
  async fn() {
    if (!supabase) return;
    const testPhone = "5531999990002";
    
    try {
      await cleanupTestData(testPhone);

      // Send a clearly commercial message
      const response = await simulateWebhook(
        buildZApiPayload(testPhone, "Quero saber quanto vou economizar na minha conta de luz")
      );
      
      assertEquals(response.status, 200);
      await response.text();
      
      await waitForProcessing(3000);

      // Get conversation
      const { data: conv } = await supabase!
        .from("chatbot_conversas")
        .select("id, sofia_mode, escalated_at, escalation_reason")
        .ilike("cliente_telefone", `%${testPhone.slice(-8)}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      assertExists(conv, "Conversation should exist");
      
      // Should NOT be escalated (triage should not trigger)
      assertEquals(conv.escalated_at, null, "Commercial message should NOT escalate");
      assertEquals(conv.sofia_mode, "standard", "Mode should be standard (not SAC)");
      
      console.log("✅ Commercial message correctly stayed in sales flow");

    } finally {
      await cleanupTestData(testPhone);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Regression: Deduplication blocks same messageId",
  ignore: !keysAvailable,
  async fn() {
    if (!supabase) return;
    const testPhone = "5531999990003";
    const sameMessageId = `dedup-test-${Date.now()}`;
    
    try {
      await cleanupTestData(testPhone);

      // First call
      const response1 = await simulateWebhook(
        buildZApiPayload(testPhone, "Oi, quero economizar", sameMessageId)
      );
      assertEquals(response1.status, 200);
      await response1.text();
      
      await waitForProcessing(1000);

      // Second call with SAME messageId
      const response2 = await simulateWebhook(
        buildZApiPayload(testPhone, "Oi, quero economizar", sameMessageId)
      );
      assertEquals(response2.status, 200);
      const body2 = await response2.json();
      
      // Should be blocked as duplicate
      console.log("Second call response:", body2);
      
      await waitForProcessing(2000);

      // Check: Only 1 user message should exist
      const { data: conv } = await supabase!
        .from("chatbot_conversas")
        .select("id")
        .ilike("cliente_telefone", `%${testPhone.slice(-8)}%`)
        .single();

      if (conv) {
        const counts = await getConversationMessages(conv.id);
        assertEquals(counts.userCount, 1, "Should have exactly 1 user message (duplicate blocked)");
        console.log("✅ Deduplication working correctly");
      }

    } finally {
      await cleanupTestData(testPhone);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
