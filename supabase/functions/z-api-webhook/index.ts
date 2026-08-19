import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  normalizePhoneNumber, generatePhoneVariations, 
  isLidPhone, saveLidPhoneMapping, resolvePhoneFromLid, resolveOperatorCommandPhone 
} from "../_shared/utils/phone-utils.ts";
import { 
  checkEntryRateLimit, 
  rateLimitMiddleware,
  type RateLimitCheckResult 
} from "../_shared/entry-point-rate-limiter.ts";
import {
  getCorsHeaders,
  handleCorsPrelight,
  validateWebhookToken,
  sanitizeObject,
  jsonResponse,
  errorResponse,
} from "../_shared/security-helpers.ts";
import { validateZApiWebhook } from "../_shared/zod-schemas.ts";

// CORS: Z-API webhooks are public (external service) - use permissive mode
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, client-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_SECURITY_TOKEN = Deno.env.get("ZAPI_SECURITY_TOKEN");

// Bump this when deploying to help diagnose stale deployments
const BUILD_VERSION = "2026-02-02.1";

// Z-API base
const ZAPI_BASE_URL = "https://api.z-api.io";

// Ensure Z-API webhooks are correctly configured (especially the "sent by me" option)
let lastWebhookEnsureAt = 0;
const ENSURE_WEBHOOKS_TTL_MS = 10 * 60 * 1000;

function getWebhookUrl(): string {
  return `${SUPABASE_URL}/functions/v1/z-api-webhook`;
}

async function ensureZApiWebhooksConfigured(): Promise<void> {
  // Without security token we cannot programmatically update webhook routes
  if (!ZAPI_SECURITY_TOKEN) {
    console.warn(`[Z-API Webhook ${BUILD_VERSION}] ZAPI_SECURITY_TOKEN not set; cannot auto-configure webhooks`);
    return;
  }

  const now = Date.now();
  if (now - lastWebhookEnsureAt < ENSURE_WEBHOOKS_TTL_MS) return;
  lastWebhookEnsureAt = now;

  const webhookUrl = getWebhookUrl();

  const putWebhook = async (path: string) => {
    const url = `${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/${path}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_SECURITY_TOKEN,
      },
      body: JSON.stringify({ value: webhookUrl }),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.warn(`[Z-API Webhook ${BUILD_VERSION}] Failed to set ${path}: ${res.status} ${text.substring(0, 200)}`);
      return;
    }
    console.log(`[Z-API Webhook ${BUILD_VERSION}] ✅ Webhook ensured: ${path} -> ${webhookUrl}`);
  };

  // 1) Incoming messages webhook
  await putWebhook("update-webhook-received");
  // 2) Incoming messages webhook WITH "sent by me" enabled (required to catch manual operator commands)
  await putWebhook("update-webhook-received-delivery");
}

/**
 * Z-API Webhook Payload Structure
 * Docs: https://developer.z-api.io/webhooks/on-message-received
 */

interface ZApiWebhookPayload {
  phone?: string;
  participantPhone?: string;
  chatLid?: string;
  connectedPhone?: string;
  messageId?: string;
  fromMe?: boolean;
  momment?: number;
  status?: string;
  chatName?: string;
  senderName?: string;
  senderPhoto?: string;
  broadcast?: boolean;
  isGroup?: boolean;
  type?: string;
  text?: { message?: string };
  audio?: { audioUrl?: string; mimeType?: string; caption?: string };
  image?: { imageUrl?: string; mimeType?: string; thumbnailUrl?: string; caption?: string };
  document?: { documentUrl?: string; mimeType?: string; title?: string };
  // Injected by agent-specific webhooks (maria-webhook, julia-webhook, etc.)
  _agentId?: string;
}

// Operator command keywords
const PAUSE_COMMANDS = ['#ASSUMIR', '#MEU', '#TAKEOVER'];
const RESUME_COMMANDS = ['#RESOLVIDO', '#DEVOLVER', '#SOFIA'];
// Marks the conversation as support/SAC and permanently blocks automations.
// Use when operator identifies the contact is an existing client seeking support.
const SAC_COMMANDS = ['#SAC', '#SUPORTE', '#CLIENTE'];
const ALL_OPERATOR_COMMANDS = [...PAUSE_COMMANDS, ...RESUME_COMMANDS, ...SAC_COMMANDS];

/**
 * ROBUST TEXT EXTRACTION: Try multiple fields where Z-API can send text
 * Solves: command not detected because Z-API changed payload shape
 */
function extractTextFromPayload(payload: ZApiWebhookPayload | null): string {
  if (!payload) return '';

  const pickFromUnknown = (value: unknown): string | null => {
    if (!value) return null;

    if (typeof value === 'string') {
      const s = value.trim();
      return s ? s : null;
    }

    // Common Z-API / transformed shapes
    if (typeof value === 'object') {
      const v = value as any;
      const nestedCandidates = [
        v.text?.message,
        v.text,
        v.message?.text,
        v.message,
        v.caption,
        v.body?.text,
        v.body?.message,
      ];

      for (const n of nestedCandidates) {
        if (typeof n === 'string' && n.trim()) return n.trim();
      }
    }

    return null;
  };

  // Priority order based on Z-API documentation + observed production payloads
  const candidates: unknown[] = [
    payload.text?.message,

    // Direct payload variants
    (payload as any).body?.text,
    (payload as any).body?.message,
    (payload as any).message,
    (payload as any).message?.text,
    (payload as any).message?.text?.message,
    (payload as any).caption,
    (payload as any).text,

    // Batched payload variants (some providers send { data: [...] })
    (payload as any).data?.[0]?.text?.message,
    (payload as any).data?.[0]?.body?.text,
    (payload as any).data?.[0]?.message,
    (payload as any).data?.[0]?.message?.text,
    (payload as any).data?.[0]?.message?.text?.message,
    (payload as any).data?.[0]?.caption,

    // Media captions
    payload.image?.caption,
    payload.audio?.caption,
  ];

  for (const candidate of candidates) {
    const picked = pickFromUnknown(candidate);
    if (picked) return picked;
  }

  return '';
}

/**
 * FALLBACK: Fetch message content via Z-API read-message endpoint
 * Used when fromMe=true payloads don't include message text (multi-device mode)
 * Docs: GET /read-message/{messageId}
 */
async function fetchMessageTextFromZApi(
  messageId: string,
  agentId: string,
  supabase: any
): Promise<string | null> {
  if (!messageId) return null;
  
  try {
    // Fetch agent-specific Z-API credentials
    const { data: agentData, error: agentError } = await supabase
      .from('ai_agents')
      .select('zapi_instance_id, zapi_token, zapi_security_token')
      .eq('agent_id', agentId)
      .single();
    
    if (agentError || !agentData?.zapi_instance_id || !agentData?.zapi_token) {
      // Fallback to global credentials
      const instanceId = ZAPI_INSTANCE_ID;
      const token = ZAPI_TOKEN;
      const securityToken = ZAPI_SECURITY_TOKEN;
      
      if (!instanceId || !token) {
        console.warn(`[Z-API Webhook] Cannot fetch message: no credentials for agent ${agentId}`);
        return null;
      }
      
      return await doFetchMessageText(instanceId, token, securityToken || null, messageId);
    }
    
    const securityToken = agentData.zapi_security_token || ZAPI_SECURITY_TOKEN;
    return await doFetchMessageText(
      agentData.zapi_instance_id,
      agentData.zapi_token,
      securityToken || null,
      messageId
    );
  } catch (err) {
    console.error(`[Z-API Webhook] Error fetching message ${messageId}:`, err);
    return null;
  }
}

async function doFetchMessageText(
  instanceId: string,
  token: string,
  securityToken: string | null,
  messageId: string
): Promise<string | null> {
  const url = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/read-message/${messageId}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (securityToken) {
    headers['Client-Token'] = securityToken;
  }
  
  console.log(`[Z-API Webhook] 📥 Fetching message content for ${messageId} (has security token: ${!!securityToken})`);
  
  const res = await fetch(url, { method: 'GET', headers });
  
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[Z-API Webhook] Failed to fetch message ${messageId}: ${res.status} ${errText.substring(0, 200)}`);
    return null;
  }
  
  const data = await res.json();
  
  // Extract text from response (Z-API read-message returns { text: { message: "..." }, ... })
  const text = data?.text?.message 
    || data?.message 
    || data?.body?.text 
    || data?.caption
    || (typeof data?.text === 'string' ? data.text : null);
    
  if (text && typeof text === 'string' && text.trim()) {
    console.log(`[Z-API Webhook] ✅ Fetched message content: "${text.substring(0, 50)}"`);
    return text.trim();
  }
  
  console.log(`[Z-API Webhook] ⚠️ Message ${messageId} fetched but no text found in response`);
  return null;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAlphaNumeric(text: string): boolean {
  // Latin letters (incl accents) + numbers. Good enough for PT-BR content.
  return /[A-Za-z0-9À-ÖØ-öø-ÿ]/.test(text);
}

