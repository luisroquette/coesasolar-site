/**
 * ═══════════════════════════════════════════════════════════════
 * BITRIX24 CLIENT - Shared Module
 * ═══════════════════════════════════════════════════════════════
 * Centralized Bitrix24 API client utilities for all Edge Functions.
 * Provides:
 * - REST API wrappers with retry logic
 * - Phone number formatting
 * - Enum/list field resolution and caching
 * - Distributor name normalization
 * - Stage ID management
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BitrixApiResponse<T = unknown> {
  result: T;
  time?: {
    start: number;
    finish: number;
    duration: number;
  };
  error?: string;
  error_description?: string;
}

export interface BitrixLeadData {
  ID?: string;
  TITLE?: string;
  NAME?: string;
  PHONE?: Array<{ VALUE: string; VALUE_TYPE?: string }>;
  EMAIL?: Array<{ VALUE: string; VALUE_TYPE?: string }>;
  STATUS_ID?: string;
  CONTACT_ID?: string;
  [key: string]: unknown;
}

export interface BitrixContactData {
  ID?: string;
  NAME?: string;
  LAST_NAME?: string;
  PHONE?: Array<{ VALUE: string; VALUE_TYPE?: string }>;
  EMAIL?: Array<{ VALUE: string; VALUE_TYPE?: string }>;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS - DEFAULT STAGE IDS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_BITRIX_STAGE_IDS = {
  NOVO_LEAD: 'NEW',
  AGUARDANDO_DADOS: 'UC_AGUARDANDO_DADOS',
  PROPOSTA_INICIAL: 'UC_9SLRPP',
  LEAD_FRIO: 'UC_LEAD_FRIO',
  LEAD_DESCARTADO: 'JUNK',
  PROPOSTA_DEFINITIVA: 'UC_JENEX5',
  AGUARDANDO_ASSINATURA: 'UC_AGUARDANDO_ASSINATURA',
  FECHADO: 'WON',
  PERDIDO: 'LOSE',
} as const;

export type BitrixStageKey = keyof typeof DEFAULT_BITRIX_STAGE_IDS;

// Mutable copy for runtime configuration
export const BITRIX_STAGE_IDS: Record<BitrixStageKey, string> = { ...DEFAULT_BITRIX_STAGE_IDS };

/**
 * Load stage IDs from configuration object
 * Call this once when loading system config
 */
