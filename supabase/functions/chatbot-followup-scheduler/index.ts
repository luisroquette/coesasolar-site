import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculateDelay, wait, getAppropriateConfig, type RateLimitConfig } from '../_shared/rate-limiter.ts';
import { 
  checkAutomationEligibility, 
  logEligibility,
  type AutomationContext 
} from '../_shared/automation-eligibility.ts';
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import {
  isPhoneBlockedByTakeover,
  getBlockedPhones,
  normalizeTakeoverPhone,
} from '../_shared/human-takeover.ts';
import { runAntiSpamGuards } from '../_shared/anti-spam-guards.ts';
// Unified Config Loader - duas camadas (agent override → global fallback)
import { 
  getUnifiedConfigLoader,
  isUnifiedQuietHours,
  getUnifiedNudgeDelays,
} from '../_shared/unified-config-loader.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ═══════════════════════════════════════════════════════════════
// QUIET HOURS - Período de silêncio para FUPs (20:00 às 07:00)
// A Sofia NÃO envia FUPs durante esse período, apenas responde se provocada
// ═══════════════════════════════════════════════════════════════

interface QuietHoursConfig {
  quiet_hours_enabled: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_timezone: string;
}

function isQuietHours(config: Partial<QuietHoursConfig>): boolean {
  if (config.quiet_hours_enabled !== 'true') return false;
  
  const startHour = parseInt(config.quiet_hours_start?.split(':')[0] || '20');
  const startMin = parseInt(config.quiet_hours_start?.split(':')[1] || '0');
  const endHour = parseInt(config.quiet_hours_end?.split(':')[0] || '7');
  const endMin = parseInt(config.quiet_hours_end?.split(':')[1] || '0');
  
  // Calcular hora atual em Brasília (UTC-3)
  const now = new Date();
  const brasiliaOffset = -3 * 60; // -3 horas em minutos
  const utcOffset = now.getTimezoneOffset();
  const brasiliaTime = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000);
  const currentHour = brasiliaTime.getHours();
  const currentMin = brasiliaTime.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMin;
  
  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;
  
  // Caso 1: Quiet hours cruza meia-noite (ex: 20:00 às 07:00)
  if (startTotalMinutes > endTotalMinutes) {
    return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
  }
  
  // Caso 2: Quiet hours no mesmo dia (ex: 01:00 às 06:00)
  return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
}

function getNextAvailableTime(config: Partial<QuietHoursConfig>): Date {
  const endHour = parseInt(config.quiet_hours_end?.split(':')[0] || '7');
  const endMin = parseInt(config.quiet_hours_end?.split(':')[1] || '0');
  
  // Calcular próximo horário disponível (fim do quiet hours + 1 minuto)
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const utcOffset = now.getTimezoneOffset();
  const brasiliaTime = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000);
  
  // Definir para o horário de fim do quiet hours + 1 minuto
  brasiliaTime.setHours(endHour, endMin + 1, 0, 0);
  
  // Se já passou do horário de fim hoje, agendar para amanhã
  const currentHour = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000).getHours();
  const startHour = parseInt(config.quiet_hours_start?.split(':')[0] || '20');
  
  // Se estamos no quiet hours (após 20h ou antes de 7h), calcular corretamente
  if (currentHour >= startHour) {
    // É noite (após 20h), agendar para amanhã às 07:01
    brasiliaTime.setDate(brasiliaTime.getDate() + 1);
  }
  // Se é madrugada (antes de 7h), o brasiliaTime já está correto para hoje
  
  // Converter de volta para UTC
  const nextTimeUTC = new Date(brasiliaTime.getTime() - (utcOffset + brasiliaOffset) * 60 * 1000);
  
  console.log(`[quiet-hours] Next available time: ${nextTimeUTC.toISOString()} (Brasília: ${brasiliaTime.toISOString()})`);
  
  return nextTimeUTC;
}

interface ConversaForFollowup {
  id: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  lead_score: number | null;
  detected_objection: string | null;
  followup_stage: string | null;
  followup_count: number | null;
  next_followup_at: string | null;
  last_message_at: string | null;
  whatsapp_provider: string | null;
  dados_coletados: Record<string, unknown> | null;
  agent_id: string;
  contrato_assinado: boolean | null;
}

