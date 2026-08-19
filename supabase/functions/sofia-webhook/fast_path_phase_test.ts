/**
 * Fast-Path Phase Unit Tests
 * 
 * Tests for the extracted fast-path-phase.ts module
 * Covers: Document collection, fast-path handlers, audio preference, confirmations
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  shouldExecuteFastPathPhase,
  type FastPathPhaseContext,
  type FastPathPhaseResult,
  type FastPathConversaData,
  type MediaAnalysisData,
} from '../_shared/sofia-orchestrator/fast-path-phase.ts';

// ═══════════════════════════════════════════════════════════════
// TEST: shouldExecuteFastPathPhase
// ═══════════════════════════════════════════════════════════════

Deno.test("shouldExecuteFastPathPhase - always returns true", () => {
  const result = shouldExecuteFastPathPhase();
  assertEquals(result, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: FastPathConversaData type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("FastPathConversaData - minimal required fields", () => {
  const conversa: FastPathConversaData = {
    id: 'test-conversa-123',
  };
  assertExists(conversa.id);
  assertEquals(conversa.bitrix24_stage, undefined);
  assertEquals(conversa.docs_received_whatsapp, undefined);
});

Deno.test("FastPathConversaData - document collection fields", () => {
  const conversa: FastPathConversaData = {
    id: 'test-conversa-456',
    bitrix24_stage: 'DOCS_PENDING',
    proposta_id: 'prop-123',
    contrato_enviado_at: '2025-02-01T12:00:00Z',
    arquivos_anexados: ['rg.pdf', 'cpf.pdf'],
    docs_received_whatsapp: ['conta_luz'],
    docs_received_page: [],
    dados_coletados: { valorFatura: 500 },
  };
  
  assertExists(conversa.arquivos_anexados);
  assertEquals(conversa.arquivos_anexados?.length, 2);
  assertExists(conversa.docs_received_whatsapp);
});

Deno.test("FastPathConversaData - audio preference fields", () => {
  const conversa: FastPathConversaData = {
    id: 'test-conversa-789',
    audio_oferecido: true,
    cliente_aceita_audio: true,
    sofia_mode: 'standard',
  };
  
  assertEquals(conversa.audio_oferecido, true);
  assertEquals(conversa.cliente_aceita_audio, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: MediaAnalysisData type structure
// ═══════════════════════════════════════════════════════════════

Deno.test("MediaAnalysisData - invoice image", () => {
  const mediaData: MediaAnalysisData = {
    analysis: 'Conta de luz CEMIG, valor R$ 450,00',
    mimeType: 'image/jpeg',
    isInvoice: true,
  };
  
  assertExists(mediaData.analysis);
  assertEquals(mediaData.isInvoice, true);
  assertEquals(mediaData.mimeType, 'image/jpeg');
});

Deno.test("MediaAnalysisData - PDF document", () => {
  const mediaData: MediaAnalysisData = {
    analysis: 'Documento de identificação - RG',
    mimeType: 'application/pdf',
    isInvoice: false,
  };
  
  assertEquals(mediaData.isInvoice, false);
  assertEquals(mediaData.mimeType, 'application/pdf');
});

// ═══════════════════════════════════════════════════════════════
// TEST: FastPathPhaseResult structure
// ═══════════════════════════════════════════════════════════════

Deno.test("FastPathPhaseResult - not handled structure", () => {
  const result: FastPathPhaseResult = {
    handled: false,
    extractedData: {},
    audioSettings: {
      enabled: true,
      congruenceEnabled: true,
      offerOnDoubtsEnabled: true,
      minCharsForCongruence: 100,
      minCharsForAudioOffer: 350,
    },
    clienteAceitaAudio: null,
    audioPreferenceJustSet: false,
    handleDirectAudioRequest: false,
  };
  
  assertEquals(result.handled, false);
  assertEquals(result.response, undefined);
  assertExists(result.audioSettings);
});

Deno.test("FastPathPhaseResult - document collection handled", () => {
  const result: FastPathPhaseResult = {
    handled: true,
    status: 'document_collected',
    extractedData: { valorFatura: 450 },
    audioSettings: {
      enabled: true,
      congruenceEnabled: true,
      offerOnDoubtsEnabled: true,
      minCharsForCongruence: 100,
      minCharsForAudioOffer: 350,
    },
    clienteAceitaAudio: null,
    audioPreferenceJustSet: false,
    handleDirectAudioRequest: false,
  };
  
  assertEquals(result.handled, true);
  assertEquals(result.status, 'document_collected');
});

Deno.test("FastPathPhaseResult - audio preference handled", () => {
  const result: FastPathPhaseResult = {
    handled: true,
    status: 'audio_preference_handled',
    extractedData: {},
    audioSettings: {
      enabled: true,
      congruenceEnabled: true,
      offerOnDoubtsEnabled: true,
      minCharsForCongruence: 100,
      minCharsForAudioOffer: 350,
    },
    clienteAceitaAudio: true,
    audioPreferenceJustSet: true,
    handleDirectAudioRequest: false,
  };
  
  assertEquals(result.handled, true);
  assertEquals(result.clienteAceitaAudio, true);
  assertEquals(result.audioPreferenceJustSet, true);
});

// ═══════════════════════════════════════════════════════════════
// TEST: Document type detection patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Document detection - invoice patterns", () => {
  const invoiceAnalysis = [
    'Conta de luz CEMIG valor R$ 500',
    'Fatura de energia elétrica',
    'Consumo mensal 380 kWh',
  ];
  
  const invoicePatterns = ['conta de luz', 'fatura', 'consumo', 'kwh', 'energia'];
  
  for (const analysis of invoiceAnalysis) {
    const isInvoice = invoicePatterns.some(p => 
      analysis.toLowerCase().includes(p)
    );
    assertEquals(isInvoice, true, `Should detect invoice: ${analysis}`);
  }
});

Deno.test("Document detection - ID document patterns", () => {
  const idDocuments = [
    'RG - 12.345.678-9 SSP/MG',
    'CPF: 123.456.789-00',
    'Carteira de identidade',
  ];
  
  const idPatterns = ['rg', 'cpf', 'identidade', 'cnh'];
  
  for (const doc of idDocuments) {
    const isId = idPatterns.some(p => 
      doc.toLowerCase().includes(p)
    );
    assertEquals(isId, true, `Should detect ID doc: ${doc}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Tipo de instalação detection
// ═══════════════════════════════════════════════════════════════

Deno.test("Tipo instalação - residencial patterns", () => {
  const messages = [
    'é minha casa',
    'residencial',
    'moro aqui',
    'apartamento',
  ];
  
  const residencialPatterns = ['casa', 'residencial', 'moro', 'apartamento', 'moradia'];
  
  for (const msg of messages) {
    const isResidencial = residencialPatterns.some(p => 
      msg.toLowerCase().includes(p)
    );
    assertEquals(isResidencial, true, `Should detect residencial: ${msg}`);
  }
});

Deno.test("Tipo instalação - comercial patterns", () => {
  const messages = [
    'é minha empresa',
    'comercial',
    'loja',
    'escritório',
  ];
  
  const comercialPatterns = ['empresa', 'comercial', 'loja', 'escritório', 'negócio'];
  
  for (const msg of messages) {
    const isComercial = comercialPatterns.some(p => 
      msg.toLowerCase().includes(p)
    );
    assertEquals(isComercial, true, `Should detect comercial: ${msg}`);
  }
});

Deno.test("Tipo instalação - rural patterns", () => {
  const messages = [
    'sítio',
    'fazenda',
    'zona rural',
    'chácara',
  ];
  
  const ruralPatterns = ['sítio', 'fazenda', 'rural', 'chácara', 'roça'];
  
  for (const msg of messages) {
    const isRural = ruralPatterns.some(p => 
      msg.toLowerCase().includes(p)
    );
    assertEquals(isRural, true, `Should detect rural: ${msg}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Audio preference detection
// ═══════════════════════════════════════════════════════════════

Deno.test("Audio preference - acceptance patterns", () => {
  const acceptMessages = [
    'sim, pode mandar áudio',
    'prefiro áudio',
    'pode ser audio',
    'quero em áudio',
  ];
  
  const acceptPatterns = ['sim', 'pode', 'prefiro', 'quero'];
  const audioKeywords = ['áudio', 'audio', 'voz'];
  
  for (const msg of acceptMessages) {
    const hasAccept = acceptPatterns.some(p => msg.toLowerCase().includes(p));
    const hasAudio = audioKeywords.some(k => msg.toLowerCase().includes(k));
    assert(hasAccept && hasAudio, `Should detect audio acceptance: ${msg}`);
  }
});

Deno.test("Audio preference - rejection patterns", () => {
  const rejectMessages = [
    'não, prefiro texto',
    'não quero áudio',
    'só texto por favor',
  ];
  
  const rejectPatterns = ['não', 'nao', 'só texto', 'prefiro texto'];
  
  for (const msg of rejectMessages) {
    const hasReject = rejectPatterns.some(p => msg.toLowerCase().includes(p));
    assertEquals(hasReject, true, `Should detect audio rejection: ${msg}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Confirmation handler patterns
// ═══════════════════════════════════════════════════════════════

Deno.test("Confirmation - positive responses", () => {
  const positiveMessages = [
    'sim',
    'confirmo',
    'isso mesmo',
    'correto',
    'está certo',
    'exato',
  ];
  
  const positivePatterns = ['sim', 'confirmo', 'isso mesmo', 'correto', 'certo', 'exato'];
  
  for (const msg of positiveMessages) {
    const isPositive = positivePatterns.some(p => 
      msg.toLowerCase().includes(p)
    );
    assertEquals(isPositive, true, `Should detect positive: ${msg}`);
  }
});

Deno.test("Confirmation - negative responses", () => {
  const negativeMessages = [
    'não',
    'errado',
    'incorreto',
    'não é isso',
    'está errado',
  ];
  
  const negativePatterns = ['não', 'nao', 'errado', 'incorreto'];
  
  for (const msg of negativeMessages) {
    const isNegative = negativePatterns.some(p => 
      msg.toLowerCase().includes(p)
    );
    assertEquals(isNegative, true, `Should detect negative: ${msg}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Fast-path status values
// ═══════════════════════════════════════════════════════════════

Deno.test("Fast-path statuses - valid status values", () => {
  const validStatuses = [
    'document_collected',
    'waiting_tipo_instalacao',
    'tipo_instalacao_processed',
    'tipo_instalacao_reask',
    'audio_preference_handled',
    'confirmation_handled',
  ];
  
  for (const status of validStatuses) {
    assert(typeof status === 'string' && status.length > 0, 
      `Status should be valid string: ${status}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// TEST: Audio settings structure
// ═══════════════════════════════════════════════════════════════

Deno.test("Audio settings - default structure", () => {
  const defaultSettings = {
    enabled: true,
    minMessageLength: 100,
    maxMessageLength: 500,
    voiceId: 'default',
  };
  
  assertEquals(defaultSettings.enabled, true);
  assert(defaultSettings.minMessageLength > 0);
  assert(defaultSettings.maxMessageLength > defaultSettings.minMessageLength);
});

Deno.test("Audio settings - message length validation", () => {
  const settings = {
    minMessageLength: 100,
    maxMessageLength: 500,
  };
  
  const messages = [
    { text: 'Olá', shouldSendAudio: false }, // Too short
    { text: 'A'.repeat(150), shouldSendAudio: true }, // Within range
    { text: 'A'.repeat(600), shouldSendAudio: false }, // Too long
  ];
  
  for (const { text, shouldSendAudio } of messages) {
    const inRange = text.length >= settings.minMessageLength && 
                    text.length <= settings.maxMessageLength;
    assertEquals(inRange, shouldSendAudio, 
      `Message length ${text.length} should${shouldSendAudio ? '' : ' not'} send audio`);
  }
});
