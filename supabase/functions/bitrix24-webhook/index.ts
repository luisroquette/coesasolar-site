import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateBitrix24Webhook } from '../_shared/zod-schemas.ts';

interface Bitrix24Lead {
  ID: string;
  TITLE?: string;
  NAME?: string;
  LAST_NAME?: string;
  PHONE?: Array<{ VALUE: string }>;
  EMAIL?: Array<{ VALUE: string }>;
  STATUS_ID?: string;
  ASSIGNED_BY_ID?: string;
  // Custom fields (UF_CRM_*)
  [key: string]: unknown;
}

interface WebhookPayload {
  event?: string;
  data?: {
    FIELDS?: {
      ID?: string;
    };
  };
  auth?: {
    domain?: string;
  };
  // URL-encoded format keys from Bitrix24
  [key: string]: unknown;
}

// Tipo de proposta baseado na coluna do Kanban
type TipoProposta = 'inicial' | 'definitiva';

// Campos disponíveis para validação dinâmica
interface AvailableFieldValues {
  nome: string | null;
  whatsappOuEmail: string | null;
  email: string | null; // CORRIGIDO: e-mail separado para validação obrigatória
  concessionaria: string | null;
  valorConta: number | null;
  tipoInstalacao: string | null;
  consumoMedio: number | null;
  cpfCnpj: string | null;
  endereco: string | null;
  numeroInstalacao: string | null;
}

// Campos opcionais com valores padrão
interface OptionalFields {
  cip: number;
  desconto: number;
  fidelidade: number;
}

// Mapeamento de IDs de campo para labels amigáveis
const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome',
  whatsappOuEmail: 'WhatsApp ou E-mail',
  email: 'E-mail', // CORRIGIDO: campo específico de e-mail
  concessionaria: 'Concessionária',
  valorConta: 'Valor da Conta de Luz',
  tipoInstalacao: 'Tipo de Instalação',
  consumoMedio: 'Consumo Médio (kWh)',
  cpfCnpj: 'CPF/CNPJ',
  endereco: 'Endereço Completo',
  numeroInstalacao: 'Número da Instalação',
};

// Constantes serão carregadas dinamicamente do banco de dados
// Valores padrão apenas como fallback
let PLANO_UNLOCK_THRESHOLD = 3000; // kWh - será sobrescrito pela config
let PLANO_UNLOCK_DESCONTO = 30;    // % - será sobrescrito pela config
let PLANO_UNLOCK_FIDELIDADE = 48;  // meses - será sobrescrito pela config
let INFERENCIA_LIMITE_BIFASICO = 1000; // kWh - será sobrescrito pela config

// Valores padrão conforme especificado (serão sobrescritos pela config do banco)
let DEFAULT_VALUES: OptionalFields = {
  cip: 25,           // R$ 25,00 (padrão se não preenchido)
  desconto: 25,      // 25% (será sobrescrito dinamicamente baseado no consumo)
  fidelidade: 36,    // 36 meses (padrão, será sobrescrito dinamicamente baseado no consumo)
};

// Calcula desconto padrão baseado no consumo médio (usa valores dinâmicos)
function calcularDescontoPadrao(consumoKwh: number): number {
  return consumoKwh > PLANO_UNLOCK_THRESHOLD ? PLANO_UNLOCK_DESCONTO : DEFAULT_VALUES.desconto;
}

// Calcula fidelidade padrão baseada no consumo médio (usa valores dinâmicos)
function calcularFidelidadePadrao(consumoKwh: number): number {
  return consumoKwh > PLANO_UNLOCK_THRESHOLD ? PLANO_UNLOCK_FIDELIDADE : DEFAULT_VALUES.fidelidade;
}

// Mapeamento de campos customizados do Bitrix24 (IDs reais do sistema)
const BITRIX_CUSTOM_FIELDS = {
  tarifa: 'UF_CRM_1762440024',           // Tarifa Energia (formato: "1.09|BRL")
  consumoMedio: 'UF_CRM_1755881740',     // Consumo médio kWh
  desconto: 'UF_CRM_1755881813',         // Desconto contratado (%)
  fidelidade: 'UF_CRM_1759186547',       // Meses contratados
  tipoInstalacao: 'UF_CRM_LEAD_1759426797107', // Tipo de instalação (lista)
  concessionaria: 'UF_CRM_1758906628',   // Concessionária (lista) - tentativa
  cip: 'UF_CRM_CIP',                     // CIP (pode não existir - usa default)
  valorConta: '',                         // Será buscado dinamicamente da config
  emailLead: '',                          // Campo customizado de e-mail no lead (ex: UF_CRM_1758742093) - carregado da config
  emailAssinatura: '',                    // Campo customizado onde o cliente costuma preencher o e-mail (ex: UF_CRM_1759756880731)
};

// Mapeamento de valores de lista do Bitrix24
const TIPO_INSTALACAO_MAP: Record<string, string> = {
  '663': 'Trifásico',
  '661': 'Monofásico', 
  '665': 'Bifásico',
};

const CONCESSIONARIA_MAP: Record<string, string> = {
  '631': 'CEMIG',
  '633': 'CPFL',
  '635': 'ENEL',
  // Adicionar mais conforme necessário
};

async function fetchBitrixLeadFields(bitrix24Url: string): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(`${bitrix24Url}/crm.lead.fields`);
    const json = await resp.json();
    const result = json?.result;
    if (!result || typeof result !== 'object') return null;
    return result as Record<string, unknown>;
  } catch (err) {
    console.error('Error fetching Bitrix lead fields:', err);
    return null;
  }
}

function resolveListOptionLabel(
  leadFields: Record<string, unknown> | null,
  fieldName: string,
  optionId: string
): string | null {
  if (!leadFields) return null;

  const def: any = (leadFields as any)?.[fieldName];
  if (!def) return null;

  const items = def.items ?? def.ITEMS ?? def.list ?? def.LIST;

  // Case 1: items is an array of {ID, VALUE}
  if (Array.isArray(items)) {
    const match = items.find((it: any) => String(it?.ID ?? it?.id) === optionId);
    const label = match?.VALUE ?? match?.value ?? match?.NAME ?? match?.name;
    return label ? String(label) : null;
  }

  // Case 2: items is an object map { [id]: label }
  if (items && typeof items === 'object') {
    const label = (items as any)?.[optionId];
    return label ? String(label) : null;
  }

  return null;
}

function extractCustomField(lead: Bitrix24Lead, fieldKey: string): string | number | null {
  const value = lead[fieldKey];
  if (value === undefined || value === null || value === '') return null;
  return value as string | number;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Extract first valid email inside strings like: "Nome <email@dominio.com>"
    const match = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match?.[0] ?? null;
  }

  if (Array.isArray(value)) {
    for (const v of value) {
      const normalized = normalizeEmail(v);
      if (normalized) return normalized;
    }
  }

  if (value && typeof value === 'object') {
    // Common Bitrix formats: { VALUE: "a@b.com" } or { value: "a@b.com" }
    const anyObj = value as any;
    const candidate = anyObj?.VALUE ?? anyObj?.value;
    return normalizeEmail(candidate);
  }

  return null;
}

function resolveClienteEmail(lead: Bitrix24Lead, customEmailFieldId?: string, assinaturaEmailFieldId?: string): string {
  // 1) Standard Bitrix lead email array
  const standard = normalizeEmail(lead.EMAIL);
  if (standard) return standard;

  // 2) Custom email field (used by our CRM sync / kanban cards)
  if (customEmailFieldId) {
    const rawCustom = (lead as any)?.[customEmailFieldId];
    const custom = normalizeEmail(rawCustom);
    if (custom) return custom;
  }

  // 3) Custom "email de assinatura" (onde o cliente de fato preenche no Bitrix)
  if (assinaturaEmailFieldId) {
    const rawAssinatura = (lead as any)?.[assinaturaEmailFieldId];
    const assinatura = normalizeEmail(rawAssinatura);
    if (assinatura) return assinatura;
  }

  return '';
}

// Parsea tarifa no formato "1.09|BRL" para número
function parseTarifa(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const strValue = String(value);
  // Remove "|BRL" ou similar e converte
  const cleanValue = strValue.split('|')[0].replace(',', '.');
  const num = parseFloat(cleanValue);
  return isNaN(num) ? null : num;
}

function parseNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value);
  return isNaN(num) ? null : num;
}

function normalizeConcessionariaForLookup(input: string): { search: string; uf?: string } {
  const raw = (input ?? '').trim();
  if (!raw) return { search: '' };

  // Common Bitrix label pattern: "NOME - UF" (e.g. "CEMIG - MG")
  const ufMatch = raw.match(/\s*-\s*([A-Z]{2})\s*$/);
  const uf = ufMatch?.[1];

  let base = uf ? raw.replace(/\s*-\s*[A-Z]{2}\s*$/, '').trim() : raw;

  // If there are multiple hyphen parts, keep the first ("CEMIG - MG" -> "CEMIG")
  if (base.includes(' - ')) base = base.split(' - ')[0].trim();

  // Defensive sanitization for Supabase `.or(...)` filter string
  const search = base.replace(/[,%]/g, ' ').replace(/\s+/g, ' ').trim();

  return { search, uf };
}

// Validação dinâmica baseada em configuração
function validateRequiredFields(
  fieldValues: AvailableFieldValues, 
  requiredFieldIds: string[]
): { valid: boolean; missingFields: string[] } {
  const missing: string[] = [];
  
  for (const fieldId of requiredFieldIds) {
    const value = fieldValues[fieldId as keyof AvailableFieldValues];
    
    // Verificação especial para valorConta e consumoMedio (números)
    if (fieldId === 'valorConta' || fieldId === 'consumoMedio') {
      if (value === null || value === undefined || (typeof value === 'number' && value <= 0)) {
        missing.push(FIELD_LABELS[fieldId] || fieldId);
      }
    } else {
      // Verificação para strings
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        missing.push(FIELD_LABELS[fieldId] || fieldId);
      }
    }
  }
  
  return {
    valid: missing.length === 0,
    missingFields: missing,
  };
}

// Campos padrão se não houver configuração no banco
const DEFAULT_REQUIRED_FIELDS_INICIAL = ['nome', 'whatsappOuEmail', 'concessionaria', 'valorConta'];
const DEFAULT_REQUIRED_FIELDS_DEFINITIVA = ['nome', 'whatsappOuEmail', 'concessionaria', 'tipoInstalacao'];

// Cálculo reverso do consumo (baseado no valor da conta)
// IMPORTANTE: Se não houver tarifa válida, retorna null para forçar erro
function calcularConsumoReverso(valorConta: number, tarifaComImpostos: number): number | null {
  if (tarifaComImpostos <= 0) return null;
  return valorConta / tarifaComImpostos;
}

// Inferência do tipo de instalação baseado no consumo (usa valores dinâmicos)
function inferirTipoInstalacao(consumoKwh: number): 'Bifásico' | 'Trifásico' {
  // Usa o limite configurável (padrão: 1000 kWh)
  // Monofásico NUNCA é usado na inferência
  return consumoKwh <= INFERENCIA_LIMITE_BIFASICO ? 'Bifásico' : 'Trifásico';
}

// Campo de endereço dinâmico (será carregado da config)
let BITRIX_FIELD_ENDERECO = 'UF_CRM_1759190189'; // Fallback: bitrix24_custom_field_endereco_completo
let BITRIX_FIELD_CPF_CNPJ = 'UF_CRM_1755711898'; // Fallback para CPF/CNPJ
let BITRIX_FIELD_NUMERO_INSTALACAO = 'UF_CRM_1755711935'; // Fallback

