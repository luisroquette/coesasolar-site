/**
 * Hot Lead Detection Module
 * Detects when a lead shows strong closing intent and triggers alerts
 */

import { matchesPatternCategory, loadDetectionPatterns, type PatternEntry } from './detection-patterns.ts';

export interface HotLeadDetectionResult {
  isHotLead: boolean;
  matchedPattern: string | null;
  confidence: 'high' | 'medium' | null;
}

export interface HotLeadAlertPayload {
  nome: string;
  telefone: string;
  email?: string;
  cidade?: string;
  distribuidora?: string;
  valor_conta?: number;
  economia_estimada?: number;
  lead_score?: number;
  origem?: string;
  bitrix_lead_id?: string;
  conversa_id?: string;
  trigger_message?: string;
}

/**
 * Detect if a message indicates hot lead (closing intent)
 * First checks for exclusion patterns (not_hot_lead_interest), 
 * then checks for hot lead patterns (hot_lead_closing)
 */
export function detectHotLead(
  message: string,
  patterns?: Map<string, PatternEntry>
): HotLeadDetectionResult {
  const normalizedMessage = message.toLowerCase().trim();
  
  // Short messages are unlikely to be closing intent
  if (normalizedMessage.length < 8) {
    return { isHotLead: false, matchedPattern: null, confidence: null };
  }
  
  // First: Check for exclusion patterns (just interest, not closing)
  // These take priority to avoid false positives
  if (matchesPatternCategory(message, 'not_hot_lead_interest', patterns)) {
    console.log('[HOT_LEAD] Excluded by not_hot_lead_interest pattern');
    return { isHotLead: false, matchedPattern: null, confidence: null };
  }
  
  // Second: Check for closing intent patterns
  if (matchesPatternCategory(message, 'hot_lead_closing', patterns)) {
    // Extract the matched keyword for logging
    const patternsToUse = patterns || new Map();
    const closingPatterns = patternsToUse.get('hot_lead_closing');
    let matchedPattern: string | null = null;
    
    if (closingPatterns) {
      for (const kw of closingPatterns.keywords) {
        if (normalizedMessage.includes(kw.toLowerCase())) {
          matchedPattern = kw;
          break;
        }
      }
      if (!matchedPattern) {
        for (const rx of closingPatterns.regexPatterns) {
          if (rx.test(message)) {
            matchedPattern = rx.source;
            break;
          }
        }
      }
    }
    
    console.log(`[HOT_LEAD] 🔥 Detected closing intent: "${matchedPattern}"`);
    return { 
      isHotLead: true, 
      matchedPattern, 
      confidence: 'high' 
    };
  }
  
  return { isHotLead: false, matchedPattern: null, confidence: null };
}

/**
 * Trigger hot lead alert by calling the edge function
 */
export async function triggerHotLeadAlert(
  supabase: any,
  payload: HotLeadAlertPayload
): Promise<{ success: boolean; error?: string }> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[HOT_LEAD_ALERT] Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return { success: false, error: 'Missing environment variables' };
  }
  
  try {
    console.log(`[HOT_LEAD_ALERT] 🔥 Triggering alert for ${payload.nome} (${payload.telefone})`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sofia-hot-lead-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[HOT_LEAD_ALERT] Failed: ${response.status} - ${errorText}`);
      return { success: false, error: errorText };
    }
    
    const result = await response.json();
    console.log(`[HOT_LEAD_ALERT] ✅ Alert triggered successfully, sent to ${result.sent_to} recipients`);
    
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[HOT_LEAD_ALERT] Exception:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Build alert payload from conversation data
 */
export function buildHotLeadPayload(
  conversa: any,
  dadosColetados: Record<string, unknown> | null,
  triggerMessage?: string
): HotLeadAlertPayload {
  return {
    nome: conversa?.cliente_nome || dadosColetados?.nome as string || 'Lead',
    telefone: conversa?.cliente_telefone || '',
    email: conversa?.cliente_email || dadosColetados?.email as string || undefined,
    cidade: dadosColetados?.cidade as string || undefined,
    distribuidora: dadosColetados?.distribuidora as string || undefined,
    valor_conta: dadosColetados?.valor_conta as number || undefined,
    economia_estimada: dadosColetados?.economia_estimada as number || undefined,
    lead_score: conversa?.lead_score || undefined,
    origem: 'whatsapp',
    bitrix_lead_id: conversa?.bitrix24_lead_id || undefined,
    conversa_id: conversa?.id || undefined,
    trigger_message: triggerMessage,
  };
}

/**
 * Full hot lead detection and alert flow
 * Returns true if alert was triggered
 */
export async function processHotLeadDetection(
  supabase: any,
  message: string,
  conversa: any,
  dadosColetados: Record<string, unknown> | null,
  patterns?: Map<string, PatternEntry>
): Promise<boolean> {
  // Detect if this is a hot lead message
  const detection = detectHotLead(message, patterns);
  
  if (!detection.isHotLead) {
    return false;
  }
  
  // Check if we already sent an alert recently (cooldown: 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: recentAlerts } = await supabase
    .from('activity_logs')
    .select('id')
    .eq('action', 'sofia_hot_lead_alert')
    .eq('entity_id', conversa?.id)
    .gte('created_at', oneHourAgo)
    .limit(1);
  
  if (recentAlerts && recentAlerts.length > 0) {
    console.log('[HOT_LEAD] Alert already sent in the last hour, skipping');
    return false;
  }
  
  // Build payload and trigger alert
  const payload = buildHotLeadPayload(conversa, dadosColetados, message);
  const result = await triggerHotLeadAlert(supabase, payload);
  
  return result.success;
}
