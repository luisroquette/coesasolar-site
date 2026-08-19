/**
 * Media Message Processor - Shared module for processing multimedia messages
 * 
 * Handles the processing of different media types from WhatsApp:
 * - Audio messages → Transcription
 * - Image messages → Analysis
 * - Document/PDF messages → Analysis
 * - Text messages with delay intent detection
 * 
 * @module _shared/media-message-processor
 * Extracted from sofia-webhook/index.ts (Phase 61 refactoring)
 */

import {
  transcribeAudio as transcribeAudioShared,
  analyzeImage as analyzeImageShared,
  analyzePDF as analyzePDFShared,
  type MediaAnalysisResult,
} from './media-handler.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MediaMessageContext {
  msgData: any;
  phone: string;
  capabilities: SofiaCapabilities;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  getMediaCapabilityMessage: (type: string, templates?: any) => string;
  getDelayIntentAcknowledgment: (templates?: any) => string;
  templateCache?: any;
  corsHeaders: Record<string, string>;
}

export interface SofiaCapabilities {
  transcricaoAudio: boolean;
  leituraImagens: boolean;
  leituraPdfs: boolean;
  enviarLinks: boolean;
  modoCloser: boolean;
}

export interface MediaProcessingResult {
  handled: boolean;
  shouldReturn: boolean;
  response?: Response;
  messageText: string | null;
  isTranscribedAudio: boolean;
  isAnalyzedImage: boolean;
  isAnalyzedDocument: boolean;
  detectedInvoice: boolean;
  mediaAnalysisResult: MediaAnalysisResult | null;
}

export interface DelayIntentResult {
  detected: boolean;
  shouldReturn: boolean;
  response?: Response;
}

// ═══════════════════════════════════════════════════════════════
// DELAY INTENT DETECTION
// ═══════════════════════════════════════════════════════════════

// DELAY INTENT: Phrases that indicate user will send something later
// IMPORTANT: These must be VERY specific to avoid false positives
// "minutos" was removed because it triggers on complaints like "3 mensagens em 5 minutos"
const DELAY_INTENT_PHRASES = [
  'já vou mandar', 'vou enviar', 'vou mandar', 'chegando em casa',
  'espera um pouco', 'daqui a pouco', 'daqui uns minutos', 'daqui alguns minutos',
  'quando chegar', 'mais tarde mando', 'já já mando', 'jaja mando', 'logo logo',
  'to chegando', 'estou chegando', 'tô chegando', 'em breve mando',
  'espera que vou', 'aguarda que vou', 'só um instante', 'só um momento',
  'peraí', 'pera aí', 'perai que', 'só um segundo'
];

// Patterns that INVALIDATE delay intent (questions, complaints, context indicators)
const DELAY_INTENT_BLOCKERS = [
  // Questions and complaints
  'por que', 'pq', 'porque', 'por qual', 'qual motivo', 'como assim',
  'repetid', 'duplicad', 'spam', 'erro', 'problema', 'bug',
  'mandou', 'enviou', 'receb', // References to past messages
  'janela de', 'em uma janela',
  '?', // Questions are NOT delay intent
  
  // Email/data context - user is providing info, not delaying
  '@', '.com', '.br', 'gmail', 'hotmail', 'outlook', 'yahoo',
  'meu email', 'meu e-mail', 'meu nome', 'meu cpf', 'meu telefone',
  'r$', 'reais', 'conta de luz', 'fatura',
  
  // Already in conversation context
  'proposta', 'contrato', 'desconto', 'economia', 'simulação',
];

const MEDIA_MENTION_PHRASES = [
  'enviei', 'mandei', 'segue', 'essa é minha conta', 'essa é minha fatura',
  'veja minha', 'olha aqui', 'olha a minha', 'tá aqui', 'está aqui',
  'minha conta de luz', 'minha fatura', 'enviando', 'mandando',
  'segue a foto', 'segue a fatura', 'essa aqui é', 'aqui está'
];

/**
 * Detect if the message indicates the user will send content later
 * Returns false if the message contains blocking patterns (complaints, questions, etc.)
 */