export function loadStageIdsFromConfig(config: Record<string, string>): void {
  const stageMapping: Record<string, BitrixStageKey> = {
    'bitrix24_stage_novo_lead': 'NOVO_LEAD',
    'bitrix24_stage_aguardando_dados': 'AGUARDANDO_DADOS',
    'bitrix24_stage_proposta_inicial': 'PROPOSTA_INICIAL',
    'bitrix24_stage_lead_frio': 'LEAD_FRIO',
    'bitrix24_stage_descartado': 'LEAD_DESCARTADO',
    'bitrix24_stage_proposta_definitiva': 'PROPOSTA_DEFINITIVA',
    'bitrix24_stage_aguardando_assinatura': 'AGUARDANDO_ASSINATURA',
    'bitrix24_stage_fechado': 'FECHADO',
    'bitrix24_stage_perdido': 'PERDIDO',
  };

  for (const [configKey, stageKey] of Object.entries(stageMapping)) {
    if (config[configKey]) {
      BITRIX_STAGE_IDS[stageKey] = config[configKey];
      console.log(`[bitrix-client] Stage ${stageKey} ID loaded: ${config[configKey]}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// DISTRIBUTOR NORMALIZATION - Now database-driven
// Maps internal values → exact Bitrix24 dropdown values
// ═══════════════════════════════════════════════════════════════

interface DistribuidoraBitrixCache {
  map: Map<string, string>;
  timestamp: number;
}

let distribuidoraBitrixCache: DistribuidoraBitrixCache | null = null;
const DISTRIBUTOR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fallback map (used if database unavailable)
const FALLBACK_DISTRIBUIDORA_MAP: Record<string, string> = {
  'CEMIG': 'CEMIG - MG',
  'COELBA': 'COELBA - BA',
  'CPFL PAULISTA': 'CPFL Paulista - SP',
  'ENEL': 'ENEL - CE',
  'COPEL': 'COPEL - PR',
  'OUTROS': 'OUTROS - ANOTAÇÃO',
};

/**
 * Load distribuidora Bitrix mappings from database
 */
export async function loadDistribuidoraBitrixMap(supabaseClient: any): Promise<Map<string, string>> {
  if (distribuidoraBitrixCache && Date.now() - distribuidoraBitrixCache.timestamp < DISTRIBUTOR_CACHE_TTL) {
    return distribuidoraBitrixCache.map;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('distribuidoras_config')
      .select('nome_normalizado, bitrix_value')
      .eq('is_active', true)
      .not('bitrix_value', 'is', null);
    
    if (error) {
      console.error('[bitrix-client] Error loading distribuidora map:', error);
      return buildFallbackMap();
    }
    
    const map = new Map<string, string>();
    
    for (const dist of data || []) {
      if (dist.nome_normalizado && dist.bitrix_value) {
        // Add normalized key
        map.set(dist.nome_normalizado.toUpperCase(), dist.bitrix_value);
        // Also add exact bitrix value as key (for direct matches)
        map.set(dist.bitrix_value.toUpperCase(), dist.bitrix_value);
      }
    }
    
    distribuidoraBitrixCache = { map, timestamp: Date.now() };
    console.log(`[bitrix-client] Loaded ${map.size} distribuidora mappings from database`);
    
    return map;
  } catch (err) {
    console.error('[bitrix-client] Exception loading distribuidora map:', err);
    return buildFallbackMap();
  }
}

/**
 * Build fallback map from hardcoded values
 */
function buildFallbackMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(FALLBACK_DISTRIBUIDORA_MAP)) {
    map.set(key, value);
    map.set(value.toUpperCase(), value);
  }
  return map;
}

/**
 * Get cached distribuidora map (for synchronous access)
 */
export function getDistribuidoraBitrixCache(): Map<string, string> {
  return distribuidoraBitrixCache?.map || buildFallbackMap();
}

/**
 * Clear the distribuidora cache
 */
export function clearDistribuidoraBitrixCache(): void {
  distribuidoraBitrixCache = null;
}

/**
 * Normalize distributor name to exact Bitrix24 dropdown value
 * Uses database mappings with fallback
 */
export function normalizarDistribuidoraParaBitrix(distribuidora: string): string {
  if (!distribuidora) return distribuidora;
  
  const upper = distribuidora.toUpperCase().trim();
  const map = getDistribuidoraBitrixCache();
  
  // Try direct match
  if (map.has(upper)) {
    return map.get(upper)!;
  }
  
  // Try partial match
  for (const [key, value] of map.entries()) {
    if (upper.includes(key) || key.includes(upper)) {
      return value;
    }
  }
  
  // Fallback: return original
  return distribuidora;
}

// ═══════════════════════════════════════════════════════════════
// PHONE FORMATTING
// ═══════════════════════════════════════════════════════════════

/**
 * Format phone to Brazilian format for Bitrix24
 * Ensures country code (55) is present for WhatsApp integration
 */
export function formatPhoneForBitrix(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  // Ensure phone has country code 55
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  
  // Format as +55 XX XXXXX-XXXX for Bitrix24
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    const ddd = cleaned.slice(2, 4);
    const numero = cleaned.slice(4);
    return `+55${ddd}${numero}`;
  }
  
  // Fallback: return with + prefix if has country code
  if (cleaned.startsWith('55')) {
    return `+${cleaned}`;
  }
  
  return cleaned;
}

/**
 * Normalize phone number to digits only with country code
 */
export function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

// ═══════════════════════════════════════════════════════════════
// ENUM/LIST FIELD RESOLUTION
// ═══════════════════════════════════════════════════════════════

// Cache for enum options: fieldName -> { normalizedValue -> optionId }
const bitrixEnumCache: Record<string, Record<string, string>> = {};

/**
 * Normalize string for enum key matching
 * Removes accents, converts to uppercase, removes non-alphanumeric
 */
export function normalizeEnumKey(input: string): string {
  return (input || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Resolve a text value to its Bitrix24 enum option ID
 * Caches the field options for performance
 */
export async function resolveBitrixEnumId(params: {
  bitrix24Url: string;
  fieldName: string;
  desiredValue: string;
}): Promise<string | null> {
  const { bitrix24Url, fieldName, desiredValue } = params;

  try {
    if (!bitrix24Url || !fieldName || !desiredValue) return null;

    // Load and cache enum options if not already cached
    if (!bitrixEnumCache[fieldName]) {
      console.log(`[bitrix-client] Loading enum options for field: ${fieldName}`);

      // Find the userfield by FIELD_NAME to get its numeric ID
      const listParams = new URLSearchParams();
      listParams.append('filter[FIELD_NAME]', fieldName);
      listParams.append('select[]', 'ID');
      listParams.append('select[]', 'FIELD_NAME');

      const ufListRes = await fetch(`${bitrix24Url}/crm.lead.userfield.list?${listParams.toString()}`);
      const ufListJson = await ufListRes.json();

      const userfieldId = ufListJson?.result?.[0]?.ID;
      if (!userfieldId) {
        console.warn(`[bitrix-client] Could not resolve userfield ID for ${fieldName}`);
        bitrixEnumCache[fieldName] = {};
      } else {
        // Fetch field details including LIST options
        const getParams = new URLSearchParams();
        getParams.append('id', String(userfieldId));

        const ufGetRes = await fetch(`${bitrix24Url}/crm.lead.userfield.get?${getParams.toString()}`);
        const ufGetJson = await ufGetRes.json();

        const list = ufGetJson?.result?.LIST ?? [];
        const map: Record<string, string> = {};

        for (const opt of list) {
          const id = opt?.ID;
          const value = opt?.VALUE;
          if (id && value) {
            map[normalizeEnumKey(String(value))] = String(id);
            // Also store original value (uppercase) for exact match
            map[String(value).toUpperCase()] = String(id);
          }
        }

        bitrixEnumCache[fieldName] = map;
        console.log(`[bitrix-client] Enum options cached for ${fieldName}: ${Object.keys(map).length} options`);
      }
    }

    // Normalize to expected Bitrix24 value
    const bitrixValue = normalizarDistribuidoraParaBitrix(desiredValue);
    console.log(`[bitrix-client] Resolving enum: "${desiredValue}" → "${bitrixValue}"`);
    
    // Try exact match with normalized value
    const exactKey = bitrixValue.toUpperCase();
    const exactMatch = bitrixEnumCache[fieldName]?.[exactKey];
    if (exactMatch) {
      console.log(`[bitrix-client] Exact match for "${bitrixValue}": ID=${exactMatch}`);
      return exactMatch;
    }
    
    // Try match with fully normalized key (no spaces/hyphens)
    const desiredKey = normalizeEnumKey(bitrixValue);
    const direct = bitrixEnumCache[fieldName]?.[desiredKey];
    if (direct) {
      console.log(`[bitrix-client] Normalized key match for "${bitrixValue}": ID=${direct}`);
      return direct;
    }

    // Fuzzy match (handles partial matches)
    const entries = Object.entries(bitrixEnumCache[fieldName] || {});
    const fuzzy = entries.find(([k]) => k.includes(desiredKey) || desiredKey.includes(k));
    if (fuzzy) {
      console.log(`[bitrix-client] Fuzzy match for "${bitrixValue}": key="${fuzzy[0]}" ID=${fuzzy[1]}`);
      return fuzzy[1];
    }
    
    console.warn(`[bitrix-client] No enum match found for "${desiredValue}" (normalized: "${bitrixValue}")`);
    return null;
  } catch (error) {
    console.error('[bitrix-client] resolveBitrixEnumId error:', error);
    return null;
  }
}

/**
 * Clear the enum cache (useful for testing or cache invalidation)
 */
export function clearEnumCache(): void {
  Object.keys(bitrixEnumCache).forEach(key => delete bitrixEnumCache[key]);
}

// ═══════════════════════════════════════════════════════════════
// BITRIX24 REST API CALLS
// ═══════════════════════════════════════════════════════════════

interface BitrixCallOptions {
  method?: 'GET' | 'POST';
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Generic Bitrix24 REST API call with retry logic
 */
export async function callBitrixApi<T = unknown>(
  bitrix24Url: string,
  endpoint: string,
  params?: Record<string, unknown>,
  options: BitrixCallOptions = {}
): Promise<BitrixApiResponse<T>> {
  const { method = 'POST', retries = 2, retryDelayMs = 500 } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `${bitrix24Url}/${endpoint}`;
      
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };
      
      if (method === 'POST' && params) {
        fetchOptions.body = JSON.stringify(params);
      } else if (method === 'GET' && params) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        }
        const queryString = searchParams.toString();
        if (queryString) {
          const separator = url.includes('?') ? '&' : '?';
          (fetchOptions as unknown as { url: string }).url = `${url}${separator}${queryString}`;
        }
      }
      
      const response = await fetch(
        (fetchOptions as unknown as { url?: string }).url || url,
        fetchOptions
      );
      
      const data = await response.json() as BitrixApiResponse<T>;
      
      if (data.error) {
        throw new Error(`Bitrix24 API error: ${data.error} - ${data.error_description || ''}`);
      }
      
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[bitrix-client] API call attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error('Bitrix24 API call failed');
}

/**
 * Get a lead by ID
 */
export async function getBitrixLead(
  bitrix24Url: string,
  leadId: string
): Promise<BitrixLeadData | null> {
  try {
    const response = await callBitrixApi<BitrixLeadData>(
      bitrix24Url,
      'crm.lead.get',
      { id: leadId }
    );
    return response.result;
  } catch (error) {
    console.error(`[bitrix-client] Failed to get lead ${leadId}:`, error);
    return null;
  }
}

/**
 * Update a lead with given fields
 */
export async function updateBitrixLead(
  bitrix24Url: string,
  leadId: string,
  fields: Record<string, unknown>
): Promise<boolean> {
  try {
    await callBitrixApi(
      bitrix24Url,
      'crm.lead.update',
      { id: leadId, fields }
    );
    return true;
  } catch (error) {
    console.error(`[bitrix-client] Failed to update lead ${leadId}:`, error);
    return false;
  }
}

/**
 * Create a new lead
 */
export async function createBitrixLead(
  bitrix24Url: string,
  fields: Record<string, unknown>
): Promise<string | null> {
  try {
    const response = await callBitrixApi<number>(
      bitrix24Url,
      'crm.lead.add',
      { fields }
    );
    return String(response.result);
  } catch (error) {
    console.error('[bitrix-client] Failed to create lead:', error);
    return null;
  }
}

/**
 * Add a timeline comment to a lead
 */
export async function addBitrixTimelineComment(
  bitrix24Url: string,
  entityType: 'lead' | 'contact' | 'deal',
  entityId: string,
  comment: string,
  authorId?: string
): Promise<boolean> {
  try {
    const entityTypeId = entityType === 'lead' ? 1 : entityType === 'contact' ? 3 : 2;
    
    await callBitrixApi(
      bitrix24Url,
      'crm.timeline.comment.add',
      {
        fields: {
          ENTITY_ID: entityId,
          ENTITY_TYPE_ID: entityTypeId,
          COMMENT: comment,
          ...(authorId ? { AUTHOR_ID: authorId } : {}),
        }
      }
    );
    return true;
  } catch (error) {
    console.error(`[bitrix-client] Failed to add timeline comment:`, error);
    return false;
  }
}

/**
 * Move a lead to a new stage
 */
export async function moveBitrixLeadToStage(
  bitrix24Url: string,
  leadId: string,
  stageId: string
): Promise<boolean> {
  return updateBitrixLead(bitrix24Url, leadId, { STATUS_ID: stageId });
}

/**
 * Get a contact by ID
 */
export async function getBitrixContact(
  bitrix24Url: string,
  contactId: string
): Promise<BitrixContactData | null> {
  try {
    const response = await callBitrixApi<BitrixContactData>(
      bitrix24Url,
      'crm.contact.get',
      { id: contactId }
    );
    return response.result;
  } catch (error) {
    console.error(`[bitrix-client] Failed to get contact ${contactId}:`, error);
    return null;
  }
}

/**
 * Update a contact with given fields
 */
export async function updateBitrixContact(
  bitrix24Url: string,
  contactId: string,
  fields: Record<string, unknown>
): Promise<boolean> {
  try {
    await callBitrixApi(
      bitrix24Url,
      'crm.contact.update',
      { id: contactId, fields }
    );
    return true;
  } catch (error) {
    console.error(`[bitrix-client] Failed to update contact ${contactId}:`, error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// BATCH OPERATIONS - Optimized bulk updates
// ═══════════════════════════════════════════════════════════════

/**
 * Bitrix24 batch.call response structure
 */
export interface BitrixBatchResponse {
  result: {
    result: Record<string, unknown>;
    result_error: Record<string, { error: string; error_description: string }>;
    result_total: Record<string, number>;
    result_next: Record<string, number>;
  };
  time?: unknown;
}

/**
 * Batch command structure for Bitrix24
 */
export interface BatchCommand {
  method: string;
  params: Record<string, unknown>;
}

/**
 * Batch update result for a single command
 */
export interface BatchUpdateResult {
  commandId: string;
  success: boolean;
  error?: string;
}

/**
 * Execute multiple Bitrix24 API calls in a single batch request
 * Bitrix24 supports up to 50 commands per batch.call
 * 
 * @param bitrix24Url - Base URL for Bitrix24 API
 * @param commands - Map of commandId -> BatchCommand
 * @returns Map of commandId -> result/error
 * 
 * @example
 * const commands = {
 *   'update_name': { method: 'crm.lead.update', params: { id: '123', fields: { NAME: 'John' } } },
 *   'update_email': { method: 'crm.lead.update', params: { id: '123', fields: { EMAIL: [{VALUE: 'j@x.com'}] } } }
 * };
 * const results = await executeBitrixBatch(url, commands);
 */
export async function executeBitrixBatch(
  bitrix24Url: string,
  commands: Record<string, BatchCommand>
): Promise<Map<string, BatchUpdateResult>> {
  const results = new Map<string, BatchUpdateResult>();
  const commandIds = Object.keys(commands);
  
  if (commandIds.length === 0) {
    console.log('[bitrix-client] No commands to execute in batch');
    return results;
  }

  // Bitrix24 batch limit is 50 commands
  const BATCH_SIZE = 50;
  const batches: Record<string, BatchCommand>[] = [];
  
  for (let i = 0; i < commandIds.length; i += BATCH_SIZE) {
    const batchCommandIds = commandIds.slice(i, i + BATCH_SIZE);
    const batch: Record<string, BatchCommand> = {};
    for (const id of batchCommandIds) {
      batch[id] = commands[id];
    }
    batches.push(batch);
  }

  console.log(`[bitrix-client] Executing ${commandIds.length} commands in ${batches.length} batch(es)`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    try {
      // Build the cmd parameter for batch.call
      const cmd: Record<string, string> = {};
      for (const [cmdId, command] of Object.entries(batch)) {
        // Format: method?param1=value1&param2=value2
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(command.params)) {
          if (value !== undefined && value !== null) {
            if (typeof value === 'object') {
              // Handle nested objects (like fields)
              for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
                if (subValue !== undefined && subValue !== null) {
                  if (Array.isArray(subValue)) {
                    // Handle arrays like EMAIL: [{VALUE: 'x'}]
                    subValue.forEach((item, idx) => {
                      if (typeof item === 'object' && item !== null) {
                        for (const [arrKey, arrVal] of Object.entries(item as Record<string, unknown>)) {
                          params.append(`${key}[${subKey}][${idx}][${arrKey}]`, String(arrVal));
                        }
                      } else {
                        params.append(`${key}[${subKey}][${idx}]`, String(item));
                      }
                    });
                  } else if (typeof subValue === 'object') {
                    for (const [nestedKey, nestedVal] of Object.entries(subValue as Record<string, unknown>)) {
                      params.append(`${key}[${subKey}][${nestedKey}]`, String(nestedVal));
                    }
                  } else {
                    params.append(`${key}[${subKey}]`, String(subValue));
                  }
                }
              }
            } else {
              params.append(key, String(value));
            }
          }
        }
        cmd[cmdId] = `${command.method}?${params.toString()}`;
      }

      const response = await fetch(`${bitrix24Url}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ halt: 0, cmd }),
      });

      const data = await response.json() as BitrixBatchResponse;

      // Process results
      const batchResults = data.result?.result || {};
      const batchErrors = data.result?.result_error || {};

      for (const cmdId of Object.keys(batch)) {
        if (batchErrors[cmdId]) {
          results.set(cmdId, {
            commandId: cmdId,
            success: false,
            error: `${batchErrors[cmdId].error}: ${batchErrors[cmdId].error_description}`,
          });
        } else {
          results.set(cmdId, {
            commandId: cmdId,
            success: true,
          });
        }
      }

      console.log(`[bitrix-client] Batch ${batchIndex + 1}/${batches.length} completed: ${Object.keys(batchResults).length} success, ${Object.keys(batchErrors).length} errors`);
    } catch (error) {
      console.error(`[bitrix-client] Batch ${batchIndex + 1} failed:`, error);
      
      // Mark all commands in this batch as failed
      for (const cmdId of Object.keys(batch)) {
        results.set(cmdId, {
          commandId: cmdId,
          success: false,
          error: error instanceof Error ? error.message : 'Batch execution failed',
        });
      }
    }
  }

  return results;
}

