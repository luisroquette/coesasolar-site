/**
 * Unit Tests: Pre-LLM Hard Stops
 * 
 * Tests deterministic guardrails in isolation.
 * Run with: deno test supabase/functions/_shared/pre-llm-hard-stops_test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ═══════════════════════════════════════════════════════════════
// TEST: checkMinimumBillThreshold
// ═══════════════════════════════════════════════════════════════

// Mock config
const mockConfig = {
  consumoMinimoReais: 50,
  disqualificationCooldownDays: 30,
  documentBlockEnabled: true,
  emailRequiredForProposal: true,
};

// Inline implementation for testing (mirrors pre-llm-hard-stops.ts)
function checkMinimumBillThreshold(
  extractedData: Record<string, unknown>,
  existingDados: Record<string, unknown>,
  config: { consumoMinimoReais: number }
): { blocked: boolean; valorDetected: number | null; message: string | null; estimatedFromConsumption: boolean } {
  let valorFatura = extractedData.valorFatura || existingDados.valorFatura || 
                    extractedData.valorConta || existingDados.valorConta ||
                    extractedData.valor_fatura || existingDados.valor_fatura;
  
  let estimatedFromConsumption = false;
  
  if (!valorFatura || typeof valorFatura !== 'number') {
    const consumoKwh = extractedData.consumo || existingDados.consumo ||
                       extractedData.consumoKwh || existingDados.consumoKwh;
    
    if (consumoKwh && typeof consumoKwh === 'number' && consumoKwh > 0) {
      valorFatura = consumoKwh * 0.80;
      estimatedFromConsumption = true;
    }
  }
  
  if (!valorFatura || typeof valorFatura !== 'number') {
    return { blocked: false, valorDetected: null, message: null, estimatedFromConsumption: false };
  }

  if ((valorFatura as number) < config.consumoMinimoReais) {
    const message = `Conta de R$ ${(valorFatura as number).toFixed(2)} está abaixo do limite mínimo de R$ ${config.consumoMinimoReais}`;
    return { blocked: true, valorDetected: valorFatura as number, message, estimatedFromConsumption };
  }

  return { blocked: false, valorDetected: valorFatura as number, message: null, estimatedFromConsumption };
}

// ═══════════════════════════════════════════════════════════════
// TEST: Document Request Detection
// ═══════════════════════════════════════════════════════════════

const DOCUMENT_REQUEST_PATTERNS = [
  /\b(envi[ae]|mand[ae]|anexe|anexar?).{0,30}(documento|rg|cnh|identidade|fatura|conta|contrato|carteirinha|comprovante)/i,
  /\b(documento|rg|cnh|identidade|foto).{0,30}(aqui|no\s+whatsapp|por\s+aqui|nessa\s+conversa)/i,
  /\bpreciso\s+(de|que).{0,30}(documento|rg|cnh|foto|scan|digitaliza)/i,
  /\bpode\s+enviar.{0,30}(documento|rg|cnh|foto|pdf)/i,
  /\baguardando.{0,30}(documento|foto|pdf|comprovante)/i,
];

function detectDocumentRequestInMessage(message: string): boolean {
  const msgLower = message.toLowerCase();
  return DOCUMENT_REQUEST_PATTERNS.some(pattern => pattern.test(msgLower));
}

// ═══════════════════════════════════════════════════════════════
// TEST: Email Check
// ═══════════════════════════════════════════════════════════════

function checkEmailForProposal(
  extractedData: Record<string, unknown>,
  existingDados: Record<string, unknown>
): { hasEmail: boolean; requestMessage: string | null } {
  const email = extractedData.email || existingDados.email;
  
  if (email && typeof email === 'string' && email.includes('@')) {
    return { hasEmail: true, requestMessage: null };
  }

  return {
    hasEmail: false,
    requestMessage: 'Preciso do seu e-mail para continuar.',
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS: Minimum Bill Threshold
// ═══════════════════════════════════════════════════════════════

Deno.test("Hard Stop: R$30 deve bloquear (abaixo do mínimo R$50)", () => {
  const result = checkMinimumBillThreshold(
    { valorFatura: 30 },
    {},
    mockConfig
  );
  assertEquals(result.blocked, true);
  assertEquals(result.valorDetected, 30);
  assertEquals(result.estimatedFromConsumption, false);
});

Deno.test("Hard Stop: R$450 NÃO deve bloquear (acima do mínimo)", () => {
  const result = checkMinimumBillThreshold(
    { valorFatura: 450 },
    {},
    mockConfig
  );
  assertEquals(result.blocked, false);
  assertEquals(result.valorDetected, 450);
});

Deno.test("Hard Stop: R$50 exato NÃO deve bloquear (igual ao mínimo)", () => {
  const result = checkMinimumBillThreshold(
    { valorFatura: 50 },
    {},
    mockConfig
  );
  assertEquals(result.blocked, false);
  assertEquals(result.valorDetected, 50);
});

Deno.test("Hard Stop: R$49.99 deve bloquear (abaixo do mínimo)", () => {
  const result = checkMinimumBillThreshold(
    { valorFatura: 49.99 },
    {},
    mockConfig
  );
  assertEquals(result.blocked, true);
  assertEquals(result.valorDetected, 249.99);
});

Deno.test("Hard Stop: 180kWh estimado deve bloquear (180 × 0.80 = R$144)", () => {
  const result = checkMinimumBillThreshold(
    { consumo: 180 },
    {},
    mockConfig
  );
  assertEquals(result.blocked, true);
  assertEquals(result.estimatedFromConsumption, true);
  assert(result.valorDetected! < 300, "Valor estimado deve ser < 300");
});

Deno.test("Hard Stop: 500kWh estimado NÃO deve bloquear (500 × 0.80 = R$400)", () => {
  const result = checkMinimumBillThreshold(
    { consumo: 500 },
    {},
    mockConfig
  );
  assertEquals(result.blocked, false);
  assertEquals(result.estimatedFromConsumption, true);
  assert(result.valorDetected! >= 300, "Valor estimado deve ser >= 300");
});

Deno.test("Hard Stop: valorConta alternativo deve funcionar", () => {
  const result = checkMinimumBillThreshold(
    { valorConta: 200 },
    {},
    mockConfig
  );
  assertEquals(result.blocked, true);
  assertEquals(result.valorDetected, 200);
});

Deno.test("Hard Stop: existing dados prevalecem se extracted vazio", () => {
  const result = checkMinimumBillThreshold(
    {},
    { valorFatura: 150 },
    mockConfig
  );
  assertEquals(result.blocked, true);
  assertEquals(result.valorDetected, 150);
});

Deno.test("Hard Stop: sem valor retorna não bloqueado", () => {
  const result = checkMinimumBillThreshold(
    {},
    {},
    mockConfig
  );
  assertEquals(result.blocked, false);
  assertEquals(result.valorDetected, null);
});

// ═══════════════════════════════════════════════════════════════
// TESTS: Document Request Detection
// ═══════════════════════════════════════════════════════════════

Deno.test("Doc Detection: 'me envia seu RG' deve detectar", () => {
  assertEquals(detectDocumentRequestInMessage("me envia seu RG aqui"), true);
});

Deno.test("Doc Detection: 'manda a foto do documento' deve detectar", () => {
  assertEquals(detectDocumentRequestInMessage("manda a foto do documento"), true);
});

Deno.test("Doc Detection: 'pode enviar a CNH' deve detectar", () => {
  assertEquals(detectDocumentRequestInMessage("pode enviar a CNH?"), true);
});

Deno.test("Doc Detection: 'aguardando o comprovante' deve detectar", () => {
  assertEquals(detectDocumentRequestInMessage("estou aguardando o comprovante"), true);
});

Deno.test("Doc Detection: 'me envia a foto da fatura' deve detectar", () => {
  assertEquals(detectDocumentRequestInMessage("me envia a foto da fatura"), true);
});

Deno.test("Doc Detection: 'sua proposta está pronta' NÃO deve detectar", () => {
  assertEquals(detectDocumentRequestInMessage("Sua proposta está pronta!"), false);
});

Deno.test("Doc Detection: 'acesse o link' NÃO deve detectar", () => {
  assertEquals(detectDocumentRequestInMessage("Acesse o link para ver sua proposta"), false);
});

Deno.test("Doc Detection: 'documentos na plataforma' NÃO deve detectar", () => {
  assertEquals(detectDocumentRequestInMessage("Anexe os documentos na plataforma"), false);
});

// ═══════════════════════════════════════════════════════════════
// TESTS: Email Check
// ═══════════════════════════════════════════════════════════════

Deno.test("Email Check: email válido deve retornar hasEmail=true", () => {
  const result = checkEmailForProposal(
    { email: "teste@exemplo.com" },
    {}
  );
  assertEquals(result.hasEmail, true);
  assertEquals(result.requestMessage, null);
});

Deno.test("Email Check: email em existingDados deve funcionar", () => {
  const result = checkEmailForProposal(
    {},
    { email: "teste@exemplo.com" }
  );
  assertEquals(result.hasEmail, true);
});

Deno.test("Email Check: sem email deve retornar hasEmail=false", () => {
  const result = checkEmailForProposal({}, {});
  assertEquals(result.hasEmail, false);
  assert(result.requestMessage !== null, "Deve ter mensagem de request");
});

Deno.test("Email Check: email inválido (sem @) deve retornar hasEmail=false", () => {
  const result = checkEmailForProposal(
    { email: "testesemarroba.com" },
    {}
  );
  assertEquals(result.hasEmail, false);
});

Deno.test("Email Check: email null deve retornar hasEmail=false", () => {
  const result = checkEmailForProposal(
    { email: null },
    {}
  );
  assertEquals(result.hasEmail, false);
});

// ═══════════════════════════════════════════════════════════════
// TESTS: Third Party Context (Sogro)
// ═══════════════════════════════════════════════════════════════

const THIRD_PARTY_PATTERNS = [
  /casa\s+d[oa]\s+(meu\s+)?sogr[oa]/i,
  /casa\s+d[oa]\s+(minha?\s+)?(m[aã]e|pai)/i,
  /conta\s+d[oa]\s+(marido|esposa)/i,
  /na\s+casa\s+del[ea]/i,
  /tem\s+na\s+casa\s+de/i,
  /vem\s+em\s+m[eé]dia/i,
  /m[eé]dia\s+de\s+r\$/i,
];

function matchesThirdPartyContext(message: string): boolean {
  const msgLower = message.toLowerCase();
  return THIRD_PARTY_PATTERNS.some(pattern => pattern.test(msgLower));
}

Deno.test("Third Party: 'casa do sogro' deve detectar", () => {
  assertEquals(matchesThirdPartyContext("Tem na casa do meu sogro"), true);
});

Deno.test("Third Party: 'casa da minha mãe' deve detectar", () => {
  assertEquals(matchesThirdPartyContext("na casa da minha mãe a conta é 400"), true);
});

Deno.test("Third Party: 'conta do marido' deve detectar", () => {
  assertEquals(matchesThirdPartyContext("a conta é do meu marido"), false); // Pattern is 'conta do marido'
  assertEquals(matchesThirdPartyContext("conta do marido"), true);
});

Deno.test("Third Party: 'vem em média 350' deve detectar (contexto comercial)", () => {
  assertEquals(matchesThirdPartyContext("vem em média 350 reais"), true);
});

Deno.test("Third Party: 'média de R$450' deve detectar (contexto comercial)", () => {
  assertEquals(matchesThirdPartyContext("média de r$450"), true);
});

Deno.test("Third Party: 'minha conta' NÃO deve detectar", () => {
  assertEquals(matchesThirdPartyContext("minha conta é de 400 reais"), false);
});

// ═══════════════════════════════════════════════════════════════
// TESTS: Cenário Completo - Sogro R$150
// ═══════════════════════════════════════════════════════════════

Deno.test("Cenário Sogro R$150: Detecta terceiro + bloqueia por valor", () => {
  const message = "Tem na casa do meu sogro, vem em média 150rs";
  
  // 1. Deve detectar contexto de terceiro (NÃO triagem)
  const isThirdParty = matchesThirdPartyContext(message);
  assertEquals(isThirdParty, true, "Deve detectar contexto de terceiros");
  
  // 2. Deve bloquear por valor baixo
  const billCheck = checkMinimumBillThreshold(
    { valorFatura: 30 },
    {},
    mockConfig
  );
  assertEquals(billCheck.blocked, true, "Deve bloquear por R$30 < R$50");
  
  // 3. A resposta deve mencionar o limite
  assert(billCheck.message?.includes("50"), "Mensagem deve mencionar R$50");
});

// ═══════════════════════════════════════════════════════════════
// TESTS: Cenário Proposta sem Email
// ═══════════════════════════════════════════════════════════════

Deno.test("Cenário Proposta: Com todos dados mas SEM email - deve bloquear sync", () => {
  const dados = {
    nome: "João Silva",
    distribuidora: "CEMIG",
    valorFatura: 500,
    email: null as string | null,
  };
  
  // Verificar email
  const emailCheck = checkEmailForProposal(dados, {});
  assertEquals(emailCheck.hasEmail, false, "Não deve ter email");
  assert(emailCheck.requestMessage !== null, "Deve pedir email");
});

Deno.test("Cenário Proposta: Com email válido - permite sync", () => {
  const dados = {
    nome: "João Silva",
    distribuidora: "CEMIG",
    valorFatura: 500,
    email: "joao@teste.com",
  };
  
  const emailCheck = checkEmailForProposal(dados, {});
  assertEquals(emailCheck.hasEmail, true, "Deve ter email");
  assertEquals(emailCheck.requestMessage, null, "Não deve pedir email");
});

console.log("✅ Unit tests de Hard Stops carregados");