/**
 * ROBUST COMMAND DETECTION (SAFE):
 * - Allows emojis/punctuation BEFORE the command (e.g. "✅ #ASSUMIR")
 * - Allows arguments AFTER the command (e.g. "#ASSUMIR agora")
 * - Does NOT match when the command appears inside a sentence (e.g. "Use #RESOLVIDO...")
 *
 * This prevents the bot's own confirmation messages from triggering commands.
 */
function detectOperatorCommand(text: string): { command: string | null; isPause: boolean; isResume: boolean } {
  const raw = (text || "").trim();
  if (!raw) return { command: null, isPause: false, isResume: false };

  // Only accept commands when there are NO letters/numbers before the first '#'.
  // This prevents matching sentences like "Use #RESOLVIDO...".
  const hashIndex = raw.indexOf('#');
  if (hashIndex === -1) return { command: null, isPause: false, isResume: false };

  const beforeHash = raw.slice(0, hashIndex);
  if (hasAlphaNumeric(beforeHash)) {
    return { command: null, isPause: false, isResume: false };
  }

  const fromHash = raw.slice(hashIndex).trimStart();

  for (const cmd of PAUSE_COMMANDS) {
    const re = new RegExp(`^${escapeRegex(cmd)}(\\s|$)`, 'iu');
    if (re.test(fromHash)) return { command: cmd, isPause: true, isResume: false };
  }

  for (const cmd of RESUME_COMMANDS) {
    const re = new RegExp(`^${escapeRegex(cmd)}(\\s|$)`, 'iu');
    if (re.test(fromHash)) return { command: cmd, isPause: false, isResume: true };
  }

  return { command: null, isPause: false, isResume: false };
}