/**
 * Batch update a single lead with multiple fields in one API call
 * Optimizes 68+ individual updates into 1-2 batch calls
 * 
 * @param bitrix24Url - Base URL for Bitrix24 API
 * @param leadId - Lead ID to update
 * @param fields - All fields to update
 * @returns Success status and any errors
 */
export async function batchUpdateBitrixLead(
  bitrix24Url: string,
  leadId: string,
  fields: Record<string, unknown>
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  if (!leadId || Object.keys(fields).length === 0) {
    return { success: true, errors: [] };
  }

  // Single update with all fields at once
  const commands: Record<string, BatchCommand> = {
    'update_lead': {
      method: 'crm.lead.update',
      params: { id: leadId, fields }
    }
  };

  const results = await executeBitrixBatch(bitrix24Url, commands);
  
  for (const [cmdId, result] of results) {
    if (!result.success) {
      errors.push(`${cmdId}: ${result.error}`);
    }
  }

  const success = errors.length === 0;
  if (success) {
    console.log(`[bitrix-client] ✅ Batch update lead ${leadId} successful (${Object.keys(fields).length} fields)`);
  } else {
    console.error(`[bitrix-client] ❌ Batch update lead ${leadId} had errors:`, errors);
  }

  return { success, errors };
}

/**
 * Batch update multiple leads at once
 * Each lead gets its own update command in the batch
 * 
 * @param bitrix24Url - Base URL for Bitrix24 API
 * @param updates - Array of { leadId, fields } to update
 * @returns Map of leadId -> { success, error? }
 */
