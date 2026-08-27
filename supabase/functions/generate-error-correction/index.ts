// Error correction generator using Gemini

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CorrectionRequest {
  client_message: string;
  wrong_response: string;
  issues: Array<{ type?: string; description?: string; severity?: string }>;
  reasoning: string;
  funnel_stage: string;
}

interface CorrectionResponse {
  correct_response: string;
  rule_to_create: {
    name: string;
    description: string;
    condition: string;
    action: string;
    priority: number;
  };
  few_shot_example: {
    client_message: string;
    correct_response: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CorrectionRequest = await req.json();
    const { client_message, wrong_response, issues, reasoning, funnel_stage } = body;

    const OPENROUTER_API_KEY = Deno.env.get('COESA_PROPOSTAS_OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) {
      throw new Error("COESA_PROPOSTAS_OPENROUTER_API_KEY not configured");
    }

    const prompt = `Você é um especialista em atendimento comercial da COESA Energia (energia solar por assinatura).
Sua tarefa é corrigir respostas problemáticas do chatbot Sofia.

CONTEXTO COESA:
- Vendemos energia solar por assinatura (cliente não instala painéis)
- Economia de 10-18% na conta de luz
- Sem fidelidade, sem investimento inicial
- Sofia deve ser humana, empática, objetiva e focada em vendas

ERRO DETECTADO:

MENSAGEM DO CLIENTE:
"${client_message}"

RESPOSTA ERRADA DA SOFIA:
"${wrong_response}"

PROBLEMAS IDENTIFICADOS:
${issues?.map(i => `- ${i.description || i.type}`).join('\n') || 'Resposta genérica ou fora de contexto'}

ANÁLISE:
${reasoning}

ESTÁGIO DO FUNIL: ${funnel_stage || 'geral'}

Gere uma correção no seguinte formato JSON (APENAS o JSON, sem markdown):
{
  "correct_response": "A resposta correta que Sofia deveria ter dado - humana, empática e objetiva",
  "rule_to_create": {
    "name": "Nome curto da regra (max 50 chars)",
    "description": "Descrição do comportamento esperado",
    "condition": "Trigger que ativa a regra",
    "action": "O que Sofia deve fazer",
    "priority": 85
  },
  "few_shot_example": {
    "client_message": "${client_message}",
    "correct_response": "Mesma resposta correta"
  }
}`;

    // Call the exact Gemini model through OpenRouter.
    const geminiResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}` },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("OpenRouter API error:", errorText);
      throw new Error(`OpenRouter API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const content = geminiData.choices?.[0]?.message?.content || "";
    
    console.log("Gemini response:", content);

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Could not find JSON in response:", content);
      throw new Error("Could not parse AI response");
    }

    const correction: CorrectionResponse = JSON.parse(jsonMatch[0]);

    // Ensure few_shot_example uses the correct client message
    correction.few_shot_example.client_message = client_message;

    return new Response(JSON.stringify(correction), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating correction:", error);
    
    // Return a fallback correction based on common patterns
    const body = await req.clone().json().catch(() => ({})) as CorrectionRequest;
    
    const fallbackCorrection: CorrectionResponse = {
      correct_response: `Entendo sua pergunta! ${body.client_message?.includes('?') ? 'Deixa eu esclarecer: ' : ''}A COESA oferece energia solar por assinatura - você economiza até 18% na conta de luz sem precisar instalar nada. A energia vem de fazendas solares e chega na sua casa pela rede normal. Posso te ajudar com alguma dúvida específica?`,
      rule_to_create: {
        name: "Responder de forma contextualizada",
        description: "Sofia deve sempre responder de forma contextualizada à pergunta do cliente, nunca com respostas genéricas",
        condition: "cliente faz pergunta ou demonstra confusão",
        action: "Responder diretamente à pergunta, contextualizar se necessário, e oferecer continuidade",
        priority: 85,
      },
      few_shot_example: {
        client_message: body.client_message || "Pergunta do cliente",
        correct_response: "Resposta contextualizada e empática da Sofia",
      },
    };

    return new Response(JSON.stringify(fallbackCorrection), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