export function detectDelayIntent(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // NEW: Se contém blocker (reclamação, pergunta, etc.), não é delay intent
  const hasBlocker = DELAY_INTENT_BLOCKERS.some(blocker => lowerText.includes(blocker));
  if (hasBlocker) {
    console.log(`[MEDIA_PROCESSOR] Delay intent blocked by pattern match`);
    return false;
  }
  
  const hasDelayIntent = DELAY_INTENT_PHRASES.some(phrase => lowerText.includes(phrase));
  const isShortMessage = text.length < 100;
  return hasDelayIntent && isShortMessage;
}

/**
 * Detect if the message mentions media being sent
 */
export function detectMediaMention(text: string): boolean {
  const lowerText = text.toLowerCase();
  const mentionsMedia = MEDIA_MENTION_PHRASES.some(phrase => lowerText.includes(phrase));
  const isShortMessage = text.length < 100;
  return mentionsMedia && isShortMessage;
}

// ═══════════════════════════════════════════════════════════════
// AUDIO MESSAGE PROCESSING
// ═══════════════════════════════════════════════════════════════

export interface AudioProcessingParams {
  msgData: any;
  phone: string;
  capabilities: SofiaCapabilities;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  getMediaCapabilityMessage: (type: string, templates?: any) => string;
  templateCache?: any;
  corsHeaders: Record<string, string>;
}

export interface AudioProcessingResult {
  handled: boolean;
  shouldReturn: boolean;
  response?: Response;
  messageText: string | null;
  isTranscribedAudio: boolean;
}

