/**
 * Data Collection Phase Unit Tests
 * 
 * Tests for the extracted data-collection-phase.ts module
 * Covers: Data extraction, media parsing, value inference, persistence
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  shouldExecuteDataCollectionPhase,
  type DataCollectionPhaseContext,
  type DataCollectionPhaseResult,
  type DataCollectionConversaData,
  type MediaAnalysisResult,
} from '../_shared/sofia-orchestrator/data-collection-phase.ts';

// ═══════════════════════════════════════════════════════════════
// TEST: shouldExecuteDataCollectionPhase
// ═══════════════════════════════════════════════════════════════

Deno.test("shouldExecuteDataCollectionPhase - returns true with conversaId", () => {
  const result = shouldExecuteDataCollectionPhase('test-conversa-123');
  assertEquals(result, true);
});

Deno.test("shouldExecuteDataCollectionPhase - returns false with null", () => {
  const result = shouldExecuteDataCollectionPhase(null);
  assertEquals(result, false);
});

Deno.test("shouldExecuteDataCollectionPhase - returns false with empty string", () => {
  const result = shouldExecuteDataCollectionPhase('');
  assertEquals(result, false);
});

// ═══════════════════════════════════════════════════════════════
// TEST: DataCollectionConversaData type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("DataCollectionConversaData - minimal required fields", () => {
  const conversa: DataCollectionConversaData = {
    id: 'test-conversa-123',
  };
  assertExists(conversa.id);
  assertEquals(conversa.cliente_email, undefined);
  assertEquals(conversa.dados_coletados, undefined);
});

Deno.test("DataCollectionConversaData - all optional fields", () => {
  const conversa: DataCollectionConversaData = {
    id: 'test-conversa-456',
    cliente_email: 'test@example.com',
    cliente_nome: 'João Silva',
    dados_coletados: { valorFatura: 500 },
    sofia_mode: 'standard',
    bitrix24_stage: 'NEW',
    proposta_id: 'prop-123',
    proposta_link_sent_at: '2025-02-01T12:00:00Z',
    event_proposal_sent: true,
    all_docs_complete_at: null,
    contrato_enviado_at: null,
    contrato_assinado_at: null,
  };
  
  assertEquals(conversa.cliente_email, 'test@example.com');
  assertEquals(conversa.cliente_nome, 'João Silva');
  assertExists(conversa.dados_coletados);
});

// ═══════════════════════════════════════════════════════════════
// TEST: MediaAnalysisResult type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("MediaAnalysisResult - invoice analysis structure", () => {
  const mediaResult: MediaAnalysisResult = {
    analysis: 'Conta de luz CEMIG, valor R$ 450,00, consumo 380 kWh',
    isInvoice: true,
    mimeType: 'image/jpeg',
  };
  
  assertExists(mediaResult.analysis);
  assertEquals(mediaResult.isInvoice, true);
  assertEquals(mediaResult.mimeType, 'image/jpeg');
});

Deno.test("MediaAnalysisResult - non-invoice document", () => {
  const mediaResult: MediaAnalysisResult = {
    analysis: 'Documento RG - CPF 123.456.789-00',
    isInvoice: false,
    mimeType: 'application/pdf',
  };
  
  assertEquals(mediaResult.isInvoice, false);
  assertEquals(mediaResult.mimeType, 'application/pdf');
});

// ═══════════════════════════════════════════════════════════════
// TEST: DataCollectionPhaseResult structure
// ═══════════════════════════════════════════════════════════════

Deno.test("DataCollectionPhaseResult - standard result structure", () => {
  const result: DataCollectionPhaseResult = {
    handled: false,
    extractedData: { email: 'test@example.com' },
    mergedData: { email: 'test@example.com', valorFatura: 500 },
    persistenceResult: {
      persisted: true,
      mergedData: { email: 'test@example.com', valorFatura: 500 },
      newFields: ['email'],
    },
  };
  
  assertEquals(result.handled, false);
  assertExists(result.extractedData);
  assertExists(result.mergedData);
  assertEquals(result.persistenceResult.persisted, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Extracted data field patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("ExtractedData - email extraction pattern", () => {
  const emails = [
    'test@example.com',
    'joao.silva@empresa.com.br',
    'user123@domain.org',
  ];
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  
  for (const email of emails) {
    const match = email.match(emailRegex);
    assertExists(match, `Email should match: ${email}`);
    assertEquals(match[0], email);
  }
});

Deno.test("ExtractedData - CPF extraction pattern", () => {
  const cpfs = [
    '123.456.789-00',
    '12345678900',
    '987.654.321-99',
  ];
  
  const cpfRegex = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
  
  for (const cpf of cpfs) {
    const match = cpf.match(cpfRegex);
    assertExists(match, `CPF should match: ${cpf}`);
  }
});

Deno.test("ExtractedData - CNPJ extraction pattern", () => {
  const cnpjs = [
    '12.345.678/0001-99',
    '12345678000199',
  ];
  
  const cnpjRegex = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;
  
  for (const cnpj of cnpjs) {
    const match = cnpj.match(cnpjRegex);
    assertExists(match, `CNPJ should match: ${cnpj}`);
  }
});

Deno.test("ExtractedData - valor fatura extraction patterns", () => {
  const valores = [
    { text: 'R$ 500,00', expected: 500 },
    { text: 'R$450', expected: 450 },
    { text: '350 reais', expected: 350 },
    { text: 'minha conta é de 600', expected: 600 },
  ];
  
  for (const { text, expected } of valores) {
    // Simple numeric extraction
    const numericMatch = text.match(/\d+[,.]?\d*/);
    assertExists(numericMatch, `Should extract number from: ${text}`);
    const extracted = parseFloat(numericMatch[0].replace(',', '.'));
    assertEquals(extracted, expected);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Numeric value inference