export async function batchUpdateMultipleLeads(
  bitrix24Url: string,
  updates: Array<{ leadId: string; fields: Record<string, unknown> }>
): Promise<Map<string, { success: boolean; error?: string }>> {
  const results = new Map<string, { success: boolean; error?: string }>();
  
  if (updates.length === 0) {
    return results;
  }

  const commands: Record<string, BatchCommand> = {};
  
  for (const update of updates) {
    if (update.leadId && Object.keys(update.fields).length > 0) {
      commands[`lead_${update.leadId}`] = {
        method: 'crm.lead.update',
        params: { id: update.leadId, fields: update.fields }
      };
    }
  }

  const batchResults = await executeBitrixBatch(bitrix24Url, commands);
  
  for (const update of updates) {
    const cmdId = `lead_${update.leadId}`;
    const result = batchResults.get(cmdId);
    
    if (result) {
      results.set(update.leadId, {
        success: result.success,
        error: result.error,
      });
    } else {
      results.set(update.leadId, {
        success: false,
        error: 'No result from batch',
      });
    }
  }

  console.log(`[bitrix-client] Batch updated ${updates.length} leads: ${[...results.values()].filter(r => r.success).length} success`);
  
  return results;
}

// ═══════════════════════════════════════════════════════════════
// VERIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Search for existing customer by CPF/CNPJ in leads
 */
