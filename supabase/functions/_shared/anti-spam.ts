/**
 * Anti-Spam Protection Module
 * 
 * Provides:
 * 1. Blacklist checking - blocks permanently excluded numbers
 * 2. Objection cooldown - 48-72h cooldown for rejected leads
 * 3. Warm-up control - gradual volume increase for new numbers
 * 
 * Zero Hardcode: All keywords, cooldowns and limits loaded from configuracoes_sistema
 */

// Use unified config loader for hierarchical config resolution
import { getConfigNumber, getConfigValue } from './unified-config-loader.ts';

// Fallback values (used if config not loaded)
const STRONG_OBJECTION_KEYWORDS_FALLBACK = [
  'nao_interessado',
  'nao_tenho_interesse',
  'reclamacao',
  'parar',
  'sair',
  'cancelar',
  'bloqueio',
  'spam',
  'nao_quero',
  'desisto',
  'nao_me_ligue',
  'nao_mande_mensagem'
];

const MILD_OBJECTION_KEYWORDS_FALLBACK = ['caro', 'depois', 'agora_nao', 'pensar'];

const COOLDOWN_CONFIG_FALLBACK = {
  strong_rejection: 72,
  mild_objection: 48,
  hesitation: 24
};

/**
 * Get strong objection keywords from config or fallback
 */
function getStrongObjectionKeywords(configCache?: Map<string, string>): string[] {
  const raw = getConfigValue('antispam_strong_objection_keywords', '', configCache);
  if (raw && raw.trim()) {
    return raw.split(',').map(k => k.trim().toLowerCase());
  }
  return STRONG_OBJECTION_KEYWORDS_FALLBACK;
}

/**
 * Get mild objection keywords from config or fallback
 */
function getMildObjectionKeywords(configCache?: Map<string, string>): string[] {
  const raw = getConfigValue('antispam_mild_objection_keywords', '', configCache);
  if (raw && raw.trim()) {
    return raw.split(',').map(k => k.trim().toLowerCase());
  }
  return MILD_OBJECTION_KEYWORDS_FALLBACK;
}

/**
 * Get cooldown hours from config or fallback
 */
function getCooldownHours(type: 'strong' | 'mild' | 'hesitation', configCache?: Map<string, string>): number {
  switch (type) {
    case 'strong':
      return getConfigNumber('antispam_cooldown_strong_hours', COOLDOWN_CONFIG_FALLBACK.strong_rejection, configCache);
    case 'mild':
      return getConfigNumber('antispam_cooldown_mild_hours', COOLDOWN_CONFIG_FALLBACK.mild_objection, configCache);
    case 'hesitation':
      return getConfigNumber('antispam_cooldown_hesitation_hours', COOLDOWN_CONFIG_FALLBACK.hesitation, configCache);
    default:
      return COOLDOWN_CONFIG_FALLBACK.hesitation;
  }
}

export interface AntiSpamCheckResult {
  canSend: boolean;
  reason?: string;
  cooldownUntil?: Date;
}

export interface WarmupStatus {
  currentLimit: number;
  messagesSent: number;
  remainingToday: number;
  daysSinceStart: number;
}

/**
 * Check if a phone number is blacklisted
 */
export async function isBlacklisted(
  supabase: any,
  telefone: string
): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const normalizedPhone = telefone.replace(/\D/g, '');
    
    const { data, error } = await supabase
      .from('whatsapp_blacklist')
      .select('motivo')
      .eq('telefone', normalizedPhone)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking blacklist:', error);
      return { blocked: false };
    }
    
    if (data) {
      return { blocked: true, reason: data.motivo };
    }
    
    return { blocked: false };
  } catch (error) {
    console.error('Error in isBlacklisted:', error);
    return { blocked: false };
  }
}

/**
 * Add a phone number to the blacklist
 */
