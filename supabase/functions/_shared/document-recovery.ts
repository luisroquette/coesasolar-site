/**
 * Document Recovery Module
 * Centralized logic for recovering missed/unprocessed documents from webhook history
 * Extracted from sofia-webhook/index.ts for reuse across Edge Functions
 */

import type { ExtractedClientData } from './data-extraction.ts';
import {
  detectDocumentType as detectDocumentTypeShared,
  verificarDocumentosCompletos,
  type DocumentCheckResult,
} from './document-handler.ts';
import {
  analyzeImage,
} from './media-handler.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RecoveredDocument {
  tipo: string;
  mediaUrl: string;
  messageId: string;
  receivedAt: string;
}

export interface DocumentRecoveryResult {
  recovered: RecoveredDocument[];
  newArquivos: string[];
  extractedData: ExtractedClientData;
}

export interface DocumentFallbackResult {
  triggered: boolean;
  hasAllDocuments: boolean;
  missingDocuments: string[];
  message: string;
  shouldEscalate: boolean;
  recoveredDocuments?: string[];
}

// ═══════════════════════════════════════════════════════════════
// AUTOMATIC DOCUMENT HISTORY SEARCH AND RECOVERY
// ═══════════════════════════════════════════════════════════════

/**
 * Searches webhook history for unprocessed documents and recovers them
 */