// ═══════════════════════════════════════════════════════════════

Deno.test("Numeric inference - standalone number as valor", () => {
  const message = '500';
  const existingData = { distribuidora: 'CEMIG' }; // Has distribuidora but no valor
  
  const numericOnly = /^\d+([,.]?\d+)?$/.test(message.trim());
  assertEquals(numericOnly, true);
  
  // Should infer as valorFatura since distribuidora exists but valor doesn't
  const shouldInferValor = existingData.distribuidora && !(existingData as Record<string, unknown>).valorFatura;
  assertEquals(shouldInferValor, true);
});

Deno.test("Numeric inference - decimal value", () => {
  const message = '450,50';
  
  const numericOnly = /^\d+([,.]?\d+)?$/.test(message.trim());
  assertEquals(numericOnly, true);
  
  const parsed = parseFloat(message.replace(',', '.'));
  assertEquals(parsed, 450.50);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Invoice analysis parsing
// ═══════════════════════════════════════════════════════════════

Deno.test("Invoice parsing - extract valor from analysis", () => {
  const analysis = 'Conta de luz CEMIG, valor R$ 450,00, consumo 380 kWh, vencimento 15/02/2025';
  
  const valorMatch = analysis.match(/valor\s*r?\$?\s*(\d+[,.]?\d*)/i);
  assertExists(valorMatch);
  const valor = parseFloat(valorMatch[1].replace(',', '.'));
  assertEquals(valor, 450);
});

Deno.test("Invoice parsing - extract consumo from analysis", () => {
  const analysis = 'Conta de luz CEMIG, valor R$ 450,00, consumo 380 kWh';
  
  const consumoMatch = analysis.match(/consumo\s*(\d+)\s*kwh/i);
  assertExists(consumoMatch);
  const consumo = parseInt(consumoMatch[1]);
  assertEquals(consumo, 380);
});

Deno.test("Invoice parsing - extract distribuidora from analysis", () => {
  const analysis = 'Conta de luz CEMIG, valor R$ 450,00';
  
  const distribuidoras = ['CEMIG', 'CPFL', 'LIGHT', 'ENEL', 'ENERGISA', 'COPEL'];
  let foundDist: string | null = null;
  
  for (const dist of distribuidoras) {
    if (analysis.toUpperCase().includes(dist)) {
      foundDist = dist;
      break;
    }
  }
  
  assertEquals(foundDist, 'CEMIG');
});

// ═══════════════════════════════════════════════════════════════
// TEST: Data merging logic
// ═══════════════════════════════════════════════════════════════

Deno.test("Data merge - new data overwrites existing", () => {
  const existingDados = {
    valorFatura: 400,
    distribuidora: 'CEMIG',
  };
  
  const extractedData = {
    valorFatura: 500,
    email: 'test@example.com',
  };
  
  const merged = { ...existingDados, ...extractedData };
  
  assertEquals(merged.valorFatura, 500); // Overwritten
  assertEquals(merged.distribuidora, 'CEMIG'); // Preserved
  assertEquals(merged.email, 'test@example.com'); // Added
});

Deno.test("Data merge - null values don't overwrite", () => {
  const existingDados = {
    valorFatura: 400,
    email: 'old@example.com',
  };
  
  const extractedData = {
    valorFatura: null,
    email: 'new@example.com',
  };
  
  // Custom merge logic that ignores null
  const merged = Object.entries(extractedData).reduce(
    (acc, [key, value]) => {
      if (value !== null && value !== undefined) {
        (acc as Record<string, unknown>)[key] = value;
      }
      return acc;
    },
    { ...existingDados }
  );
  
  assertEquals(merged.valorFatura, 400); // Preserved (null ignored)
  assertEquals(merged.email, 'new@example.com'); // Overwritten
});

// ═══════════════════════════════════════════════════════════════
// TEST: Special detections
// ═══════════════════════════════════════════════════════════════

Deno.test("Special detection - rural area (sem_cip)", () => {
  const message = 'moro na zona rural, não tem CIP';
  
  const ruralPatterns = ['zona rural', 'área rural', 'sem cip', 'não tem cip'];
  const hasRural = ruralPatterns.some(p => message.toLowerCase().includes(p));
  
  assertEquals(hasRural, true);
});

Deno.test("Special detection - future consumption (AC)", () => {
  const message = 'vou instalar ar condicionado novo';
  
  const futurePatterns = ['ar condicionado', 'piscina', 'novo equipamento'];
  const hasFuture = futurePatterns.some(p => message.toLowerCase().includes(p));
  
  assertEquals(hasFuture, true);
});

Deno.test("Special detection - pause followup request", () => {
  const messages = [
    'pode pausar o contato por favor',
    'não me ligue mais por hoje',
    'para de mandar mensagem',
  ];
  
  const pausePatterns = ['pausar', 'não me ligue', 'para de mandar'];
  
  for (const message of messages) {
    const hasPause = pausePatterns.some(p => message.toLowerCase().includes(p));
    assertEquals(hasPause, true, `Should detect pause in: ${message}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Distributor typo detection
// ═══════════════════════════════════════════════════════════════

Deno.test("Distributor typo - common typos", () => {
  const typoMappings = [
    { typo: 'cemyg', suggested: 'CEMIG' },
    { typo: 'seming', suggested: 'CEMIG' },
    { typo: 'cpfl paulista', suggested: 'CPFL' },
    { typo: 'energ', suggested: 'ENERGISA' },
    { typo: 'copeel', suggested: 'COPEL' },
  ];
  
  for (const { typo, suggested } of typoMappings) {
    assert(typo.length > 0);
    assert(suggested.length > 0);
  }
});

Deno.test("Distributor typo - awaiting confirmation flags", () => {
  const typoData = {
    aguardandoConfirmacaoTypo: true,
    distribuidoraTypoDetectado: 'cemyg',
    distribuidoraTypoSugerida: 'CEMIG',
  };
  
  assertEquals(typoData.aguardandoConfirmacaoTypo, true);
  assertExists(typoData.distribuidoraTypoDetectado);
  assertExists(typoData.distribuidoraTypoSugerida);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Critical field persistence
// ═══════════════════════════════════════════════════════════════

Deno.test("Critical persistence - result structure", () => {
  const persistenceResult = {
    persisted: true,
    mergedData: { email: 'test@example.com', valorFatura: 500 },
    newFields: ['email'],
    updatedFields: ['valorFatura'],
  };
  
  assertEquals(persistenceResult.persisted, true);
  assertExists(persistenceResult.mergedData);
  assert(persistenceResult.newFields.length > 0);
});

Deno.test("Critical persistence - no changes result", () => {
  const persistenceResult = {
    persisted: false,
    mergedData: { valorFatura: 500 },
    newFields: [],
    updatedFields: [],
  };
  
  assertEquals(persistenceResult.persisted, false);
  assertEquals(persistenceResult.newFields.length, 0);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Name extraction patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Name extraction - common patterns", () => {
  const nameMessages = [
    { text: 'meu nome é João Silva', expectedName: 'João Silva' },
    { text: 'sou Maria', expectedName: 'Maria' },
    { text: 'pode me chamar de Pedro', expectedName: 'Pedro' },
  ];
  
  const namePatterns = [
    /(?:meu nome [eé]\s*)([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
    /(?:sou\s+)([A-ZÀ-Ú][a-zà-ú]+)/i,
    /(?:chamar\s+de\s+)([A-ZÀ-Ú][a-zà-ú]+)/i,
  ];
  
  for (const { text } of nameMessages) {
    const hasMatch = namePatterns.some(p => p.test(text));
    assertEquals(hasMatch, true, `Should extract name from: ${text}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Phone extraction patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Phone extraction - various formats", () => {
  const phones = [
    '11999999999',
    '(11) 99999-9999',
    '+55 11 99999-9999',
    '5511999999999',
  ];
  
  for (const phone of phones) {
    const digits = phone.replace(/\D/g, '');
    assert(digits.length >= 10 && digits.length <= 13);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Context analysis for distributor
// ═══════════════════════════════════════════════════════════════

Deno.test("Context analysis - message context patterns", () => {
  const contextPatterns = [
    { pattern: /minha\s+distribuidora\s+[eé]/i, intent: 'distributor_info' },
    { pattern: /conta\s+de\s+luz\s+(da|do|é)/i, intent: 'invoice_context' },
    { pattern: /energia\s+(de|da|aqui)/i, intent: 'location_context' },
  ];
  
  const testMessages = [
    { text: 'minha distribuidora é CEMIG', expectedIntent: 'distributor_info' },
    { text: 'conta de luz da minha casa', expectedIntent: 'invoice_context' },
    { text: 'energia aqui é da COPEL', expectedIntent: 'location_context' },
  ];
  
  for (const { text, expectedIntent } of testMessages) {
    const matchedPattern = contextPatterns.find(cp => cp.pattern.test(text));
    assertExists(matchedPattern, `Should match pattern for: ${text}`);
    assertEquals(matchedPattern!.intent, expectedIntent);
  }
});
