/**
 * SOFIA PIPELINE 2.0 - DETERMINISTIC ROUTER
 * 
 * Camada de roteamento que intercepta mensagens ANTES da LLM,
 * decidindo quando usar respostas determinísticas (templates)
 * vs quando acionar o cérebro probabilístico.
 * 
 * Objetivo: Reduzir alucinações em tarefas repetitivas (coleta de dados)
 * onde respostas estruturadas são mais confiáveis que IA generativa.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { IntentPayload, FullContext, ExtractedEntity } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================
// TYPES
// ============================================

export interface DeterministicResult {
  /** Whether the router handled this message (skip LLM if true) */
  handled: boolean;
  /** Response text to send (if handled) */
  responseText: string | null;
  /** Next expected field for FSM */
  newExpectedField: string | null;
  /** Next FSM state */
  newState: string | null;
  /** Data to save to dados_coletados */
  dataToSave: Record<string, unknown>;
  /** Skip LLM entirely */
  skipLLM: boolean;
  /** Reason for routing decision */
  routingReason: string;
  /** Field attempts counter (if validation failed) */
  fieldAttempts: number;
  /** Whether to escalate to human */
  shouldEscalate: boolean;
}

interface ResponseTemplate {
  id: string;
  agent_id: string;
  current_state: string;
  expected_field: string;
  validation_result: string;
  response_template: string;
  next_state: string | null;
  next_expected_field: string | null;
  priority: number;
  metadata: Record<string, unknown>;
}

interface FSMState {
  expectedField: string | null;
  currentState: string | null;
  fieldAttempts: number;
}

// ============================================
// MAIN ROUTER FUNCTION
// ============================================

/**
 * Tenta rotear a mensagem de forma determinística.
 * Se handled=true, o pipeline deve pular a LLM.
 */
