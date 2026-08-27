import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const VERSION = "retell-sofia-webhook@2025-02-05.1200";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ FAST-PATH PATTERNS ============
const PATTERNS = {
  greeting: /^(oi|olá|ola|bom dia|boa tarde|boa noite|alô|alo|hey|ei|eai|e ai)[\s,!?.]*$/i,
  who_are_you: /(com quem (eu )?(falo|estou falando)|quem (é|eh|e) voc[êe]|qual (é )?seu nome|quem t[áa] falando|quem est[áa] falando|quem fala|você é quem|voce e quem)/i,
  ask_price: /(quanto custa|qual o (valor|preço|custo)|tem taxa|pago algo|é (de graça|gratis|gratuito))/i,
  ask_how_works: /(como funciona|como é|me explica|pode explicar|qual o processo)/i,
  want_proposal: /(quero (proposta|simula|saber)|me (manda|envia)|fazer (proposta|simula))/i,
  already_customer: /(já sou cliente|sou (cliente|assinante)|já (tenho|faço parte))/i,
  not_interested: /(não (tenho interesse|quero|preciso)|sem interesse|obrigad[oa] mas)/i,
  ask_discount: /(qual o desconto|quanto economizo|quanto de desconto|percentual)/i,
  confirmation: /^(sim|isso|ok|tá|ta|certo|pode ser|isso mesmo|exato|correto|uhum)[\s,!?.]*$/i,
  noise: /^(hm+|ah+|é+|né|então|tipo|sabe)[\s,!?.]*$/i,
};

// ============ FAST-PATH RESPONSES ============
const FAST_RESPONSES: Record<string, string> = {
  greeting: "Oi! Aqui é a Sofia da COESA Energia. Tô te ouvindo! Quer saber como economizar até trinta por cento na conta de luz?",
  who_are_you: "Eu sou a Sofia, assistente virtual da COESA Energia. Posso te ajudar a economizar na conta de luz com energia solar por assinatura. Qual é a sua distribuidora de energia?",
  ask_price: "Não tem custo de adesão! Você só paga a conta com o desconto aplicado. Quer que eu calcule quanto você economizaria por mês?",
  ask_how_works: "É bem simples: a COESA gera energia solar em fazendas solares e injeta na rede. Você recebe o crédito direto na sua conta de luz, sem precisar instalar nada na sua casa. Quer saber o desconto pro seu caso?",
  want_proposal: "Ótimo! Pra gerar sua proposta personalizada, preciso só de algumas informações. Qual é o seu nome completo?",
  already_customer: "Que bom que você já é cliente COESA! Vou te transferir pro nosso suporte de clientes que pode te ajudar melhor. Um momento!",
  not_interested: "Tudo bem, sem problemas! Se mudar de ideia ou quiser saber mais no futuro, a COESA tá sempre aqui. Tenha um ótimo dia!",
  ask_discount: "O desconto pode chegar até trinta por cento, dependendo da sua distribuidora e consumo. Pra eu te dar o valor exato, qual é o valor médio da sua conta de luz?",
  confirmation: "Perfeito! E qual seria o próximo dado?",
  noise: "", // Return empty to let Retell handle silence
};

// ============ SYSTEM PROMPT FOR LLM ============
const SYSTEM_PROMPT = `Você é a sofIA, assistente virtual de vendas da COESA Energia.

## IDENTIDADE
- Nome: sofIA (sempre minúsculo)
- Empresa: COESA Energia
- Função: Qualificar leads e coletar dados para proposta de energia solar por assinatura

## TOM DE VOZ
- Profissional mas acolhedora
- Objetiva e clara
- Empática e paciente
- NUNCA use termos técnicos demais

## PRODUTO
- Energia solar por assinatura (GD - Geração Distribuída)
- Desconto de até 30% na conta de luz
- SEM instalação na casa do cliente
- SEM custo de adesão
- Funciona com créditos na conta de luz

## DADOS A COLETAR (em ordem)
1. Distribuidora de energia (CEMIG, Energisa, CPFL, etc.)
2. Valor médio da conta de luz (mínimo R$300)
3. E-mail para envio da proposta
4. Nome completo
5. CPF (para contrato)

## REGRAS
- Se valor < R$300: explique que o mínimo é R$300 para compensar
- NUNCA invente dados ou prometa coisas não confirmadas
- Se não souber algo: diga que vai verificar
- Mantenha respostas CURTAS (máx 2-3 frases) - é uma ligação!

## FORMATO
Responda APENAS com o texto que será falado. Sem formatação, sem emojis, sem markdown.`;

// ============ NORMALIZE TRANSCRIPT ============
interface TranscriptMessage {
  role: string;
  content: string;
}

function normalizeTranscript(body: Record<string, unknown>): TranscriptMessage[] {
  const call = body.call as Record<string, unknown> | undefined;
  
  // Priority 1: transcript_object (structured array from Retell)
  const transcriptObject = call?.transcript_object;
  if (Array.isArray(transcriptObject)) {
    return transcriptObject.map((item: Record<string, unknown>) => ({
      role: String(item.role || 'user'),
      content: String(item.content || item.text || item.message || ''),
    })).filter(m => m.content.trim().length > 0);
  }
  
  // Priority 2: transcript as array
  const transcript = call?.transcript;
  if (Array.isArray(transcript)) {
    return transcript.map((item: Record<string, unknown>) => ({
      role: String(item.role || 'user'),
      content: String(item.content || item.text || item.message || ''),
    })).filter(m => m.content.trim().length > 0);
  }
  
  // Priority 3: transcript as string - parse if possible
  if (typeof transcript === 'string' && transcript.trim().length > 0) {
    // Try to parse lines like "Agent: hello" / "User: hi"
    const lines = transcript.split('\n').filter(l => l.trim());
    const parsed: TranscriptMessage[] = [];
    for (const line of lines) {
      const agentMatch = line.match(/^(Agent|Sofia|Assistant):\s*(.+)/i);
      const userMatch = line.match(/^(User|Cliente|Human):\s*(.+)/i);
      if (agentMatch) {
        parsed.push({ role: 'agent', content: agentMatch[2].trim() });
      } else if (userMatch) {
        parsed.push({ role: 'user', content: userMatch[2].trim() });
      }
    }
    if (parsed.length > 0) return parsed;
  }
  
  // Fallback: empty array (no context, but won't crash)
  return [];
}

