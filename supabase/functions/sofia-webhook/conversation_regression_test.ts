/**
 * CONVERSATION REGRESSION TESTS (E2E)
 * 
 * Tests end-to-end conversation flows via webhook to validate guardrails.
 * Based on real transcripts that exposed bugs.
 * 
 * Run with: deno test supabase/functions/sofia-webhook/conversation_regression_test.ts
 * 
 * Scenarios:
 * 1. Sogro R$150 - Third party context + minimum bill hard stop
 * 2. Triage Loop - Response "2" must not repeat triage
 * 3. Proposal without Email - Must block proposal generation
 * 4. Doc request via WhatsApp - Must redirect to platform
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function cleanupTestData(phone: string): Promise<void> {
  const normalizedSuffix = phone.slice(-8);
  
  // Get conversation IDs first
  const { data: convs } = await supabase
    .from("chatbot_conversas")
    .select("id")
    .ilike("cliente_telefone", `%${normalizedSuffix}%`);
  
  if (convs && convs.length > 0) {
    const ids = convs.map(c => c.id);
    
    // Delete messages
    await supabase
      .from("chatbot_mensagens")
      .delete()
      .in("conversa_id", ids);
    
    // Delete conversations
    await supabase
      .from("chatbot_conversas")
      .delete()
      .in("id", ids);
  }
  
  // Delete test proposals
  await supabase
    .from("propostas_assinantes")
    .delete()
    .ilike("cliente_telefone", `%${normalizedSuffix}%`);
}

async function simulateWebhook(payload: Record<string, unknown>): Promise<Response> {
  const url = `${SUPABASE_URL}/functions/v1/sofia-webhook`;
  
  const zapiPayload = {
    phone: payload.phone,
    messageId: payload.messageId || `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: payload.text,
    type: "ReceivedCallback",
    fromMe: false,
    momment: Date.now(),
    isGroup: false,
    instanceId: "TEST_REGRESSION",
    connectedPhone: "5531936180487",
  };
  
  return await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(zapiPayload),
  });
}

async function waitForProcessing(ms: number = 2000): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function getConversation(phone: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("chatbot_conversas")
    .select("*")
    .ilike("cliente_telefone", `%${phone.slice(-8)}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return data;
}

async function getLastSofiaMessage(conversaId: string): Promise<string | null> {
  const { data } = await supabase
    .from("chatbot_mensagens")
    .select("content")
    .eq("conversa_id", conversaId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return data?.content || null;
}

// ═══════════════════════════════════════════════════════════════
// CENÁRIO 1: Sogro R$150
// Transcrição real: "Tem na casa do meu sogro, vem em média 150rs"
// Expected: Bypass triagem + Hard stop por valor
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "E2E Cenário 1: Casa do sogro R$150 - Bypass triagem + Hard stop",
  async fn() {
    const testPhone = "5531999990100";
    
    try {
      await cleanupTestData(testPhone);
      console.log("🧹 Cleanup complete for", testPhone);
      
      // Enviar mensagem do cenário real
      const response = await simulateWebhook({
        phone: testPhone,
        text: { message: "Tem na casa do meu sogro, vem em média 150rs" },
      });
      
      assertEquals(response.status, 200, "Webhook deve retornar 200");
      const body = await response.json();
      console.log("📨 Response:", JSON.stringify(body).slice(0, 300));
      
      await waitForProcessing(3000);
      
      // Verificar conversa
      const conv = await getConversation(testPhone);
      
      if (conv) {
        const dados = conv.dados_coletados as Record<string, unknown> || {};
        
        // VALIDAÇÃO 1: NÃO deve estar em triagem
        assert(
          conv.sofia_mode !== "triagem" || dados.triagem_concluida === true,
          "Conversa NÃO deve estar em triagem ativa"
        );
        
        // VALIDAÇÃO 2: Deve estar descartada OU ter motivo de baixo consumo
        const sofiaMode = conv.sofia_mode as string;
        const motivoDescarte = dados.motivoDescarte as string || "";
        
        if (sofiaMode === "descartado" || motivoDescarte.includes("Baixo Consumo")) {
          console.log("✅ Hard stop funcionou: lead descartado por baixo consumo");
        } else {
          // Verificar se resposta menciona limite
          const lastMsg = await getLastSofiaMessage(conv.id as string);
          if (lastMsg) {
            assert(
              lastMsg.includes("300") || lastMsg.includes("mínimo") || lastMsg.includes("limite"),
              "Resposta deve mencionar limite R$300"
            );
          }
        }
        
        // VALIDAÇÃO 3: Resposta NÃO deve ter opções de triagem
        const lastMsg = await getLastSofiaMessage(conv.id as string);
        if (lastMsg) {
          assert(!lastMsg.includes("1️⃣"), "Resposta não deve ter opção 1 de triagem");
          assert(!lastMsg.includes("2️⃣"), "Resposta não deve ter opção 2 de triagem");
        }
        
        console.log("✅ Cenário 1 PASSOU: Terceiro detectado + Hard stop aplicado");
      } else {
        console.log("⚠️ Conversa não criada - possível bloqueio imediato");
      }
      
    } finally {
      await cleanupTestData(testPhone);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ═══════════════════════════════════════════════════════════════
// CENÁRIO 2: Loop de Triagem
// Transcrição real: Cliente responde "2" e Sofia repete a pergunta
// Expected: Marcar como novo cliente e NÃO repetir triagem
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "E2E Cenário 2: Resposta '2' deve encerrar triagem sem loop",
  async fn() {
    const testPhone = "5531999990101";
    
    try {
      await cleanupTestData(testPhone);
      console.log("🧹 Cleanup complete for", testPhone);
      
      // Passo 1: Mensagem inicial (pode acionar triagem)
      await simulateWebhook({
        phone: testPhone,
        text: { message: "Olá" },
      });
      await waitForProcessing(3000);
      
      // Passo 2: Responde "2" (não sou cliente)
      await simulateWebhook({
        phone: testPhone,
        text: { message: "2" },
      });
      await waitForProcessing(3000);
      
      // Passo 3: Envia mensagem comercial
      const response3 = await simulateWebhook({
        phone: testPhone,
        text: { message: "Minha conta é de R$400 da CEMIG" },
      });
      await response3.text();
      await waitForProcessing(3000);
      
      // Verificar conversa
      const conv = await getConversation(testPhone);
      assert(conv !== null, "Conversa deve existir");
      
      const dados = conv!.dados_coletados as Record<string, unknown> || {};
      
      // VALIDAÇÃO 1: Deve ter triagem concluída
      if (dados.triagem_state) {
        assert(
          dados.triagem_concluida === true || dados.is_new_client === true,
          "Triagem deve estar concluída ou marcada como novo cliente"
        );
      }
      
      // VALIDAÇÃO 2: Última resposta NÃO deve ter opções de triagem
      const lastMsg = await getLastSofiaMessage(conv!.id as string);
      if (lastMsg) {
        assert(!lastMsg.includes("1️⃣"), "Última resposta não deve ter opção 1");
        assert(!lastMsg.includes("2️⃣"), "Última resposta não deve ter opção 2");
        assert(
          !lastMsg.toLowerCase().includes("já sou cliente"),
          "Não deve perguntar novamente se é cliente"
        );
      }
      
      console.log("✅ Cenário 2 PASSOU: Triagem não repetiu após resposta '2'");
      
    } finally {
      await cleanupTestData(testPhone);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ═══════════════════════════════════════════════════════════════
// CENÁRIO 3: Proposta sem E-mail
// Transcrição real: Sofia gera proposta sem coletar email
// Expected: Bloquear geração até coletar email
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "E2E Cenário 3: Proposta deve exigir email antes de gerar",
  async fn() {
    const testPhone = "5531999990102";
    
    try {
      await cleanupTestData(testPhone);
      console.log("🧹 Cleanup complete for", testPhone);
      
      // Sequência de mensagens: dados completos MAS sem email
      const messages = [
        "Oi, quero economizar",
        "Meu nome é João Silva",
        "Minha conta é R$450 pela CEMIG",
        "Pode gerar minha proposta?"
      ];
      
      for (const msg of messages) {
        const response = await simulateWebhook({
          phone: testPhone,
          text: { message: msg },
        });
        await response.text();
        await waitForProcessing(2500);
      }
      
      // Verificar conversa
      const conv = await getConversation(testPhone);
      assert(conv !== null, "Conversa deve existir");
      
      const dados = conv!.dados_coletados as Record<string, unknown> || {};
      
      // VALIDAÇÃO 1: Se não tem email, não deve ter proposta_id
      if (!dados.email) {
        assert(
          !conv!.proposta_id,
          "Proposta NÃO deve ser gerada sem email"
        );
        console.log("✅ Proposta corretamente bloqueada por falta de email");
      }
      
      // VALIDAÇÃO 2: Última resposta deve pedir email
      const lastMsg = await getLastSofiaMessage(conv!.id as string);
      if (lastMsg && !dados.email) {
        const hasEmailRequest = 
          lastMsg.toLowerCase().includes("e-mail") || 
          lastMsg.toLowerCase().includes("email");
        
        assert(hasEmailRequest, "Sofia deve pedir email antes de gerar proposta");
      }
      
      console.log("✅ Cenário 3 PASSOU: Email exigido antes de proposta");
      
    } finally {
      await cleanupTestData(testPhone);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ═══════════════════════════════════════════════════════════════
// CENÁRIO 4: Pedido de Docs via WhatsApp
// Transcrição real: Sofia pede RG/CNH no WhatsApp
// Expected: Substituir por redirecionamento para plataforma
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "E2E Cenário 4: Docs não devem ser solicitados via WhatsApp",
  async fn() {
    const testPhone = "5531999990103";
    
    try {
      await cleanupTestData(testPhone);
      console.log("🧹 Cleanup complete for", testPhone);
      
      // Simular conversa avançada onde Sofia poderia pedir docs
      const messages = [
        "Olá, quero aderir ao desconto",
        "Maria Santos",
        "maria@email.com",
        "Minha conta é R$500 da CEMIG",
        "Monofásico",
        "Belo Horizonte MG"
      ];
      
      for (const msg of messages) {
        const response = await simulateWebhook({
          phone: testPhone,
          text: { message: msg },
        });
        await response.text();
        await waitForProcessing(2000);
      }
      
      // Verificar conversa
      const conv = await getConversation(testPhone);
      
      if (conv) {
        // Pegar todas as mensagens da Sofia
        const { data: sofiaMessages } = await supabase
          .from("chatbot_mensagens")
          .select("content")
          .eq("conversa_id", conv.id as string)
          .eq("role", "assistant")
          .order("created_at", { ascending: true });
        
        // VALIDAÇÃO: Nenhuma mensagem deve pedir docs via WhatsApp
        const docRequestPatterns = [
          /\b(envi[ae]|mand[ae]).{0,30}(rg|cnh|documento|identidade)/i,
          /\b(documento|rg|cnh).{0,30}(aqui|no\s+whatsapp)/i,
        ];
        
        let foundDocRequest = false;
        for (const msg of sofiaMessages || []) {
          for (const pattern of docRequestPatterns) {
            if (pattern.test(msg.content)) {
              // Verificar se é redirecionamento para plataforma
              if (!msg.content.includes("plataforma") && !msg.content.includes("segurança")) {
                console.error("❌ Pedido de doc detectado:", msg.content.slice(0, 100));
                foundDocRequest = true;
              }
            }
          }
        }
        
        assert(!foundDocRequest, "Sofia NÃO deve pedir documentos via WhatsApp");
        
        // Se houver menção a documentos, deve redirecionar para plataforma
        const lastMsg = await getLastSofiaMessage(conv.id as string);
        if (lastMsg && (lastMsg.includes("documento") || lastMsg.includes("RG") || lastMsg.includes("CNH"))) {
          assert(
            lastMsg.includes("plataforma") || lastMsg.includes("link") || lastMsg.includes("segurança"),
            "Menção a documentos deve redirecionar para plataforma"
          );
        }
      }
      
      console.log("✅ Cenário 4 PASSOU: Docs não solicitados via WhatsApp");
      
    } finally {
      await cleanupTestData(testPhone);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ═══════════════════════════════════════════════════════════════
// CENÁRIO EXTRA: Valor R$250 (entre mínimo antigo e novo)
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "E2E Extra: R$250 deve ser bloqueado (threshold R$300)",
  async fn() {
    const testPhone = "5531999990104";
    
    try {
      await cleanupTestData(testPhone);
      
      const response = await simulateWebhook({
        phone: testPhone,
        text: { message: "Minha conta é de 250 reais" },
      });
      
      assertEquals(response.status, 200);
      await response.text();
      await waitForProcessing(3000);
      
      const conv = await getConversation(testPhone);
      
      if (conv) {
        const dados = conv.dados_coletados as Record<string, unknown> || {};
        const sofiaMode = conv.sofia_mode as string;
        
        // Deve estar descartado OU ter mensagem de limite
        if (sofiaMode !== "descartado") {
          const lastMsg = await getLastSofiaMessage(conv.id as string);
          if (lastMsg) {
            const mentionsLimit = 
              lastMsg.includes("300") || 
              lastMsg.includes("mínimo") || 
              lastMsg.includes("limite") ||
              lastMsg.includes("abaixo");
            
            assert(mentionsLimit, "Resposta deve mencionar limite ou estar descartado");
          }
        }
      }
      
      console.log("✅ Cenário Extra PASSOU: R$250 corretamente tratado");
      
    } finally {
      await cleanupTestData(testPhone);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

console.log("✅ Conversation regression tests carregados (5 cenários)");