// Carrega as configurações dinâmicas do banco de dados
async function loadDynamicConfig(supabase: any): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'cip_default',
        'desconto_default', 
        'fidelidade_default',
        'plano_unlock_threshold',
        'plano_unlock_desconto',
        'plano_unlock_fidelidade',
        'inferencia_limite_bifasico',
        'bitrix24_custom_field_endereco_completo',
        'bitrix24_custom_field_endereco',
        'bitrix24_custom_field_cpf_cnpj',
        'bitrix24_custom_field_numero_instalacao',
      ]);

    if (error) {
      console.warn('[loadDynamicConfig] Error loading configs, using defaults:', error.message);
      return;
    }

    if (data && data.length > 0) {
      const configMap: Record<string, string> = {};
      data.forEach((row: { chave: string; valor: string }) => {
        configMap[row.chave] = row.valor;
      });

      // Atualiza os valores globais com os valores do banco
      if (configMap.cip_default) {
        DEFAULT_VALUES.cip = parseFloat(configMap.cip_default) || 25;
      }
      if (configMap.desconto_default) {
        DEFAULT_VALUES.desconto = parseFloat(configMap.desconto_default) || 25;
      }
      if (configMap.fidelidade_default) {
        DEFAULT_VALUES.fidelidade = parseFloat(configMap.fidelidade_default) || 36;
      }
      if (configMap.plano_unlock_threshold) {
        PLANO_UNLOCK_THRESHOLD = parseFloat(configMap.plano_unlock_threshold) || 3000;
      }
      if (configMap.plano_unlock_desconto) {
        PLANO_UNLOCK_DESCONTO = parseFloat(configMap.plano_unlock_desconto) || 30;
      }
      if (configMap.plano_unlock_fidelidade) {
        PLANO_UNLOCK_FIDELIDADE = parseFloat(configMap.plano_unlock_fidelidade) || 48;
      }
      if (configMap.inferencia_limite_bifasico) {
        INFERENCIA_LIMITE_BIFASICO = parseFloat(configMap.inferencia_limite_bifasico) || 1000;
      }
      
      // Campos dinâmicos do Bitrix - prioriza endereco_completo, depois endereco
      if (configMap.bitrix24_custom_field_endereco_completo) {
        BITRIX_FIELD_ENDERECO = configMap.bitrix24_custom_field_endereco_completo;
      } else if (configMap.bitrix24_custom_field_endereco) {
        BITRIX_FIELD_ENDERECO = configMap.bitrix24_custom_field_endereco;
      }
      if (configMap.bitrix24_custom_field_cpf_cnpj) {
        BITRIX_FIELD_CPF_CNPJ = configMap.bitrix24_custom_field_cpf_cnpj;
      }
      if (configMap.bitrix24_custom_field_numero_instalacao) {
        BITRIX_FIELD_NUMERO_INSTALACAO = configMap.bitrix24_custom_field_numero_instalacao;
      }

      console.log('[loadDynamicConfig] Loaded dynamic config:', {
        cip: DEFAULT_VALUES.cip,
        desconto: DEFAULT_VALUES.desconto,
        fidelidade: DEFAULT_VALUES.fidelidade,
        unlockThreshold: PLANO_UNLOCK_THRESHOLD,
        unlockDesconto: PLANO_UNLOCK_DESCONTO,
        unlockFidelidade: PLANO_UNLOCK_FIDELIDADE,
        limiteBifasico: INFERENCIA_LIMITE_BIFASICO,
        enderecoField: BITRIX_FIELD_ENDERECO,
        cpfCnpjField: BITRIX_FIELD_CPF_CNPJ,
      });
    }
  } catch (err) {
    console.error('[loadDynamicConfig] Unexpected error:', err);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  console.log('Bitrix24 Webhook received:', req.method);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Carrega configurações dinâmicas do banco de dados
    await loadDynamicConfig(supabase);

    // Check for test/diagnostic endpoint
    const url = new URL(req.url);
    const isTestMode = url.searchParams.get('test') === 'true';
    const isDiagnostic = url.searchParams.get('diagnostic') === 'true';

    // Diagnostic endpoint - check configuration and recent activity
    if (isDiagnostic && req.method === 'GET') {
      console.log('Diagnostic mode activated');
      
      // Check Bitrix24 configuration
      const { data: configData } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', ['bitrix24_webhook_url', 'bitrix24_enabled', 'public_app_url', 
                      'bitrix24_status_proposta_definitiva', 'bitrix24_status_proposta_inicial',
                      'bitrix24_field_valor_conta', 'bitrix24_field_concessionaria']);
      
      const configs: Record<string, string> = {};
      configData?.forEach(c => { configs[c.chave] = c.valor; });
      
      // Get recent sync logs
      const { data: recentLogs } = await supabase
        .from('bitrix24_sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      // Get recent proposals
      const { data: recentProposals } = await supabase
        .from('propostas_assinantes')
        .select('id, cliente_nome, bitrix24_lead_id, created_at, status')
        .order('created_at', { ascending: false })
        .limit(10);
      
      // Get recent CRM contacts
      const { data: recentContacts } = await supabase
        .from('crm_contatos')
        .select('id, nome, bitrix24_lead_id, status, ultimo_erro, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      
      return new Response(JSON.stringify({
        success: true,
        diagnostic: {
          timestamp: new Date().toISOString(),
          configuration: {
            bitrix24_enabled: configs.bitrix24_enabled === 'true',
            bitrix24_webhook_url: configs.bitrix24_webhook_url ? '✓ Configurado' : '✗ Não configurado',
            public_app_url: configs.public_app_url || '✗ Não configurado',
            status_definitiva: configs.bitrix24_status_proposta_definitiva || 'UC_JENEX5 (default)',
            status_inicial: configs.bitrix24_status_proposta_inicial || 'UC_9SLRPP (default)',
            field_valor_conta: configs.bitrix24_field_valor_conta || 'UF_CRM_1755817510 (default)',
            field_concessionaria: configs.bitrix24_field_concessionaria || 'UF_CRM_1759750064 (default)',
          },
          recent_sync_logs: recentLogs?.map(l => ({
            id: l.id,
            action: l.action,
            status: l.status,
            lead_id: l.bitrix24_lead_id,
            error: l.error_message,
            created_at: l.created_at,
          })),
          recent_proposals: recentProposals?.map(p => ({
            id: p.id,
            cliente: p.cliente_nome,
            bitrix_lead_id: p.bitrix24_lead_id,
            status: p.status,
            created_at: p.created_at,
          })),
          recent_crm_contacts: recentContacts?.map(c => ({
            id: c.id,
            nome: c.nome,
            bitrix_lead_id: c.bitrix24_lead_id,
            status: c.status,
            ultimo_erro: c.ultimo_erro,
            created_at: c.created_at,
          })),
        }
      }, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse webhook payload - either from test mode or normal Bitrix24 webhook
    let payload: WebhookPayload;
    
    // Test mode - simulate lead processing with a provided leadId
    if (isTestMode && req.method === 'POST') {
      const body = await req.json();
      const testLeadId = body.leadId;
      
      if (!testLeadId) {
        return new Response(JSON.stringify({ 
          error: 'Missing leadId in body',
          usage: 'POST ?test=true with body: { "leadId": "1234", "forceProcess": true }'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const forceProcess = body.forceProcess === true;
      console.log(`[TEST MODE] Processing lead ${testLeadId} manually, forceProcess: ${forceProcess}`);
      
      // Get Bitrix24 webhook URL from config
      const { data: configData } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'bitrix24_webhook_url')
        .single();

      const bitrix24Url = configData?.valor;

      if (!bitrix24Url) {
        return new Response(JSON.stringify({ 
          error: 'Bitrix24 webhook URL not configured',
          hint: 'Configure em Configurações > Integrações > Bitrix24'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Fetch lead data from Bitrix24
      const leadResponse = await fetch(`${bitrix24Url}/crm.lead.get?ID=${testLeadId}`);
      const leadResult = await leadResponse.json();
      
      if (!leadResult.result) {
        return new Response(JSON.stringify({ 
          error: 'Lead not found in Bitrix24',
          leadId: testLeadId,
          bitrix_response: leadResult
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const lead = leadResult.result as Bitrix24Lead;
      
      // If forceProcess is NOT set, just return info about the lead
      if (!forceProcess) {
        return new Response(JSON.stringify({
          success: true,
          test_mode: true,
          message: `Lead ${testLeadId} found. Use forceProcess: true to actually process it.`,
          lead_summary: {
            id: lead.ID,
            title: lead.TITLE,
            name: `${lead.NAME || ''} ${lead.LAST_NAME || ''}`.trim(),
            status_id: lead.STATUS_ID,
            phone: lead.PHONE?.[0]?.VALUE,
            email: lead.EMAIL?.[0]?.VALUE,
          },
          hint: 'Add "forceProcess": true to the request body to actually process this lead'
        }, null, 2), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // forceProcess is true - create simulated payload and continue to normal flow
      console.log(`[TEST MODE] forceProcess=true - continuing to full processing for lead ${testLeadId}`);
      payload = {
        event: 'ONCRMLEADUPDATE',
        'data[FIELDS][ID]': testLeadId,
        forceProcess: true,
      };
    } else {
      // Normal flow - Parse webhook payload from Bitrix24
      const contentType = req.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return errorResponse('Invalid JSON body', 400, req);
        }
        
        // Validate with Zod schema (sanitizes prototype pollution)
        const validation = validateBitrix24Webhook(rawBody);
        if (!validation.success) {
          const errorMsg = validation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
          console.warn('[bitrix24-webhook] Validation failed:', errorMsg);
          return errorResponse(`Validation failed: ${errorMsg}`, 400, req);
        }
        
        payload = rawBody as WebhookPayload;

        // Internal/manual processing API (used by other backend functions)
        // Body: { action: 'process_lead', leadId: '1234', source?: string }
        const action = (payload as any)?.action;
        const internalLeadId = (payload as any)?.leadId;
        if (action === 'process_lead') {
          if (!internalLeadId) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Missing leadId',
              usage: '{ "action": "process_lead", "leadId": "1234" }'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          payload = {
            event: 'ONCRMLEADUPDATE',
            'data[FIELDS][ID]': String(internalLeadId),
            forceProcess: true,
            source: (payload as any)?.source ?? 'internal',
          } as unknown as WebhookPayload;

          console.log(`[INTERNAL] Processing lead ${internalLeadId} (source: ${(payload as any).source})`);
        }
      } else {
        // Bitrix24 sends as application/x-www-form-urlencoded
        const formData = await req.formData();
        const data: Record<string, unknown> = {};
        formData.forEach((value, key) => {
          data[key] = value;
        });
        payload = data as unknown as WebhookPayload;
      }
    }

    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    // Extract event - handle both JSON and URL-encoded formats
    const event = payload.event || payload['event'];
    
    // Extract leadId - Bitrix24 may send keys like "data[FIELDS][ID]" or "FIELDS[ID]" depending on the hook source
    let leadId: string | undefined;
    
    if (payload.data?.FIELDS?.ID) {
      // Standard JSON format
      leadId = payload.data.FIELDS.ID;
    } else if (payload['data[FIELDS][ID]']) {
      // URL-encoded format from Bitrix24
      leadId = payload['data[FIELDS][ID]'] as string;
    } else if ((payload as any)['FIELDS[ID]']) {
      // Some Bitrix hooks/providers may send this shorter key
      leadId = (payload as any)['FIELDS[ID]'] as string;
    }

    console.log('Extracted leadId:', leadId, 'event:', event);

    if (!leadId) {
      console.log('No lead ID in payload, keys received:', Object.keys(payload));
      return new Response(JSON.stringify({ success: true, message: 'No lead ID', keys: Object.keys(payload) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =====================================================
    // DEBOUNCE INTELIGENTE: Evitar processamentos duplicados
    // =====================================================
    // Bitrix24 dispara MUITOS webhooks em sequência (às vezes dezenas).
    // Bloqueamos se:
    // 1. Já houve SUCCESS nos últimos 60 segundos
    // 2. Há processamento em andamento (pending) nos últimos 5 segundos (evita race condition)
    const DEBOUNCE_SUCCESS_SECONDS = 60;
    const DEBOUNCE_PENDING_SECONDS = 5;
    
    // Verificar logs recentes COM SUCESSO para este lead
    const { data: recentSuccessSync } = await supabase
      .from('bitrix24_sync_logs')
      .select('id, created_at, status, action')
      .eq('bitrix24_lead_id', leadId)
      .eq('status', 'success')
      .gte('created_at', new Date(Date.now() - DEBOUNCE_SUCCESS_SECONDS * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (recentSuccessSync && !payload.forceProcess) {
      console.log(`Debounce: Lead ${leadId} processado com SUCESSO há menos de ${DEBOUNCE_SUCCESS_SECONDS}s (${recentSuccessSync.action} em ${recentSuccessSync.created_at}). Bloqueando.`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Debounced - lead recently processed with success',
        debounceSeconds: DEBOUNCE_SUCCESS_SECONDS,
        lastSyncId: recentSuccessSync.id,
        lastSyncAt: recentSuccessSync.created_at,
        lastAction: recentSuccessSync.action,
        lastStatus: recentSuccessSync.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // NOVO: Verificar se há processamento em andamento (evita webhooks paralelos)
    const { data: recentPendingSync } = await supabase
      .from('bitrix24_sync_logs')
      .select('id, created_at, status, action')
      .eq('bitrix24_lead_id', leadId)
      .in('status', ['pending', 'processing'])
      .eq('action', 'processing_started')
      .gte('created_at', new Date(Date.now() - DEBOUNCE_PENDING_SECONDS * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (recentPendingSync && !payload.forceProcess) {
      console.log(`Debounce: Lead ${leadId} já está sendo processado (${recentPendingSync.id} em ${recentPendingSync.created_at}). Bloqueando webhook paralelo.`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Debounced - lead already being processed',
        reason: 'parallel_webhook_blocked',
        pendingLogId: recentPendingSync.id,
        pendingLogAt: recentPendingSync.created_at,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Inserir log IMEDIATAMENTE para bloquear outras requisições paralelas
    const { data: earlyLog } = await supabase.from('bitrix24_sync_logs').insert({
      bitrix24_lead_id: leadId,
      action: 'processing_started',
      status: 'pending',
      request_data: { event, timestamp: new Date().toISOString() },
    }).select('id').single();
    
    const earlyLogId = earlyLog?.id;
    console.log(`Lead ${leadId}: Iniciando processamento (log ${earlyLogId})`);
    
    // Função para atualizar o log no final
    const updateEarlyLog = async (status: string, responseData?: unknown) => {
      if (earlyLogId) {
        await supabase.from('bitrix24_sync_logs')
          .update({ status, response_data: responseData as any })
          .eq('id', earlyLogId);
      }
    };

    // Get Bitrix24 webhook URL from config
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_webhook_url')
      .single();

    const bitrix24Url = configData?.valor;

    if (!bitrix24Url) {
      console.error('Bitrix24 webhook URL not configured');
      return new Response(JSON.stringify({ error: 'Bitrix24 not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if integration is enabled
    const { data: enabledConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_enabled')
      .single();

    if (enabledConfig?.valor !== 'true') {
      console.log('Bitrix24 integration disabled');
      return new Response(JSON.stringify({ success: true, message: 'Integration disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helper function to fetch lead from Bitrix24
    const fetchLeadFromBitrix = async (): Promise<Bitrix24Lead | null> => {
      const response = await fetch(`${bitrix24Url}/crm.lead.get?ID=${leadId}`);
      const data = await response.json();
      return data.result || null;
    };

    // Fetch lead details from Bitrix24
    let lead = await fetchLeadFromBitrix();

    console.log('Lead data from Bitrix24 (initial fetch):', JSON.stringify(lead, null, 2));
    console.log('Lead STATUS_ID (initial):', lead?.STATUS_ID);

    if (!lead) {
      console.error('Lead not found in Bitrix24');
      await updateEarlyLog('error', { error: 'Lead not found in Bitrix24' });
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check forceProcess flag - when true, skip status validation (manual reprocessing)
    const forceProcess = payload.forceProcess === true || payload.forceProcess === 'true';
    console.log(`forceProcess flag: ${forceProcess} (raw: ${payload.forceProcess})`);

    // =====================================================
    // DETECTAR TIPO DE PROPOSTA (INICIAL vs DEFINITIVA)
    // =====================================================
    
    // Buscar configurações das duas colunas gatilho
    const { data: targetStatusConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_target_status_id')
      .maybeSingle();
    
    const { data: targetStatusInicialConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_target_status_id_inicial')
      .maybeSingle();
    
    // Buscar ID do campo "Valor da Conta" configurado
    const { data: valorContaFieldConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_field_valor_conta')
      .maybeSingle();
    
    // Buscar ID do campo "Concessionária" configurado
    const { data: concessionariaFieldConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_field_concessionaria')
      .maybeSingle();

    // Buscar ID do campo customizado de E-mail no Lead
    const { data: emailLeadFieldConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_custom_field_email_lead')
      .maybeSingle();

    // Buscar ID do campo customizado de E-mail (assinatura) - frequentemente é onde o e-mail do cliente está
    const { data: emailAssinaturaFieldConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_custom_field_email_assinatura')
      .maybeSingle();
    
    // Buscar configuração de campos obrigatórios para proposta inicial
    const { data: requiredFieldsInicialConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'automation_required_fields_inicial')
      .maybeSingle();
    
    // Buscar configuração de campos obrigatórios para proposta definitiva
    const { data: requiredFieldsDefinitivaConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'automation_required_fields_definitiva')
      .maybeSingle();
    
    const targetStatusIdDefinitiva = (targetStatusConfig?.valor ?? '').trim();
    const targetStatusIdInicial = (targetStatusInicialConfig?.valor ?? '').trim();
    const valorContaFieldId = (valorContaFieldConfig?.valor ?? '').trim();
    const concessionariaFieldId = (concessionariaFieldConfig?.valor ?? '').trim();
    const emailLeadFieldId = (emailLeadFieldConfig?.valor ?? '').trim();
    const emailAssinaturaFieldId = (emailAssinaturaFieldConfig?.valor ?? '').trim();
    
    // Parsear campos obrigatórios configurados (ou usar padrões)
    let requiredFieldIdsInicial: string[] = DEFAULT_REQUIRED_FIELDS_INICIAL;
    let requiredFieldIdsDefinitiva: string[] = DEFAULT_REQUIRED_FIELDS_DEFINITIVA;
    
    try {
      if (requiredFieldsInicialConfig?.valor) {
        const parsed = JSON.parse(requiredFieldsInicialConfig.valor);
        if (Array.isArray(parsed) && parsed.length > 0) {
          requiredFieldIdsInicial = parsed;
        }
      }
    } catch {
      console.log('Error parsing required fields inicial config, using defaults');
    }
    
    try {
      if (requiredFieldsDefinitivaConfig?.valor) {
        const parsed = JSON.parse(requiredFieldsDefinitivaConfig.valor);
        if (Array.isArray(parsed) && parsed.length > 0) {
          requiredFieldIdsDefinitiva = parsed;
        }
      }
    } catch {
      console.log('Error parsing required fields definitiva config, using defaults');
    }
    
    console.log(`Campos obrigatórios - Inicial: [${requiredFieldIdsInicial.join(', ')}], Definitiva: [${requiredFieldIdsDefinitiva.join(', ')}]`);
    
    // Atualizar mapeamento dos campos dinamicamente
    if (valorContaFieldId) {
      BITRIX_CUSTOM_FIELDS.valorConta = valorContaFieldId;
    }
    if (concessionariaFieldId) {
      BITRIX_CUSTOM_FIELDS.concessionaria = concessionariaFieldId;
    }
    if (emailLeadFieldId) {
      BITRIX_CUSTOM_FIELDS.emailLead = emailLeadFieldId;
    }
    if (emailAssinaturaFieldId) {
      BITRIX_CUSTOM_FIELDS.emailAssinatura = emailAssinaturaFieldId;
    }

    console.log(`Target Status Definitiva: "${targetStatusIdDefinitiva}", Inicial: "${targetStatusIdInicial}"`);
    console.log(`Campos customizados - Valor Conta: "${valorContaFieldId}", Concessionária: "${concessionariaFieldId || BITRIX_CUSTOM_FIELDS.concessionaria}"`);
    console.log(`Lead STATUS_ID (before workaround): "${lead.STATUS_ID}"`);

    // =====================================================
    // WORKAROUND: Bitrix24 envia webhook ANTES de atualizar STATUS_ID
    // O webhook é disparado com STATUS_ID incorreto (ex: "NEW") antes do status real.
    // Solução: Se STATUS_ID NÃO corresponder a nenhuma coluna gatilho, aguardar e re-buscar.
    // =====================================================
    const isTargetStatus = (status: string | undefined) => {
      if (!status) return false;
      if (status === targetStatusIdInicial && targetStatusIdInicial) return true;
      if (status === targetStatusIdDefinitiva && targetStatusIdDefinitiva) return true;
      return false;
    };

    if (!isTargetStatus(lead.STATUS_ID) && !forceProcess) {
      console.log(`Lead STATUS_ID "${lead.STATUS_ID}" não é target. Aguardando 5s e re-buscando...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const updatedLead = await fetchLeadFromBitrix();
      if (updatedLead) {
        lead = updatedLead;
        console.log(`Lead STATUS_ID after 5s re-fetch: "${lead.STATUS_ID}"`);
      }
    }

    console.log(`Lead STATUS_ID (final): "${lead.STATUS_ID}"`);

    // Determinar qual tipo de proposta gerar
    let tipoProposta: TipoProposta | null = null;
    
    if (forceProcess) {
      // Se forceProcess, verificar se existe proposta anterior para determinar o tipo
      const { data: existingPropostaCheck } = await supabase
        .from('propostas_assinantes')
        .select('tipo_proposta')
        .eq('bitrix24_lead_id', leadId)
        .maybeSingle();
      
      if (existingPropostaCheck?.tipo_proposta) {
        tipoProposta = existingPropostaCheck.tipo_proposta as TipoProposta;
        console.log(`forceProcess: usando tipo "${tipoProposta}" da proposta existente`);
      } else {
        // Sem proposta existente - determinar pelo STATUS_ID do lead
        if (lead.STATUS_ID === targetStatusIdInicial && targetStatusIdInicial) {
          tipoProposta = 'inicial';
          console.log(`forceProcess: Lead sem proposta, mas está em "Proposta Inicial" -> tipo = inicial`);
        } else if (lead.STATUS_ID === targetStatusIdDefinitiva && targetStatusIdDefinitiva) {
          tipoProposta = 'definitiva';
          console.log(`forceProcess: Lead sem proposta, mas está em "Proposta Definitiva" -> tipo = definitiva`);
        } else {
          // Default para inicial (formulário do site sempre cria em UC_9SLRPP)
          tipoProposta = 'inicial';
          console.log(`forceProcess: Lead sem proposta e sem status gatilho -> default tipo = inicial`);
        }
      }
    } else if (lead.STATUS_ID === targetStatusIdInicial && targetStatusIdInicial) {
      tipoProposta = 'inicial';
      console.log(`Lead está na coluna "Proposta Inicial" (${targetStatusIdInicial})`);
    } else if (lead.STATUS_ID === targetStatusIdDefinitiva && targetStatusIdDefinitiva) {
      tipoProposta = 'definitiva';
      console.log(`Lead está na coluna "Proposta Definitiva" (${targetStatusIdDefinitiva})`);
    }

    // Se não está em nenhuma coluna gatilho, verificar se deve enfileirar retry
    if (!tipoProposta) {
      console.log(`Lead ${leadId} not in any target status. Current: ${lead.STATUS_ID}. Skipping.`);
      
      // Se não é um retry e o lead tem dados mínimos, enfileirar para retry automático
      // Isso resolve race conditions onde o webhook dispara antes do lead chegar na etapa
      const isRetry = payload.isRetry === true;
      const clienteNomeForQueue = [lead.NAME, lead.LAST_NAME].filter(Boolean).join(' ') || lead.TITLE || null;
      const clienteTelefoneForQueue = lead.PHONE?.[0]?.VALUE || '';
      
      // Só enfileira se: não é retry, tem nome ou telefone, e não foi processado recentemente
      if (!isRetry && (clienteNomeForQueue || clienteTelefoneForQueue)) {
        // Verificar se já existe na fila
        const { data: existingQueue } = await supabase
          .from('proposal_generation_queue')
          .select('id')
          .eq('bitrix_lead_id', leadId)
          .eq('status', 'pending')
          .maybeSingle();
        
        if (!existingQueue) {
          // Buscar conversa associada pelo telefone
          let conversaIdForQueue: string | null = null;
          if (clienteTelefoneForQueue) {
            const phoneDigits = clienteTelefoneForQueue.replace(/\D/g, '');
            const { data: conversaData } = await supabase
              .from('chatbot_conversas')
              .select('id')
              .or(`cliente_telefone.ilike.%${phoneDigits.slice(-9)}%,cliente_telefone.eq.${phoneDigits}`)
              .is('proposta_id', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            conversaIdForQueue = conversaData?.id || null;
          }
          
          // Enfileirar para retry em 30 segundos
          const { error: queueError } = await supabase
            .from('proposal_generation_queue')
            .insert({
              bitrix_lead_id: leadId,
              cliente_telefone: clienteTelefoneForQueue,
              cliente_nome: clienteNomeForQueue,
              conversa_id: conversaIdForQueue,
              retry_at: new Date(Date.now() + 30000).toISOString(), // 30 segundos
              request_data: { 
                event, 
                originalStatus: lead.STATUS_ID,
                targetStatusIdInicial,
                targetStatusIdDefinitiva,
              },
            });
          
          if (!queueError) {
            console.log(`Lead ${leadId} enfileirado para retry automático em 30s`);
            await updateEarlyLog('queued_for_retry', { 
              reason: 'Lead not in target status - queued for automatic retry',
              currentStatus: lead.STATUS_ID,
              targetStatusIdDefinitiva,
              targetStatusIdInicial,
              retryIn: '30s',
            });
            return new Response(JSON.stringify({ 
              status: 'queued',
              message: 'Lead not in target status - queued for automatic retry',
              currentStatus: lead.STATUS_ID,
              retryIn: '30 seconds',
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else {
            console.error(`Erro ao enfileirar lead ${leadId}:`, queueError);
          }
        } else {
          console.log(`Lead ${leadId} já está na fila de retry`);
        }
      }
      
      await updateEarlyLog('skipped', { 
        reason: 'Lead not in target status after re-fetch',
        currentStatus: lead.STATUS_ID,
        targetStatusIdDefinitiva,
        targetStatusIdInicial,
        isRetry,
      });
      return new Response(JSON.stringify({ 
        status: 'skipped',
        message: 'Lead not in target status - skipping proposal generation',
        currentStatus: lead.STATUS_ID,
        targetStatusDefinitiva: targetStatusIdDefinitiva,
        targetStatusInicial: targetStatusIdInicial,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing lead ${leadId} as "${tipoProposta}" proposal...`);

    // Extract required fields from Bitrix24 lead
    const clienteNome = [lead.NAME, lead.LAST_NAME].filter(Boolean).join(' ') || lead.TITLE || null;
    const clienteTelefone = lead.PHONE?.[0]?.VALUE || '';
    // FIX: aceitar e-mail vindo do campo padrão, do custom do lead, OU do campo de assinatura (onde o cliente preenche)
    const clienteEmail = resolveClienteEmail(
      lead,
      BITRIX_CUSTOM_FIELDS.emailLead,
      BITRIX_CUSTOM_FIELDS.emailAssinatura
    );
    const whatsappOuEmail = clienteTelefone || clienteEmail || null;

    // Extract custom fields - usando IDs reais do Bitrix24
    const concessionariaRaw = extractCustomField(lead, BITRIX_CUSTOM_FIELDS.concessionaria);
    const tipoInstalacaoRaw = extractCustomField(lead, BITRIX_CUSTOM_FIELDS.tipoInstalacao);
    const tarifaRaw = extractCustomField(lead, BITRIX_CUSTOM_FIELDS.tarifa);

    // Mapear valores de lista para strings legíveis (com resolução dinâmica quando vier como ID numérico)
    const concessionariaRawStr = concessionariaRaw !== null ? String(concessionariaRaw) : null;
    const tipoInstalacaoRawStr = tipoInstalacaoRaw !== null ? String(tipoInstalacaoRaw) : null;

    let leadFieldsCache: Record<string, unknown> | null = null;
    const resolveFromBitrix = async (fieldName: string, optionId: string) => {
      if (!leadFieldsCache) leadFieldsCache = await fetchBitrixLeadFields(bitrix24Url);
      return resolveListOptionLabel(leadFieldsCache, fieldName, optionId);
    };

    let concessionaria = concessionariaRawStr
      ? (CONCESSIONARIA_MAP[concessionariaRawStr] || concessionariaRawStr)
      : null;

    // Se veio como ID (ex: "679"), tenta resolver o label real do campo no Bitrix
    if (concessionariaRawStr && /^\d+$/.test(concessionariaRawStr) && concessionaria === concessionariaRawStr) {
      const resolved = await resolveFromBitrix(BITRIX_CUSTOM_FIELDS.concessionaria, concessionariaRawStr);
      if (resolved) concessionaria = resolved;
    }

    let tipoInstalacao = tipoInstalacaoRawStr
      ? (TIPO_INSTALACAO_MAP[tipoInstalacaoRawStr] || tipoInstalacaoRawStr)
      : null;

    if (tipoInstalacaoRawStr && /^\d+$/.test(tipoInstalacaoRawStr) && tipoInstalacao === tipoInstalacaoRawStr) {
      const resolved = await resolveFromBitrix(BITRIX_CUSTOM_FIELDS.tipoInstalacao, tipoInstalacaoRawStr);
      if (resolved) tipoInstalacao = resolved;
    }
    
    // Tarifa: primeiro tenta do Bitrix24, se não tiver busca da concessionária
    let tarifa = parseTarifa(tarifaRaw);
    let tarifaBuscadaAutomaticamente = false;  // Flag para saber se devemos enviar de volta ao Bitrix24

    console.log('Extracted fields (before tarifa lookup):', { concessionariaRaw, tipoInstalacaoRaw, tarifaRaw, concessionaria, tipoInstalacao, tarifa });

    // === BUSCAR TARIFA AUTOMATICAMENTE DA CONCESSIONÁRIA ===
    if (tarifa === null && concessionaria) {
      console.log(`Tarifa not provided, looking up from concessionaria: "${concessionaria}"`);
      
      const { search: concessionariaSearch, uf: ufFromLabel } = normalizeConcessionariaForLookup(concessionaria);
      console.log(
        `Tarifa lookup query normalized: input="${concessionaria}" -> search="${concessionariaSearch}"${ufFromLabel ? ` uf=${ufFromLabel}` : ''}`
      );

      // Buscar tarifa na tabela concessionarias (busca flexível por nome ou sigla)
      let query = supabase
        .from('concessionarias')
        .select('tarifa_com_impostos, tarifa_media, te, tusd, pis_cofins, uf, nome, sigla_aneel')
        .or(`nome.ilike.%${concessionariaSearch}%,sigla_aneel.ilike.%${concessionariaSearch}%`);

      if (ufFromLabel) query = query.eq('uf', ufFromLabel);

      const { data: concessionariaData, error: concError } = await query
        .limit(1)
        .maybeSingle();

      if (concError) {
        console.error('Error fetching concessionaria tariff:', concError);
      } else if (concessionariaData) {
        // Preferimos SEMPRE tarifa_com_impostos; se não existir, estimamos a partir da tarifa base + tributos.
        const tarifaBase =
          concessionariaData.tarifa_media ??
          ((concessionariaData.te ?? null) !== null && (concessionariaData.tusd ?? null) !== null
            ? Number(concessionariaData.te) + Number(concessionariaData.tusd)
            : null);

        let tarifaFinal: number | null = concessionariaData.tarifa_com_impostos ?? null;
        let tarifaSource = tarifaFinal !== null ? 'tarifa_com_impostos' : 'estimated';

        if (tarifaFinal === null && tarifaBase !== null) {
          const pisCofins = concessionariaData.pis_cofins ?? 0.0365; // fallback para 3,65%
          let icms = 0;

          if (concessionariaData.uf) {
            const { data: icmsData, error: icmsError } = await supabase
              .from('icms_estados')
              .select('icms_percentual')
              .eq('uf', concessionariaData.uf)
              .limit(1)
              .maybeSingle();

            if (icmsError) {
              console.error('Error fetching ICMS for UF:', concessionariaData.uf, icmsError);
            } else if (icmsData?.icms_percentual !== null && icmsData?.icms_percentual !== undefined) {
              icms = Number(icmsData.icms_percentual) / 100;
            }
          }

          // Estimativa "por dentro" (aproximação): tarifa_com_impostos ~= tarifa_base / (1 - PIS/COFINS - ICMS)
          const denom = 1 - Number(pisCofins) - Number(icms);
          if (denom > 0 && denom < 1) {
            tarifaFinal = Number(tarifaBase) / denom;
          } else {
            // fallback seguro se algo vier estranho
            tarifaFinal = Number(tarifaBase);
            tarifaSource = 'tarifa_base_fallback';
          }

          console.log(
            `Estimated tarifa_com_impostos from base: ${tarifaBase} | PIS/COFINS: ${pisCofins} | ICMS: ${icms} | result: ${tarifaFinal}`
          );
        }

        tarifa = tarifaFinal ?? tarifaBase ?? null;
        tarifaBuscadaAutomaticamente = tarifa !== null;

        console.log(
          `Found tariff from DB: ${tarifa} (source: ${tarifaSource}) (from ${concessionariaData.nome || concessionariaData.sigla_aneel}), autoDiscovered: ${tarifaBuscadaAutomaticamente}`
        );
      } else {
        console.log(`No matching concessionaria found in DB for: "${concessionaria}"`);
      }
    }

    // Optional fields with defaults
    const cipRaw = extractCustomField(lead, BITRIX_CUSTOM_FIELDS.cip);
    const descontoRaw = extractCustomField(lead, BITRIX_CUSTOM_FIELDS.desconto);
    const fidelidadeRaw = extractCustomField(lead, BITRIX_CUSTOM_FIELDS.fidelidade);
    const consumoMedioRaw = extractCustomField(lead, BITRIX_CUSTOM_FIELDS.consumoMedio);
    
    // Valor da Conta (para proposta inicial)
    const valorContaRaw = valorContaFieldId ? extractCustomField(lead, valorContaFieldId) : null;
    const valorConta = parseNumber(valorContaRaw);

    const cip = parseNumber(cipRaw) ?? DEFAULT_VALUES.cip;
    // Desconto e fidelidade serão calculados após definir o consumo final
    const descontoFromBitrix = parseNumber(descontoRaw);
    const fidelidadeFromBitrix = parseNumber(fidelidadeRaw);
    // Consumo: do Bitrix24, ou será calculado via valor_conta/tarifa (nunca usar fallback padrão)
    let consumoMedio: number | null = parseNumber(consumoMedioRaw);
    let tipoInstalacaoFinal = tipoInstalacao;
    let dadosInferidos = false;
    
    // Fidelidade e desconto: inicializados com valores do Bitrix24 ou padrão
    // Serão recalculados após determinar o consumo final (cálculo reverso se necessário)
    // O Bitrix24 armazena em MESES, mas o banco espera ANOS (INTEGER)
    // Arredondamos para cima para garantir inteiro válido (5 meses = 1 ano, 12 meses = 1 ano, 36 meses = 3 anos)
    let fidelidadeMeses = fidelidadeFromBitrix ?? DEFAULT_VALUES.fidelidade;
    let fidelidadeAnos = Math.ceil(fidelidadeMeses / 12); // Converter para anos (arredondado para cima)
    
    // Desconto: será calculado dinamicamente baseado no consumo final (após cálculo reverso se necessário)
    // Por enquanto inicializa com valor do Bitrix24 ou placeholder
    let desconto = descontoFromBitrix ?? DEFAULT_VALUES.desconto;

    // Get Bitrix24 URL for comments
    const addBitrix24Comment = async (comment: string) => {
      try {
        const commentPayload = new URLSearchParams({
          'fields[ENTITY_ID]': leadId,
          'fields[ENTITY_TYPE]': 'lead',
          'fields[COMMENT]': comment,
        });
        await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
          method: 'POST',
          body: commentPayload,
        });
        console.log('Added timeline comment to Bitrix24 lead');
      } catch (commentError) {
        console.error('Error adding timeline comment:', commentError);
      }
    };

    // =====================================================
    // FUNÇÃO PARA CRIAR/ATUALIZAR CONTATO NO MICRO CRM
    // Deduplicação inteligente: CPF/CNPJ → email → telefone → bitrix24_lead_id
    // Retorna o crm_contato_id para vincular na proposta
    // =====================================================
    const upsertCrmContato = async (options: {
      status: 'novo' | 'erro';
      propostaId?: string;
      ultimoErro?: string;
      cpfCnpj?: string | null;
    }): Promise<string | null> => {
      try {
        // Primeiro, buscar um admin user_id para atribuir ao contato
        const { data: adminUser } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin')
          .limit(1)
          .single();

        if (!adminUser) {
          console.error('No admin user found for CRM contact');
          return null;
        }

        // =====================================================
        // DEDUPLICAÇÃO INTELIGENTE (ordem de prioridade):
        // 1. CPF/CNPJ (mais confiável)
        // 2. E-mail
        // 3. Telefone (normalizado)
        // 4. bitrix24_lead_id (fallback)
        // =====================================================
        let existingContato: { id: string } | null = null;
        const cpfCnpjClean = options.cpfCnpj?.replace(/[^\d]/g, '') || null;
        const emailClean = clienteEmail?.toLowerCase().trim() || null;
        const telefoneClean = clienteTelefone?.replace(/[^\d]/g, '') || null;

        // 1. Buscar por CPF/CNPJ
        if (cpfCnpjClean && cpfCnpjClean.length >= 11) {
          const { data } = await supabase
            .from('crm_contatos')
            .select('id')
            .or(`cpf_cnpj.eq.${cpfCnpjClean},cpf_cnpj.ilike.%${cpfCnpjClean}%`)
            .limit(1)
            .maybeSingle();
          if (data) {
            existingContato = data;
            console.log(`[upsertCrmContato] Found existing contact by CPF/CNPJ: ${cpfCnpjClean}`);
          }
        }

        // 2. Buscar por e-mail
        if (!existingContato && emailClean && emailClean.includes('@')) {
          const { data } = await supabase
            .from('crm_contatos')
            .select('id')
            .ilike('email', emailClean)
            .limit(1)
            .maybeSingle();
          if (data) {
            existingContato = data;
            console.log(`[upsertCrmContato] Found existing contact by email: ${emailClean}`);
          }
        }

        // 3. Buscar por telefone (últimos 9 dígitos para compatibilidade)
        if (!existingContato && telefoneClean && telefoneClean.length >= 10) {
          const telefoneSearch = telefoneClean.slice(-9); // Últimos 9 dígitos
          const { data } = await supabase
            .from('crm_contatos')
            .select('id')
            .ilike('telefone', `%${telefoneSearch}`)
            .limit(1)
            .maybeSingle();
          if (data) {
            existingContato = data;
            console.log(`[upsertCrmContato] Found existing contact by phone: ${telefoneSearch}`);
          }
        }

        // 4. Buscar por bitrix24_lead_id (fallback)
        if (!existingContato) {
          const { data } = await supabase
            .from('crm_contatos')
            .select('id')
            .eq('bitrix24_lead_id', leadId)
            .maybeSingle();
          if (data) {
            existingContato = data;
            console.log(`[upsertCrmContato] Found existing contact by bitrix24_lead_id: ${leadId}`);
          }
        }

        const contatoData = {
          nome: clienteNome || 'Lead Bitrix24',
          email: clienteEmail || null,
          telefone: clienteTelefone || null,
          cpf_cnpj: cpfCnpjClean || null,
          cidade: null as string | null,
          uf: null as string | null,
          origem: 'bitrix24_webhook',
          status: options.status,
          bitrix24_lead_id: leadId,
          bitrix24_stage: lead.STATUS_ID || null,
          ultimo_erro: options.ultimoErro || null,
          // NOTA: proposta_id é DEPRECATED - usar crm_contato_id na proposta
          proposta_id: options.propostaId || null,
          proposta_tipo: tipoProposta,
          ultima_interacao: new Date().toISOString(),
        };

        if (existingContato) {
          // Atualizar contato existente (merge de dados - não sobrescreve com null)
          const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
            bitrix24_lead_id: leadId, // Sempre atualiza para manter vínculo
            bitrix24_stage: lead.STATUS_ID || null,
            ultima_interacao: new Date().toISOString(),
            status: options.status,
          };
          
          // Só atualiza campos se tiver valor novo
          if (clienteNome) updateData.nome = clienteNome;
          if (clienteEmail) updateData.email = clienteEmail;
          if (clienteTelefone) updateData.telefone = clienteTelefone;
          if (cpfCnpjClean) updateData.cpf_cnpj = cpfCnpjClean;
          if (options.ultimoErro) updateData.ultimo_erro = options.ultimoErro;
          if (options.propostaId) updateData.proposta_id = options.propostaId;
          if (tipoProposta) updateData.proposta_tipo = tipoProposta;

          const { error } = await supabase
            .from('crm_contatos')
            .update(updateData)
            .eq('id', existingContato.id);

          if (error) {
            console.error('Error updating CRM contact:', error);
            return existingContato.id; // Retorna mesmo com erro para vincular proposta
          }
          
          console.log(`[upsertCrmContato] Updated CRM contact ${existingContato.id} for lead ${leadId}`);
          return existingContato.id;
        } else {
          // Criar novo contato
          const { data: newContato, error } = await supabase
            .from('crm_contatos')
            .insert({
              ...contatoData,
              user_id: adminUser.user_id,
              criado_por_nome: 'Bitrix24 Webhook',
              criado_por_email: 'webhook@bitrix24.com',
            })
            .select('id')
            .single();

          if (error) {
            console.error('Error creating CRM contact:', error);
            return null;
          }
          
          console.log(`[upsertCrmContato] Created CRM contact ${newContato.id} for lead ${leadId}`);
          return newContato.id;
        }
      } catch (err) {
        console.error('Error in upsertCrmContato:', err);
        return null;
      }
    };

    // =====================================================
    // VALIDAÇÃO E CÁLCULOS ESPECÍFICOS POR TIPO DE PROPOSTA
    // =====================================================
    
    if (tipoProposta === 'inicial') {
      // PROPOSTA INICIAL: Usa valor da conta para cálculo reverso
      console.log(`[PROPOSTA INICIAL] Valor da Conta: ${valorConta}, Concessionária: ${concessionaria}`);
      
      // Montar objeto com todos os valores de campos disponíveis
      const allFieldValues: AvailableFieldValues = {
        nome: clienteNome,
        whatsappOuEmail,
        email: clienteEmail || null, // CORRIGIDO: e-mail separado para validação obrigatória
        concessionaria,
        valorConta,
        tipoInstalacao,
        consumoMedio: parseNumber(consumoMedioRaw),
        cpfCnpj: extractCustomField(lead, BITRIX_FIELD_CPF_CNPJ) as string | null,
        endereco: extractCustomField(lead, BITRIX_FIELD_ENDERECO) as string | null,
        numeroInstalacao: extractCustomField(lead, BITRIX_FIELD_NUMERO_INSTALACAO) as string | null,
      };

      const validationInicial = validateRequiredFields(allFieldValues, requiredFieldIdsInicial);
      console.log('Validation Inicial result:', validationInicial, '| Required fields:', requiredFieldIdsInicial);

      if (!validationInicial.valid) {
        console.log(`Lead ${leadId} missing required fields for INICIAL: ${validationInicial.missingFields.join(', ')}. NOT creating proposal.`);
        
        await supabase.from('bitrix24_sync_logs').insert({
          bitrix24_lead_id: leadId,
          action: 'validation_failed_inicial',
          status: 'skipped',
          request_data: payload,
          response_data: { validation: validationInicial, lead: { nome: clienteNome, telefone: clienteTelefone, email: clienteEmail, valorConta }, requiredFields: requiredFieldIdsInicial },
        });

        const configuredFieldsList = requiredFieldIdsInicial.map(id => FIELD_LABELS[id] || id).join('\n• ');
        const commentText = `⛔ Proposta INICIAL COESA NÃO gerada - Dados incompletos\n\n📋 Campos obrigatórios faltantes:\n${validationInicial.missingFields.map((f: string) => `• ${f}`).join('\n')}\n\n✏️ Complete os dados acima e mova o lead novamente para esta etapa.\n\n📌 Campos configurados como obrigatórios:\n• ${configuredFieldsList}`;
        
        await addBitrix24Comment(commentText);

        // Criar/atualizar contato no CRM com status de erro
        await upsertCrmContato({
          status: 'erro',
          ultimoErro: `Campos faltantes (Inicial): ${validationInicial.missingFields.join(', ')}`,
          cpfCnpj: allFieldValues.cpfCnpj,
        });

        return new Response(
          JSON.stringify({
            success: true,
            proposalCreated: false,
            tipoProposta: 'inicial',
            message: 'Missing required fields for initial proposal - NOT created',
            missingFields: validationInicial.missingFields,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Tarifa é necessária para o cálculo reverso
      if (tarifa === null) {
        console.log(`[PROPOSTA INICIAL] Tarifa not found for concessionaria "${concessionaria}". NOT creating proposal.`);
        
        await supabase.from('bitrix24_sync_logs').insert({
          bitrix24_lead_id: leadId,
          action: 'tarifa_not_found_inicial',
          status: 'skipped',
          request_data: payload,
          response_data: { concessionaria, message: 'Tarifa not found for reverse calculation' },
        });

        const commentText = `⚠️ Proposta INICIAL COESA NÃO gerada - Tarifa não encontrada\n\n📋 Concessionária informada: ${concessionaria}\n\n❌ Não foi possível localizar a tarifa desta concessionária na base de dados.\nA tarifa é necessária para calcular o consumo estimado a partir do valor da conta.\n\n💡 Soluções:\n• Verifique se o nome da concessionária está correto\n• Solicite ao administrador que sincronize as tarifas com a ANEEL`;
        
        await addBitrix24Comment(commentText);

        // Criar/atualizar contato no CRM com status de erro
        await upsertCrmContato({
          status: 'erro',
          ultimoErro: `Tarifa não encontrada para: ${concessionaria}`,
          cpfCnpj: null,
        });

        return new Response(
          JSON.stringify({
            success: true,
            proposalCreated: false,
            tipoProposta: 'inicial',
            message: 'Tariff not found for initial proposal',
            concessionaria,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // CÁLCULO REVERSO: Consumo = Valor da Conta / Tarifa
      const consumoCalculado = calcularConsumoReverso(valorConta!, tarifa);
      
      // Se não foi possível calcular o consumo (tarifa inválida), retornar erro
      if (consumoCalculado === null) {
        console.log(`Lead ${leadId}: Could not calculate consumption (invalid tariff). NOT creating proposal.`);
        
        await supabase.from('bitrix24_sync_logs').insert({
          bitrix24_lead_id: leadId,
          action: 'consumo_calc_failed',
          status: 'error',
          request_data: payload,
          response_data: { valorConta, tarifa, message: 'Could not calculate consumption from bill value' },
        });

        const commentText = `⛔ Proposta INICIAL COESA NÃO gerada - Erro de cálculo\n\n❌ Não foi possível calcular o consumo a partir do valor da conta.\n\n📋 Dados informados:\n• Valor da Conta: R$ ${valorConta?.toFixed(2).replace('.', ',')}\n• Tarifa: R$ ${tarifa.toFixed(4).replace('.', ',')}\n\n💡 Verifique se os valores estão corretos.`;
        
        await addBitrix24Comment(commentText);

        return new Response(
          JSON.stringify({
            success: true,
            proposalCreated: false,
            tipoProposta: 'inicial',
            message: 'Could not calculate consumption from bill value',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      consumoMedio = consumoCalculado;
      tipoInstalacaoFinal = inferirTipoInstalacao(consumoMedio);
      dadosInferidos = true;
      
      // Recalcular desconto e fidelidade baseados no consumo se não foram informados no Bitrix24
      if (descontoFromBitrix === null) {
        desconto = calcularDescontoPadrao(consumoMedio);
        console.log(`[PROPOSTA INICIAL] Desconto padrão calculado: ${desconto}% (consumo: ${consumoMedio.toFixed(0)} kWh)`);
      }
      
      // Fidelidade dinâmica: UNLOCK para consumo > 3.000 kWh
      if (fidelidadeFromBitrix === null) {
        fidelidadeMeses = calcularFidelidadePadrao(consumoMedio);
        fidelidadeAnos = Math.ceil(fidelidadeMeses / 12);
        console.log(`[PROPOSTA INICIAL] Fidelidade padrão calculada: ${fidelidadeMeses} meses (${fidelidadeAnos} anos) - consumo: ${consumoMedio.toFixed(0)} kWh`);
      }

      console.log(`[PROPOSTA INICIAL] Cálculo reverso: R$ ${valorConta} / R$ ${tarifa.toFixed(4)} = ${consumoMedio.toFixed(0)} kWh → ${tipoInstalacaoFinal}, Desconto: ${desconto}%, Fidelidade: ${fidelidadeMeses} meses (${fidelidadeAnos} anos)`);
      
    } else {
      // PROPOSTA DEFINITIVA: Validação dinâmica
      // Montar objeto com todos os valores de campos disponíveis
      const allFieldValues: AvailableFieldValues = {
        nome: clienteNome,
        whatsappOuEmail,
        email: clienteEmail || null, // CORRIGIDO: e-mail separado para validação obrigatória
        concessionaria,
        valorConta,
        tipoInstalacao,
        consumoMedio: parseNumber(consumoMedioRaw),
        cpfCnpj: extractCustomField(lead, BITRIX_FIELD_CPF_CNPJ) as string | null,
        endereco: extractCustomField(lead, BITRIX_FIELD_ENDERECO) as string | null,
        numeroInstalacao: extractCustomField(lead, BITRIX_FIELD_NUMERO_INSTALACAO) as string | null,
      };

      const validationDefinitiva = validateRequiredFields(allFieldValues, requiredFieldIdsDefinitiva);
      console.log('Validation Definitiva result:', validationDefinitiva, '| Tarifa final:', tarifa, '| Required fields:', requiredFieldIdsDefinitiva);

      if (!validationDefinitiva.valid) {
        console.log(`Lead ${leadId} missing required fields: ${validationDefinitiva.missingFields.join(', ')}. NOT creating proposal.`);
        
        await supabase.from('bitrix24_sync_logs').insert({
          bitrix24_lead_id: leadId,
          action: 'validation_failed',
          status: 'skipped',
          request_data: payload,
          response_data: { validation: validationDefinitiva, lead: { nome: clienteNome, telefone: clienteTelefone, email: clienteEmail }, requiredFields: requiredFieldIdsDefinitiva },
        });

        const configuredFieldsList = requiredFieldIdsDefinitiva.map(id => FIELD_LABELS[id] || id).join('\n• ');
        const commentText = `⛔ Proposta DEFINITIVA COESA NÃO gerada - Dados incompletos\n\n📋 Campos obrigatórios faltantes:\n${validationDefinitiva.missingFields.map((f: string) => `• ${f}`).join('\n')}\n\n✏️ Complete os dados acima e mova o lead novamente para esta etapa.\n\n📌 Campos configurados como obrigatórios:\n• ${configuredFieldsList}\n\n💡 A Tarifa será buscada automaticamente da concessionária selecionada.`;
        
        await addBitrix24Comment(commentText);

        // Criar/atualizar contato no CRM com status de erro
        await upsertCrmContato({
          status: 'erro',
          ultimoErro: `Campos faltantes (Definitiva): ${validationDefinitiva.missingFields.join(', ')}`,
          cpfCnpj: allFieldValues.cpfCnpj,
        });

        return new Response(
          JSON.stringify({
            success: true,
            proposalCreated: false,
            tipoProposta: 'definitiva',
            message: 'Missing required fields - proposal NOT created',
            missingFields: validationDefinitiva.missingFields,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      // Para proposta definitiva, se consumo não informado, calcular via valor_conta/tarifa (se disponíveis)
      if (consumoMedio === null && valorConta && tarifa && tarifa > 0) {
        const consumoCalculado = calcularConsumoReverso(valorConta, tarifa);
        if (consumoCalculado !== null) {
          consumoMedio = consumoCalculado;
          console.log(`[PROPOSTA DEFINITIVA] Consumo calculado: R$ ${valorConta} / R$ ${tarifa.toFixed(4)} = ${consumoMedio.toFixed(0)} kWh`);
        }
      }
      
      // Se consumo ainda é null, usar valor padrão de 300 kWh (bifásico básico) para cálculos internos
      // Isso não deveria acontecer se valorConta ou consumoMedio forem campos obrigatórios
      const consumoFinal = consumoMedio ?? 300;
      
      // Para proposta definitiva, também aplicar desconto e fidelidade padrão se não informados
      if (descontoFromBitrix === null) {
        desconto = calcularDescontoPadrao(consumoFinal);
        console.log(`[PROPOSTA DEFINITIVA] Desconto padrão calculado: ${desconto}% (consumo: ${consumoFinal.toFixed(0)} kWh)`);
      }
      
      // Fidelidade dinâmica: UNLOCK para consumo > 3.000 kWh
      if (fidelidadeFromBitrix === null) {
        fidelidadeMeses = calcularFidelidadePadrao(consumoFinal);
        fidelidadeAnos = Math.ceil(fidelidadeMeses / 12);
        console.log(`[PROPOSTA DEFINITIVA] Fidelidade padrão calculada: ${fidelidadeMeses} meses (${fidelidadeAnos} anos) - consumo: ${consumoFinal.toFixed(0)} kWh`);
      }
      
      console.log(`[PROPOSTA DEFINITIVA] Desconto: ${desconto}%, Fidelidade: ${fidelidadeMeses} meses (${fidelidadeAnos} anos), Consumo: ${consumoFinal.toFixed(0)} kWh`);

      // VALIDAR: Se tarifa não foi encontrada mesmo após busca automática
      if (tarifa === null) {
        console.log(`Lead ${leadId}: Tarifa not found for concessionaria "${concessionaria}". NOT creating proposal.`);
        
        await supabase.from('bitrix24_sync_logs').insert({
          bitrix24_lead_id: leadId,
          action: 'tarifa_not_found',
          status: 'skipped',
          request_data: payload,
          response_data: { concessionaria, message: 'Tarifa not found in database' },
        });

        const commentText = `⚠️ Proposta DEFINITIVA COESA NÃO gerada - Tarifa não encontrada\n\n📋 Concessionária informada: ${concessionaria}\n\n❌ Não foi possível localizar a tarifa desta concessionária na base de dados.\n\n💡 Soluções:\n• Verifique se o nome da concessionária está correto\n• Solicite ao administrador que sincronize as tarifas com a ANEEL\n• Ou preencha a tarifa manualmente no campo (${BITRIX_CUSTOM_FIELDS.tarifa})`;
        
        await addBitrix24Comment(commentText);

        // Criar/atualizar contato no CRM com status de erro
        await upsertCrmContato({
          status: 'erro',
          ultimoErro: `Tarifa não encontrada para: ${concessionaria}`,
          cpfCnpj: null,
        });

        return new Response(
          JSON.stringify({
            success: true,
            proposalCreated: false,
            tipoProposta: 'definitiva',
            message: 'Tariff not found for concessionaria',
            concessionaria,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // All required fields are valid - proceed with proposal creation
    // Get a default user (first admin) to assign the proposal
    const { data: adminUser } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!adminUser) {
      console.error('No admin user found to assign proposal');
      return new Response(JSON.stringify({ error: 'No admin user found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = adminUser.user_id;

    // Use upsert to prevent duplicates - if bitrix24_lead_id exists, update instead of insert
    // First, check if proposal exists
    const { data: existingProposal } = await supabase
      .from('propostas_assinantes')
      .select('id, crm_contato_id')
      .eq('bitrix24_lead_id', leadId)
      .maybeSingle();

    // =====================================================
    // CRIAR/ATUALIZAR CONTATO NO CRM PRIMEIRO
    // Isso garante que temos o crm_contato_id para vincular na proposta
    // =====================================================
    const cpfCnpjFromLead = extractCustomField(lead, 'UF_CRM_1755711898') as string | null;
    const crmContatoId = await upsertCrmContato({
      status: 'novo',
      cpfCnpj: cpfCnpjFromLead,
    });

    console.log(`[bitrix24-webhook] CRM contato ID for proposal: ${crmContatoId}`);

    let proposalId: string;

    if (existingProposal) {
      // Update existing proposal
      proposalId = existingProposal.id;
      
      const updateData: Record<string, unknown> = {
        cliente_nome: clienteNome,
        cliente_telefone: clienteTelefone,
        cliente_email: clienteEmail,
        bitrix24_last_sync: new Date().toISOString(),
        status: 'rascunho',
        concessionaria: concessionaria,
        tipo_instalacao: tipoInstalacaoFinal,
        tarifa: tarifa,
        cip: cip,
        desconto_percentual: desconto,
        fidelidade_anos: fidelidadeAnos,
        consumo_medio: consumoMedio,
        tipo_proposta: tipoProposta,
        valor_conta_original: valorConta,
        dados_inferidos: dadosInferidos,
      };
      
      // Vincular ao contato CRM se ainda não estiver vinculado
      if (crmContatoId && !existingProposal.crm_contato_id) {
        updateData.crm_contato_id = crmContatoId;
      }
      
      const { error: updateError } = await supabase
        .from('propostas_assinantes')
        .update(updateData)
        .eq('id', proposalId);

      if (updateError) {
        console.error('Error updating proposal:', updateError);
        throw updateError;
      }

      console.log('Updated existing proposal:', proposalId);
    } else {
      // Insert new proposal with all validated data
      const insertData: Record<string, unknown> = {
        user_id: userId,
        cliente_nome: clienteNome,
        cliente_telefone: clienteTelefone,
        cliente_email: clienteEmail,
        bitrix24_lead_id: leadId,
        bitrix24_last_sync: new Date().toISOString(),
        status: 'rascunho',
        concessionaria: concessionaria,
        tipo_instalacao: tipoInstalacaoFinal,
        tarifa: tarifa,
        cip: cip,
        consumo_medio: consumoMedio,
        fidelidade_anos: fidelidadeAnos,
        desconto_percentual: desconto,
        numero_ucs: 1,
        tipo_proposta: tipoProposta,
        valor_conta_original: valorConta,
        dados_inferidos: dadosInferidos,
      };
      
      // Vincular ao contato CRM
      if (crmContatoId) {
        insertData.crm_contato_id = crmContatoId;
      }
      
      const { data: newProposal, error: insertError } = await supabase
        .from('propostas_assinantes')
        .insert(insertData)
        .select('id')
        .single();

      if (insertError) {
        // If duplicate key error, try to find and use existing proposal
        if (insertError.code === '23505') {
          console.log('Duplicate detected, fetching existing proposal for lead:', leadId);
          const { data: duplicateProposal } = await supabase
            .from('propostas_assinantes')
            .select('id')
            .eq('bitrix24_lead_id', leadId)
            .single();
          
          if (duplicateProposal) {
            proposalId = duplicateProposal.id;
            console.log('Using existing proposal:', proposalId);
            
            // Atualizar vínculo com contato CRM se necessário
            if (crmContatoId) {
              await supabase
                .from('propostas_assinantes')
                .update({ crm_contato_id: crmContatoId })
                .eq('id', proposalId)
                .is('crm_contato_id', null);
            }
          } else {
            throw insertError;
          }
        } else {
          console.error('Error creating proposal:', insertError);
          throw insertError;
        }
      } else {
        proposalId = newProposal.id;
        console.log('Created new proposal:', proposalId);
      }
    }

    // Log the sync action
    await supabase.from('bitrix24_sync_logs').insert({
      proposta_id: proposalId,
      bitrix24_lead_id: leadId,
      action: existingProposal ? 'lead_updated' : 'lead_created',
      status: 'success',
      request_data: payload,
      response_data: { proposalId, crmContatoId },
    });

    // ═══════════════════════════════════════════════════════════════
    // CRITICAL FIX: Vincular proposta_id à chatbot_conversas
    // Garante que a conversa sempre tenha referência para a proposta
    // ═══════════════════════════════════════════════════════════════
    if (proposalId) {
      try {
        const { data: conversaParaVincular } = await supabase
          .from('chatbot_conversas')
          .select('id, proposta_id')
          .eq('bitrix24_lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (conversaParaVincular && !conversaParaVincular.proposta_id) {
          await supabase
            .from('chatbot_conversas')
            .update({ proposta_id: proposalId })
            .eq('id', conversaParaVincular.id);
          
          console.log(`[bitrix24-webhook] ✅ Linked proposal ${proposalId} to conversation ${conversaParaVincular.id}`);
        } else if (conversaParaVincular?.proposta_id) {
          console.log(`[bitrix24-webhook] Conversation ${conversaParaVincular.id} already has proposta_id: ${conversaParaVincular.proposta_id}`);
        } else {
          console.log(`[bitrix24-webhook] No conversation found for lead ${leadId} to link proposal`);
        }
      } catch (linkError) {
        console.warn('[bitrix24-webhook] Failed to link proposal to conversation:', linkError);
        // Don't fail the webhook for this non-critical operation
      }
    }

    // Generate public proposal URL - fetch from configuracoes_sistema (including cache bust)
    let publicUrl = '';
    const { data: urlConfigs } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['public_app_url', 'public_cache_bust']);
    
    const urlConfigMap: Record<string, string> = {};
    urlConfigs?.forEach(c => { urlConfigMap[c.chave] = c.valor; });
    
    const publicAppUrl = urlConfigMap['public_app_url']?.trim();
    const publicCacheBust = urlConfigMap['public_cache_bust'] || '';
    
    if (publicAppUrl) {
      // Propostas criadas automaticamente pelo webhook são sempre 'inicial'
      // Propostas 'definitiva' só são criadas manualmente após validação de documentos
      const routePath = 'proposta-inicial';
      
      // Use configured URL with download=true for auto-download and v= for cache busting
      const vParam = publicCacheBust ? `&v=${publicCacheBust}` : '';
      publicUrl = `${publicAppUrl}/${routePath}/${proposalId}?download=true${vParam}`;
      console.log(`Using configured public_app_url: ${publicAppUrl} with route: ${routePath}, cache bust: ${publicCacheBust}`);
    } else {
      // Fallback: try to get from request origin or use a sensible default
      // Default para inicial se não há contexto
      const routePath = 'proposta-inicial';
      const origin = req.headers.get('origin') || req.headers.get('referer');
      const vParam = publicCacheBust ? `&v=${publicCacheBust}` : '';
      if (origin) {
        const originUrl = new URL(origin);
        publicUrl = `${originUrl.origin}/${routePath}/${proposalId}?download=true${vParam}`;
        console.log(`Using request origin for URL: ${originUrl.origin}`);
      } else {
        publicUrl = `https://coesasolar.com.br/${routePath}/${proposalId}?download=true${vParam}`;
        console.log('Using official CoesaSolar URL fallback');
      }
    }

    // Update lead in Bitrix24 with proposal link (for ChatApp WhatsApp robot)
    // and (when applicable) update Tarifa Energia in the SAME crm.lead.update call
    // to reduce OPERATION_TIME_LIMIT occurrences.
    let linkFieldUsed = '';
    // IMPORTANT: Link field code is configurable (Bitrix custom field UF_CRM_*)
    // Backward-compatible keys:
    // - bitrix24_custom_field_link_proposta (preferred)
    // - bitrix24_link_proposta_field (legacy)
    // Fallback remains UF_CRM_1767885928302
    let linkFieldCode = 'UF_CRM_1767885928302';
    try {
      const { data: linkFieldConfigs } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', ['bitrix24_custom_field_link_proposta', 'bitrix24_link_proposta_field']);

      const linkMap: Record<string, string> = {};
      linkFieldConfigs?.forEach((c) => {
        linkMap[c.chave] = (c.valor || '').trim();
      });

      linkFieldCode =
        linkMap.bitrix24_custom_field_link_proposta ||
        linkMap.bitrix24_link_proposta_field ||
        linkFieldCode;

      console.log(`[bitrix24-webhook] Using link field code: ${linkFieldCode}`);
    } catch (e) {
      console.warn('[bitrix24-webhook] Failed to load link field config, using default:', e);
    }

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const updateLeadFieldsOnce = async (fields: Record<string, string>) => {
      const updatePayload = new URLSearchParams({
        id: leadId, // Bitrix24 expects lowercase 'id' for crm.lead.update
      });

      for (const [fieldCode, fieldValue] of Object.entries(fields)) {
        updatePayload.append(`fields[${fieldCode}]`, fieldValue);
      }

      const updateResponse = await fetch(`${bitrix24Url}/crm.lead.update`, {
        method: 'POST',
        body: updatePayload,
      });

      return await updateResponse.json();
    };

    // ========================================
    // ATUALIZAÇÃO DA TARIFA ENERGIA NO BITRIX24
    // ========================================
    // Lógica: Atualizar sempre que o campo estiver vazio no Bitrix e tivermos uma tarifa calculada
    const tarifaBitrixRaw = extractCustomField(lead, BITRIX_CUSTOM_FIELDS.tarifa);
    const tarifaBitrixParsed = parseTarifa(tarifaBitrixRaw);
    const tarifaEstaVaziaNoBitrix = tarifaBitrixParsed === null;

    // Verificar se foi solicitado forçar atualização (via botão Reprocessar)
    const forceTarifaUpdate = payload.forceTarifaUpdate === true || payload.forceTarifaUpdate === 'true';

    let tarifaUpdateAttempted = false;
    let tarifaUpdateSuccess = false;
    let tarifaFieldUsed = BITRIX_CUSTOM_FIELDS.tarifa;
    let tarifaUpdateResponse: unknown = null;
    let tarifaFieldType = 'Money'; // Default assumption

    // Descobrir automaticamente o campo correto de Tarifa Energia
    const discoverTarifaField = async (): Promise<{ fieldCode: string; fieldType: string } | null> => {
      try {
        console.log('Discovering Tarifa Energia field code...');
        const userFieldsResponse = await fetch(`${bitrix24Url}/crm.lead.userfield.list`);
        const userFieldsData = await userFieldsResponse.json();

        if (!userFieldsData.result || !Array.isArray(userFieldsData.result)) {
          console.log('No userfields found or invalid response');
          return null;
        }

        // Procurar campo cujo label contenha "tarifa energia"
        for (const field of userFieldsData.result) {
          const labelEdit = (field.EDIT_FORM_LABEL || '').toLowerCase();
          const labelList = (field.LIST_COLUMN_LABEL || '').toLowerCase();
          const fieldName = field.FIELD_NAME || '';
          const userTypeId = field.USER_TYPE_ID || '';

          if (
            labelEdit.includes('tarifa energia') ||
            labelEdit.includes('tarifa_energia') ||
            labelList.includes('tarifa energia') ||
            labelList.includes('tarifa_energia')
          ) {
            console.log(
              `Found Tarifa Energia field: ${fieldName} (type: ${userTypeId}, label: ${labelEdit || labelList})`
            );
            return {
              fieldCode: fieldName,
              fieldType: userTypeId, // e.g., 'money', 'double', 'string'
            };
          }
        }

        console.log('No matching Tarifa Energia field found via discovery');
        return null;
      } catch (error) {
        console.error('Error discovering Tarifa Energia field:', error);
        return null;
      }
    };

    // Decide se devemos atualizar tarifa e, se sim, preparar valor + campo.
    let tarifaFormatted: string | null = null;

    if ((tarifaEstaVaziaNoBitrix || forceTarifaUpdate) && tarifa !== null) {
      tarifaUpdateAttempted = true;

      try {
        const discoveredField = await discoverTarifaField();
        if (discoveredField) {
          tarifaFieldUsed = discoveredField.fieldCode;
          tarifaFieldType = discoveredField.fieldType;
        }

        // Formatar valor conforme tipo do campo
        if (tarifaFieldType.toLowerCase() === 'money') {
          // Campo tipo Money: formato "1.17|BRL"
          tarifaFormatted = `${tarifa.toFixed(2)}|BRL`;
        } else {
          // Campo tipo Number/Double/String: apenas o número
          tarifaFormatted = tarifa.toFixed(2);
        }

        console.log(
          `Tarifa update planned for field ${tarifaFieldUsed} (type: ${tarifaFieldType}) with: ${tarifaFormatted}`
        );
        console.log(
          `Tarifa antes no Bitrix: ${tarifaBitrixRaw} (parsed: ${tarifaBitrixParsed}), forceTarifaUpdate: ${forceTarifaUpdate}`
        );
      } catch (prepError) {
        console.error('Error preparing tarifa update:', prepError);
        tarifaFormatted = null;
        tarifaUpdateAttempted = true;
        tarifaUpdateSuccess = false;
        tarifaUpdateResponse = { error: prepError instanceof Error ? prepError.message : 'Unknown error' };
      }
    } else if (!tarifaEstaVaziaNoBitrix) {
      console.log(
        `Tarifa already filled in Bitrix24: ${tarifaBitrixRaw} (parsed: ${tarifaBitrixParsed}). Skipping update.`
      );
    } else if (tarifa === null) {
      console.log('No tariff calculated, cannot update Bitrix24.');
    }

    // ========================================
    // ATUALIZAR CONSUMO MÉDIO NO BITRIX24 (PROPOSTA INICIAL)
    // ========================================
    // Quando a proposta é inicial, exportar o consumo calculado de volta ao Bitrix24
    let consumoMedioFormatted: string | null = null;
    let consumoMedioUpdateAttempted = false;
    let consumoMedioUpdateSuccess = false;
    
    if (tipoProposta === 'inicial' && dadosInferidos && consumoMedio !== null && consumoMedio > 0) {
      consumoMedioFormatted = consumoMedio.toFixed(0);  // Valor inteiro em kWh
      consumoMedioUpdateAttempted = true;
      console.log(`Consumo Médio calculado: ${consumoMedioFormatted} kWh → será enviado ao Bitrix24 campo ${BITRIX_CUSTOM_FIELDS.consumoMedio}`);
    }

    // Faz UMA única chamada ao crm.lead.update (link + tarifa + consumo quando aplicável)
    try {
      const updateFields: Record<string, string> = {
        [linkFieldCode]: publicUrl,
      };

      if (tarifaFormatted !== null) {
        updateFields[tarifaFieldUsed] = tarifaFormatted;
      }
      
      // Adicionar consumo médio calculado para propostas iniciais
      if (consumoMedioFormatted !== null) {
        updateFields[BITRIX_CUSTOM_FIELDS.consumoMedio] = consumoMedioFormatted;
      }

      // Backoff muito mais conservador para evitar OPERATION_TIME_LIMIT
      // Bitrix24 pode bloquear por até 30-60 segundos após limite atingido
      const maxAttempts = 4;
      const backoffMs = [2000, 8000, 20000, 45000]; // Delay inicial + crescente

      let lastResult: any = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Sempre esperar antes da primeira tentativa para dar tempo ao Bitrix24
        await sleep(backoffMs[attempt - 1]);
        console.log(`Tentativa ${attempt}/${maxAttempts} de atualizar lead ${leadId} no Bitrix24...`);

        const result = await updateLeadFieldsOnce(updateFields);
        lastResult = result;

        if (result?.error === 'OPERATION_TIME_LIMIT' && attempt < maxAttempts) {
          console.log(
            `crm.lead.update blocked by OPERATION_TIME_LIMIT (attempt ${attempt}/${maxAttempts}). Aguardando ${backoffMs[attempt] / 1000}s...`
          );
          continue;
        }

        break;
      }

      const updateResult = lastResult;

      if (updateResult?.error) {
        console.error(`Bitrix24 error on crm.lead.update: ${updateResult.error} - ${updateResult.error_description || ''}`);

        // Build error message dynamically
        let camposAtualizados = 'Link Proposta COESA';
        if (tarifaFormatted !== null) camposAtualizados += ' + Tarifa Energia';
        if (consumoMedioFormatted !== null) camposAtualizados += ' + Consumo Médio';

        await addBitrix24Comment(
          `⚠️ Não foi possível atualizar o lead automaticamente (${camposAtualizados}).\n\n` +
            `🔗 Link da proposta: ${publicUrl}\n` +
            `📝 Campo Link: ${linkFieldCode}\n` +
            (tarifaFormatted !== null
              ? `📊 Tarifa tentada: R$ ${tarifa.toFixed(2).replace('.', ',')} /kWh\n📝 Campo Tarifa: ${tarifaFieldUsed}\n`
              : '') +
            (consumoMedioFormatted !== null
              ? `⚡ Consumo Médio tentado: ${consumoMedioFormatted} kWh\n📝 Campo Consumo: ${BITRIX_CUSTOM_FIELDS.consumoMedio}\n`
              : '') +
            `❌ Erro: ${updateResult.error} - ${updateResult.error_description || ''}\n\n` +
            `💡 Se for OPERATION_TIME_LIMIT, aguarde 1-2 minutos e reprocessse.`
        );

        if (tarifaFormatted !== null) {
          tarifaUpdateSuccess = false;
          tarifaUpdateResponse = updateResult;
        }
        if (consumoMedioFormatted !== null) {
          consumoMedioUpdateSuccess = false;
        }
      } else if (updateResult?.result === true) {
        linkFieldUsed = linkFieldCode;

        if (tarifaFormatted !== null) {
          tarifaUpdateSuccess = true;
          tarifaUpdateResponse = updateResult;
        }
        if (consumoMedioFormatted !== null) {
          consumoMedioUpdateSuccess = true;
        }
        
        const camposAtualizados = [
          'link',
          tarifaFormatted !== null ? 'tarifa' : null,
          consumoMedioFormatted !== null ? 'consumo médio' : null,
        ].filter(Boolean).join(' + ');
        
        console.log(`Successfully updated Bitrix24 lead with ${camposAtualizados} in a single call.`);
      } else {
        console.log(`Unexpected response on crm.lead.update: ${JSON.stringify(updateResult)}`);

        await addBitrix24Comment(
          `⚠️ Resposta inesperada ao atualizar o lead no Bitrix24.\n\n` +
            `🔗 Link da proposta: ${publicUrl}\n` +
            (tarifaFormatted !== null
              ? `📊 Tarifa tentada: R$ ${tarifa.toFixed(2).replace('.', ',')} /kWh\n`
              : '') +
            (consumoMedioFormatted !== null
              ? `⚡ Consumo Médio tentado: ${consumoMedioFormatted} kWh\n`
              : '') +
            `📋 Resposta: ${JSON.stringify(updateResult)}`
        );

        if (tarifaFormatted !== null) {
          tarifaUpdateSuccess = false;
          tarifaUpdateResponse = updateResult;
        }
        if (consumoMedioFormatted !== null) {
          consumoMedioUpdateSuccess = false;
        }
      }

      // Log detalhado no banco de dados
      if (tarifaFormatted !== null || consumoMedioFormatted !== null) {
        await supabase.from('bitrix24_sync_logs').insert({
          bitrix24_lead_id: leadId,
          proposta_id: proposalId,
          action: tipoProposta === 'inicial' ? 'initial_proposal_update' : 'tarifa_update',
          status: (tarifaFormatted !== null && tarifaUpdateSuccess) || (consumoMedioFormatted !== null && consumoMedioUpdateSuccess) ? 'success' : 'failed',
          request_data: {
            tarifaFieldUsed: tarifaFormatted !== null ? tarifaFieldUsed : null,
            tarifaFieldType: tarifaFormatted !== null ? tarifaFieldType : null,
            tarifaFormatted,
            tarifaBitrixAntes: tarifaBitrixRaw,
            consumoMedioFormatted,
            consumoMedioField: BITRIX_CUSTOM_FIELDS.consumoMedio,
          },
          response_data: tarifaUpdateResponse,
        });
      }
    } catch (updateLeadError) {
      console.error('Error updating lead fields in Bitrix24:', updateLeadError);

      await addBitrix24Comment(
        `⚠️ Erro ao tentar atualizar o lead automaticamente.\n\n` +
          `🔗 Link da proposta: ${publicUrl}\n` +
          `❌ Erro: ${updateLeadError instanceof Error ? updateLeadError.message : 'Erro desconhecido'}`
      );

      if (tarifaFormatted !== null) {
        tarifaUpdateSuccess = false;
        tarifaUpdateResponse = {
          error: updateLeadError instanceof Error ? updateLeadError.message : 'Unknown error',
        };
      }
    }

    // Add success comment to Bitrix24
    let successComment = '';
    
    if (tipoProposta === 'inicial') {
      successComment = `✅ Proposta INICIAL COESA gerada com sucesso!\n\n📄 Link da proposta: ${publicUrl}`;
      successComment += `\n\n⚠️ PROPOSTA ESTIMATIVA - Valores calculados automaticamente:`;
      successComment += `\n• Valor da conta informado: R$ ${valorConta?.toFixed(2).replace('.', ',')}`;
      successComment += `\n• Tarifa utilizada: R$ ${tarifa!.toFixed(4).replace('.', ',')} /kWh`;
      successComment += `\n• Consumo estimado: ${consumoMedio?.toFixed(0) ?? 'N/A'} kWh`;
      successComment += `\n• Tipo de instalação inferido: ${tipoInstalacaoFinal}`;
      
      // Informar sobre exportação do consumo médio
      if (consumoMedioUpdateAttempted) {
        if (consumoMedioUpdateSuccess) {
          successComment += `\n\n✅ Campo "Consumo Médio" preenchido automaticamente no Bitrix24: ${consumoMedio?.toFixed(0) ?? 'N/A'} kWh`;
        } else {
          successComment += `\n\n⚠️ Não foi possível preencher o campo "Consumo Médio" automaticamente (veja comentário anterior)`;
        }
      }
      
      successComment += `\n\n📝 Esta proposta contém dados estimados e não constitui compromisso comercial.`;
      successComment += `\nPara proposta definitiva, solicite os dados completos do cliente.`;
    } else {
      successComment = `✅ Proposta DEFINITIVA COESA gerada com sucesso!\n\n📄 Link da proposta: ${publicUrl}`;
      
      if (tarifaBuscadaAutomaticamente && tarifa !== null) {
        successComment += `\n\n📊 Tarifa aplicada automaticamente: R$ ${tarifa.toFixed(2).replace('.', ',')} /kWh\n(Fonte: Concessionária ${concessionaria})`;
        
        if (tarifaUpdateAttempted) {
          if (tarifaUpdateSuccess) {
            successComment += `\n✅ Campo "Tarifa Energia" preenchido no Bitrix24`;
          } else {
            successComment += `\n⚠️ Não foi possível preencher o campo "Tarifa Energia" automaticamente (veja comentário anterior)`;
          }
        }
      }
    }
    
    successComment += `\n\nO cliente pode visualizar e aceitar a proposta através deste link.`;
    
    await addBitrix24Comment(successComment);
    
    // Marcar log inicial como sucesso
    await updateEarlyLog('success', { proposalId, publicUrl, tipoProposta });

    // ========================================
    // ENVIO VIA WHATSAPP DESABILITADO
    // ========================================
    // O envio de proposta via WhatsApp agora é feito EXCLUSIVAMENTE pelo
    // bitrix24-link-webhook, que possui deduplicação robusta via hash.
    // Isso evita mensagens duplicadas (4 mensagens enviadas de uma vez).
    // 
    // O bitrix24-link-webhook é disparado automaticamente quando o campo
    // "Link Proposta COESA" é atualizado no Bitrix24.
    //
    // Mantendo o código comentado para referência:
    /*
    const sendProposalViaWhatsApp = async () => {
      try {
        if (!clienteTelefone) {
          console.log('[bitrix24-webhook] No phone number, skipping WhatsApp notification');
          return;
        }

        // DEDUP: Verificar se já enviamos proposta via WhatsApp para este lead nos últimos 60s
        const WHATSAPP_DEDUP_SECONDS = 60;
        const { data: recentProposalMessage } = await supabase
          .from('chatbot_mensagens')
          .select('id, created_at')
          .ilike('content', '%proposta%está aqui%')
          .gte('created_at', new Date(Date.now() - WHATSAPP_DEDUP_SECONDS * 1000).toISOString())
          .limit(1)
          .maybeSingle();
        
        if (recentProposalMessage) {
          console.log(`[bitrix24-webhook] WhatsApp proposal already sent recently (${recentProposalMessage.id}). Skipping duplicate.`);
          return;
        }

        // Buscar se existe conversa ativa com este lead
        const { data: conversa } = await supabase
          .from('chatbot_conversas')
          .select('id, cliente_telefone, cliente_nome, proposta_id')
          .eq('bitrix24_lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        // DEDUP adicional: Se a conversa já tem proposta_id igual, não enviar novamente
        if (conversa?.proposta_id === proposalId) {
          console.log(`[bitrix24-webhook] Conversation already has this proposal (${proposalId}). Skipping duplicate WhatsApp.`);
          return;
        }

        // Se não encontrou conversa pelo lead_id, tentar pelo telefone
        let conversaId = conversa?.id;
        let whatsappPhone = conversa?.cliente_telefone || clienteTelefone;

        if (!conversaId && clienteTelefone) {
          // Normalizar telefone para busca
          const phoneDigits = clienteTelefone.replace(/\D/g, '');
          const phoneVariants = [
            phoneDigits,
            phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`,
          ];

          const { data: conversaByPhone } = await supabase
            .from('chatbot_conversas')
            .select('id, cliente_telefone')
            .or(phoneVariants.map(p => `cliente_telefone.ilike.%${p.slice(-9)}`).join(','))
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (conversaByPhone) {
            conversaId = conversaByPhone.id;
            whatsappPhone = conversaByPhone.cliente_telefone;
          }
        }

        if (!whatsappPhone) {
          console.log('[bitrix24-webhook] No WhatsApp phone found, skipping notification');
          return;
        }

        // Preparar mensagem baseada no tipo de proposta
        const primeiroNome = clienteNome?.split(' ')[0] || 'Cliente';
        let mensagem = '';
        
        // Criar URL simples sem download automático para WhatsApp
        // Remove ?download=true ou &download=true e corrige &v= para ?v= se necessário
        let publicUrlSimples = publicUrl
          .replace('?download=true&', '?')
          .replace('?download=true', '')
          .replace('&download=true', '');
        // Se a URL ficou com &v= no início dos parâmetros, corrigir para ?v=
        if (publicUrlSimples.includes('&v=') && !publicUrlSimples.includes('?')) {
          publicUrlSimples = publicUrlSimples.replace('&v=', '?v=');
        }
        
        if (tipoProposta === 'inicial') {
          mensagem = `Pronto, ${primeiroNome}! 🎉\n\n` +
            `Sua proposta inicial está aqui:\n${publicUrlSimples}\n\n` +
            `É uma simulação baseada no valor que você informou. ` +
            `Dá uma olhada e me conta o que achou! 😊`;
        } else {
          // Proposta definitiva: não enviar mensagem, Bitrix24 cuida disso
          console.log(`[bitrix24-webhook] Skipping WhatsApp for non-inicial proposal (type: ${tipoProposta})`);
          return;
        }

        console.log(`[bitrix24-webhook] Sending proposal to WhatsApp: ${whatsappPhone}`);

        // Chamar edge function para enviar mensagem
        const { error: sendError } = await supabase.functions.invoke('z-api-send-message', {
          body: {
            phone: whatsappPhone,
            message: mensagem,
            conversaId: conversaId,
          },
        });

        if (sendError) {
          console.error('[bitrix24-webhook] Error sending WhatsApp message:', sendError);
        } else {
          console.log('[bitrix24-webhook] WhatsApp proposal notification sent successfully');
          
          // Atualizar conversa com proposta_id se encontrada
          if (conversaId) {
            await supabase
              .from('chatbot_conversas')
              .update({ 
                proposta_id: proposalId,
                last_sofia_message_at: new Date().toISOString(),
              })
              .eq('id', conversaId);
          }
        }
      } catch (whatsappError) {
        console.error('[bitrix24-webhook] WhatsApp notification error:', whatsappError);
        // Não falhar o webhook por causa do WhatsApp
      }
    };

    // Executar envio do WhatsApp em background (não bloqueia resposta)
    // @ts-ignore - EdgeRuntime exists in Deno Deploy
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(sendProposalViaWhatsApp());
    } else {
      // Fallback: executar diretamente mas sem await
      sendProposalViaWhatsApp().catch(err => console.error('[bitrix24-webhook] Background WhatsApp error:', err));
    }
    */
    // FIM DO CÓDIGO COMENTADO - Envio agora é feito pelo bitrix24-link-webhook
    console.log('[bitrix24-webhook] WhatsApp sending disabled - handled by bitrix24-link-webhook');

    return new Response(
      JSON.stringify({
        success: true,
        proposalCreated: true,
        proposalId,
        publicUrl,
        tipoProposta,
        dadosInferidos,
        message: existingProposal ? 'Proposal updated' : 'Proposal created',
        linkFieldUpdated: linkFieldUsed,
        // Dados calculados (para proposta inicial)
        consumoCalculado: tipoProposta === 'inicial' ? consumoMedio : undefined,
        tipoInstalacaoInferido: tipoProposta === 'inicial' ? tipoInstalacaoFinal : undefined,
        valorContaOriginal: valorConta,
        // Informações sobre exportação do consumo médio
        consumoMedioExportado: consumoMedioUpdateAttempted ? consumoMedioUpdateSuccess : undefined,
        consumoMedioField: consumoMedioUpdateAttempted ? BITRIX_CUSTOM_FIELDS.consumoMedio : undefined,
        // Informações detalhadas sobre a atualização da tarifa
        tarifaBitrixAntes: tarifaBitrixRaw,
        tarifaCalculada: tarifa,
        tarifaFieldUsed,
        tarifaFieldType,
        tarifaUpdateAttempted,
        tarifaUpdateSuccess,
        tarifaUpdateResponse,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