function detectOperatorCommandV2(text: string): { command: string | null; isPause: boolean; isResume: boolean; isSAC: boolean } {
  const base = detectOperatorCommand(text);
  if (base.command) {
    return { ...base, isSAC: false };
  }

  const raw = (text || "").trim();
  if (!raw) return { command: null, isPause: false, isResume: false, isSAC: false };

  const hashIndex = raw.indexOf('#');
  if (hashIndex === -1) return { command: null, isPause: false, isResume: false, isSAC: false };

  const beforeHash = raw.slice(0, hashIndex);
  if (hasAlphaNumeric(beforeHash)) {
    return { command: null, isPause: false, isResume: false, isSAC: false };
  }

  const fromHash = raw.slice(hashIndex).trimStart();
  for (const cmd of SAC_COMMANDS) {
    const re = new RegExp(`^${escapeRegex(cmd)}(\\s|$)`, 'iu');
    if (re.test(fromHash)) return { command: cmd, isPause: false, isResume: false, isSAC: true };
  }

  return { command: null, isPause: false, isResume: false, isSAC: false };
}

/**
 * Normalize incoming phone number using shared utility
 * CRITICAL FIX: Now uses the same normalization as sofia-webhook to ensure
 * 12-digit phones (553288032822) are normalized to 13-digit (5532988032822)
 */
function normalizeIncomingPhone(rawPhone: string): string {
  const trimmed = (rawPhone || '').trim();

  // In multi-device mode, Z-API can send "...@lid" for some callbacks.
  // We keep it as-is; later we resolve it when needed.
  if (trimmed.includes('@lid')) return trimmed;

  // Use the shared normalization function to ensure consistency
  return normalizePhoneNumber(trimmed);
}


async function updateWebhookLog(supabase: any, logId: string | null, update: any) {
  if (!logId) return;
  try {
    await supabase.from("whatsapp_webhook_events").update(update as any).eq("id", logId);
  } catch (err) {
    console.error("[Z-API Webhook] Failed to update log:", err);
  }
}

async function isDuplicateReceivedCallback(supabase: any, phone: string, messageId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_webhook_events")
      .select("id")
      .eq("provider", "z-api")
      .eq("event_type", "ReceivedCallback")
      .eq("phone", phone)
      .contains("body_parsed", { messageId })
      .limit(1);
    if (error) {
      console.warn("[Z-API Webhook] Duplicate check failed:", error);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.warn("[Z-API Webhook] Duplicate check exception:", err);
    return false;
  }
}

/**
 * DEPRECATED: Use resolvePhoneFromLid from phone-utils.ts instead
 * Kept for backward compatibility, now just wraps the new function
 */
async function resolveClientPhoneFromLid(supabase: any, lidOrPhone: string): Promise<string | null> {
  return await resolvePhoneFromLid(supabase, lidOrPhone);
}

/**
 * Send Z-API message with CORRECT AGENT CREDENTIALS
 * Solves: messages sent using wrong instance (sofIA instead of marIA)
 */
async function sendZApiMessage(phone: string, message: string, agentId: string = 'sofia'): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/z-api-send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ phone, message, agentId }),
    });
    if (!response.ok) {
      console.error(`[Z-API Webhook] Failed to send message for agent ${agentId}:`, await response.text());
      return false;
    }
    console.log(`[Z-API Webhook] ✅ Message sent via agent ${agentId} to ${phone}`);
    return true;
  } catch (err) {
    console.error("[Z-API Webhook] Error sending message:", err);
    return false;
  }
}

/**
 * ROBUST CONVERSATION LOOKUP WITH PHONE VARIATIONS
 * Solves: 12-digit vs 13-digit phone mismatch causing "no_conversation" errors
 * Strategy: Generate all phone variations and use ilike query for flexible matching
 */
async function findConversationByPhoneVariations(
  supabase: any,
  targetPhone: string,
  agentIdFromPayload: string | null
): Promise<{ conversa: any | null; resolvedAgentId: string; lookupMethod: string }> {
  const variations = generatePhoneVariations(targetPhone);
  const last8Digits = targetPhone.replace(/\D/g, '').slice(-8);
  
  console.log(`[Z-API Webhook] 📱 Phone lookup with variations: ${variations.join(', ')}, last8: ${last8Digits}`);

  // 1. Try exact match with provided agent_id first
  if (agentIdFromPayload) {
    for (const variation of variations) {
      const { data, error } = await supabase
        .from("chatbot_conversas")
        .select("id, cliente_nome, cliente_telefone, sofia_mode, needs_human_fallback, escalated_at, agent_id")
        .eq("cliente_telefone", variation)
        .eq("agent_id", agentIdFromPayload)
        .is("ended_at", null)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!error && data) {
        console.log(`[Z-API Webhook] ✅ Found via exact match (variation: ${variation}, agent: ${agentIdFromPayload})`);
        return { conversa: data, resolvedAgentId: data.agent_id, lookupMethod: 'exact_with_agent' };
      }
    }
  }

  // 2. Try exact match without agent filter
  for (const variation of variations) {
    const { data, error } = await supabase
      .from("chatbot_conversas")
      .select("id, cliente_nome, cliente_telefone, sofia_mode, needs_human_fallback, escalated_at, agent_id")
      .eq("cliente_telefone", variation)
      .is("ended_at", null)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!error && data) {
      console.log(`[Z-API Webhook] ✅ Found via exact match (variation: ${variation}, any agent)`);
      return { conversa: data, resolvedAgentId: data.agent_id || 'sofia', lookupMethod: 'exact_any_agent' };
    }
  }

  // 3. Fallback: search by last 8 digits (more flexible)
  const { data, error } = await supabase
    .from("chatbot_conversas")
    .select("id, cliente_nome, cliente_telefone, sofia_mode, needs_human_fallback, escalated_at, agent_id")
    .ilike("cliente_telefone", `%${last8Digits}`)
    .is("ended_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (!error && data) {
    console.log(`[Z-API Webhook] ✅ Found via last 8 digits (${last8Digits}), stored phone: ${data.cliente_telefone}`);
    return { conversa: data, resolvedAgentId: data.agent_id || 'sofia', lookupMethod: 'last8_digits' };
  }

  console.log(`[Z-API Webhook] ❌ No conversation found for any variation or last 8 digits`);
  return { conversa: null, resolvedAgentId: agentIdFromPayload || 'sofia', lookupMethod: 'not_found' };
}