export async function tryDeterministicResponse(
  intake: IntentPayload,
  fsmState: FSMState,
  agentId: string = 'sofia'
): Promise<DeterministicResult> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log(`[DeterministicRouter] Evaluating: state=${fsmState.currentState}, expected=${fsmState.expectedField}, intent=${intake.intent}`);
  
  // ========================================
  // RULE 1: Check for open-ended intents (ALWAYS go to LLM)
  // ========================================
  const llmRequiredIntents = [
    'clarification',
    'objection',
    'technical_question',
    'competitor_mention',
    'complaint',
    'billing_question',
    'doubt',
    'negotiation'
  ];
  
  if (llmRequiredIntents.includes(intake.intent)) {
    console.log(`[DeterministicRouter] → LLM (intent requires reasoning: ${intake.intent})`);
    return createPassToLLM(`intent_requires_llm: ${intake.intent}`);
  }
  
  // ========================================
  // RULE 2: If not in data collection mode, pass to LLM
  // ========================================
  if (!fsmState.expectedField) {
    console.log(`[DeterministicRouter] → LLM (no expected field set)`);
    return createPassToLLM('no_expected_field');
  }
  
  // ========================================
  // RULE 3: Match extracted entity to expected field
  // ========================================
  const fieldMapping: Record<string, string[]> = {
    'nome': ['name', 'person_name'],
    'email': ['email'],
    'valor': ['value', 'bill_value', 'currency'],
    'distribuidora': ['distributor', 'utility_company'],
    'cpf': ['cpf'],
    'cnpj': ['cnpj'],
    'telefone': ['phone'],
    'endereco': ['address', 'cep']
  };
  
  const expectedEntityTypes = fieldMapping[fsmState.expectedField] || [fsmState.expectedField];
  
  // Find matching entity
  const matchedEntity = intake.entities.find(e => 
    expectedEntityTypes.includes(e.type) && e.confidence >= 0.6
  );
  
  // ========================================
  // RULE 4: Determine validation result
  // ========================================
  let validationResult: 'success' | 'fail' | 'invalid_format' | 'missing';
  let extractedValue: unknown = null;
  
  if (matchedEntity) {
    // Entity found - validate it
    const validation = validateEntity(fsmState.expectedField, matchedEntity);
    validationResult = validation.result;
    extractedValue = validation.normalizedValue;
    
    console.log(`[DeterministicRouter] Entity found: ${matchedEntity.type}=${matchedEntity.value}, validation=${validationResult}`);
  } else {
    // No entity found - check if message looks like expected data
    const looksLikeData = checkMessageLooksLikeData(intake.rawContent, fsmState.expectedField);
    validationResult = looksLikeData ? 'invalid_format' : 'missing';
    
    console.log(`[DeterministicRouter] No entity matched. Message looks like ${fsmState.expectedField}? ${looksLikeData}`);
  }
  
  // ========================================
  // RULE 5: Fetch template from database
  // ========================================
  const { data: templates, error } = await supabase
    .from('deterministic_response_templates')
    .select('*')
    .eq('agent_id', agentId)
    .eq('current_state', fsmState.currentState || `aguardando_${fsmState.expectedField}`)
    .eq('expected_field', fsmState.expectedField)
    .eq('validation_result', validationResult)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(1);
  
  if (error || !templates || templates.length === 0) {
    console.log(`[DeterministicRouter] → LLM (no template found for state=${fsmState.currentState}, field=${fsmState.expectedField}, result=${validationResult})`);
    return createPassToLLM('no_template_found');
  }
  
  const template = templates[0] as ResponseTemplate;
  
  // ========================================
  // RULE 6: Check max attempts before escalation
  // ========================================
  const MAX_FIELD_ATTEMPTS = 3;
  const newAttempts = validationResult === 'success' ? 0 : fsmState.fieldAttempts + 1;
  
  if (newAttempts >= MAX_FIELD_ATTEMPTS) {
    console.log(`[DeterministicRouter] Max attempts reached for ${fsmState.expectedField}, escalating`);
    
    // Get escalation template
    const { data: escalationTemplates } = await supabase
      .from('deterministic_response_templates')
      .select('*')
      .eq('agent_id', agentId)
      .eq('current_state', 'validacao_falhou')
      .eq('is_active', true)
      .limit(1);
    
    const escalationTemplate = escalationTemplates?.[0] as ResponseTemplate | undefined;
    
    return {
      handled: true,
      responseText: escalationTemplate?.response_template || 
        'Parece que estamos com dificuldade. Vou chamar um atendente para te ajudar!',
      newExpectedField: null,
      newState: 'escalar',
      dataToSave: {},
      skipLLM: true,
      routingReason: 'max_attempts_exceeded',
      fieldAttempts: newAttempts,
      shouldEscalate: true
    };
  }
  
  // ========================================
  // RULE 7: Interpolate template and return
  // ========================================
  const interpolatedResponse = interpolateTemplate(
    template.response_template,
    extractedValue,
    intake,
    fsmState.expectedField
  );
  
  // Build data to save
  const dataToSave: Record<string, unknown> = {};
  if (validationResult === 'success' && extractedValue !== null) {
    dataToSave[fsmState.expectedField] = extractedValue;
  }
  
  console.log(`[DeterministicRouter] ✅ DETERMINISTIC: ${template.current_state} → ${template.next_state || 'same'}`);
  
  return {
    handled: true,
    responseText: interpolatedResponse,
    newExpectedField: template.next_expected_field,
    newState: template.next_state,
    dataToSave,
    skipLLM: true,
    routingReason: `template_matched: ${validationResult}`,
    fieldAttempts: newAttempts,
    shouldEscalate: false
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function createPassToLLM(reason: string): DeterministicResult {
  return {
    handled: false,
    responseText: null,
    newExpectedField: null,
    newState: null,
    dataToSave: {},
    skipLLM: false,
    routingReason: reason,
    fieldAttempts: 0,
    shouldEscalate: false
  };
}

interface ValidationResult {
  result: 'success' | 'fail' | 'invalid_format';
  normalizedValue: unknown;
}

function validateEntity(
  fieldType: string,
  entity: ExtractedEntity
): ValidationResult {
  const value = entity.normalized || entity.value;
  
  switch (fieldType) {
    case 'nome':
      // Name should have at least 2 words
      const words = value.trim().split(/\s+/);
      if (words.length >= 2 && words.every((w: string) => w.length >= 2)) {
        return { result: 'success', normalizedValue: value.trim() };
      }
      return { result: 'fail', normalizedValue: null };
    
    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(value)) {
        return { result: 'success', normalizedValue: value.toLowerCase().trim() };
      }
      return { result: 'invalid_format', normalizedValue: null };
    
    case 'valor':
      // Extract numeric value
      const numericStr = value.replace(/[^\d,\.]/g, '').replace(',', '.');
      const numericValue = parseFloat(numericStr);
      if (!isNaN(numericValue) && numericValue > 0) {
        return { result: 'success', normalizedValue: numericValue };
      }
      return { result: 'fail', normalizedValue: null };
    
    case 'distribuidora':
      // Just check if it looks like a utility name (minimum 3 chars)
      if (value.length >= 3) {
        return { result: 'success', normalizedValue: value.toUpperCase().trim() };
      }
      return { result: 'fail', normalizedValue: null };
    
    case 'cpf':
      const cpfClean = value.replace(/\D/g, '');
      if (cpfClean.length === 11) {
        return { result: 'success', normalizedValue: cpfClean };
      }
      return { result: 'invalid_format', normalizedValue: null };
    
    case 'cnpj':
      const cnpjClean = value.replace(/\D/g, '');
      if (cnpjClean.length === 14) {
        return { result: 'success', normalizedValue: cnpjClean };
      }
      return { result: 'invalid_format', normalizedValue: null };
    
    default:
      // Default: accept if entity confidence is high enough
      return entity.confidence >= 0.7 
        ? { result: 'success', normalizedValue: value }
        : { result: 'fail', normalizedValue: null };
  }
}

