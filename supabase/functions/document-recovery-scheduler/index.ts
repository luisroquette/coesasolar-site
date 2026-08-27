import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.90.0";
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';

/**
 * document-recovery-scheduler: Internal cron-triggered scheduler
 * SECURITY: Uses strict CORS (internal API)
 */

interface WebhookEvent {
  id: string;
  phone: string;
  body_parsed: any;
  received_at: string;
  processing_status: string;
}

interface ConversaData {
  id: string;
  cliente_telefone: string;
  proposta_id: string | null;
  bitrix24_lead_id: string | null;
  arquivos_anexados: any[];
  dados_coletados: any;
  sofia_mode: string | null;
  bitrix24_stage: string | null;
}

interface RecoveryLog {
  conversa_id: string;
  cliente_telefone: string;
  document_type: string;
  document_url: string;
  document_name: string;
  recovery_source: string;
  original_event_id: string;
  original_event_at: string;
  was_successful: boolean;
  error_message?: string;
  bitrix_lead_id?: string;
  bitrix_stage_before?: string;
  bitrix_stage_after?: string;
  all_docs_complete: boolean;
}

// Document types we're looking for
const DOCUMENT_TYPES = ['conta_luz', 'documento_identificacao', 'contrato_social'];

// Analyze image using OpenAI Vision
async function analyzeImage(imageUrl: string, openaiApiKey: string): Promise<{ analysis: string; documentType: string | null }> {
  console.log(`[RECOVERY] Analyzing image: ${imageUrl.substring(0, 100)}...`);
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um analisador de documentos. Analise a imagem e determine se é um dos seguintes documentos:
            - CONTA_LUZ: Conta de energia elétrica/luz
            - CNH: Carteira Nacional de Habilitação
            - RG: Documento de identidade
            - CPF: Cadastro de Pessoa Física
            - CONTRATO_SOCIAL: Contrato social de empresa
            - OUTRO: Qualquer outro documento ou imagem
            
            Responda APENAS com o tipo do documento em maiúsculas, seguido de uma breve descrição.
            Formato: TIPO_DOCUMENTO: descrição breve`
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              },
              {
                type: 'text',
                text: 'Que tipo de documento é este?'
              }
            ]
          }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error(`[RECOVERY] OpenAI API error: ${response.status}`);
      return { analysis: 'Erro na análise', documentType: null };
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || 'Análise não disponível';
    
    // Detect document type from analysis
    let documentType: string | null = null;
    const upperAnalysis = analysis.toUpperCase();
    
    if (upperAnalysis.includes('CONTA_LUZ') || upperAnalysis.includes('CONTA DE LUZ') || upperAnalysis.includes('ENERGIA')) {
      documentType = 'conta_luz';
    } else if (upperAnalysis.includes('CNH') || upperAnalysis.includes('HABILITAÇÃO')) {
      documentType = 'documento_identificacao';
    } else if (upperAnalysis.includes('RG') || upperAnalysis.includes('IDENTIDADE')) {
      documentType = 'documento_identificacao';
    } else if (upperAnalysis.includes('CPF')) {
      documentType = 'documento_identificacao';
    } else if (upperAnalysis.includes('CONTRATO_SOCIAL') || upperAnalysis.includes('CONTRATO SOCIAL')) {
      documentType = 'contrato_social';
    }
    
    console.log(`[RECOVERY] Analysis result: ${analysis}, detected type: ${documentType}`);
    return { analysis, documentType };
  } catch (error) {
    console.error(`[RECOVERY] Error analyzing image:`, error);
    return { analysis: 'Erro na análise', documentType: null };
  }
}

// Dynamic requirements - loaded from config
let dynamicRequiredFilesDefinitiva: string[] = ['conta_luz', 'documento_identificacao'];

function loadDynamicRequirements(config: Record<string, string>): void {
  // Load dynamic required files for PROPOSTA_DEFINITIVA
  if (config.automation_required_files_definitiva) {
    try {
      const parsed = JSON.parse(config.automation_required_files_definitiva);
      if (Array.isArray(parsed)) {
        // Map internal names to recovery names if needed
        dynamicRequiredFilesDefinitiva = parsed.map((f: string) => {
          if (f === 'fatura') return 'conta_luz';
          return f;
        });
        console.log(`[document-recovery-scheduler] Loaded ${dynamicRequiredFilesDefinitiva.length} required files from config`);
      }
    } catch (e) {
      console.warn('[document-recovery-scheduler] Failed to parse automation_required_files_definitiva:', e);
    }
  }
}

// Check if a conversation has missing documents
function getMissingDocuments(arquivos: any[], isPJ: boolean): string[] {
  // Use dynamic requirements
  const requiredDocs = isPJ 
    ? [...dynamicRequiredFilesDefinitiva, 'contrato_social']
    : dynamicRequiredFilesDefinitiva;
  
  // Ensure unique values
  const uniqueRequired = [...new Set(requiredDocs)];
  
  const receivedTypes = arquivos.map(a => a.tipo);
  return uniqueRequired.filter(doc => !receivedTypes.includes(doc));
}

// Log recovery attempt to database
async function logRecoveryAttempt(supabase: any, log: RecoveryLog): Promise<void> {
  try {
    const { error } = await supabase
      .from('document_recovery_logs')
      .insert(log);
    
    if (error) {
      console.error('[RECOVERY] Error logging recovery attempt:', error);
    }
  } catch (e) {
    console.error('[RECOVERY] Exception logging recovery attempt:', e);
  }
}

// Update aggregated metrics
async function updateRecoveryMetrics(supabase: any, logs: RecoveryLog[]): Promise<void> {
  if (logs.length === 0) return;
  
  const today = new Date().toISOString().split('T')[0];
  
  // Group logs by document_type and recovery_source
  const groups: Record<string, { successful: number; failed: number; complete: number }> = {};
  
  for (const log of logs) {
    const key = `${log.document_type}|${log.recovery_source}`;
    if (!groups[key]) {
      groups[key] = { successful: 0, failed: 0, complete: 0 };
    }
    if (log.was_successful) {
      groups[key].successful++;
      if (log.all_docs_complete) {
        groups[key].complete++;
      }
    } else {
      groups[key].failed++;
    }
  }
  
  // Upsert metrics for each group
  for (const [key, stats] of Object.entries(groups)) {
    const [docType, source] = key.split('|');
    
    try {
      // Try to get existing record
      const { data: existing } = await supabase
        .from('document_recovery_metrics')
        .select('*')
        .eq('metric_date', today)
        .eq('document_type', docType)
        .eq('recovery_source', source)
        .single();
      
      if (existing) {
        // Update existing
        await supabase
          .from('document_recovery_metrics')
          .update({
            total_attempts: existing.total_attempts + stats.successful + stats.failed,
            successful_recoveries: existing.successful_recoveries + stats.successful,
            failed_recoveries: existing.failed_recoveries + stats.failed,
            led_to_complete_docs: existing.led_to_complete_docs + stats.complete,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        // Insert new
        await supabase
          .from('document_recovery_metrics')
          .insert({
            metric_date: today,
            document_type: docType,
            recovery_source: source,
            total_attempts: stats.successful + stats.failed,
            successful_recoveries: stats.successful,
            failed_recoveries: stats.failed,
            led_to_complete_docs: stats.complete
          });
      }
    } catch (e) {
      console.error('[RECOVERY] Error updating metrics:', e);
    }
  }
}

// Process a single conversation for document recovery
async function processConversation(
  supabase: any,
  conversa: ConversaData,
  webhookEvents: WebhookEvent[],
  openaiApiKey: string
): Promise<{ recovered: number; conversaId: string; logs: RecoveryLog[] }> {
  console.log(`[RECOVERY] Processing conversa ${conversa.id} for phone ${conversa.cliente_telefone}`);
  
  const arquivosAnexados = conversa.arquivos_anexados || [];
  const dadosColetados = conversa.dados_coletados || {};
  const isPJ = dadosColetados.tipo_pessoa === 'PJ' || dadosColetados.cnpj;
  const recoveryLogs: RecoveryLog[] = [];
  
  const missingDocs = getMissingDocuments(arquivosAnexados, isPJ);
  
  if (missingDocs.length === 0) {
    console.log(`[RECOVERY] Conversa ${conversa.id} has all required documents`);
    return { recovered: 0, conversaId: conversa.id, logs: [] };
  }
  
  console.log(`[RECOVERY] Conversa ${conversa.id} missing: ${missingDocs.join(', ')}`);
  
  // Find webhook events for this phone with media
  const phoneEvents = webhookEvents.filter(e => {
    const normalizedEventPhone = e.phone?.replace(/\D/g, '');
    const normalizedConversaPhone = conversa.cliente_telefone?.replace(/\D/g, '');
    return normalizedEventPhone === normalizedConversaPhone;
  });
  
  console.log(`[RECOVERY] Found ${phoneEvents.length} webhook events for this phone`);
  
  let recoveredCount = 0;
  const newArquivos = [...arquivosAnexados];
  
  for (const event of phoneEvents) {
    try {
      const body = event.body_parsed;
      if (!body) continue;
      
      // Check for image
      const imageUrl = body.image?.imageUrl || body.imageUrl || body.image?.url;
      // Check for document
      const documentUrl = body.document?.documentUrl || body.documentUrl || body.document?.url;
      const documentName = body.document?.fileName || body.fileName || '';
      
      if (imageUrl) {
        // Check if this image was already processed
        const alreadyProcessed = newArquivos.some(a => a.url === imageUrl);
        if (alreadyProcessed) {
          console.log(`[RECOVERY] Image already processed: ${imageUrl.substring(0, 50)}...`);
          continue;
        }
        
        // Analyze the image
        const { analysis, documentType } = await analyzeImage(imageUrl, openaiApiKey);
        
        if (documentType && missingDocs.includes(documentType)) {
          console.log(`[RECOVERY] Recovered ${documentType} from image`);
          newArquivos.push({
            tipo: documentType,
            url: imageUrl,
            nome: `${documentType}_recuperado_${Date.now()}.jpg`,
            data_envio: event.received_at,
            analise: analysis,
            recuperado_automaticamente: true
          });
          recoveredCount++;
          
          // Log this recovery
          recoveryLogs.push({
            conversa_id: conversa.id,
            cliente_telefone: conversa.cliente_telefone,
            document_type: documentType,
            document_url: imageUrl,
            document_name: `${documentType}_recuperado_${Date.now()}.jpg`,
            recovery_source: 'scheduled_scan',
            original_event_id: event.id,
            original_event_at: event.received_at,
            was_successful: true,
            bitrix_lead_id: conversa.bitrix24_lead_id || undefined,
            bitrix_stage_before: conversa.bitrix24_stage || undefined,
            all_docs_complete: false // Will update later if all complete
          });
        }
      }
      
      if (documentUrl) {
        // Check if this document was already processed
        const alreadyProcessed = newArquivos.some(a => a.url === documentUrl);
        if (alreadyProcessed) {
          console.log(`[RECOVERY] Document already processed: ${documentUrl.substring(0, 50)}...`);
          continue;
        }
        
        // Try to detect type from filename
        let documentType: string | null = null;
        const lowerName = documentName.toLowerCase();
        
        if (lowerName.includes('conta') || lowerName.includes('luz') || lowerName.includes('energia') || lowerName.includes('fatura')) {
          documentType = 'conta_luz';
        } else if (lowerName.includes('cnh') || lowerName.includes('rg') || lowerName.includes('cpf') || lowerName.includes('identidade')) {
          documentType = 'documento_identificacao';
        } else if (lowerName.includes('contrato') || lowerName.includes('social') || lowerName.includes('cnpj')) {
          documentType = 'contrato_social';
        }
        
        if (documentType && missingDocs.includes(documentType)) {
          console.log(`[RECOVERY] Recovered ${documentType} from document: ${documentName}`);
          newArquivos.push({
            tipo: documentType,
            url: documentUrl,
            nome: documentName || `${documentType}_recuperado_${Date.now()}.pdf`,
            data_envio: event.received_at,
            recuperado_automaticamente: true
          });
          recoveredCount++;
          
          // Log this recovery
          recoveryLogs.push({
            conversa_id: conversa.id,
            cliente_telefone: conversa.cliente_telefone,
            document_type: documentType,
            document_url: documentUrl,
            document_name: documentName || `${documentType}_recuperado_${Date.now()}.pdf`,
            recovery_source: 'scheduled_scan',
            original_event_id: event.id,
            original_event_at: event.received_at,
            was_successful: true,
            bitrix_lead_id: conversa.bitrix24_lead_id || undefined,
            bitrix_stage_before: conversa.bitrix24_stage || undefined,
            all_docs_complete: false
          });
        }
      }
    } catch (error) {
      console.error(`[RECOVERY] Error processing event ${event.id}:`, error);
      
      // Log failed attempt
      recoveryLogs.push({
        conversa_id: conversa.id,
        cliente_telefone: conversa.cliente_telefone,
        document_type: 'unknown',
        document_url: '',
        document_name: '',
        recovery_source: 'scheduled_scan',
        original_event_id: event.id,
        original_event_at: event.received_at,
        was_successful: false,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        all_docs_complete: false
      });
    }
  }
  
  // Update conversation if we recovered any documents
  if (recoveredCount > 0) {
    console.log(`[RECOVERY] Updating conversa ${conversa.id} with ${recoveredCount} recovered documents`);
    
    const { error: updateError } = await supabase
      .from('chatbot_conversas')
      .update({
        arquivos_anexados: newArquivos,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversa.id);
    
    if (updateError) {
      console.error(`[RECOVERY] Error updating conversa:`, updateError);
      // Mark all logs as failed
      for (const log of recoveryLogs) {
        log.was_successful = false;
        log.error_message = updateError.message;
      }
    } else {
      // Check if all documents are now complete
      const stillMissing = getMissingDocuments(newArquivos, isPJ);
      const allComplete = stillMissing.length === 0;
      
      // Update all logs with completion status
      for (const log of recoveryLogs) {
        log.all_docs_complete = allComplete;
      }
      
      if (allComplete && conversa.bitrix24_lead_id) {
        console.log(`[RECOVERY] All documents recovered for ${conversa.id}, updating Bitrix24 stage`);
        
        // Get Bitrix24 webhook URL
        const { data: configData } = await supabase
          .from('configuracoes_sistema')
          .select('valor')
          .eq('chave', 'bitrix24_webhook_url')
          .single();
        
        if (configData?.valor) {
          try {
            // Update lead stage to Aguardando Assinatura
            const updateResponse = await fetch(`${configData.valor}/crm.lead.update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: conversa.bitrix24_lead_id,
                fields: {
                  STAGE_ID: 'UC_XIM123' // Aguardando Assinatura - ClickSign
                }
              })
            });
            
            if (updateResponse.ok) {
              console.log(`[RECOVERY] Successfully moved lead ${conversa.bitrix24_lead_id} to UC_XIM123`);
              
              // Update logs with new stage
              for (const log of recoveryLogs) {
                log.bitrix_stage_after = 'UC_XIM123';
              }
              
              // Add timeline comment
              await fetch(`${configData.valor}/crm.timeline.comment.add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fields: {
                    ENTITY_ID: conversa.bitrix24_lead_id,
                    ENTITY_TYPE: 'lead',
                    COMMENT: `🔄 RECUPERAÇÃO AUTOMÁTICA DE DOCUMENTOS\n\n` +
                      `${recoveredCount} documento(s) recuperado(s) automaticamente do histórico.\n` +
                      `Todos os documentos necessários estão completos.\n` +
                      `Lead movido para Aguardando Assinatura.`
                  }
                })
              });
              
              // Update conversa stage
              await supabase
                .from('chatbot_conversas')
                .update({
                  bitrix24_stage: 'UC_XIM123',
                  all_docs_complete_at: new Date().toISOString()
                })
                .eq('id', conversa.id);
            }
          } catch (bitrixError) {
            console.error(`[RECOVERY] Error updating Bitrix24:`, bitrixError);
          }
        }
      }
      
      // Create admin notification
      await supabase
        .from('admin_notifications')
        .insert({
          title: '🔄 Documentos Recuperados Automaticamente',
          message: `${recoveredCount} documento(s) recuperado(s) para ${conversa.cliente_telefone}. ` +
            `Documentos ainda faltando: ${stillMissing.length > 0 ? stillMissing.join(', ') : 'nenhum'}`,
          type: stillMissing.length === 0 ? 'success' : 'info',
          entity_type: 'chatbot_conversa',
          entity_id: conversa.id
        });
    }
    
    // Log all recovery attempts to database
    for (const log of recoveryLogs) {
      await logRecoveryAttempt(supabase, log);
    }
  }
  
  return { recovered: recoveredCount, conversaId: conversa.id, logs: recoveryLogs };
}

serve(async (req) => {
  // Internal API - strict CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }
  
  const corsHeaders = getStrictCorsHeaders(req);
  const startTime = Date.now();
  console.log('[RECOVERY] Starting proactive document recovery scan...');
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = (Deno.env.get('COESASOLAR_OPENROUTER_API_KEY') ?? Deno.env.get('OPENROUTER_API_KEY'))!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Load dynamic automation configuration
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .like('chave', 'automation_%');
    
    const config: Record<string, string> = {};
    configData?.forEach((c: any) => {
      config[c.chave] = c.valor;
    });
    
    // Load dynamic requirements from config
    loadDynamicRequirements(config);
    
    // Get conversations from the last 48 hours that:
    // 1. Have a proposta_id (meaning they're in the proposal flow)
    // 2. Are in the proposta_inicial stage or similar
    // 3. Have incomplete documents
    const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    const { data: conversas, error: conversasError } = await supabase
      .from('chatbot_conversas')
      .select('id, cliente_telefone, proposta_id, bitrix24_lead_id, arquivos_anexados, dados_coletados, sofia_mode, bitrix24_stage')
      .not('proposta_id', 'is', null)
      .gte('created_at', cutoffTime)
      .is('all_docs_complete_at', null) // Documents not yet complete
      .is('ended_at', null) // Only active conversations
      // ═══════════════════════════════════════════════════════════════
      // FILTROS DE DESCARTE - Não processar leads descartados/finalizados
      // ═══════════════════════════════════════════════════════════════
      .not('sofia_mode', 'eq', 'descartado')
      .not('sofia_mode', 'eq', 'paused_for_human')
      .not('sofia_mode', 'eq', 'sac_redirect')
      .not('bitrix24_stage', 'eq', 'JUNK')
      .not('bitrix24_stage', 'eq', 'WON')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (conversasError) {
      console.error('[RECOVERY] Error fetching conversas:', conversasError);
      throw conversasError;
    }
    
    console.log(`[RECOVERY] Found ${conversas?.length || 0} conversations to check`);
    
    if (!conversas || conversas.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No conversations to process',
        processed: 0,
        recovered: 0,
        duration_ms: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get webhook events from the last 48 hours
    const { data: webhookEvents, error: eventsError } = await supabase
      .from('whatsapp_webhook_events')
      .select('id, phone, body_parsed, received_at, processing_status')
      .gte('received_at', cutoffTime)
      .in('event_type', ['ReceivedCallback', 'message'])
      .order('received_at', { ascending: false })
      .limit(500);
    
    if (eventsError) {
      console.error('[RECOVERY] Error fetching webhook events:', eventsError);
      throw eventsError;
    }
    
    console.log(`[RECOVERY] Found ${webhookEvents?.length || 0} webhook events to scan`);
    
    // Process each conversation
    let totalRecovered = 0;
    const allLogs: RecoveryLog[] = [];
    const results: { conversaId: string; recovered: number }[] = [];
    
    for (const conversa of conversas) {
      try {
        const result = await processConversation(
          supabase,
          conversa as ConversaData,
          webhookEvents as WebhookEvent[],
          openaiApiKey
        );
        results.push({ conversaId: result.conversaId, recovered: result.recovered });
        totalRecovered += result.recovered;
        allLogs.push(...result.logs);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[RECOVERY] Error processing conversa ${conversa.id}:`, error);
      }
    }
    
    // Update aggregated metrics
    await updateRecoveryMetrics(supabase, allLogs);
    
    const duration = Date.now() - startTime;
    console.log(`[RECOVERY] Scan complete. Processed: ${conversas.length}, Recovered: ${totalRecovered}, Duration: ${duration}ms`);
    
    return new Response(JSON.stringify({
      success: true,
      processed: conversas.length,
      recovered: totalRecovered,
      logged: allLogs.length,
      results,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[RECOVERY] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - startTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