export async function addToBlacklist(
  supabase: any,
  telefone: string,
  motivo: string,
  createdBy?: string
): Promise<boolean> {
  try {
    const normalizedPhone = telefone.replace(/\D/g, '');
    
    const { error } = await supabase
      .from('whatsapp_blacklist')
      .upsert({
        telefone: normalizedPhone,
        motivo,
        created_by: createdBy || 'system'
      }, { onConflict: 'telefone' });
    
    if (error) {
      console.error('Error adding to blacklist:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in addToBlacklist:', error);
    return false;
  }
}

/**
 * Remove a phone number from the blacklist
 */
export async function removeFromBlacklist(
  supabase: any,
  telefone: string
): Promise<boolean> {
  try {
    const normalizedPhone = telefone.replace(/\D/g, '');
    
    const { error } = await supabase
      .from('whatsapp_blacklist')
      .delete()
      .eq('telefone', normalizedPhone);
    
    if (error) {
      console.error('Error removing from blacklist:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in removeFromBlacklist:', error);
    return false;
  }
}

/**
 * Calculate cooldown duration based on detected objection - uses dynamic config
 */
export function calculateObjectionCooldown(detectedObjection: string | null, configCache?: Map<string, string>): number {
  if (!detectedObjection) return 0;
  
  const objectionLower = detectedObjection.toLowerCase();
  
  // Get keywords from config
  const strongKeywords = getStrongObjectionKeywords(configCache);
  const mildKeywords = getMildObjectionKeywords(configCache);
  
  // Check for strong rejection keywords
  for (const keyword of strongKeywords) {
    if (objectionLower.includes(keyword)) {
      return getCooldownHours('strong', configCache);
    }
  }
  
  // Check for mild objections
  for (const keyword of mildKeywords) {
    if (objectionLower.includes(keyword)) {
      return getCooldownHours('mild', configCache);
    }
  }
  
  // Default hesitation cooldown
  return getCooldownHours('hesitation', configCache);
}

/**
 * Check if a conversation is in objection cooldown
 */
export async function checkObjectionCooldown(
  supabase: any,
  conversaId: string
): Promise<{ inCooldown: boolean; cooldownUntil?: Date; hoursRemaining?: number }> {
  try {
    const { data, error } = await supabase
      .from('chatbot_conversas')
      .select('objection_cooldown_until, detected_objection')
      .eq('id', conversaId)
      .single();
    
    if (error || !data) {
      return { inCooldown: false };
    }
    
    // If there's an explicit cooldown set
    if (data.objection_cooldown_until) {
      const cooldownUntil = new Date(data.objection_cooldown_until);
      const now = new Date();
      
      if (cooldownUntil > now) {
        const hoursRemaining = Math.ceil((cooldownUntil.getTime() - now.getTime()) / (1000 * 60 * 60));
        return { inCooldown: true, cooldownUntil, hoursRemaining };
      }
    }
    
    return { inCooldown: false };
  } catch (error) {
    console.error('Error checking objection cooldown:', error);
    return { inCooldown: false };
  }
}

/**
 * Set objection cooldown for a conversation - uses dynamic config
 */
export async function setObjectionCooldown(
  supabase: any,
  conversaId: string,
  detectedObjection: string,
  configCache?: Map<string, string>
): Promise<boolean> {
  try {
    const cooldownHours = calculateObjectionCooldown(detectedObjection, configCache);
    
    if (cooldownHours === 0) return false;
    
    const cooldownUntil = new Date();
    cooldownUntil.setHours(cooldownUntil.getHours() + cooldownHours);
    
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({
        objection_cooldown_until: cooldownUntil.toISOString(),
        detected_objection: detectedObjection
      })
      .eq('id', conversaId);
    
    if (error) {
      console.error('Error setting objection cooldown:', error);
      return false;
    }
    
    console.log(`Set ${cooldownHours}h cooldown for conversation ${conversaId} due to: ${detectedObjection}`);
    return true;
  } catch (error) {
    console.error('Error in setObjectionCooldown:', error);
    return false;
  }
}

/**
 * Calculate warm-up daily limit based on days since start - uses dynamic config
 */
function calculateWarmupLimit(daysSinceStart: number, configCache?: Map<string, string>): number {
  // Get thresholds from config
  const threshold1 = getConfigNumber('antispam_warmup_day_threshold_1', 3, configCache);
  const threshold2 = getConfigNumber('antispam_warmup_day_threshold_2', 7, configCache);
  const threshold3 = getConfigNumber('antispam_warmup_day_threshold_3', 14, configCache);
  const threshold4 = getConfigNumber('antispam_warmup_day_threshold_4', 30, configCache);
  
  // Get limits from config
  const limitStage1 = getConfigNumber('antispam_warmup_limit_stage_1', 50, configCache);
  const limitStage2 = getConfigNumber('antispam_warmup_limit_stage_2', 100, configCache);
  const limitStage3 = getConfigNumber('antispam_warmup_limit_stage_3', 200, configCache);
  const limitStage4 = getConfigNumber('antispam_warmup_limit_stage_4', 500, configCache);
  const limitFull = getConfigNumber('antispam_warmup_limit_full', 1000, configCache);
  
  // Progressive warm-up schedule
  if (daysSinceStart > threshold4) return limitFull;
  if (daysSinceStart > threshold3) return limitStage4;
  if (daysSinceStart > threshold2) return limitStage3;
  if (daysSinceStart > threshold1) return limitStage2;
  return limitStage1;
}

/**
 * Get current warm-up status and limits - uses dynamic config
 */
export async function getWarmupStatus(supabase: any, configCache?: Map<string, string>): Promise<WarmupStatus> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's volume record
    let { data, error } = await supabase
      .from('whatsapp_daily_volume')
      .select('*')
      .eq('data', today)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching warmup status:', error);
    }
    
    // If no record for today, create one with progressive limit
    if (!data) {
      // Calculate days since first record (warm-up progression)
      const { data: firstRecord } = await supabase
        .from('whatsapp_daily_volume')
        .select('data')
        .order('data', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      let daysSinceStart = 0;
      if (firstRecord) {
        const firstDate = new Date(firstRecord.data);
        const todayDate = new Date(today);
        daysSinceStart = Math.floor((todayDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      // Calculate limit using dynamic config
      const dailyLimit = calculateWarmupLimit(daysSinceStart, configCache);
      
      // Create today's record
      const { data: newRecord, error: insertError } = await supabase
        .from('whatsapp_daily_volume')
        .insert({
          data: today,
          mensagens_enviadas: 0,
          limite_do_dia: dailyLimit
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Error creating daily volume record:', insertError);
        const fallbackLimit = getConfigNumber('antispam_warmup_limit_stage_1', 50, configCache);
        return { currentLimit: fallbackLimit, messagesSent: 0, remainingToday: fallbackLimit, daysSinceStart: 0 };
      }
      
      data = newRecord;
    }
    
    // Calculate days since start
    const { data: firstRecord } = await supabase
      .from('whatsapp_daily_volume')
      .select('data')
      .order('data', { ascending: true })
      .limit(1)
      .maybeSingle();
    
    let daysSinceStart = 0;
    if (firstRecord) {
      const firstDate = new Date(firstRecord.data);
      const todayDate = new Date(today);
      daysSinceStart = Math.floor((todayDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    return {
      currentLimit: data.limite_do_dia,
      messagesSent: data.mensagens_enviadas,
      remainingToday: Math.max(0, data.limite_do_dia - data.mensagens_enviadas),
      daysSinceStart
    };
  } catch (error) {
    console.error('Error in getWarmupStatus:', error);
    const fallbackLimit = getConfigNumber('antispam_warmup_limit_stage_1', 50, configCache);
    return { currentLimit: fallbackLimit, messagesSent: 0, remainingToday: fallbackLimit, daysSinceStart: 0 };
  }
}

/**
 * Check if we can send a message (warm-up limit check) - uses dynamic config
 */
export async function canSendMessage(supabase: any, configCache?: Map<string, string>): Promise<{ allowed: boolean; reason?: string; status?: WarmupStatus }> {
  try {
    const status = await getWarmupStatus(supabase, configCache);
    
    if (status.remainingToday <= 0) {
      return {
        allowed: false,
        reason: `Limite diário de warm-up atingido (${status.currentLimit} mensagens). Próximo envio amanhã.`,
        status
      };
    }
    
    return { allowed: true, status };
  } catch (error) {
    console.error('Error in canSendMessage:', error);
    return { allowed: true }; // Fail open to avoid blocking all messages
  }
}

/**
 * Increment the daily message counter
 */
export async function incrementDailyCount(supabase: any): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { error } = await supabase.rpc('increment_daily_volume', { target_date: today });
    
    // If RPC doesn't exist, do it manually
    if (error) {
      const { data } = await supabase
        .from('whatsapp_daily_volume')
        .select('mensagens_enviadas')
        .eq('data', today)
        .single();
      
      if (data) {
        await supabase
          .from('whatsapp_daily_volume')
          .update({ 
            mensagens_enviadas: data.mensagens_enviadas + 1,
            updated_at: new Date().toISOString()
          })
          .eq('data', today);
      }
    }
  } catch (error) {
    console.error('Error incrementing daily count:', error);
  }
}

/**
 * Comprehensive anti-spam check before sending a message - uses dynamic config
 */
export async function performAntiSpamCheck(
  supabase: any,
  telefone: string,
  conversaId?: string,
  configCache?: Map<string, string>
): Promise<AntiSpamCheckResult> {
  // 1. Check blacklist
  const blacklistCheck = await isBlacklisted(supabase, telefone);
  if (blacklistCheck.blocked) {
    return {
      canSend: false,
      reason: `Número na blacklist: ${blacklistCheck.reason}`
    };
  }
  
  // 2. Check objection cooldown (if we have a conversation)
  if (conversaId) {
    const cooldownCheck = await checkObjectionCooldown(supabase, conversaId);
    if (cooldownCheck.inCooldown) {
      return {
        canSend: false,
        reason: `Em cooldown por objeção. ${cooldownCheck.hoursRemaining}h restantes.`,
        cooldownUntil: cooldownCheck.cooldownUntil
      };
    }
  }
  
  // 3. Check warm-up limit
  const warmupCheck = await canSendMessage(supabase, configCache);
  if (!warmupCheck.allowed) {
    return {
      canSend: false,
      reason: warmupCheck.reason
    };
  }
  
  return { canSend: true };
}

/**
 * Override warm-up limit (for manual adjustment)
 */
export async function setWarmupLimit(
  supabase: any,
  newLimit: number,
  date?: string
): Promise<boolean> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const { error } = await supabase
      .from('whatsapp_daily_volume')
      .upsert({
        data: targetDate,
        limite_do_dia: newLimit,
        updated_at: new Date().toISOString()
      }, { onConflict: 'data' });
    
    if (error) {
      console.error('Error setting warmup limit:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in setWarmupLimit:', error);
    return false;
  }
}