export async function searchAndRecoverDocuments(
  supabase: any,
  phone: string,
  conversaId: string,
  existingArquivos: string[] | null,
  dadosColetados: ExtractedClientData
): Promise<DocumentRecoveryResult> {
  console.log(`[DOC-RECOVERY] Searching webhook history for ${phone}`);

  const result: DocumentRecoveryResult = {
    recovered: [],
    newArquivos: [...(existingArquivos || [])],
    extractedData: { ...dadosColetados },
  };

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: webhookEvents, error } = await supabase
      .from('whatsapp_webhook_events')
      .select('id, received_at, body_parsed, message_preview, event_type')
      .eq('phone', phone)
      .eq('event_type', 'ReceivedCallback')
      .gte('received_at', twentyFourHoursAgo)
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error(`[DOC-RECOVERY] Error fetching webhook events:`, error);
      return result;
    }

    console.log(`[DOC-RECOVERY] Found ${webhookEvents?.length || 0} webhook events to analyze`);

    if (!webhookEvents || webhookEvents.length === 0) {
      return result;
    }

    for (const event of webhookEvents) {
      const body = event.body_parsed as Record<string, unknown> | null;
      if (!body) continue;

      let mediaUrl: string | null = null;
      let mediaType: 'image' | 'document' | null = null;
      let fileName: string | null = null;

      // Check for image
      if (body.image) {
        const imageData = body.image as Record<string, unknown>;
        mediaUrl = (imageData.imageUrl || imageData.url) as string | null;
        mediaType = 'image';
      }

      // Check for document
      if (body.document) {
        const docData = body.document as Record<string, unknown>;
        mediaUrl = (docData.documentUrl || docData.url) as string | null;
        mediaType = 'document';
        fileName = (docData.fileName || docData.title) as string | null;
      }

      if (!mediaUrl || !mediaType) continue;

      console.log(`[DOC-RECOVERY] Analyzing media from event ${event.id}...`);

      try {
        let analysisText: string | null = null;

        if (mediaType === 'image') {
          const imageResult = await analyzeImage(mediaUrl);
          if (imageResult) {
            analysisText = imageResult.analysis;
          }
        } else if (mediaType === 'document' && fileName) {
          const lowerFileName = fileName.toLowerCase();

          if (lowerFileName.includes('cnh') || lowerFileName.includes('rg') ||
              lowerFileName.includes('identidade') || lowerFileName.includes('documento')) {
            analysisText = `Documento de identidade detectado: ${fileName}. CNH, carteira de identidade, RG.`;
          } else if (lowerFileName.includes('fatura') || lowerFileName.includes('cemig') ||
                     lowerFileName.includes('coelba') || lowerFileName.includes('cpfl') ||
                     lowerFileName.includes('conta') || lowerFileName.includes('luz') ||
                     lowerFileName.includes('energia')) {
            analysisText = `Fatura de energia detectada: ${fileName}. Conta de luz, consumo kWh, distribuidora.`;
          } else if (lowerFileName.includes('contrato') || lowerFileName.includes('social') ||
                     lowerFileName.includes('alteracao') || lowerFileName.includes('estatuto') ||
                     lowerFileName.includes('constituicao') || lowerFileName.includes('ltda')) {
            analysisText = `Contrato social detectado: ${fileName}. Razão social, sócios, capital social.`;
          } else {
            console.log(`[DOC-RECOVERY] Unknown PDF type for ${fileName}, skipping`);
            continue;
          }
        }

        if (!analysisText) continue;

        const tipoDocumento = detectDocumentTypeShared(analysisText);
        console.log(`[DOC-RECOVERY] Detected type: ${tipoDocumento} from event ${event.id}`);

        if (tipoDocumento === 'unknown') continue;

        const tipoKey = tipoDocumento === 'fatura' ? 'fatura' :
                       tipoDocumento === 'documento_identidade' ? 'documento_identidade' :
                       tipoDocumento === 'contrato_social' ? 'contrato_social' : null;

        if (!tipoKey || result.newArquivos.includes(tipoKey)) continue;

        result.recovered.push({
          tipo: tipoDocumento,
          mediaUrl,
          messageId: event.id,
          receivedAt: event.received_at,
        });

        result.newArquivos.push(tipoKey);
        console.log(`[DOC-RECOVERY] Recovered document: ${tipoDocumento}`);

      } catch (analysisError) {
        console.error(`[DOC-RECOVERY] Error analyzing media:`, analysisError);
        continue;
      }
    }

    // Update database if documents were recovered
    if (result.recovered.length > 0) {
      console.log(`[DOC-RECOVERY] Recovered ${result.recovered.length} documents, updating database`);

      await supabase
        .from('chatbot_conversas')
        .update({
          arquivos_anexados: result.newArquivos,
          dados_coletados: result.extractedData,
        })
        .eq('id', conversaId);

      // Log each recovered document
      for (const recoveredDoc of result.recovered) {
        try {
          await supabase
            .from('document_recovery_logs')
            .insert({
              conversa_id: conversaId,
              cliente_telefone: phone,
              document_type: recoveredDoc.tipo === 'fatura' ? 'conta_luz' :
                            recoveredDoc.tipo === 'documento_identidade' ? 'documento_identificacao' :
                            recoveredDoc.tipo,
              document_url: recoveredDoc.mediaUrl,
              document_name: `${recoveredDoc.tipo}_recovered`,
              recovery_source: 'complaint_triggered',
              original_event_id: recoveredDoc.messageId,
              original_event_at: recoveredDoc.receivedAt,
              was_successful: true,
              all_docs_complete: false,
            });
        } catch (logErr) {
          console.error(`[DOC-RECOVERY] Error logging recovery:`, logErr);
        }
      }
    }

  } catch (err) {
    console.error(`[DOC-RECOVERY] Exception:`, err);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT COMPLAINT FALLBACK HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handles document complaint fallback - when client claims they already sent docs
 */
export async function handleDocumentComplaintFallback(
  supabase: any,
  conversaId: string,
  phone: string,
  clienteNome: string | null,
  arquivosAnexados: string[] | null,
  dadosColetados: ExtractedClientData,
  bitrixLeadId: string | null,
  agentName?: string
): Promise<DocumentFallbackResult> {
  console.log(`[DOC-FALLBACK] Handling document complaint for ${phone}`);

  // Try to recover documents first
  const recoveryResult = await searchAndRecoverDocuments(
    supabase,
    phone,
    conversaId,
    arquivosAnexados,
    dadosColetados
  );

  const effectiveArquivos = recoveryResult.newArquivos;
  const effectiveDados = recoveryResult.extractedData;
  const recoveredDocs = recoveryResult.recovered;

  const docCheck = verificarDocumentosCompletos(effectiveArquivos, effectiveDados);

  const result: DocumentFallbackResult = {
    triggered: true,
    hasAllDocuments: docCheck.completo,
    missingDocuments: docCheck.faltando,
    message: '',
    shouldEscalate: false,
    recoveredDocuments: recoveredDocs.map(d => d.tipo),
  };

  const recoveredMessage = recoveredDocs.length > 0
    ? `🔍 *Boa notícia!* Encontrei ${recoveredDocs.length} documento(s) no histórico:\n` +
      recoveredDocs.map(d => `• ${d.tipo === 'fatura' ? 'Fatura de energia' : d.tipo === 'documento_identidade' ? 'Documento de identidade' : 'Contrato social'}`).join('\n') + '\n\n'
    : '';

  if (docCheck.completo) {
    result.message = recoveredMessage +
      `📋 *Perfeito!* Já tenho todos os seus documentos registrados:\n\n` +
      `${(effectiveArquivos || []).map((doc: string) => {
        if (doc === 'fatura') return '✅ Fatura de energia';
        if (doc === 'documento_identidade') return '✅ Documento de identidade';
        if (doc === 'contrato_social') return '✅ Contrato social';
        return `✅ ${doc}`;
      }).join('\n')}\n\n` +
      `Sua proposta definitiva já está sendo processada! 🚀`;

    // Move lead to proposta definitiva
    if (bitrixLeadId) {
      try {
        const { data: bitrixConfig } = await supabase
          .from('configuracoes_sistema')
          .select('valor')
          .eq('chave', 'bitrix24_webhook_url')
          .single();

        if (bitrixConfig?.valor) {
          await fetch(`${bitrixConfig.valor}crm.lead.update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: bitrixLeadId,
              fields: { STATUS_ID: 'UC_JENEX5' },
            }),
          });

          await supabase
            .from('chatbot_conversas')
            .update({
              bitrix24_stage: 'UC_JENEX5',
              sofia_mode: 'proposta_definitiva',
              all_docs_complete_at: new Date().toISOString(),
            })
            .eq('id', conversaId);
        }
      } catch (err) {
        console.error(`[DOC-FALLBACK] Error moving lead:`, err);
      }
    }
  } else {
    const receivedDocs = (effectiveArquivos || []).map((doc: string) => {
      if (doc === 'fatura') return 'fatura de energia';
      if (doc === 'documento_identidade') return 'documento de identidade';
      if (doc === 'contrato_social') return 'contrato social';
      return doc;
    });

    const receivedList = receivedDocs.length > 0
      ? receivedDocs.map((d: string) => `✅ ${d}`).join('\n')
      : '(nenhum documento recebido ainda)';

    result.message = recoveredMessage +
      `📋 Deixa eu verificar o que já recebi...\n\n` +
      `*Documentos que já tenho:*\n${receivedList}\n\n` +
      `*Ainda falta:*\n${docCheck.faltando.map((d: string) => `❌ ${d}`).join('\n')}\n\n` +
      `Pode enviar novamente ${docCheck.faltando.length === 1 ? 'esse documento' : 'esses documentos'}? 📷`;

    // Create admin notification
    await supabase.from('admin_notifications').insert({
      admin_user_id: null,
      title: recoveredDocs.length > 0
        ? '🔄 Recuperação automática de documentos'
        : '⚠️ Cliente reclama de documentos não recebidos',
      message: `${clienteNome || phone}: Faltam: ${docCheck.faltando.join(', ')}`,
      type: recoveredDocs.length > 0 ? 'info' : 'warning',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId,
      created_by_nome: agentName || 'IA',
    });
  }

  return result;
}