export async function findLeadByCpfCnpj(
  bitrix24Url: string,
  cpfCnpjFieldName: string,
  cpfCnpj: string
): Promise<BitrixLeadData | null> {
  try {
    const cleanedValue = cpfCnpj.replace(/\D/g, '');
    
    const response = await callBitrixApi<BitrixLeadData[]>(
      bitrix24Url,
      'crm.lead.list',
      {
        filter: { [cpfCnpjFieldName]: cleanedValue },
        select: ['ID', 'TITLE', 'NAME', 'PHONE', 'EMAIL', 'STATUS_ID', 'CONTACT_ID']
      }
    );
    
    return response.result?.[0] || null;
  } catch (error) {
    console.error(`[bitrix-client] Failed to find lead by CPF/CNPJ:`, error);
    return null;
  }
}

/**
 * Search for existing customer by phone in leads
 */
export async function findLeadByPhone(
  bitrix24Url: string,
  phone: string
): Promise<BitrixLeadData | null> {
  try {
    const cleanedPhone = phone.replace(/\D/g, '');
    
    // Try with and without country code
    const phoneVariations = [
      cleanedPhone,
      cleanedPhone.startsWith('55') ? cleanedPhone.slice(2) : `55${cleanedPhone}`,
      `+${cleanedPhone}`,
    ];
    
    for (const phoneVar of phoneVariations) {
      const response = await callBitrixApi<BitrixLeadData[]>(
        bitrix24Url,
        'crm.lead.list',
        {
          filter: { 'PHONE': phoneVar },
          select: ['ID', 'TITLE', 'NAME', 'PHONE', 'EMAIL', 'STATUS_ID', 'CONTACT_ID']
        }
      );
      
      if (response.result?.[0]) {
        return response.result[0];
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[bitrix-client] Failed to find lead by phone:`, error);
    return null;
  }
}

/**
 * Search for existing contact by phone
 */
export async function findContactByPhone(
  bitrix24Url: string,
  phone: string
): Promise<BitrixContactData | null> {
  try {
    const cleanedPhone = phone.replace(/\D/g, '');
    
    // Try with and without country code
    const phoneVariations = [
      cleanedPhone,
      cleanedPhone.startsWith('55') ? cleanedPhone.slice(2) : `55${cleanedPhone}`,
      `+${cleanedPhone}`,
    ];
    
    for (const phoneVar of phoneVariations) {
      const response = await callBitrixApi<BitrixContactData[]>(
        bitrix24Url,
        'crm.contact.list',
        {
          filter: { 'PHONE': phoneVar },
          select: ['ID', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL']
        }
      );
      
      if (response.result?.[0]) {
        return response.result[0];
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[bitrix-client] Failed to find contact by phone:`, error);
    return null;
  }
}
