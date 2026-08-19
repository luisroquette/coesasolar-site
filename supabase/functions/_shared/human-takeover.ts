/**
 * Human Takeover Store (hard-stop)
 *
 * Purpose: Make #ASSUMIR/#RESOLVIDO behavior resilient by keeping an
 * explicit, phone-based "do not automate" list in the database.
 * 
 * This is the SINGLE SOURCE OF TRUTH for blocking ALL automations.
 * Every scheduler MUST check this table before sending any message.
 */

export type HumanTakeoverKey = {
  agentId: string;
  whatsappProvider?: string | null;
  phoneNormalized: string;
};

export function normalizeTakeoverPhone(input: string): string {
  let digits = (input || '').replace(/\D/g, '');
  if (!digits) return '';

  // Keep if already contains Brazil country code
  if (digits.startsWith('55') && digits.length >= 12) return digits;

  // If user provided just DDD+number, prepend 55
  if (digits.length === 11) return `55${digits}`;

  // If DDD+8-digit (10), add the missing 9 for mobile format
  if (digits.length === 10) return `55${digits.slice(0, 2)}9${digits.slice(2)}`;

  // Fallback: return as-is (better than failing closed)
  return digits;
}

function resolveProvider(whatsappProvider?: string | null): string {
  return (whatsappProvider && whatsappProvider.trim()) ? whatsappProvider.trim() : 'zapi';
}

/**
 * Check if a phone number has an active human takeover.
 * This is the CRITICAL check that ALL schedulers must perform.
 */
// deno-lint-ignore no-explicit-any
export async function isHumanTakeoverActive(
  supabase: any,
  key: HumanTakeoverKey
): Promise<boolean> {
  try {
    if (!key.agentId || !key.phoneNormalized) return false;
    const provider = resolveProvider(key.whatsappProvider);

    const { data, error } = await supabase
      .from('human_takeovers')
      .select('id')
      .eq('agent_id', key.agentId)
      .eq('whatsapp_provider', provider)
      .eq('phone_normalized', key.phoneNormalized)
      .is('resolved_at', null)
      .limit(1);

    if (error) {
      console.warn('[human-takeover] isHumanTakeoverActive query error:', error);
      return false;
    }
    return (data || []).length > 0;
  } catch (err) {
    console.warn('[human-takeover] isHumanTakeoverActive error:', err);
    return false;
  }
}

/**
 * Check if takeover is active for a phone (simplified API for schedulers).
 * Handles phone normalization internally.
 */
// deno-lint-ignore no-explicit-any
export async function isPhoneBlockedByTakeover(
  supabase: any,
  phone: string,
  agentId: string = 'sofia',
  whatsappProvider: string = 'zapi'
): Promise<boolean> {
  const phoneNormalized = normalizeTakeoverPhone(phone);
  if (!phoneNormalized) return false;
  
  return isHumanTakeoverActive(supabase, {
    agentId,
    whatsappProvider,
    phoneNormalized,
  });
}

/**
 * Batch check: returns a Set of phone numbers that are blocked by takeover.
 * Optimized for schedulers that process multiple conversations.
 */
// deno-lint-ignore no-explicit-any
export async function getBlockedPhones(
  supabase: any,
  phones: string[],
  agentId: string = 'sofia',
  whatsappProvider: string = 'zapi'
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (!phones.length) return blocked;
  
  const normalizedPhones = phones
    .map(p => normalizeTakeoverPhone(p))
    .filter(p => p.length > 0);
  
  if (!normalizedPhones.length) return blocked;
  
  try {
    const provider = resolveProvider(whatsappProvider);
    
    const { data, error } = await supabase
      .from('human_takeovers')
      .select('phone_normalized')
      .eq('agent_id', agentId)
      .eq('whatsapp_provider', provider)
      .in('phone_normalized', normalizedPhones)
      .is('resolved_at', null);
    
    if (error) {
      console.warn('[human-takeover] getBlockedPhones query error:', error);
      return blocked;
    }
    
    for (const row of (data || [])) {
      blocked.add(row.phone_normalized);
    }
    
    if (blocked.size > 0) {
      console.log(`[human-takeover] 🛑 Found ${blocked.size} phones blocked by active takeover`);
    }
    
    return blocked;
  } catch (err) {
    console.warn('[human-takeover] getBlockedPhones error:', err);
    return blocked;
  }
}

// deno-lint-ignore no-explicit-any
export async function ensureHumanTakeoverActive(
  supabase: any,
  input: {
    agentId: string;
    whatsappProvider?: string | null;
    phone: string;
    takenOverByPhone?: string | null;
    takenOverByName?: string | null;
  }
): Promise<void> {
  const phoneNormalized = normalizeTakeoverPhone(input.phone);
  if (!phoneNormalized) return;

  const provider = resolveProvider(input.whatsappProvider);

  try {
    const { error } = await supabase
      .from('human_takeovers')
      .insert({
        agent_id: input.agentId,
        whatsapp_provider: provider,
        phone_normalized: phoneNormalized,
        taken_over_by_phone: input.takenOverByPhone || null,
        taken_over_by_name: input.takenOverByName || null,
        taken_over_at: new Date().toISOString(),
      });

    // If it already exists (unique active), that's fine.
    if (error) {
      const msg = String((error as any)?.message || error);
      if (!msg.toLowerCase().includes('duplicate') && !msg.toLowerCase().includes('unique')) {
        console.warn('[human-takeover] ensureHumanTakeoverActive insert error:', error);
      }
    }
    
    console.log(`[human-takeover] ✅ Takeover registered: ${phoneNormalized} (agent: ${input.agentId})`);
  } catch (err) {
    console.warn('[human-takeover] ensureHumanTakeoverActive error:', err);
  }
}

// deno-lint-ignore no-explicit-any
export async function resolveHumanTakeover(
  supabase: any,
  input: {
    agentId: string;
    whatsappProvider?: string | null;
    phone: string;
    resolvedByPhone?: string | null;
    resolvedByName?: string | null;
  }
): Promise<void> {
  const phoneNormalized = normalizeTakeoverPhone(input.phone);
  if (!phoneNormalized) return;

  const provider = resolveProvider(input.whatsappProvider);
  const nowIso = new Date().toISOString();

  try {
    const { error, count } = await supabase
      .from('human_takeovers')
      .update({
        resolved_at: nowIso,
        resolved_by_phone: input.resolvedByPhone || null,
        resolved_by_name: input.resolvedByName || null,
      })
      .eq('agent_id', input.agentId)
      .eq('whatsapp_provider', provider)
      .eq('phone_normalized', phoneNormalized)
      .is('resolved_at', null);

    if (error) {
      console.warn('[human-takeover] resolveHumanTakeover update error:', error);
    } else {
      console.log(`[human-takeover] ✅ Takeover resolved: ${phoneNormalized} (agent: ${input.agentId})`);
    }
  } catch (err) {
    console.warn('[human-takeover] resolveHumanTakeover error:', err);
  }
}