// Follow-up messages based on stage and score
function getFollowupMessage(
  stage: 'd1' | 'd3' | 'd7',
  score: number,
  clienteName: string | null,
  detectedObjection: string | null
): string {
  const firstName = clienteName?.split(' ')[0] || '';
  const greeting = firstName ? `Olá, ${firstName}! ` : 'Olá! ';

  // Score >= 80: Direct closing
  if (score >= 80) {
    switch (stage) {
      case 'd1':
        return `${greeting}Passando pra fechar o ciclo: você prefere seguir com a proposta ou ajustar o plano antes de assinar?`;
      case 'd3':
        return `${greeting}Isso aqui já está resolvido do ponto de vista técnico. A única decisão agora é formalizar. Quer que eu reenvie o contrato?`;
      case 'd7':
        return `${greeting}Vou encerrar seu atendimento por aqui pra não te incomodar. Se quiser retomar a economia, é só me avisar que eu reativo a proposta.`;
    }
  }

  // Score 60-79: Address objection
  if (score >= 60 && detectedObjection) {
    const objectionLabels: Record<string, string> = {
      PRECO: 'o valor',
      CONFIANCA: 'a confiança na empresa',
      CONTRATO: 'o contrato e a multa',
      TEMPO: 'o timing',
      COMPLEXIDADE: 'como funciona',
      AUTORIDADE: 'a decisão em conjunto',
    };
    const objectionLabel = objectionLabels[detectedObjection] || 'sua dúvida';

    switch (stage) {
      case 'd1':
        return `${greeting}Pelo que vi, sua dúvida principal é sobre ${objectionLabel}. Se eu resolver isso agora, a gente consegue avançar hoje?`;
      case 'd3':
        return `${greeting}Enquanto você avalia, sua conta continua vindo cheia. Se quiser, resolvemos isso agora e você já entra na próxima fatura com desconto.`;
      case 'd7':
        return `${greeting}Vou encerrar seu atendimento por aqui pra não te incomodar. Se quiser retomar a economia, é só me avisar que eu reativo a proposta.`;
    }
  }

  // Score 30-59: Re-anchor with simple choice
  if (score >= 30) {
    switch (stage) {
      case 'd1':
        return `${greeting}Pra não deixar isso parado: você prefere economizar menos com mais flexibilidade ou economizar mais com contrato?`;
      case 'd3':
        return `${greeting}Enquanto você avalia, sua conta continua vindo cheia. Se quiser, resolvemos isso agora e você já entra na próxima fatura com desconto.`;
      case 'd7':
        return `${greeting}Vou encerrar seu atendimento por aqui pra não te incomodar. Se quiser retomar a economia, é só me avisar que eu reativo a proposta.`;
    }
  }

  // Score < 30: No active follow-up (return empty - will be skipped)
  return '';
}

// Calculate next follow-up stage
function getNextStage(currentStage: string | null): 'd1' | 'd3' | 'd7' | null {
  switch (currentStage) {
    case null:
    case '':
    case 'initial':
      return 'd1';
    case 'd1':
      return 'd3';
    case 'd3':
      return 'd7';
    case 'd7':
      return null; // No more follow-ups
    default:
      return null;
  }
}

// Calculate next follow-up time based on score
function calculateNextFollowupTime(score: number, stage: 'd1' | 'd3' | 'd7'): Date | null {
  const now = new Date();
  
  if (stage === 'd7') {
    return null; // No more follow-ups after d7
  }

  const nextStage = getNextStage(stage);
  if (!nextStage) return null;

  // Time until next follow-up depends on score
  if (score >= 80) {
    // High score: 24h intervals
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  } else if (score >= 60) {
    // Medium-high score: 48h intervals
    return new Date(now.getTime() + 48 * 60 * 60 * 1000);
  } else if (score >= 30) {
    // Medium score: 72h intervals
    return new Date(now.getTime() + 72 * 60 * 60 * 1000);
  }

  return null; // Low score: no follow-up
}

