import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getNotificationAuthorName } from '../_shared/agent-identity.ts';
import {
  getCorsHeaders,
  handleCorsPrelight,
  errorResponse,
  jsonResponse,
} from '../_shared/security-helpers.ts';
import { validateBitrixLink } from '../_shared/zod-schemas.ts';
 

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Webhook for Bitrix24 Lead updates (ONCRMLEADUPDATE)
 * 
 * This webhook detects when the "Link Proposta COESA" field is populated
 * and automatically sends the link to the client via WhatsApp.
 * 
 * Register this webhook in Bitrix24:
 * - Event: ONCRMLEADUPDATE
 * - Handler URL: https://<project>.supabase.co/functions/v1/bitrix24-link-webhook
 */
Deno.serve(async (req) => {
  // CORS: Public webhook endpoint (Bitrix24 external calls)
  const corsHeaders = getCorsHeaders(req, { mode: 'permissive' });
  
  console.log('[bitrix24-link-webhook] Function called:', req.method);

  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'permissive' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request - Bitrix24 sends data as form-urlencoded
    let leadId: string | null = null;

    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      const rawId = formData.get('data[FIELDS][ID]')?.toString() || 
               formData.get('LEAD_ID')?.toString() ||
               formData.get('data[LEAD_ID]')?.toString();
      leadId = rawId || null;
      
      // Log all form fields for debugging
      const formEntries: Record<string, string> = {};
      formData.forEach((value, key) => {
        formEntries[key] = value.toString();
      });
      console.log('[bitrix24-link-webhook] Form data:', JSON.stringify(formEntries, null, 2));
    } else {
      const body = await req.json();
      const rawId = body.data?.FIELDS?.ID || body.LEAD_ID || body.data?.LEAD_ID;
      leadId = rawId || null;
      console.log('[bitrix24-link-webhook] JSON body:', JSON.stringify(body, null, 2));
    }

    // Validate leadId
    const validation = validateBitrixLink(leadId);
    if (!validation.success) {
      console.log('[bitrix24-link-webhook] No lead ID found in request');
      return jsonResponse({ status: 'ignored', reason: 'no_lead_id' }, 200, req, { mode: 'permissive' });
    }
    
    leadId = validation.data!.leadId;

    console.log(`[bitrix24-link-webhook] Processing lead ID: ${leadId}`);

    // Get Bitrix24 configuration and link field code
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'bitrix24_webhook_url',
        'bitrix24_custom_field_link_proposta',
        'bitrix24_link_whatsapp_enabled'
      ]);

    const config: Record<string, string> = {};
    configData?.forEach((c) => {
      config[c.chave] = c.valor;
    });

    const bitrix24Url = config.bitrix24_webhook_url;
    const linkFieldCode = config.bitrix24_custom_field_link_proposta || 'UF_CRM_1767885928302';
    const whatsappLinkEnabled = config.bitrix24_link_whatsapp_enabled !== 'false'; // Default: enabled

    if (!bitrix24Url) {
      console.error('[bitrix24-link-webhook] Bitrix24 webhook URL not configured');
      return new Response(
        JSON.stringify({ error: 'Bitrix24 not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!whatsappLinkEnabled) {
      console.log('[bitrix24-link-webhook] WhatsApp link sending is disabled');
      return new Response(
        JSON.stringify({ status: 'ignored', reason: 'feature_disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch lead details from Bitrix24
    console.log(`[bitrix24-link-webhook] Fetching lead ${leadId} from Bitrix24`);
    const leadResponse = await fetch(`${bitrix24Url}/crm.lead.get?id=${leadId}`);
    const leadResult = await leadResponse.json();

    if (!leadResult.result) {
      console.error('[bitrix24-link-webhook] Failed to fetch lead:', leadResult);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch lead', details: leadResult }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lead = leadResult.result;
    const proposalLink = lead[linkFieldCode];
    const leadTitle = lead.TITLE || '';
    const leadName = lead.NAME || '';
    
    // Extract phone from lead
    let leadPhone: string | null = null;
    if (lead.PHONE && Array.isArray(lead.PHONE) && lead.PHONE.length > 0) {
      leadPhone = lead.PHONE[0].VALUE?.replace(/\D/g, '') || null;
    }

    console.log(`[bitrix24-link-webhook] Lead ${leadId} - Link: ${proposalLink ? 'present' : 'empty'}, Phone: ${leadPhone ? 'present' : 'empty'}`);

    // Check if link field has a value
    if (!proposalLink || proposalLink.trim() === '') {
      console.log(`[bitrix24-link-webhook] No proposal link in field ${linkFieldCode}`);
      return new Response(
        JSON.stringify({ 
          status: 'ignored', 
          reason: 'no_link_in_field',
          fieldCode: linkFieldCode
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!leadPhone) {
      console.log('[bitrix24-link-webhook] No phone number found in lead');
      return new Response(
        JSON.stringify({ 
          status: 'ignored', 
          reason: 'no_phone_number'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we already sent this link to avoid duplicates
    // We use a tracking table or check conversation history
    const phoneFormatted = leadPhone.startsWith('55') ? leadPhone : `55${leadPhone}`;
    
    // ═══════════════════════════════════════════════════════════════
    // CROSS-WEBHOOK LOCK - Prevents bitrix24-link-webhook and sofia-webhook
    // from processing simultaneously for the same phone number
    // This is CRITICAL to prevent race conditions where LLM generates
    // response while proposal link is being sent
    // ═══════════════════════════════════════════════════════════════
    const { data: crossLockResult, error: crossLockError } = await supabase.rpc('acquire_cross_webhook_lock', {
      p_phone: phoneFormatted,
      p_lead_id: leadId,
      p_locked_by: 'bitrix24-link-webhook',
      p_purpose: 'proposal_send',
      p_lock_duration_seconds: 30,
    });

    if (crossLockError) {
      console.error('[bitrix24-link-webhook] ❌ Error acquiring cross-webhook lock:', crossLockError);
      // Continue - lock failure shouldn't block proposal sending
    } else if (crossLockResult && crossLockResult.length > 0 && !crossLockResult[0].acquired) {
      const lockInfo = crossLockResult[0];
      console.log(`[bitrix24-link-webhook] ⏳ Cross-lock held by ${lockInfo.existing_lock_by} (purpose: ${lockInfo.existing_lock_purpose})`);
      
      // If sofia-webhook has the lock (processing message), wait and retry
      if (lockInfo.existing_lock_by === 'sofia-webhook') {
        console.log(`[bitrix24-link-webhook] ⏳ Waiting for sofia-webhook to finish processing...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s
        
        const { data: retryResult } = await supabase.rpc('acquire_cross_webhook_lock', {
          p_phone: phoneFormatted,
          p_lead_id: leadId,
          p_locked_by: 'bitrix24-link-webhook',
          p_purpose: 'proposal_send',
          p_lock_duration_seconds: 30,
        });
        
        if (retryResult && retryResult.length > 0 && !retryResult[0].acquired) {
          console.log(`[bitrix24-link-webhook] ⚠️ Still locked after retry - proceeding anyway to send proposal`);
        } else {
          console.log(`[bitrix24-link-webhook] ✅ Cross-lock acquired after retry`);
        }
      }
    } else {
      console.log(`[bitrix24-link-webhook] 🔒 Cross-lock acquired for phone ${phoneFormatted}`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: ATOMIC LOCK - Prevent race conditions from multiple events
    // Uses 5-second window to group rapid-fire events into single lock
    // ═══════════════════════════════════════════════════════════════
    const lockWindow = Math.floor(Date.now() / 5000) * 5000; // 5s window
    const lockKey = `link_send_${leadId}_${lockWindow}`;
    
    const { data: lockResult, error: lockError } = await supabase
      .from('bitrix24_sync_locks')
      .upsert(
        { 
          lock_key: lockKey, 
          lead_id: leadId,
          acquired_at: new Date().toISOString(),
        },
        { 
          onConflict: 'lock_key',
          ignoreDuplicates: true,
        }
      )
      .select('id')
      .maybeSingle();
    
    // If we couldn't acquire lock (another event is processing), skip
    if (lockError || !lockResult?.id) {
      console.log(`[bitrix24-link-webhook] ⏳ Lock não adquirido para lead ${leadId} - outro evento processando (lockKey: ${lockKey})`);
      
      // Release cross-webhook lock before returning
      await supabase.rpc('release_cross_webhook_lock', { p_phone: phoneFormatted, p_locked_by: 'bitrix24-link-webhook' });
      
      return new Response(
        JSON.stringify({ 
          status: 'ignored', 
          reason: 'lock_held_by_another_event',
          lockKey
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[bitrix24-link-webhook] 🔒 Lock adquirido para lead ${leadId} (lockKey: ${lockKey})`);
    
    // Find conversation by phone and bitrix24_lead_id
    const { data: conversa } = await supabase
      .from('chatbot_conversas')
      .select('id, cliente_nome, agent_id, proposta_link_sent_at, sofia_mode, event_proposal_sent, proposta_id')
      .eq('bitrix24_lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: CONVERSATION-LEVEL DEDUPLICATION
    // Check if proposal was recently sent to this conversation
    // ═══════════════════════════════════════════════════════════════
    const { data: cooldownConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix_link_cooldown_ms')
      .maybeSingle();
    
    const COOLDOWN_MS = parseInt(cooldownConfig?.valor || '300000', 10); // Default: 5 minutes
    
    if (conversa?.proposta_link_sent_at) {
      const lastSentTime = new Date(conversa.proposta_link_sent_at).getTime();
      const timeSince = Date.now() - lastSentTime;
      
      if (timeSince < COOLDOWN_MS) {
        console.log(`[bitrix24-link-webhook] ❌ BLOCKED: Conversa já recebeu proposta há ${Math.round(timeSince / 1000)}s (cooldown: ${Math.round(COOLDOWN_MS / 1000)}s)`);
        return new Response(
          JSON.stringify({ 
            status: 'ignored', 
            reason: 'proposta_recently_sent_to_conversa',
            secondsSinceLast: Math.round(timeSince / 1000),
            cooldownSeconds: Math.round(COOLDOWN_MS / 1000)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

     // ═══════════════════════════════════════════════════════════════
     // DETECT PROPOSAL TYPE (DB-first) + HARD GATE for "definitiva"
     // Goal: NEVER message "Proposta Definitiva" unless backend confirms
     // that it is eligible (docs complete and/or definitive_ready_at).
     // ═══════════════════════════════════════════════════════════════

     // Extract proposal ID from URL (UUID pattern)
     const proposalIdMatch = proposalLink.match(/proposta(?:-inicial|-definitiva)?\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
     const proposalIdFromUrl = proposalIdMatch ? proposalIdMatch[1] : null;

     // URL-based detection (only when explicit)
     const urlIndicatesInicial = proposalLink.includes('proposta-inicial');
     const urlIndicatesDefinitiva = proposalLink.includes('proposta-definitiva');

     // Defaults: if URL is legacy (/proposta/:id), treat as INITIAL unless DB proves otherwise
     let currentProposalType: 'inicial' | 'definitiva' = 'inicial';
     let definitiveEligible = false;
     let propostaTipoFromDb: string | null = null;
     let propostaDefinitiveReadyAt: string | null = null;

     if (proposalIdFromUrl) {
       // Fetch actual proposal data (single source of truth)
       const { data: propostaData } = await supabase
         .from('propostas_assinantes')
         .select('id, tipo_proposta, dados_inferidos, definitive_ready_at')
         .eq('id', proposalIdFromUrl)
         .maybeSingle();

       if (propostaData) {
         propostaTipoFromDb = (propostaData as any).tipo_proposta ?? null;
         propostaDefinitiveReadyAt = (propostaData as any).definitive_ready_at ?? null;

         console.log(
           `[bitrix24-link-webhook] Proposal ${proposalIdFromUrl} - tipo_proposta=${propostaTipoFromDb}, dados_inferidos=${(propostaData as any).dados_inferidos}, definitive_ready_at=${propostaDefinitiveReadyAt}`
         );
       } else {
         console.log(`[bitrix24-link-webhook] Proposal not found in DB for ID ${proposalIdFromUrl} (keeping type as 'inicial')`);
       }

       // Docs eligibility should be strict: use ONLY all_docs_complete_at (dynamic requirements)
       // CRITICAL FIX: Remove propostaDefinitiveReadyAt from eligibility - it can be set before docs are complete
       const { data: conversaData } = await supabase
         .from('chatbot_conversas')
         .select('all_docs_complete_at')
         .eq('bitrix24_lead_id', leadId)
         .order('created_at', { ascending: false })
         .limit(1)
         .maybeSingle();

       const docsComplete = conversaData?.all_docs_complete_at !== null && conversaData?.all_docs_complete_at !== undefined;
       
       // PHASE 1 FIX: Only all_docs_complete_at matters for definitiva eligibility
       // Removed: || !!propostaDefinitiveReadyAt (this was the bug - could be set before docs are complete)
       definitiveEligible = docsComplete;

       console.log(
         `[bitrix24-link-webhook] Definitiva eligibility: docsComplete=${docsComplete} (STRICT - propostaDefinitiveReadyAt ignored)`,
         { definitive_ready_at_raw: propostaDefinitiveReadyAt, final_eligibility: definitiveEligible }
       );

       // Decide type (DB-first)
       if (propostaTipoFromDb === 'definitiva') {
         currentProposalType = 'definitiva';
       } else if (propostaTipoFromDb === 'inicial' || (propostaData as any)?.dados_inferidos === true) {
         currentProposalType = 'inicial';
       }
     }

     // If URL explicitly says inicial, always respect it
     if (urlIndicatesInicial) {
       currentProposalType = 'inicial';
     }

     // If URL explicitly says definitiva, we ONLY allow it when eligible
     if (urlIndicatesDefinitiva) {
       currentProposalType = 'definitiva';
     }

     // HARD STOP: never allow 'definitiva' message unless eligibility is confirmed
     if (currentProposalType === 'definitiva' && !definitiveEligible) {
       console.log(
         `[bitrix24-link-webhook] ❌ BLOCKED: tentativa de enviar 'definitiva' sem docs completos/definitive_ready_at. leadId=${leadId}, proposalId=${proposalIdFromUrl}`
       );

       // Best-effort telemetry (do not fail the webhook on logging errors)
       try {
         await supabase.from('bitrix24_sync_logs').insert({
           action: 'link_whatsapp_blocked',
           status: 'skipped',
           bitrix24_lead_id: leadId,
           request_data: {
             reason: 'definitiva_without_eligibility',
             proposalLink,
             proposalIdFromUrl,
             proposalTypeAttempted: 'definitiva',
             propostaTipoFromDb,
             definitive_ready_at: propostaDefinitiveReadyAt,
           },
           response_data: {
             message: 'Blocked definitive proposal send: missing eligibility signals',
           },
         });

          // Also notify admins so the team can see the anomaly immediately
          const blockerAgentId = conversa?.agent_id || 'sofia';
          await supabase.from('admin_notifications').insert({
            admin_user_id: null,
            title: '⚠️ Envio de Proposta Definitiva bloqueado',
            message:
              `Lead ${leadId}: tentativa de envio de proposta definitiva sem documentos completos. ` +
              `Proposta: ${proposalIdFromUrl || 'não identificado'} | Link: ${proposalLink}`,
            type: 'proposal_link_blocked',
            entity_type: 'bitrix_lead',
            entity_id: leadId,
            created_by_nome: getNotificationAuthorName(blockerAgentId, 'sofIA', 'Link Automático'),
          });
       } catch (e) {
         console.log('[bitrix24-link-webhook] Failed to log block event:', e);
       }

       return new Response(
         JSON.stringify({
           status: 'ignored',
           reason: 'definitiva_without_eligibility',
           proposalIdFromUrl,
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }

     console.log(
       `[bitrix24-link-webhook] Final proposal type: ${currentProposalType} (definitiveEligible: ${definitiveEligible})`
     );

    // ═══════════════════════════════════════════════════════════════
    // ANTI-SPAM DEDUPLICATION (Correção 1 - Performance Vendas)
    // Uses SHA-256 hash of link + cooldown to prevent duplicate sends
    // ═══════════════════════════════════════════════════════════════
    
    // Generate hash of the proposal link for exact deduplication
    const linkHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proposalLink));
    const linkHash = Array.from(new Uint8Array(linkHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Check if this EXACT link was already sent (hash-based dedup)
    const { data: existingByHash } = await supabase
      .from('bitrix24_sync_logs')
      .select('id, created_at')
      .eq('bitrix24_lead_id', leadId)
      .eq('action', 'link_whatsapp_sent')
      .eq('status', 'success')
      .filter('request_data->>link_hash', 'eq', linkHash)
      .limit(1)
      .maybeSingle();
    
    if (existingByHash) {
      console.log(`[bitrix24-link-webhook] ❌ BLOCKED: Exact link hash already sent (${linkHash.substring(0, 8)}...)`);
      return new Response(
        JSON.stringify({ 
          status: 'ignored', 
          reason: 'exact_link_already_sent',
          linkHash: linkHash.substring(0, 16),
          lastSentAt: existingByHash.created_at
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check cooldown between sends for same lead (prevents rapid-fire)
    // Uses COOLDOWN_MS already defined above from Phase 3
    const { data: recentSend } = await supabase
      .from('bitrix24_sync_logs')
      .select('id, created_at')
      .eq('bitrix24_lead_id', leadId)
      .eq('action', 'link_whatsapp_sent')
      .eq('status', 'success')
      .gte('created_at', new Date(Date.now() - COOLDOWN_MS).toISOString())
      .limit(1)
      .maybeSingle();
    
    if (recentSend) {
      const timeSinceLast = Date.now() - new Date(recentSend.created_at).getTime();
      console.log(`[bitrix24-link-webhook] ❌ BLOCKED: Cooldown active (${Math.round(timeSinceLast / 1000)}s < 60s)`);
      return new Response(
        JSON.stringify({ 
          status: 'ignored', 
          reason: 'cooldown_active',
          secondsSinceLast: Math.round(timeSinceLast / 1000),
          cooldownSeconds: 60
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if conversation is paused for human (avoid interference)
    if (conversa?.sofia_mode === 'paused_for_human') {
      console.log(`[bitrix24-link-webhook] ⏸️ Conversation paused for human - skipping automatic send`);
      return new Response(
        JSON.stringify({ 
          status: 'ignored', 
          reason: 'conversation_paused_for_human'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we already sent this TYPE of proposal link
    // Strategy: Compare proposal TYPE (inicial vs definitiva), not the exact URL
    const { data: lastSend } = await supabase
      .from('bitrix24_sync_logs')
      .select('id, created_at, request_data')
      .eq('bitrix24_lead_id', leadId)
      .eq('action', 'link_whatsapp_sent')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSend) {
      const lastSentType = (lastSend.request_data as any)?.proposalType;
      const lastSentAt = new Date(lastSend.created_at).getTime();
      const RESEND_COOLDOWN_MS = 3600000; // 1 hora - permite reenvio após cooldown
      
      if (lastSentType === currentProposalType) {
        const timeSince = Date.now() - lastSentAt;
        
        // CRITICAL FIX: Permitir reenvio após cooldown de 1 hora
        // Isso permite que clientes que retornam recebam o link novamente
        if (timeSince < RESEND_COOLDOWN_MS) {
          console.log(`[bitrix24-link-webhook] ${currentProposalType} sent ${Math.round(timeSince / 1000)}s ago, skipping (cooldown: ${Math.round(RESEND_COOLDOWN_MS / 60000)}min)`);
          return new Response(
            JSON.stringify({ 
              status: 'ignored', 
              reason: 'same_type_recently_sent',
              lastSentAt: lastSend.created_at,
              proposalType: currentProposalType,
              cooldownRemainingSeconds: Math.round((RESEND_COOLDOWN_MS - timeSince) / 1000)
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Após cooldown de 1 hora, permitir reenvio
        console.log(`[bitrix24-link-webhook] ✅ Allowing resend after ${Math.round(timeSince / 3600000)}h cooldown (${currentProposalType})`);
      } else {
        // Type CHANGED (inicial → definitiva) - proceed with sending!
        console.log(`[bitrix24-link-webhook] ✅ Proposal type changed: ${lastSentType} → ${currentProposalType}`);
      }
    }

    // Get agent info for personalized message
    const agentId = conversa?.agent_id || 'sofia';
    const { data: agentConfig } = await supabase
      .from('ai_agents')
      .select('name, zapi_instance_id, zapi_token, zapi_security_token')
      .eq('agent_id', agentId)
      .single();

    const agentName = agentConfig?.name || 'IA';
    const clienteName = conversa?.cliente_nome || leadName || 'Cliente';

    // Use the already detected proposal type
    const proposalTypeLabel = currentProposalType === 'definitiva' ? 'Proposta Definitiva' : 'Proposta Inicial';

    // Build personalized message
    let message: string;
    
    if (currentProposalType === 'definitiva') {
      message = `🎉 *Sua ${proposalTypeLabel} está pronta!*

Olá${clienteName ? `, ${clienteName.split(' ')[0]}` : ''}! Seus documentos foram processados com sucesso.

📋 *Clique no link abaixo para visualizar:*
${proposalLink}

Qualquer dúvida, é só me chamar!

${agentName} ☀️`;
    } else {
      // Proposta Inicial - mensagem simples e direta
      message = `✨ *Sua ${proposalTypeLabel} está pronta!*

Olá${clienteName ? `, ${clienteName.split(' ')[0]}` : ''}! Preparei uma proposta personalizada para você.

📋 *Clique no link abaixo para visualizar:*
${proposalLink}

Veja a economia que você pode ter e, se gostar, podemos avançar para a proposta definitiva!

${agentName} ☀️`;
    }

    // WhatsApp sending DISABLED - Bitrix24 automations handle notifications
    console.log(`[bitrix24-link-webhook] WhatsApp sending SKIPPED (delegated to Bitrix24 automations) for lead ${leadId}`);

    // Log that we skipped WhatsApp send
    await supabase.from('bitrix24_sync_logs').insert({
      bitrix24_lead_id: leadId,
      action: 'link_whatsapp_skipped',
      status: 'success',
      request_data: { 
        phone: phoneFormatted, 
        proposalLink, 
        proposalType: currentProposalType,
        proposalTypeLabel,
        agentId,
        link_hash: linkHash,
        reason: 'delegated_to_bitrix24_automations'
      }
    });

    // Still update conversation state if we have one (for tracking)
    if (conversa) {
      const updateData: Record<string, any> = {
        proposta_link_sent_at: new Date().toISOString(),
        event_proposal_sent: true,
      };
      
      if (proposalIdFromUrl && !conversa.proposta_id) {
        updateData.proposta_id = proposalIdFromUrl;
        console.log(`[bitrix24-link-webhook] Linking proposal ${proposalIdFromUrl} to conversation ${conversa.id}`);
      }
      
      await supabase
        .from('chatbot_conversas')
        .update(updateData)
        .eq('id', conversa.id);
    }

    // Release cross-webhook lock
    await supabase.rpc('release_cross_webhook_lock', { p_phone: phoneFormatted, p_locked_by: 'bitrix24-link-webhook' });

    return new Response(
      JSON.stringify({ 
        status: 'success', 
        message: 'Proposal link saved (WhatsApp delegated to Bitrix24)',
        leadId,
        phone: phoneFormatted,
        proposalType: currentProposalType,
        proposalTypeLabel,
        whatsappSent: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bitrix24-link-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