export async function processAudioMessage(params: AudioProcessingParams): Promise<AudioProcessingResult> {
  const { msgData, phone, capabilities, sendMessage, getMediaCapabilityMessage, templateCache, corsHeaders } = params;

  // Check if audio transcription is enabled
  if (!capabilities.transcricaoAudio) {
    console.log('[MEDIA_PROCESSOR] Audio transcription disabled, asking for text');
    await sendMessage(phone, getMediaCapabilityMessage('audio_disabled', templateCache));
    return {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ 
        status: 'capability_disabled',
        capability: 'transcricaoAudio',
        reason: 'Audio transcription is disabled'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isTranscribedAudio: false,
    };
  }
  
  // Get audio URL
  const audioUrl = msgData.message?.url || msgData.message?.file?.link;
  
  if (!audioUrl) {
    // CORREÇÃO: Quando áudio chega sem URL, enviar feedback ao usuário
    // Isso acontece quando o Z-API não consegue processar o arquivo de áudio
    console.log('[MEDIA_PROCESSOR] Audio message without URL - sending feedback to user. Message object:', JSON.stringify(msgData.message));
    await sendMessage(phone, getMediaCapabilityMessage('audio_inaudible', templateCache));
    return {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ 
        status: 'audio_no_url',
        reason: 'Audio message received without URL - user notified to send text'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isTranscribedAudio: false,
    };
  }

  console.log(`[MEDIA_PROCESSOR] Processing audio message from ${phone}, duration: ${msgData.message?.duration}s, URL: ${audioUrl.substring(0, 50)}...`);
  
  const transcription = await transcribeAudioShared(audioUrl);
  
  // Check if transcription failed or audio was inaudible
  const isInaudible = !transcription || 
                      transcription.trim() === '' || 
                      transcription.includes('[ÁUDIO INAUDÍVEL]') ||
                      transcription.length < 3;
  
  if (isInaudible) {
    console.log(`[MEDIA_PROCESSOR] Audio inaudible or transcription failed. Result: "${transcription?.substring(0, 50) || 'null'}"`);
    await sendMessage(phone, getMediaCapabilityMessage('audio_inaudible', templateCache));
    return {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ 
        status: 'audio_inaudible',
        reason: 'Could not transcribe audio - inaudible'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isTranscribedAudio: false,
    };
  }
  
  console.log(`[MEDIA_PROCESSOR] Audio transcribed successfully: "${transcription.substring(0, 100)}..."`);
  
  return {
    handled: true,
    shouldReturn: false,
    messageText: transcription,
    isTranscribedAudio: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// IMAGE MESSAGE PROCESSING
// ═══════════════════════════════════════════════════════════════

export interface ImageProcessingParams {
  msgData: any;
  phone: string;
  capabilities: SofiaCapabilities;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  getMediaCapabilityMessage: (type: string, templates?: any) => string;
  templateCache?: any;
  corsHeaders: Record<string, string>;
}

export interface ImageProcessingResult {
  handled: boolean;
  shouldReturn: boolean;
  response?: Response;
  messageText: string | null;
  isAnalyzedImage: boolean;
  detectedInvoice: boolean;
  mediaAnalysisResult: MediaAnalysisResult | null;
}

export async function processImageMessage(params: ImageProcessingParams): Promise<ImageProcessingResult> {
  const { msgData, phone, capabilities, sendMessage, getMediaCapabilityMessage, templateCache, corsHeaders } = params;

  // Check if image analysis is enabled
  if (!capabilities.leituraImagens) {
    console.log('[MEDIA_PROCESSOR] Image analysis disabled, asking for text description');
    await sendMessage(phone, getMediaCapabilityMessage('image_disabled', templateCache));
    return {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ 
        status: 'capability_disabled',
        capability: 'leituraImagens',
        reason: 'Image analysis is disabled'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isAnalyzedImage: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
  }
  
  // Get image URL
  const imageUrl = msgData.message?.url || msgData.message?.file?.link;
  const caption = msgData.message?.caption;
  
  if (!imageUrl) {
    console.log('[MEDIA_PROCESSOR] Image message without URL, ignoring. Message object:', JSON.stringify(msgData.message));
    return {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ status: 'ignored', reason: 'image without URL' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isAnalyzedImage: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
  }

  console.log(`[MEDIA_PROCESSOR] Processing image from ${phone}, URL: ${imageUrl.substring(0, 50)}...${caption ? `, caption: "${caption}"` : ''}`);
  
  const imageAnalysisResult = await analyzeImageShared(imageUrl, caption || undefined);
  
  if (imageAnalysisResult && imageAnalysisResult.analysis.trim()) {
    const messageText = caption 
      ? `[Legenda: ${caption}] [Análise da imagem: ${imageAnalysisResult.analysis}]`
      : `[Análise da imagem: ${imageAnalysisResult.analysis}]`;
    
    console.log(`[MEDIA_PROCESSOR] Image analyzed successfully: "${imageAnalysisResult.analysis.substring(0, 100)}..."${imageAnalysisResult.isInvoice ? ' [FATURA DETECTADA]' : ''}`);
    
    return {
      handled: true,
      shouldReturn: false,
      messageText,
      isAnalyzedImage: true,
      detectedInvoice: imageAnalysisResult.isInvoice,
      mediaAnalysisResult: imageAnalysisResult,
    };
  }
  
  console.log('[MEDIA_PROCESSOR] Failed to analyze image, sending fallback message');
  await sendMessage(phone, getMediaCapabilityMessage('image_analysis_failed', templateCache));
  return {
    handled: true,
    shouldReturn: true,
    response: new Response(JSON.stringify({ 
      status: 'image_analysis_failed',
      reason: 'Could not analyze image'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
    messageText: null,
    isAnalyzedImage: false,
    detectedInvoice: false,
    mediaAnalysisResult: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT/PDF MESSAGE PROCESSING
// ═══════════════════════════════════════════════════════════════

export interface DocumentProcessingParams {
  msgData: any;
  phone: string;
  capabilities: SofiaCapabilities;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  getMediaCapabilityMessage: (type: string, templates?: any) => string;
  templateCache?: any;
  corsHeaders: Record<string, string>;
}

export interface DocumentProcessingResult {
  handled: boolean;
  shouldReturn: boolean;
  response?: Response;
  messageText: string | null;
  isAnalyzedDocument: boolean;
  detectedInvoice: boolean;
  mediaAnalysisResult: MediaAnalysisResult | null;
}

export async function processDocumentMessage(params: DocumentProcessingParams): Promise<DocumentProcessingResult> {
  const { msgData, phone, capabilities, sendMessage, getMediaCapabilityMessage, templateCache, corsHeaders } = params;

  // Check if PDF analysis is enabled
  if (!capabilities.leituraPdfs) {
    console.log('[MEDIA_PROCESSOR] PDF analysis disabled, asking for image or text');
    await sendMessage(phone, getMediaCapabilityMessage('pdf_disabled', templateCache));
    return {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ 
        status: 'capability_disabled',
        capability: 'leituraPdfs',
        reason: 'PDF analysis is disabled'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isAnalyzedDocument: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
  }
  
  // Get document URL
  const docUrl = msgData.message?.url || msgData.message?.file?.link;
  const mimeType = msgData.message?.mimeType || msgData.message?.file?.contentType;
  const fileName = msgData.message?.fileName || msgData.message?.file?.name;
  
  const isPDF = mimeType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf');
  
  if (!docUrl) {
    console.log('[MEDIA_PROCESSOR] Document message without URL, ignoring. Message object:', JSON.stringify(msgData.message));
    return {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ status: 'ignored', reason: 'document without URL' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isAnalyzedDocument: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
  }

  if (!isPDF) {
    console.log(`[MEDIA_PROCESSOR] Unsupported document type: ${mimeType}, file: ${fileName}`);
    await sendMessage(phone, getMediaCapabilityMessage('unsupported_document', templateCache));
    return {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ 
        status: 'unsupported_document_type',
        mimeType,
        fileName
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isAnalyzedDocument: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
  }

  console.log(`[MEDIA_PROCESSOR] Processing PDF from ${phone}: ${fileName || 'unnamed.pdf'}`);
  
  const pdfAnalysisResult = await analyzePDFShared(docUrl, fileName || undefined);
  
  if (pdfAnalysisResult && pdfAnalysisResult.analysis.trim()) {
    const messageText = `[Documento PDF: ${fileName || 'arquivo.pdf'}] [Conteúdo: ${pdfAnalysisResult.analysis}]`;
    
    console.log(`[MEDIA_PROCESSOR] PDF analyzed successfully: "${pdfAnalysisResult.analysis.substring(0, 100)}..."${pdfAnalysisResult.isInvoice ? ' [FATURA DETECTADA]' : ''}`);
    
    return {
      handled: true,
      shouldReturn: false,
      messageText,
      isAnalyzedDocument: true,
      detectedInvoice: pdfAnalysisResult.isInvoice,
      mediaAnalysisResult: pdfAnalysisResult,
    };
  }
  
  console.log('[MEDIA_PROCESSOR] Failed to analyze PDF, sending fallback message');
  await sendMessage(phone, getMediaCapabilityMessage('pdf_analysis_failed', templateCache));
  return {
    handled: true,
    shouldReturn: true,
    response: new Response(JSON.stringify({ 
      status: 'pdf_analysis_failed',
      reason: 'Could not analyze PDF'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
    messageText: null,
    isAnalyzedDocument: false,
    detectedInvoice: false,
    mediaAnalysisResult: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

export interface ProcessMediaMessageParams {
  msgData: any;
  phone: string;
  capabilities: SofiaCapabilities;
  requestAgentId: string;
  supabase: any;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  getMediaCapabilityMessage: (type: string, templates?: any) => string;
  getDelayIntentAcknowledgment: (templates?: any) => string;
  templateCache?: any;
  corsHeaders: Record<string, string>;
}

export async function processMediaMessage(params: ProcessMediaMessageParams): Promise<MediaProcessingResult> {
  const { 
    msgData, 
    phone, 
    capabilities, 
    requestAgentId,
    supabase,
    sendMessage, 
    getMediaCapabilityMessage, 
    getDelayIntentAcknowledgment,
    templateCache, 
    corsHeaders 
  } = params;

  const messageType = msgData.type?.toLowerCase() || '';
  const isAudioMessage = ['voice', 'audio', 'ptt'].includes(messageType);
  const isImageMessage = ['image', 'photo', 'picture', 'sticker'].includes(messageType);
  const isDocumentMessage = ['document', 'file'].includes(messageType);
  
  console.log(`[MEDIA_PROCESSOR] Message type: "${messageType}", Audio: ${isAudioMessage}, Image: ${isImageMessage}, Document: ${isDocumentMessage}`);

  // Default result
  let result: MediaProcessingResult = {
    handled: false,
    shouldReturn: false,
    messageText: null,
    isTranscribedAudio: false,
    isAnalyzedImage: false,
    isAnalyzedDocument: false,
    detectedInvoice: false,
    mediaAnalysisResult: null,
  };

  if (isAudioMessage) {
    const audioResult = await processAudioMessage({
      msgData,
      phone,
      capabilities,
      sendMessage,
      getMediaCapabilityMessage,
      templateCache,
      corsHeaders,
    });
    
    result = {
      handled: audioResult.handled,
      shouldReturn: audioResult.shouldReturn,
      response: audioResult.response,
      messageText: audioResult.messageText,
      isTranscribedAudio: audioResult.isTranscribedAudio,
      isAnalyzedImage: false,
      isAnalyzedDocument: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
    
  } else if (isImageMessage) {
    const imageResult = await processImageMessage({
      msgData,
      phone,
      capabilities,
      sendMessage,
      getMediaCapabilityMessage,
      templateCache,
      corsHeaders,
    });
    
    result = {
      handled: imageResult.handled,
      shouldReturn: imageResult.shouldReturn,
      response: imageResult.response,
      messageText: imageResult.messageText,
      isTranscribedAudio: false,
      isAnalyzedImage: imageResult.isAnalyzedImage,
      isAnalyzedDocument: false,
      detectedInvoice: imageResult.detectedInvoice,
      mediaAnalysisResult: imageResult.mediaAnalysisResult,
    };
    
  } else if (isDocumentMessage) {
    const docResult = await processDocumentMessage({
      msgData,
      phone,
      capabilities,
      sendMessage,
      getMediaCapabilityMessage,
      templateCache,
      corsHeaders,
    });
    
    result = {
      handled: docResult.handled,
      shouldReturn: docResult.shouldReturn,
      response: docResult.response,
      messageText: docResult.messageText,
      isTranscribedAudio: false,
      isAnalyzedImage: false,
      isAnalyzedDocument: docResult.isAnalyzedDocument,
      detectedInvoice: docResult.detectedInvoice,
      mediaAnalysisResult: docResult.mediaAnalysisResult,
    };
    
  } else if (messageType === 'text') {
    const textContent = msgData.message?.text || msgData.message?.caption || null;
    
    if (textContent) {
      // Check for delay intent
      if (detectDelayIntent(textContent)) {
        console.log(`[MEDIA_PROCESSOR] Detected delay intent: "${textContent}". Sending brief acknowledgment.`);
        await sendMessage(phone, getDelayIntentAcknowledgment(templateCache));
        
        // Update conversation to show we're awaiting response
        const { data: existingConversa } = await supabase
          .from('chatbot_conversas')
          .select('id')
          .eq('cliente_telefone', phone)
          .eq('agent_id', requestAgentId)
          .eq('whatsapp_provider', 'zapi')
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (existingConversa) {
          await supabase
            .from('chatbot_conversas')
            .update({ last_message_at: new Date().toISOString(), awaiting_response: true })
            .eq('id', existingConversa.id);
        }
        
        result = {
          handled: true,
          shouldReturn: true,
          response: new Response(JSON.stringify({ 
            status: 'delay_intent_acknowledged',
            message: 'Client indicated will send later'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }),
          messageText: null,
          isTranscribedAudio: false,
          isAnalyzedImage: false,
          isAnalyzedDocument: false,
          detectedInvoice: false,
          mediaAnalysisResult: null,
        };
      } else {
        // Check for media mention and wait briefly
        if (detectMediaMention(textContent)) {
          console.log(`[MEDIA_PROCESSOR] Detected media mention in text: "${textContent}". Waiting 2s for possible image...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        result = {
          handled: true,
          shouldReturn: false,
          messageText: textContent,
          isTranscribedAudio: false,
          isAnalyzedImage: false,
          isAnalyzedDocument: false,
          detectedInvoice: false,
          mediaAnalysisResult: null,
        };
      }
    }
  } else {
    console.log('[MEDIA_PROCESSOR] Ignoring unsupported message type:', messageType);
    result = {
      handled: true,
      shouldReturn: true,
      response: new Response(JSON.stringify({ status: 'ignored', reason: `unsupported type: ${messageType}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isTranscribedAudio: false,
      isAnalyzedImage: false,
      isAnalyzedDocument: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
  }

  return result;
}