/**
 * ROBUST OPERATOR COMMAND HANDLER
 * Key improvements:
 * 1. Agent ID fallback: if not provided, find from active conversation
 * 2. Correct credentials: send messages using agent-specific Z-API
 * 3. Clear confirmation messages
 * 4. CRITICAL FIX: Uses phone variations to find conversation even with 12/13 digit mismatch
 * 5. Applies HARD STOP on takeover: clears all pending automations
 */
async function handleOperatorCommand(
  supabase: any,
  phone: string,
  command: string,
  logId: string | null,
  agentIdFromPayload: string | null = null,
  extractedText: string = '',
  chatLid: string | null = null
): Promise<{ handled: boolean; action?: string; agentId?: string }> {
  const { command: detectedCommand, isPause, isResume, isSAC } = detectOperatorCommandV2(command);

  if (!isPause && !isResume && !isSAC) {
    return { handled: false };
  }

  const rawPhone = phone; // Keep original for logging
  
  // SMART PHONE RESOLUTION: Handle both regular phones and LIDs (multi-device mode)
  const { phone: resolvedPhone, method: resolveMethod } = await resolveOperatorCommandPhone(
    supabase,
    phone,
    chatLid,
    agentIdFromPayload || 'sofia'
  );
  
  if (!resolvedPhone) {
    console.error(`[Z-API Webhook] ❌ TAKEOVER FAILED: Could not resolve LID to phone. raw=${rawPhone}, chatLid=${chatLid}`);
    
    // Log the failed attempt for diagnostics
    await supabase.from("operator_command_logs").insert({
      command: detectedCommand,
      client_phone: rawPhone,
      operator_name: "Operador",
      action_result: `failed - lid_unresolved (raw=${rawPhone}, chatLid=${chatLid}, agent=${agentIdFromPayload})`,
    });
    
    await updateWebhookLog(supabase, logId, { processing_status: "lid_unresolved" });

    // Always provide feedback in the operator chat
    await sendZApiMessage(rawPhone, `⚠️ Não consegui identificar o telefone dessa conversa (LID não resolvido).\n\nTente usar: *#RESOLVIDO 55DDDNÚMERO* ou *#ASSUMIR 55DDDNÚMERO*.` , agentIdFromPayload || 'sofia');
    return { handled: true, action: "lid_unresolved" };
  }
  
  const targetPhone = resolvedPhone;
  
  console.log(`[Z-API Webhook] 🔍 Processing operator command: "${detectedCommand}" for phone ${targetPhone} (raw: ${rawPhone}, method: ${resolveMethod}, agent: ${agentIdFromPayload})`);

  // ROBUST CONVERSATION LOOKUP WITH VARIATIONS
  const { conversa, resolvedAgentId, lookupMethod } = await findConversationByPhoneVariations(
    supabase,
    targetPhone,
    agentIdFromPayload
  );

  if (!conversa) {
    console.warn(`[Z-API Webhook] ❌ No active conversation found for ${targetPhone} (raw: ${rawPhone})`);
    
    // Log the failed attempt for diagnostics with full context
    await supabase.from("operator_command_logs").insert({
      command: detectedCommand,
      client_phone: targetPhone,
      operator_name: "Operador",
      action_result: `failed - no_conversation (raw=${rawPhone}, normalized=${targetPhone}, variations=${generatePhoneVariations(targetPhone).join(',')}, agent=${agentIdFromPayload}, text=${extractedText.substring(0, 50)})`,
    });
    
    await updateWebhookLog(supabase, logId, { processing_status: "no_conversation" });

    // Always provide feedback to the operator
    await sendZApiMessage(targetPhone, `ℹ️ *Comando recebido*, mas não encontrei um atendimento ativo associado a esse telefone.\n\nSe quiser devolver um atendimento específico, use:\n• *#RESOLVIDO 55DDDNÚMERO*\nou envie *#RESOLVIDO* diretamente no chat do cliente.`, resolvedAgentId);
    return { handled: true, action: "no_conversation" };
  }

  console.log(`[Z-API Webhook] 📞 Conversation found via "${lookupMethod}": ${conversa.id}, stored phone: ${conversa.cliente_telefone}`);

  const clienteName = conversa.cliente_nome || "cliente";
  const clientFirstName = clienteName.split(" ")[0] || clienteName;
  
  // Get agent display name for messages
  const agentDisplayName = resolvedAgentId === 'sofia' ? 'sofIA' : 
                           resolvedAgentId === 'maria' ? 'marIA' :
                           resolvedAgentId === 'julia' ? 'julIA' :
                           resolvedAgentId === 'iago' ? 'iagO' :
                           resolvedAgentId === 'jaime' ? 'jaimE' : 'IA';

  if (isSAC) {
    if (conversa.sofia_mode === 'sac_redirect') {
      console.log(`[Z-API Webhook] Conversation ${conversa.id} already in sac_redirect`);
      return { handled: true, action: 'already_sac', agentId: resolvedAgentId };
    }

    const nowIso = new Date().toISOString();

    // Mark as SAC and clear ALL pending automations to avoid any future confusion.
    const { error: updateError } = await supabase
      .from('chatbot_conversas')
      .update({
        sofia_mode: 'sac_redirect',
        needs_human_fallback: true,
        escalated_at: nowIso,
        escalation_reason: `Redirecionado ao SAC por operador (${detectedCommand})`,
        human_agent_nome: 'Operador',
        atendente_notificado_at: nowIso,
        // Hard cleanup of schedules
        next_followup_at: null,
        next_nudge_at: null,
        next_rescue_at: null,
        next_contract_nudge_at: null,
        // Also clear any pending task so we don't re-trigger rescue/automation
        pending_task: null,
        pending_task_retries: 0,
      })
      .eq('id', conversa.id);

    if (updateError) {
      console.error('[Z-API Webhook] Error setting SAC redirect:', updateError);
      return { handled: true, action: 'error', agentId: resolvedAgentId };
    }

    const confirmationMessage = `✅ *Atendimento direcionado ao suporte*

${clientFirstName}, entendi que seu caso é de suporte. Vou encaminhar seu atendimento para o time da COESA.

_${agentDisplayName} não enviará mais lembretes automáticos nessa conversa._`;
    await sendZApiMessage(targetPhone, confirmationMessage, resolvedAgentId);

    await supabase.from('operator_command_logs').insert({
      command: detectedCommand,
      conversa_id: conversa.id,
      client_phone: targetPhone,
      client_name: clienteName,
      operator_phone: targetPhone,
      operator_name: 'Operador',
      action_result: `sac_redirect - agent=${resolvedAgentId}, payloadAgent=${agentIdFromPayload}`,
    });

    await supabase.from('chatbot_mensagens').insert([
      { conversa_id: conversa.id, role: 'system', content: `[COMANDO] ${detectedCommand} executado (sac_redirect, agent: ${resolvedAgentId})` },
      { conversa_id: conversa.id, role: 'assistant', content: confirmationMessage },
    ]);

    await updateWebhookLog(supabase, logId, { processing_status: 'operator_command_sac_redirect' });
    return { handled: true, action: 'sac_redirect', agentId: resolvedAgentId };
  }

  if (isPause) {
    // Check if already paused
    if (conversa.sofia_mode === 'paused_for_human') {
      console.log(`[Z-API Webhook] Conversation ${conversa.id} already paused`);

      // Feedback + log
      await supabase.from('operator_command_logs').insert({
        command: detectedCommand,
        conversa_id: conversa.id,
        client_phone: conversa.cliente_telefone || targetPhone,
        client_name: conversa.cliente_nome,
        operator_phone: targetPhone,
        operator_name: 'Operador',
        action_result: `already_paused - agent=${resolvedAgentId}`,
      });
      await updateWebhookLog(supabase, logId, { processing_status: 'operator_command_already_paused' });
      await sendZApiMessage(targetPhone, `ℹ️ *Comando recebido.*\n\nEsse atendimento já está em modo humano (pausado).`, resolvedAgentId);
      return { handled: true, action: "already_paused", agentId: resolvedAgentId };
    }

    const nowIso = new Date().toISOString();

    // ATOMIC: Pause conversation with HARD STOP (clear ALL pending automations)
    // This ensures no followups, nudges, or rescues are triggered after takeover
    const { error: updateError } = await supabase
      .from("chatbot_conversas")
      .update({
        sofia_mode: "paused_for_human",
        needs_human_fallback: true,
        escalated_at: nowIso,
        escalation_reason: `Atendente assumiu via comando ${detectedCommand}`,
        human_agent_nome: "Operador",
        atendente_notificado_at: nowIso,
        // HARD STOP: Clear ALL pending automations
        next_followup_at: null,
        next_nudge_at: null,
        next_rescue_at: null,
        next_contract_nudge_at: null,
        pending_task: null,
        pending_task_retries: 0,
        pending_task_created_at: null,
      })
      .eq("id", conversa.id);

    if (updateError) {
      console.error("[Z-API Webhook] Error pausing conversation:", updateError);
      return { handled: true, action: "error" };
    }

    console.log(`[Z-API Webhook] ✅ Conversation ${conversa.id} PAUSED with HARD STOP (agent: ${resolvedAgentId}, lookup: ${lookupMethod})`);

    // CLEAR CONFIRMATION: Single combined message
    const confirmationMessage = `✅ *Atendimento assumido por humano*\n\n${clientFirstName}, vou transferir seu atendimento para um especialista da equipe. Você está em boas mãos! 😊\n\n_${agentDisplayName} pausada. Use #RESOLVIDO para reativar._`;
    
    // Use stored phone from conversation for reliable delivery
    const phoneToSend = conversa.cliente_telefone || targetPhone;
    await sendZApiMessage(phoneToSend, confirmationMessage, resolvedAgentId);

    // Log the command with full diagnostics
    await supabase.from("operator_command_logs").insert({
      command: detectedCommand,
      conversa_id: conversa.id,
      client_phone: phoneToSend,
      client_name: clienteName,
      operator_phone: targetPhone,
      operator_name: "Operador",
      action_result: `paused - agent=${resolvedAgentId}, lookup=${lookupMethod}, storedPhone=${conversa.cliente_telefone}, raw=${rawPhone}`,
    });

    // Save to message history
    await supabase.from("chatbot_mensagens").insert([
      { conversa_id: conversa.id, role: "system", content: `[COMANDO] ${detectedCommand} executado (agent: ${resolvedAgentId}, lookup: ${lookupMethod})` },
      { conversa_id: conversa.id, role: "assistant", content: confirmationMessage },
    ]);

    await updateWebhookLog(supabase, logId, { processing_status: "operator_command_paused" });
    return { handled: true, action: "paused", agentId: resolvedAgentId };
  }

  if (isResume) {
    // Check if actually paused
    if (conversa.sofia_mode !== 'paused_for_human') {
      console.log(`[Z-API Webhook] Conversation ${conversa.id} not paused, ignoring resume`);

      await supabase.from('operator_command_logs').insert({
        command: detectedCommand,
        conversa_id: conversa.id,
        client_phone: conversa.cliente_telefone || targetPhone,
        client_name: conversa.cliente_nome,
        operator_phone: targetPhone,
        operator_name: 'Operador',
        action_result: `not_paused - agent=${resolvedAgentId}, sofia_mode=${conversa.sofia_mode}`,
      });
      await updateWebhookLog(supabase, logId, { processing_status: 'operator_command_not_paused' });

      // Provide feedback instead of silent ignore
      await sendZApiMessage(
        targetPhone,
        `ℹ️ *Comando recebido*, mas esse atendimento não está em modo humano no momento.\n\nSe você quer devolver um atendimento específico, use:\n• *#RESOLVIDO 55DDDNÚMERO*\nou envie *#RESOLVIDO* diretamente no chat do cliente.`,
        resolvedAgentId
      );
      return { handled: true, action: "not_paused", agentId: resolvedAgentId };
    }

    // Calculate resolution time
    let resolutionTimeSeconds: number | null = null;
    if (conversa.escalated_at) {
      const escalatedAt = new Date(conversa.escalated_at);
      resolutionTimeSeconds = Math.floor((Date.now() - escalatedAt.getTime()) / 1000);
    }

    // Resume conversation
    const { error: updateError } = await supabase
      .from("chatbot_conversas")
      .update({
        sofia_mode: "standard",
        needs_human_fallback: false,
        human_resolved_at: new Date().toISOString(),
        human_resolution_time_seconds: resolutionTimeSeconds,
      })
      .eq("id", conversa.id);

    if (updateError) {
      console.error("[Z-API Webhook] Error resuming conversation:", updateError);
      return { handled: true, action: "error" };
    }

    console.log(`[Z-API Webhook] ✅ Conversation ${conversa.id} RESUMED (agent: ${resolvedAgentId}, resolution: ${resolutionTimeSeconds}s)`);

    // CLEAR CONFIRMATION: Single combined message
    const confirmationMessage = `✅ *Atendimento automático reativado*\n\n${clientFirstName}, estou de volta! 😊 Como posso te ajudar?\n\n_${agentDisplayName} ativa novamente._`;
    await sendZApiMessage(targetPhone, confirmationMessage, resolvedAgentId);

    // Log the command
    await supabase.from("operator_command_logs").insert({
      command: detectedCommand,
      conversa_id: conversa.id,
      client_phone: targetPhone,
      client_name: clienteName,
      operator_phone: targetPhone,
      operator_name: "Operador",
      action_result: `resumed - agent=${resolvedAgentId}, resolution_time=${resolutionTimeSeconds}s`,
    });

    // Save to message history
    await supabase.from("chatbot_mensagens").insert([
      { conversa_id: conversa.id, role: "system", content: `[COMANDO] ${detectedCommand} executado (agent: ${resolvedAgentId})` },
      { conversa_id: conversa.id, role: "assistant", content: confirmationMessage },
    ]);

    await updateWebhookLog(supabase, logId, { processing_status: "operator_command_resumed" });
    return { handled: true, action: "resumed", agentId: resolvedAgentId };
  }

  return { handled: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Best-effort: keep Z-API webhook routes aligned (especially "sent by me")
  // so operator commands typed manually can be ingested as normal messages.
  await ensureZApiWebhooksConfigured();

  let bodyRaw = "";
  let bodyParsed: ZApiWebhookPayload | null = null;
  let parseError: string | null = null;

  try {
    bodyRaw = await req.text();
    console.log(`[Z-API Webhook ${BUILD_VERSION}] Raw body received:`, bodyRaw.substring(0, 500));
    if (bodyRaw) {
      const rawParsed = JSON.parse(bodyRaw);
      
      // Validate with Zod schema for protection against prototype pollution
      const validationResult = validateZApiWebhook(rawParsed);
      if (validationResult.success) {
        bodyParsed = validationResult.data!;
      } else {
        parseError = validationResult.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || 'Validation failed';
        console.warn(`[Z-API Webhook] Validation warnings (non-blocking): ${parseError}`);
        // Still use raw parsed for backward compatibility, but sanitized
        bodyParsed = sanitizeObject(rawParsed) as ZApiWebhookPayload;
        parseError = null; // Clear error since we recovered
      }
    }
  } catch (e) {
    parseError = e instanceof Error ? e.message : "Unknown parse error";
    console.error("[Z-API Webhook] Parse error:", parseError);
  }

  // Determine event type
  let eventType = "unknown";
  let phone = "";
  let messagePreview = "";
  let chatId = "";

  if (bodyParsed) {
    eventType = bodyParsed.type || "message";

    const rawPhone = bodyParsed.phone || bodyParsed.participantPhone || "";
    phone = normalizeIncomingPhone(rawPhone);
    chatId = phone || rawPhone || "";

    if (bodyParsed.text?.message) {
      messagePreview = bodyParsed.text.message.substring(0, 100);
    } else if (bodyParsed.audio) {
      messagePreview = "[Áudio recebido]";
    } else if (bodyParsed.image) {
      messagePreview = bodyParsed.image.caption || "[Imagem recebida]";
    } else if (bodyParsed.document) {
      messagePreview = bodyParsed.document.title || "[Documento recebido]";
    }
  }

  // Dedupe: Z-API can resend the same ReceivedCallback
  const isFromMe = bodyParsed?.fromMe === true;
  const shouldDedupe =
    !!bodyParsed &&
    eventType === "ReceivedCallback" &&
    !!phone &&
    !!bodyParsed.messageId &&
    !isFromMe &&
    bodyParsed.isGroup !== true;

  const duplicated = shouldDedupe
    ? await isDuplicateReceivedCallback(supabase, phone, bodyParsed!.messageId!)
    : false;

  // Log event to database
  let logId: string | null = null;
  try {
    const { data, error } = await supabase
      .from("whatsapp_webhook_events")
      .insert({
        provider: "z-api",
        body_raw: bodyRaw.substring(0, 10000),
        body_parsed: bodyParsed,
        parsed_ok: !parseError,
        error_message: parseError,
        event_type: eventType,
        phone,
        chat_id: chatId,
        message_preview: messagePreview,
        content_type: req.headers.get("content-type"),
        request_method: req.method,
        processing_status: duplicated ? "deduped" : "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Z-API Webhook] Failed to log event:", error);
    } else {
      logId = (data as { id: string } | null)?.id ?? null;
    }
  } catch (logError) {
    console.error("[Z-API Webhook] Failed to log event:", logError);
  }

  if (duplicated) {
    console.log(`[Z-API Webhook] Deduped ReceivedCallback (messageId=${bodyParsed!.messageId}) for ${phone}`);
    return new Response(
      JSON.stringify({ status: "deduped", reason: "Duplicate ReceivedCallback" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!bodyParsed) {
    return new Response(
      JSON.stringify({ error: "Failed to parse webhook body", details: parseError }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RATE LIMITING - First Line of Defense
  // ═══════════════════════════════════════════════════════════════
  const rateLimitResponse = await rateLimitMiddleware(supabase, phone, bodyParsed._agentId || 'sofia');
  if (rateLimitResponse) {
    console.warn(`[Z-API Webhook] 🚫 Rate limited: ${phone}`);
    await updateWebhookLog(supabase, logId, { processing_status: "rate_limited" });
    return rateLimitResponse;
  }

  // Extract agent ID (may be null if not injected by maria-webhook, julia-webhook, etc.)
  const agentIdFromPayload = bodyParsed._agentId || null;
  
  // Extract chatLid for LID mapping
  const chatLid = bodyParsed.chatLid || null;
  
  // SAVE LID MAPPING: When we have both a valid phone AND a chatLid, save the mapping
  // This allows future operator commands with LID to be resolved
  if (chatLid && phone && !isLidPhone(phone)) {
    await saveLidPhoneMapping(supabase, chatLid, phone, agentIdFromPayload || 'sofia');
  }

  // ROBUST TEXT EXTRACTION: Use multiple fields to extract message text
  let extractedText = extractTextFromPayload(bodyParsed);
  
  // FALLBACK: Some Z-API ReceivedCallback payloads (multi-device / new versions)
  // can arrive WITHOUT the message body (no text/audio/image/document fields).
  // If that happens, we must fetch the content via the read-message endpoint;
  // otherwise the client gets ignored.
  const messageIdForFetch = bodyParsed.messageId;
  const shouldFetchText =
    !!messageIdForFetch &&
    !extractedText &&
    eventType === "ReceivedCallback" &&
    bodyParsed.isGroup !== true &&
    !bodyParsed.audio &&
    !bodyParsed.image &&
    !bodyParsed.document;

  if (shouldFetchText) {
    const direction = isFromMe ? "fromMe" : "inbound";
    console.log(
      `[Z-API Webhook] ⚠️ ${direction} ReceivedCallback without body. Fetching message ${messageIdForFetch} via API...`
    );

    const fetchedText = await fetchMessageTextFromZApi(
      messageIdForFetch,
      agentIdFromPayload || "sofia",
      supabase
    );

    if (fetchedText) {
      extractedText = fetchedText;
      console.log(
        `[Z-API Webhook] ✅ Successfully fetched text (${direction}): "${extractedText.substring(0, 50)}"`
      );
    } else {
      console.log(`[Z-API Webhook] ❌ Could not fetch text for message ${messageIdForFetch}`);
    }
  }
  
  // ROBUST COMMAND DETECTION: Detect command even with prefixes/suffixes
  const { command: detectedCommand, isPause, isResume } = detectOperatorCommand(extractedText);
  const isOperatorCommand = isPause || isResume;

  // If fromMe=true AND it's an operator command, process it directly
  if (isFromMe && isOperatorCommand) {
    console.log(`[Z-API Webhook] 🎯 OPERATOR COMMAND DETECTED: "${detectedCommand}" (extracted from: "${extractedText.substring(0, 50)}", phone: ${phone}, chatLid: ${chatLid})`);
    
    const result = await handleOperatorCommand(supabase, phone, detectedCommand!, logId, agentIdFromPayload, extractedText, chatLid);
    
    return new Response(
      JSON.stringify({
        status: "processed",
        operatorCommand: true,
        command: detectedCommand,
        action: result.action,
        agentId: result.agentId,
        extractedText: extractedText.substring(0, 50),
        resolveMethod: 'lid_aware',
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Skip other outgoing messages (fromMe=true but not commands)
  if (isFromMe) {
    console.log("[Z-API Webhook] Ignoring outgoing message (fromMe=true)", extractedText ? `text="${extractedText.substring(0, 30)}"` : 'no text');
    await updateWebhookLog(supabase, logId, { processing_status: "ignored_outgoing" });
    return new Response(
      JSON.stringify({ status: "ignored", reason: "Outgoing message (fromMe=true)" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Skip group messages
  if (bodyParsed.isGroup === true) {
    console.log("[Z-API Webhook] Ignoring group message");
    await updateWebhookLog(supabase, logId, { processing_status: "ignored_group" });
    return new Response(
      JSON.stringify({ status: "ignored", reason: "Group message" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Extract message content for forwarding to Sofia
  let messageContent = "";
  let messageType = "text";
  let mediaUrl: string | null = null;
  let mimeType: string | null = null;

  if (bodyParsed.text?.message) {
    messageContent = bodyParsed.text.message;
    messageType = "text";
  } else if (extractedText) {
    // Fallback for payload variants where text isn't in `text.message`
    messageContent = extractedText;
    messageType = "text";
  } else if (bodyParsed.audio) {
    messageContent = "[Áudio]";
    messageType = "audio";
    mediaUrl = bodyParsed.audio.audioUrl || null;
    mimeType = bodyParsed.audio.mimeType || null;
  } else if (bodyParsed.image) {
    messageContent = bodyParsed.image.caption || "[Imagem]";
    messageType = "image";
    mediaUrl = bodyParsed.image.imageUrl || null;
    mimeType = bodyParsed.image.mimeType || null;
  } else if (bodyParsed.document) {
    messageContent = bodyParsed.document.title || "[Documento]";
    messageType = "document";
    mediaUrl = bodyParsed.document.documentUrl || null;
    mimeType = bodyParsed.document.mimeType || null;
  }

  if (!messageContent && !mediaUrl) {
    console.log("[Z-API Webhook] No message content or media found");
    await updateWebhookLog(supabase, logId, { processing_status: "no_content" });
    return new Response(
      JSON.stringify({ status: "ignored", reason: "No message content or media" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[Z-API Webhook] Processing ${messageType} from ${phone}: ${messageContent.substring(0, 50)}...`);
  await updateWebhookLog(supabase, logId, { processing_status: "processing" });

  // Transform and forward to sofia-webhook
  // agentId was extracted earlier for operator command handling
  const transformedPayload = {
    data: [
      {
        id: bodyParsed.messageId || crypto.randomUUID(),
        fromMe: false,
        side: "in",
        type: messageType === "audio" ? "voice" : messageType,
        message: {
          text: messageContent,
          ...(mediaUrl && {
            file: {
              link: mediaUrl,
              contentType: mimeType,
            },
          }),
        },
        fromUser: {
          id: phone,
          name: bodyParsed.senderName || bodyParsed.chatName,
          phone: phone,
        },
        chat: {
          id: phone,
          phone: phone,
          name: bodyParsed.chatName || bodyParsed.senderName,
          type: "private",
        },
        time: bodyParsed.momment
          ? Math.floor(bodyParsed.momment / 1000)
          : Math.floor(Date.now() / 1000),
      },
    ],
    _zapiOriginal: bodyParsed,
    _provider: "z-api",
    _agentId: agentIdFromPayload || 'sofia',
  };
  
  console.log(`[Z-API Webhook] Forwarding to sofia-webhook with agent_id: ${agentIdFromPayload || 'sofia'}`);


  try {
    const webhookResponse = await fetch(`${SUPABASE_URL}/functions/v1/sofia-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(transformedPayload),
    });

    const webhookResult = await webhookResponse.text();
    console.log("[Z-API Webhook] sofia-webhook response:", webhookResponse.status, webhookResult.substring(0, 200));

    await updateWebhookLog(supabase, logId, {
      processing_status: webhookResponse.ok ? "processed" : "error",
      error_message: webhookResponse.ok ? null : webhookResult.substring(0, 500),
    });

    return new Response(
      JSON.stringify({
        status: "processed",
        forwarded: true,
        chatappResponse: webhookResult.substring(0, 500),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (forwardError) {
    console.error("[Z-API Webhook] Error forwarding to sofia-webhook:", forwardError);
    await updateWebhookLog(supabase, logId, {
      processing_status: "error",
      error_message: forwardError instanceof Error ? forwardError.message : "Unknown error",
    });

    return new Response(
      JSON.stringify({
        error: "Failed to process message",
        details: forwardError instanceof Error ? forwardError.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});