// Format phone number for WhatsApp (Brazilian format: 55XXXXXXXXXXX)
function formatWhatsAppNumber(input: string): string {
  if (!input) return '';
  
  let digits = input.replace(/\D/g, '');
  
  // Remove zero inicial do DDD se existir (031 -> 31)
  if (digits.length === 12 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  
  // Se tem 11 dígitos (DDD + 9 + celular), adiciona DDI 55
  if (digits.length === 11 && digits[2] === '9') {
    digits = '55' + digits;
  }
  
  // Se tem 10 dígitos (DDD + celular sem 9), adiciona DDI 55 e 9
  if (digits.length === 10) {
    digits = '55' + digits.substring(0, 2) + '9' + digits.substring(2);
  }
  
  return digits;
}

// Send WhatsApp message via Z-API (calling z-api-send-message edge function)
// Now accepts agentId to fetch correct Z-API credentials
async function sendWhatsAppViaZApi(
  phone: string, 
  message: string,
  agentId: string = 'sofia'
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const formattedPhone = formatWhatsAppNumber(phone);
    
    if (formattedPhone.length !== 13) {
      console.log(`[followup-scheduler] Invalid phone number format: ${phone} -> ${formattedPhone}`);
      return { success: false, error: 'Invalid phone number format' };
    }

    console.log(`[followup-scheduler] Sending WhatsApp to ${formattedPhone} via Z-API (agent: ${agentId})`);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/z-api-send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        phone: formattedPhone, 
        message,
        agentId, // Pass agentId so z-api-send-message can fetch correct credentials
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[followup-scheduler] Z-API send error for agent ${agentId}:`, response.status, responseText);
      return { success: false, error: `Z-API error: ${response.status}` };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    console.log('[followup-scheduler] Z-API send success:', data);
    return { 
      success: true, 
      messageId: data.messageId || data.zapiMessageId || data.id 
    };
  } catch (error) {
    console.error('[followup-scheduler] Error sending WhatsApp via Z-API:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    console.log('[followup-scheduler] Starting follow-up scheduler...');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();

    // ═══════════════════════════════════════════════════════════════
    // CARREGAR CONFIGURAÇÕES DE QUIET HOURS
    // ═══════════════════════════════════════════════════════════════
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_timezone']);
    
    const quietConfig: Partial<QuietHoursConfig> = {};
    configData?.forEach((c: { chave: string; valor: string }) => {
      quietConfig[c.chave as keyof QuietHoursConfig] = c.valor;
    });
    
    // Verificar se estamos em quiet hours
    if (isQuietHours(quietConfig)) {
      console.log('[followup-scheduler] 🌙 QUIET HOURS ACTIVE - Suppressing all follow-ups');
      
      // Buscar conversas que precisam de reagendamento
      const { data: conversasToReschedule } = await supabase
        .from('chatbot_conversas')
        .select('id, next_followup_at')
        .lte('next_followup_at', now.toISOString())
        .is('event_conversion', false)
        .is('event_drop', false)
        .not('next_followup_at', 'is', null);
      
      if (conversasToReschedule && conversasToReschedule.length > 0) {
        const nextTime = getNextAvailableTime(quietConfig);
        
        // Reagendar todas para o fim do quiet hours
        for (const conversa of conversasToReschedule) {
          await supabase
            .from('chatbot_conversas')
            .update({ next_followup_at: nextTime.toISOString() })
            .eq('id', conversa.id);
        }
        
        console.log(`[followup-scheduler] Rescheduled ${conversasToReschedule.length} follow-ups to ${nextTime.toISOString()}`);
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          quietHours: true,
          rescheduled: conversasToReschedule?.length || 0,
          nextAvailableTime: getNextAvailableTime(quietConfig).toISOString(),
          timestamp: now.toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find conversations that need follow-up
    // Criteria: next_followup_at is in the past, not converted, not dropped
    const { data: conversas, error: fetchError } = await supabase
      .from('chatbot_conversas')
      .select('id, cliente_nome, cliente_telefone, cliente_email, lead_score, detected_objection, followup_stage, followup_count, next_followup_at, last_message_at, whatsapp_provider, agent_id, dados_coletados, contrato_assinado, sofia_mode, bitrix24_stage, has_simulation')
      .lte('next_followup_at', now.toISOString())
      .is('event_conversion', false)
      .is('event_drop', false)
      .is('ended_at', null) // 🚫 never follow-up ended/closed conversations
      .is('human_agent_id', null) // 🚫 NUNCA follow-up se atendente humano assumiu
      .is('contrato_enviado_at', null) // 🚫 NUNCA follow-up se contrato já foi enviado
      .neq('contrato_assinado', true) // 🚫 NUNCA follow-up se contrato já foi assinado
      .not('next_followup_at', 'is', null)
      .not('sofia_mode', 'eq', 'descartado') // 🚫 NUNCA enviar follow-up para leads descartados
      .not('sofia_mode', 'eq', 'paused_for_human') // 🚫 NUNCA follow-up quando humano está atendendo
      .not('sofia_mode', 'eq', 'sac_redirect') // 🚫 NUNCA follow-up para clientes redirecionados ao SAC
      .not('bitrix24_stage', 'eq', 'JUNK') // 🚫 NUNCA enviar follow-up para leads JUNK
      .not('bitrix24_stage', 'eq', 'WON') // 🚫 NUNCA follow-up se lead já GANHO
      .order('next_followup_at', { ascending: true })
      .limit(50); // Process 50 at a time

    if (fetchError) {
      console.error('[followup-scheduler] Error fetching conversations:', fetchError);
      throw fetchError;
    }

    console.log(`[followup-scheduler] Found ${conversas?.length || 0} conversations needing follow-up`);

    // ═══════════════════════════════════════════════════════════════
    // 🛑 HUMAN TAKEOVER CHECK - Block ALL phones that are under human control
    // This is the SOURCE OF TRUTH for blocking automations
    // ═══════════════════════════════════════════════════════════════
    const allPhones = (conversas || []).map((c: any) => c.cliente_telefone).filter(Boolean);
    const blockedPhones = await getBlockedPhones(supabase, allPhones, 'sofia', 'zapi');
    
    if (blockedPhones.size > 0) {
      console.log(`[followup-scheduler] 🛑 Blocking ${blockedPhones.size} phones due to active human takeover`);
    }

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    // ═══════════════════════════════════════════════════════════════
    // RATE LIMITING - Evitar disparo em massa e bloqueio pela Meta
    // ═══════════════════════════════════════════════════════════════
    const totalConversas = conversas?.length || 0;
    const rateLimitConfig = getAppropriateConfig(totalConversas, totalConversas > 20);
    console.log(`[followup-scheduler] 🚦 Rate limiting: ${totalConversas} messages, base delay ${rateLimitConfig.baseDelayMs}ms`);

    let messageIndex = 0;
    for (const conversa of (conversas || []) as ConversaForFollowup[]) {
      results.processed++;

      // ═══════════════════════════════════════════════════════════════
      // 🛑 ABSOLUTE FIRST CHECK: Human takeover blocks EVERYTHING
      // ═══════════════════════════════════════════════════════════════
      const normalizedPhone = normalizeTakeoverPhone(conversa.cliente_telefone || '');
      if (blockedPhones.has(normalizedPhone)) {
        console.log(`[followup-scheduler] 🛑 BLOCKED: ${conversa.cliente_telefone} - Active human takeover`);
        results.skipped++;
        // Clear any pending followup to prevent retry loops
        await supabase
          .from('chatbot_conversas')
          .update({ next_followup_at: null })
          .eq('id', conversa.id);
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🛡️ ANTI-SPAM GUARDS: Daily limit + Cross-conversation takeover
      // ═══════════════════════════════════════════════════════════════
      const guardResult = await runAntiSpamGuards(supabase, conversa.id, conversa.cliente_telefone || '');
      if (!guardResult.allowed) {
        console.log(`[followup-scheduler] 🛡️ GUARD BLOCKED: ${conversa.cliente_telefone} - ${guardResult.reason}`);
        if (guardResult.crossConvTakeover?.blocked) {
          await supabase
            .from('chatbot_conversas')
            .update({ next_followup_at: null, sofia_mode: 'paused_for_human' })
            .eq('id', conversa.id);
        }
        results.skipped++;
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // UNIFIED ELIGIBILITY CHECK - Uses centralized automation-eligibility module
      // Checks: human control, activity cooldown, stage gating, disqualification
      // ═══════════════════════════════════════════════════════════════
      const eligibilityContext: AutomationContext = {
        id: conversa.id,
        cliente_telefone: conversa.cliente_telefone,
        cliente_nome: conversa.cliente_nome,
        human_agent_id: null, // Already filtered in query
        sofia_mode: (conversa as any).sofia_mode || null,
        last_message_at: conversa.last_message_at,
        last_human_message_at: null,
        ended_at: null, // Already filtered in query
        contrato_enviado_at: null, // Already filtered in query
        bitrix24_stage: (conversa as any).bitrix24_stage || null,
        contrato_assinado: conversa.contrato_assinado,
        event_conversion: null,
        event_drop: null,
        dados_coletados: conversa.dados_coletados,
        lead_score: conversa.lead_score,
        has_simulation: (conversa as any).has_simulation || false,
      };
      
      const eligibility = checkAutomationEligibility(eligibilityContext, 'followup');
      logEligibility('followup-scheduler', conversa.id, conversa.cliente_telefone, eligibility);
      
      if (!eligibility.eligible) {
        if (eligibility.action === 'cleanup') {
          // Cleanup: mark as descartado and clear all automations
          await supabase
            .from('chatbot_conversas')
            .update({
              sofia_mode: 'descartado',
              ended_at: new Date().toISOString(),
              awaiting_response: false,
              next_nudge_at: null,
              next_followup_at: null,
              next_rescue_at: null,
            })
            .eq('id', conversa.id);
        } else if (eligibility.action === 'reschedule') {
          // Reschedule: move to 30 minutes from now
          await supabase
            .from('chatbot_conversas')
            .update({
              next_followup_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            })
            .eq('id', conversa.id);
        }
        results.skipped++;
        continue;
      }

      const score = conversa.lead_score || 0;
      
      // Skip low-score leads (< 30)
      if (score < 30) {
        console.log(`[followup-scheduler] Skipping conversa ${conversa.id} - score too low (${score})`);
        results.skipped++;
        
        // Mark as dropped
        await supabase
          .from('chatbot_conversas')
          .update({
            event_drop: true,
            next_followup_at: null,
          })
          .eq('id', conversa.id);
        continue;
      }

      // Determine next stage
      const nextStage = getNextStage(conversa.followup_stage);
      if (!nextStage) {
        console.log(`[followup-scheduler] Skipping conversa ${conversa.id} - no more follow-up stages`);
        results.skipped++;
        
        // Clear next_followup_at
        await supabase
          .from('chatbot_conversas')
          .update({ next_followup_at: null })
          .eq('id', conversa.id);
        continue;
      }

      // Generate follow-up message
      const message = getFollowupMessage(
        nextStage,
        score,
        conversa.cliente_nome,
        conversa.detected_objection
      );

      if (!message) {
        console.log(`[followup-scheduler] Skipping conversa ${conversa.id} - empty message generated`);
        results.skipped++;
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // RATE LIMITING - Aplicar delay antes do envio
      // ═══════════════════════════════════════════════════════════════
      const delay = calculateDelay(messageIndex, totalConversas, rateLimitConfig);
      if (delay > 0) {
        console.log(`[followup-scheduler] 🕐 Rate limit: waiting ${delay}ms before message ${messageIndex + 1}/${totalConversas}`);
        await wait(delay);
      }
      messageIndex++;

      // Send via Z-API with agent-specific credentials
      let sendSuccess = false;
      let sendError: string | null = 'No phone number';
      let messageId: string | undefined;
      const agentId = (conversa as any).agent_id || 'sofia';
      
      if (conversa.cliente_telefone) {
        const sendResult = await sendWhatsAppViaZApi(
          conversa.cliente_telefone, 
          message,
          agentId
        );
        sendSuccess = sendResult.success;
        sendError = sendResult.error || null;
        messageId = sendResult.messageId;
        
        if (sendSuccess) {
          results.sent++;
        } else {
          results.failed++;
        }
      } else {
        results.skipped++;
        console.log(`[followup-scheduler] Skipping conversa ${conversa.id} - no phone number`);
        continue;
      }

      // Insert follow-up record
      const { error: insertError } = await supabase
        .from('chatbot_followups')
        .insert({
          conversa_id: conversa.id,
          cliente_nome: conversa.cliente_nome,
          cliente_telefone: conversa.cliente_telefone,
          cliente_email: conversa.cliente_email,
          followup_stage: nextStage,
          message,
          lead_score: score,
          detected_objection: conversa.detected_objection,
          status: sendSuccess ? 'sent' : 'failed',
          sent_at: sendSuccess ? now.toISOString() : null,
          error_message: sendSuccess ? null : sendError,
          whatsapp_message_id: messageId || null,
        });

      if (insertError) {
        console.error(`[followup-scheduler] Error inserting followup for ${conversa.id}:`, insertError);
      }

      // Calculate next follow-up time
      const nextFollowupAt = calculateNextFollowupTime(score, nextStage);

      // Update conversation
      await supabase
        .from('chatbot_conversas')
        .update({
          followup_stage: nextStage,
          followup_count: (conversa.followup_count || 0) + 1,
          followup_sent_at: now.toISOString(),
          next_followup_at: nextFollowupAt?.toISOString() || null,
        })
        .eq('id', conversa.id);

      // Also save the follow-up as a message in the conversation
      await supabase
        .from('chatbot_mensagens')
        .insert({
          conversa_id: conversa.id,
          role: 'assistant',
          content: `[FOLLOW-UP ${nextStage.toUpperCase()}] ${message}`,
          is_quick_reply: false,
        });

      console.log(`[followup-scheduler] Processed follow-up for conversa ${conversa.id} - stage ${nextStage}, sent: ${sendSuccess}`);
    }

    console.log('[followup-scheduler] Follow-up scheduler completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[followup-scheduler] Error in follow-up scheduler:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