function checkMessageLooksLikeData(message: string, expectedField: string): boolean {
  const patterns: Record<string, RegExp> = {
    'nome': /^[A-Za-zÀ-ú\s]{5,}$/,
    'email': /@/,
    'valor': /\d{2,}/,
    'distribuidora': /^[A-Za-z]{3,}/,
    'cpf': /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
    'cnpj': /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/
  };
  
  const pattern = patterns[expectedField];
  return pattern ? pattern.test(message.trim()) : false;
}

function interpolateTemplate(
  template: string,
  extractedValue: unknown,
  intake: IntentPayload,
  expectedField: string
): string {
  let result = template;
  
  // Extract first name from full name
  const firstName = typeof extractedValue === 'string' && expectedField === 'nome'
    ? extractedValue.split(' ')[0]
    : '';
  
  // Replace placeholders
  const replacements: Record<string, string> = {
    '{cliente_nome}': String(extractedValue || ''),
    '{first_name}': firstName,
    '{valor_extraido}': expectedField === 'valor' ? formatCurrency(extractedValue as number) : '',
    '{email_extraido}': expectedField === 'email' ? String(extractedValue || '') : '',
    '{distribuidora}': expectedField === 'distribuidora' ? String(extractedValue || '') : '',
    '{cpf}': expectedField === 'cpf' ? formatCPF(String(extractedValue || '')) : '',
    '{cnpj}': expectedField === 'cnpj' ? formatCNPJ(String(extractedValue || '')) : ''
  };
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  
  return result;
}

function formatCurrency(value: number): string {
  if (!value || isNaN(value)) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCPF(cpf: string): string {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatCNPJ(cnpj: string): string {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// ============================================
// FSM STATE MANAGEMENT
// ============================================

/**
 * Carrega o estado FSM da conversa atual
 */
export async function loadFSMState(conversaId: string): Promise<FSMState> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('chatbot_conversas')
    .select('fsm_expected_field, sofia_mode, field_attempts')
    .eq('id', conversaId)
    .single();
  
  if (error || !data) {
    return {
      expectedField: null,
      currentState: null,
      fieldAttempts: 0
    };
  }
  
  return {
    expectedField: data.fsm_expected_field,
    currentState: inferStateFromMode(data.sofia_mode, data.fsm_expected_field),
    fieldAttempts: data.field_attempts || 0
  };
}

/**
 * Atualiza o estado FSM após processamento determinístico
 */
export async function updateFSMState(
  conversaId: string,
  result: DeterministicResult,
  previousData: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const updateData: Record<string, unknown> = {
    field_attempts: result.fieldAttempts,
    last_deterministic_response_at: new Date().toISOString()
  };
  
  if (result.newExpectedField !== undefined) {
    updateData.fsm_expected_field = result.newExpectedField;
  }
  
  if (result.newState) {
    updateData.sofia_mode = mapStateToMode(result.newState);
  }
  
  // Merge new data into dados_coletados
  if (Object.keys(result.dataToSave).length > 0) {
    updateData.dados_coletados = {
      ...previousData,
      ...result.dataToSave
    };
  }
  
  await supabase
    .from('chatbot_conversas')
    .update(updateData)
    .eq('id', conversaId);
}

function inferStateFromMode(mode: string | null, expectedField: string | null): string {
  if (expectedField) {
    return `aguardando_${expectedField}`;
  }
  
  switch (mode) {
    case 'standard': return 'qualificacao';
    case 'closer_premium': return 'proposta_enviada';
    case 'contract_closer': return 'aguardando_docs';
    case 'triage': return 'triagem';
    default: return 'inicio';
  }
}

function mapStateToMode(state: string): string | null {
  if (state.startsWith('aguardando_')) return null; // Keep current mode
  
  switch (state) {
    case 'qualificacao': return 'standard';
    case 'gerando_proposta': return 'closer_premium';
    case 'proposta_enviada': return 'closer_premium';
    case 'aguardando_docs': return 'contract_closer';
    case 'escalar': return 'escalar';
    default: return null;
  }
}

// ============================================
// SET EXPECTED FIELD (for LLM to call)
// ============================================

/**
 * Define qual campo deve ser coletado a seguir.
 * Chamado após a LLM decidir pedir um dado específico.
 */
export async function setExpectedField(
  conversaId: string,
  field: string | null
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  await supabase
    .from('chatbot_conversas')
    .update({
      fsm_expected_field: field,
      field_attempts: 0
    })
    .eq('id', conversaId);
  
  console.log(`[DeterministicRouter] Set expected field: ${field || 'null'}`);
}