// ============ EXTRACT TRANSCRIBED TEXT ============
function extractTranscribedText(body: Record<string, unknown>, normalizedTranscript: TranscriptMessage[]): string {
  const args = body.args as Record<string, unknown> | undefined;
  
  // Priority 1: args.transcribed_text (most common Retell format)
  if (typeof args?.transcribed_text === 'string' && args.transcribed_text.trim()) {
    return args.transcribed_text.trim();
  }
  
  // Priority 2: args.transcript (alternative naming)
  if (typeof args?.transcript === 'string' && args.transcript.trim()) {
    return args.transcript.trim();
  }
  
  // Priority 3: body.transcribed_text (direct field)
  if (typeof body.transcribed_text === 'string' && (body.transcribed_text as string).trim()) {
    return (body.transcribed_text as string).trim();
  }
  
  // Priority 4: Last user message from normalized transcript
  const lastUserMessage = [...normalizedTranscript].reverse().find(m => m.role === 'user');
  if (lastUserMessage?.content) {
    return lastUserMessage.content;
  }
  
  return '';
}

// ============ INTENT DETECTION ============
function detectIntent(text: string): string | null {
  const normalized = text.toLowerCase().trim();
  
  for (const [intent, pattern] of Object.entries(PATTERNS)) {
    if (pattern.test(normalized)) {
      return intent;
    }
  }
  return null;
}

// ============ BUILD CONVERSATION CONTEXT (DEFENSIVE) ============
function buildContext(transcript: unknown): string {
  // Defensive: only process if it's actually an array
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return "";
  }
  
  const recent = transcript.slice(-6); // Last 6 messages for context
  
  try {
    return recent.map((m: TranscriptMessage) => {
      const role = m.role === 'agent' ? 'Sofia' : 'Cliente';
      const content = String(m.content || '');
      return `${role}: ${content}`;
    }).join('\n');
  } catch (e) {
    console.error(`[${VERSION}] buildContext error:`, e);
    return "";
  }
}

// ============ CALL LLM ============
async function callLLM(userMessage: string, conversationContext: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.error(`[${VERSION}] LOVABLE_API_KEY not configured`);
    return "Desculpa, tive um problema técnico aqui. Pode repetir?";
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (conversationContext) {
    messages.push({ 
      role: "user", 
      content: `Contexto da conversa até agora:\n${conversationContext}\n\n---\nCliente agora disse: "${userMessage}"\n\nResponda de forma natural, curta e objetiva.`
    });
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error(`[${VERSION}] LLM error:`, response.status, await response.text());
      return "Desculpa, tive um probleminha aqui. Pode repetir o que disse?";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Pode repetir, por favor?";
  } catch (error) {
    console.error(`[${VERSION}] LLM exception:`, error);
    return "Ops, tive uma falha técnica. Pode falar de novo?";
  }
}

// ============ MAIN HANDLER ============
serve(async (req) => {
  console.log(`[${VERSION}] Request received`);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Structured logging for debugging
    const call = body.call as Record<string, unknown> | undefined;
    const callId = call?.call_id || "unknown";
    const fromNumber = call?.from_number || "";
    
    console.log(`[${VERSION}] Call: ${callId} | From: ${fromNumber}`);
    console.log(`[${VERSION}] Payload structure: transcript_object=${Array.isArray(call?.transcript_object)}, transcript_type=${typeof call?.transcript}`);

    // Normalize transcript (handles all Retell variations)
    const normalizedTranscript = normalizeTranscript(body);
    console.log(`[${VERSION}] Normalized transcript length: ${normalizedTranscript.length}`);
    
    // Extract transcribed text with fallbacks
    const transcribedText = extractTranscribedText(body, normalizedTranscript);
    console.log(`[${VERSION}] Transcribed text: "${transcribedText.substring(0, 100)}${transcribedText.length > 100 ? '...' : ''}"`);

    // Empty or very short input - return empty (Retell lifecycle events)
    if (!transcribedText || transcribedText.trim().length < 2) {
      console.log(`[${VERSION}] Empty/short input, returning empty result`);
      return new Response(
        JSON.stringify({ result: "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try fast-path first
    const intent = detectIntent(transcribedText);
    if (intent && FAST_RESPONSES[intent] !== undefined) {
      const fastResponse = FAST_RESPONSES[intent];
      console.log(`[${VERSION}] Fast-path hit: ${intent}`);
      
      if (fastResponse === "") {
        // Noise - return empty to let conversation flow
        return new Response(
          JSON.stringify({ result: "" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ result: fastResponse }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No fast-path match - call LLM
    console.log(`[${VERSION}] No fast-path, calling LLM...`);
    const conversationContext = buildContext(normalizedTranscript);
    const llmResponse = await callLLM(transcribedText, conversationContext);
    
    console.log(`[${VERSION}] LLM response: "${llmResponse.substring(0, 100)}${llmResponse.length > 100 ? '...' : ''}"`);

    return new Response(
      JSON.stringify({ result: llmResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${VERSION}] Unhandled error:`, error);
    return new Response(
      JSON.stringify({ 
        result: "Desculpa, tive um problema técnico. Pode tentar de novo?" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
