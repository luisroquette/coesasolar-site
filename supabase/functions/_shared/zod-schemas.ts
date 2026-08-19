/**
 * Zod Validation Schemas Module
 * Centralized input validation for edge functions
 * 
 * Protects against:
 * - Prototype pollution
 * - Type coercion attacks
 * - Oversized payloads
 * - Malformed data
 * 
 * @module zod-schemas
 */

// Note: Using custom validation since Zod isn't available in Deno without import maps
// This module provides equivalent functionality with manual validation

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

// ═══════════════════════════════════════════════════════════════
// HELPER VALIDATORS
// ═══════════════════════════════════════════════════════════════

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

function isNumber(val: unknown): val is number {
  return typeof val === 'number' && !isNaN(val);
}

function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean';
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isArray(val: unknown): val is unknown[] {
  return Array.isArray(val);
}

/**
 * Remove dangerous prototype-polluting properties
 */
function sanitizeObject<T>(obj: unknown): T | null {
  if (!isObject(obj)) return null;
  
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (dangerous.includes(key)) continue;
    
    if (isObject(value)) {
      result[key] = sanitizeObject(value);
    } else if (isArray(value)) {
      result[key] = value.map(item => 
        isObject(item) ? sanitizeObject(item) : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

// ═══════════════════════════════════════════════════════════════
// Z-API WEBHOOK SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface ZApiWebhookPayload {
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
  _agentId?: string;
}

export function validateZApiWebhook(body: unknown): ValidationResult<ZApiWebhookPayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<ZApiWebhookPayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // Validate phone if present
  if (sanitized.phone !== undefined && !isString(sanitized.phone)) {
    errors.push({ field: 'phone', message: 'Phone must be a string', code: 'invalid_type' });
  }
  if (sanitized.phone && sanitized.phone.length > 30) {
    errors.push({ field: 'phone', message: 'Phone too long (max 30)', code: 'too_long' });
  }
  
  // Validate messageId if present
  if (sanitized.messageId !== undefined && !isString(sanitized.messageId)) {
    errors.push({ field: 'messageId', message: 'messageId must be a string', code: 'invalid_type' });
  }
  if (sanitized.messageId && sanitized.messageId.length > 100) {
    errors.push({ field: 'messageId', message: 'messageId too long (max 100)', code: 'too_long' });
  }
  
  // Validate fromMe if present
  if (sanitized.fromMe !== undefined && !isBoolean(sanitized.fromMe)) {
    errors.push({ field: 'fromMe', message: 'fromMe must be a boolean', code: 'invalid_type' });
  }
  
  // Validate type if present
  if (sanitized.type !== undefined && !isString(sanitized.type)) {
    errors.push({ field: 'type', message: 'type must be a string', code: 'invalid_type' });
  }
  
  // Validate text.message if present
  if (sanitized.text !== undefined) {
    if (!isObject(sanitized.text)) {
      errors.push({ field: 'text', message: 'text must be an object', code: 'invalid_type' });
    } else if (sanitized.text.message !== undefined && !isString(sanitized.text.message)) {
      errors.push({ field: 'text.message', message: 'text.message must be a string', code: 'invalid_type' });
    } else if (sanitized.text.message && sanitized.text.message.length > 10000) {
      errors.push({ field: 'text.message', message: 'text.message too long (max 10000)', code: 'too_long' });
    }
  }
  
  // Validate _agentId if present
  if (sanitized._agentId !== undefined && !isString(sanitized._agentId)) {
    errors.push({ field: '_agentId', message: '_agentId must be a string', code: 'invalid_type' });
  }
  if (sanitized._agentId && sanitized._agentId.length > 50) {
    errors.push({ field: '_agentId', message: '_agentId too long (max 50)', code: 'too_long' });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// SOFIA WEBHOOK SCHEMA (ChatApp format)
// ═══════════════════════════════════════════════════════════════

export interface SofiaWebhookPayload {
  data?: MessageData[];
  _agentId?: string;
  _zapiOriginal?: ZApiWebhookPayload;
  _provider?: string;
}

export interface MessageData {
  id: string;
  fromMe: boolean;
  fromApi?: boolean;
  side: 'in' | 'out';
  type: string;
  message?: {
    text?: string;
    caption?: string;
    file?: { link?: string; contentType?: string };
  };
  fromUser?: { id: string; name?: string; phone?: string };
  chat?: { id: string; phone?: string; name?: string; type?: 'private' | 'group' };
  time?: number;
}

export function validateSofiaWebhook(body: unknown): ValidationResult<SofiaWebhookPayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<SofiaWebhookPayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // Validate data array if present
  if (sanitized.data !== undefined) {
    if (!isArray(sanitized.data)) {
      errors.push({ field: 'data', message: 'data must be an array', code: 'invalid_type' });
    } else if (sanitized.data.length > 100) {
      errors.push({ field: 'data', message: 'data array too long (max 100)', code: 'too_long' });
    } else {
      // Validate each message
      for (let i = 0; i < sanitized.data.length; i++) {
        const msg = sanitized.data[i];
        if (!isObject(msg)) {
          errors.push({ field: `data[${i}]`, message: 'Each message must be an object', code: 'invalid_type' });
          continue;
        }
        
        if (msg.id !== undefined && !isString(msg.id)) {
          errors.push({ field: `data[${i}].id`, message: 'id must be a string', code: 'invalid_type' });
        }
        
        if (msg.fromMe !== undefined && !isBoolean(msg.fromMe)) {
          errors.push({ field: `data[${i}].fromMe`, message: 'fromMe must be a boolean', code: 'invalid_type' });
        }
        
        if (msg.side !== undefined && msg.side !== 'in' && msg.side !== 'out') {
          errors.push({ field: `data[${i}].side`, message: 'side must be "in" or "out"', code: 'invalid_enum' });
        }
      }
    }
  }
  
  // Validate _agentId
  if (sanitized._agentId !== undefined && !isString(sanitized._agentId)) {
    errors.push({ field: '_agentId', message: '_agentId must be a string', code: 'invalid_type' });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// BITRIX24 WEBHOOK SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface Bitrix24WebhookPayload {
  event?: string;
  data?: {
    FIELDS?: { ID?: string };
  };
  auth?: {
    domain?: string;
    access_token?: string;
  };
}

export function validateBitrix24Webhook(body: unknown): ValidationResult<Bitrix24WebhookPayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<Bitrix24WebhookPayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // Validate event if present
  if (sanitized.event !== undefined && !isString(sanitized.event)) {
    errors.push({ field: 'event', message: 'event must be a string', code: 'invalid_type' });
  }
  if (sanitized.event && sanitized.event.length > 100) {
    errors.push({ field: 'event', message: 'event too long (max 100)', code: 'too_long' });
  }
  
  // Validate data.FIELDS.ID if present
  if (sanitized.data?.FIELDS?.ID !== undefined && !isString(sanitized.data.FIELDS.ID)) {
    errors.push({ field: 'data.FIELDS.ID', message: 'ID must be a string', code: 'invalid_type' });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// SEND MESSAGE SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface SendMessagePayload {
  phone: string;
  message?: string;
  audioUrl?: string;
  conversaId?: string;
  agentId?: string;
  enableAsyncRetry?: boolean;
  skipAntiSpam?: boolean;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiSecurityToken?: string;
}

export function validateSendMessage(body: unknown): ValidationResult<SendMessagePayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<SendMessagePayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // phone is required
  if (!sanitized.phone) {
    errors.push({ field: 'phone', message: 'phone is required', code: 'required' });
  } else if (!isString(sanitized.phone)) {
    errors.push({ field: 'phone', message: 'phone must be a string', code: 'invalid_type' });
  } else if (sanitized.phone.length > 30) {
    errors.push({ field: 'phone', message: 'phone too long (max 30)', code: 'too_long' });
  }
  
  // message or audioUrl required
  if (!sanitized.message && !sanitized.audioUrl) {
    errors.push({ field: 'message', message: 'message or audioUrl is required', code: 'required' });
  }
  
  // Validate message if present
  if (sanitized.message !== undefined) {
    if (!isString(sanitized.message)) {
      errors.push({ field: 'message', message: 'message must be a string', code: 'invalid_type' });
    } else if (sanitized.message.length > 10000) {
      errors.push({ field: 'message', message: 'message too long (max 10000)', code: 'too_long' });
    }
  }
  
  // Validate audioUrl if present
  if (sanitized.audioUrl !== undefined && !isString(sanitized.audioUrl)) {
    errors.push({ field: 'audioUrl', message: 'audioUrl must be a string', code: 'invalid_type' });
  }
  
  // Validate agentId if present
  if (sanitized.agentId !== undefined && !isString(sanitized.agentId)) {
    errors.push({ field: 'agentId', message: 'agentId must be a string', code: 'invalid_type' });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// RAG SEARCH SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface RAGSearchPayload {
  query: string;
  agentId?: string;
  topK?: number;
  minScore?: number;
  categories?: string[];
}

export function validateRAGSearch(body: unknown): ValidationResult<RAGSearchPayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<RAGSearchPayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // query is required
  if (!sanitized.query) {
    errors.push({ field: 'query', message: 'query is required', code: 'required' });
  } else if (!isString(sanitized.query)) {
    errors.push({ field: 'query', message: 'query must be a string', code: 'invalid_type' });
  } else if (sanitized.query.length > 2000) {
    errors.push({ field: 'query', message: 'query too long (max 2000)', code: 'too_long' });
  }
  
  // Validate topK if present
  if (sanitized.topK !== undefined) {
    if (!isNumber(sanitized.topK)) {
      errors.push({ field: 'topK', message: 'topK must be a number', code: 'invalid_type' });
    } else if (sanitized.topK < 1 || sanitized.topK > 50) {
      errors.push({ field: 'topK', message: 'topK must be between 1 and 50', code: 'out_of_range' });
    }
  }
  
  // Validate minScore if present
  if (sanitized.minScore !== undefined) {
    if (!isNumber(sanitized.minScore)) {
      errors.push({ field: 'minScore', message: 'minScore must be a number', code: 'invalid_type' });
    } else if (sanitized.minScore < 0 || sanitized.minScore > 1) {
      errors.push({ field: 'minScore', message: 'minScore must be between 0 and 1', code: 'out_of_range' });
    }
  }
  
  // Validate categories if present
  if (sanitized.categories !== undefined) {
    if (!isArray(sanitized.categories)) {
      errors.push({ field: 'categories', message: 'categories must be an array', code: 'invalid_type' });
    } else if (!sanitized.categories.every(c => isString(c))) {
      errors.push({ field: 'categories', message: 'all categories must be strings', code: 'invalid_type' });
    }
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// CREATE LEAD SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface CreateLeadPayload {
  nome: string;
  telefone: string;
  email?: string;
  valorConta?: number;
  consumo?: number;
  concessionaria?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  origem?: string;
}

export function validateCreateLead(body: unknown): ValidationResult<CreateLeadPayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<CreateLeadPayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // nome is required
  if (!sanitized.nome) {
    errors.push({ field: 'nome', message: 'nome is required', code: 'required' });
  } else if (!isString(sanitized.nome)) {
    errors.push({ field: 'nome', message: 'nome must be a string', code: 'invalid_type' });
  } else if (sanitized.nome.length < 2) {
    errors.push({ field: 'nome', message: 'nome too short (min 2)', code: 'too_short' });
  } else if (sanitized.nome.length > 200) {
    errors.push({ field: 'nome', message: 'nome too long (max 200)', code: 'too_long' });
  }
  
  // telefone is required
  if (!sanitized.telefone) {
    errors.push({ field: 'telefone', message: 'telefone is required', code: 'required' });
  } else if (!isString(sanitized.telefone)) {
    errors.push({ field: 'telefone', message: 'telefone must be a string', code: 'invalid_type' });
  } else {
    const digits = sanitized.telefone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      errors.push({ field: 'telefone', message: 'telefone must have 10-15 digits', code: 'invalid_format' });
    }
  }
  
  // Validate email if present
  if (sanitized.email !== undefined && sanitized.email !== null && sanitized.email !== '') {
    if (!isString(sanitized.email)) {
      errors.push({ field: 'email', message: 'email must be a string', code: 'invalid_type' });
    } else {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(sanitized.email)) {
        errors.push({ field: 'email', message: 'invalid email format', code: 'invalid_format' });
      }
    }
  }
  
  // Validate valorConta if present
  if (sanitized.valorConta !== undefined) {
    if (!isNumber(sanitized.valorConta)) {
      errors.push({ field: 'valorConta', message: 'valorConta must be a number', code: 'invalid_type' });
    } else if (sanitized.valorConta < 0 || sanitized.valorConta > 1000000) {
      errors.push({ field: 'valorConta', message: 'valorConta out of range', code: 'out_of_range' });
    }
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// BITRIX24 UPDATE CUSTOMER SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface Bitrix24UpdateCustomerPayload {
  lead_id?: string;
  contact_id?: string;
  deal_id?: string;
  updates: {
    email?: string;
    telefone?: string;
    cpf_cnpj?: string;
    nome?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  };
  add_timeline_comment?: boolean;
  comment_text?: string;
  agent_id?: string;
}

export function validateBitrix24UpdateCustomer(body: unknown): ValidationResult<Bitrix24UpdateCustomerPayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<Bitrix24UpdateCustomerPayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // At least one ID required
  if (!sanitized.lead_id && !sanitized.contact_id && !sanitized.deal_id) {
    errors.push({ field: 'id', message: 'lead_id, contact_id or deal_id is required', code: 'required' });
  }
  
  // Validate IDs format (should be numeric strings)
  if (sanitized.lead_id && (typeof sanitized.lead_id !== 'string' || !/^\d{1,20}$/.test(sanitized.lead_id))) {
    errors.push({ field: 'lead_id', message: 'lead_id must be a numeric string', code: 'invalid_format' });
  }
  if (sanitized.contact_id && (typeof sanitized.contact_id !== 'string' || !/^\d{1,20}$/.test(sanitized.contact_id))) {
    errors.push({ field: 'contact_id', message: 'contact_id must be a numeric string', code: 'invalid_format' });
  }
  if (sanitized.deal_id && (typeof sanitized.deal_id !== 'string' || !/^\d{1,20}$/.test(sanitized.deal_id))) {
    errors.push({ field: 'deal_id', message: 'deal_id must be a numeric string', code: 'invalid_format' });
  }
  
  // updates is required
  if (!sanitized.updates || !isObject(sanitized.updates)) {
    errors.push({ field: 'updates', message: 'updates object is required', code: 'required' });
  } else if (Object.keys(sanitized.updates).length === 0) {
    errors.push({ field: 'updates', message: 'updates cannot be empty', code: 'required' });
  } else {
    // Validate update fields
    if (sanitized.updates.email && !isString(sanitized.updates.email)) {
      errors.push({ field: 'updates.email', message: 'email must be a string', code: 'invalid_type' });
    }
    if (sanitized.updates.telefone && !isString(sanitized.updates.telefone)) {
      errors.push({ field: 'updates.telefone', message: 'telefone must be a string', code: 'invalid_type' });
    }
    if (sanitized.updates.nome && !isString(sanitized.updates.nome)) {
      errors.push({ field: 'updates.nome', message: 'nome must be a string', code: 'invalid_type' });
    }
    if (sanitized.updates.nome && sanitized.updates.nome.length > 200) {
      errors.push({ field: 'updates.nome', message: 'nome too long (max 200)', code: 'too_long' });
    }
  }
  
  // Validate comment_text if present
  if (sanitized.comment_text !== undefined && !isString(sanitized.comment_text)) {
    errors.push({ field: 'comment_text', message: 'comment_text must be a string', code: 'invalid_type' });
  }
  if (sanitized.comment_text && sanitized.comment_text.length > 5000) {
    errors.push({ field: 'comment_text', message: 'comment_text too long (max 5000)', code: 'too_long' });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// BITRIX24 SYNC SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface Bitrix24SyncPayload {
  action: 'update_status' | 'send_proposal' | 'test_connection';
  proposalId?: string;
  status?: string;
  leadId?: string;
}

export function validateBitrix24Sync(body: unknown): ValidationResult<Bitrix24SyncPayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<Bitrix24SyncPayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // action is required
  if (!sanitized.action) {
    errors.push({ field: 'action', message: 'action is required', code: 'required' });
  } else if (!['update_status', 'send_proposal', 'test_connection'].includes(sanitized.action)) {
    errors.push({ field: 'action', message: 'invalid action', code: 'invalid_enum' });
  }
  
  // Validate UUID format for proposalId
  if (sanitized.proposalId !== undefined) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!isString(sanitized.proposalId) || !uuidRegex.test(sanitized.proposalId)) {
      errors.push({ field: 'proposalId', message: 'proposalId must be a valid UUID', code: 'invalid_format' });
    }
  }
  
  // Validate status if present
  if (sanitized.status !== undefined && !isString(sanitized.status)) {
    errors.push({ field: 'status', message: 'status must be a string', code: 'invalid_type' });
  }
  if (sanitized.status && sanitized.status.length > 50) {
    errors.push({ field: 'status', message: 'status too long (max 50)', code: 'too_long' });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// MANAGE USERS SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface ManageUsersPayload {
  action: 'create' | 'update' | 'delete' | 'reset-password';
  userId?: string;
  userData?: {
    email?: string;
    password?: string;
    nome?: string;
    cargo?: string;
    role?: 'admin' | 'funcionario';
    is_active?: boolean;
  };
}

export function validateManageUsers(body: unknown): ValidationResult<ManageUsersPayload> {
  const errors: ValidationError[] = [];
  
  if (!isObject(body)) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }]
    };
  }
  
  const sanitized = sanitizeObject<ManageUsersPayload>(body);
  if (!sanitized) {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }]
    };
  }
  
  // action is required
  if (!sanitized.action) {
    errors.push({ field: 'action', message: 'action is required', code: 'required' });
  } else if (!['create', 'update', 'delete', 'reset-password'].includes(sanitized.action)) {
    errors.push({ field: 'action', message: 'invalid action', code: 'invalid_enum' });
  }
  
  // Validate userId format (UUID)
  if (sanitized.userId !== undefined) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!isString(sanitized.userId) || !uuidRegex.test(sanitized.userId)) {
      errors.push({ field: 'userId', message: 'userId must be a valid UUID', code: 'invalid_format' });
    }
  }
  
  // Validate userData for create action
  if (sanitized.action === 'create') {
    if (!sanitized.userData?.email) {
      errors.push({ field: 'userData.email', message: 'email is required for create', code: 'required' });
    }
    if (!sanitized.userData?.password) {
      errors.push({ field: 'userData.password', message: 'password is required for create', code: 'required' });
    } else if (sanitized.userData.password.length < 6) {
      errors.push({ field: 'userData.password', message: 'password must be at least 6 characters', code: 'too_short' });
    }
  }
  
  // Validate email format
  if (sanitized.userData?.email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(sanitized.userData.email)) {
      errors.push({ field: 'userData.email', message: 'invalid email format', code: 'invalid_format' });
    }
  }
  
  // Validate role enum
  if (sanitized.userData?.role && !['admin', 'funcionario'].includes(sanitized.userData.role)) {
    errors.push({ field: 'userData.role', message: 'role must be admin or funcionario', code: 'invalid_enum' });
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// GENERIC HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Parse and validate JSON body with automatic error handling
 */
export async function parseAndValidate<T>(
  req: Request,
  validator: (body: unknown) => ValidationResult<T>
): Promise<{ success: true; data: T } | { success: false; error: string; status: number }> {
  try {
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return { success: false, error: 'Request body too large (max 1MB)', status: 413 };
    }
    
    const text = await req.text();
    if (!text) {
      return { success: false, error: 'Empty request body', status: 400 };
    }
    
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { success: false, error: 'Invalid JSON', status: 400 };
    }
    
    const result = validator(body);
    
    if (!result.success) {
      const errorMessages = result.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
      return { success: false, error: `Validation failed: ${errorMessages}`, status: 400 };
    }
    
    return { success: true, data: result.data! };
  } catch (error) {
    console.error('[ZOD_SCHEMAS] Parse error:', error);
    return { success: false, error: 'Failed to parse request', status: 400 };
  }
}

// ═══════════════════════════════════════════════════════════════
// CONTRACT SENT WEBHOOK SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface ContractSentPayload {
  cliente_telefone?: string;
  bitrix24_lead_id?: string;
  proposta_id?: string;
  desconto_percentual?: number;
}

export function validateContractSent(body: unknown): ValidationResult<ContractSentPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<ContractSentPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // At least one identifier required
  if (!sanitized.cliente_telefone && !sanitized.bitrix24_lead_id && !sanitized.proposta_id) {
    errors.push({ field: 'identifier', message: 'cliente_telefone, bitrix24_lead_id or proposta_id is required', code: 'required' });
  }
  
  if (sanitized.cliente_telefone && (typeof sanitized.cliente_telefone !== 'string' || sanitized.cliente_telefone.length > 30)) {
    errors.push({ field: 'cliente_telefone', message: 'Invalid phone format', code: 'invalid_format' });
  }
  
  if (sanitized.desconto_percentual !== undefined && (typeof sanitized.desconto_percentual !== 'number' || sanitized.desconto_percentual < 0 || sanitized.desconto_percentual > 100)) {
    errors.push({ field: 'desconto_percentual', message: 'desconto_percentual must be between 0 and 100', code: 'out_of_range' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// RETELL CALL WEBHOOK SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface RetellWebhookPayload {
  event: 'call_started' | 'call_ended' | 'call_analyzed';
  call: {
    call_id: string;
    agent_id?: string;
    call_status?: string;
    start_timestamp?: number;
    end_timestamp?: number;
    disconnection_reason?: string;
    from_number?: string;
    to_number?: string;
    direction?: string;
    metadata?: {
      queue_id?: string;
      bitrix_lead_id?: string;
      campaign_id?: string;
    };
  };
  transcript?: string;
  transcript_object?: unknown[];
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown>;
  };
  recording_url?: string;
}

export function validateRetellWebhook(body: unknown): ValidationResult<RetellWebhookPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<RetellWebhookPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (!sanitized.event || !['call_started', 'call_ended', 'call_analyzed'].includes(sanitized.event)) {
    errors.push({ field: 'event', message: 'event must be call_started, call_ended or call_analyzed', code: 'invalid_enum' });
  }
  
  if (!sanitized.call || typeof sanitized.call !== 'object') {
    errors.push({ field: 'call', message: 'call object is required', code: 'required' });
  } else if (!sanitized.call.call_id || typeof sanitized.call.call_id !== 'string') {
    errors.push({ field: 'call.call_id', message: 'call_id is required', code: 'required' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// PROPOSAL CHATBOT SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface ProposalChatbotPayload {
  message?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  proposalContext?: {
    cliente_nome?: string;
    economia_mensal?: number;
    economia_anual?: number;
    desconto_percentual?: number;
    consumo_medio?: number;
    concessionaria?: string;
    tipo_proposta?: string;
    tarifa?: number;
    valor_conta?: number;
    conversa_id?: string;
    agent_id?: string;
  };
}

export function validateProposalChatbot(body: unknown): ValidationResult<ProposalChatbotPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<ProposalChatbotPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (!sanitized.message && !sanitized.messages) {
    errors.push({ field: 'message', message: 'message or messages is required', code: 'required' });
  }
  
  if (sanitized.message && typeof sanitized.message !== 'string') {
    errors.push({ field: 'message', message: 'message must be a string', code: 'invalid_type' });
  }
  
  if (sanitized.message && sanitized.message.length > 5000) {
    errors.push({ field: 'message', message: 'message too long (max 5000)', code: 'too_long' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// RAG UPLOAD SCHEMA  
// ═══════════════════════════════════════════════════════════════

export interface RAGUploadPayload {
  file_name: string;
  file_content: string;
  file_type?: string;
  category: string;
  subcategory?: string;
}

export function validateRAGUpload(body: unknown): ValidationResult<RAGUploadPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<RAGUploadPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (!sanitized.file_name || typeof sanitized.file_name !== 'string') {
    errors.push({ field: 'file_name', message: 'file_name is required', code: 'required' });
  }
  
  if (!sanitized.file_content || typeof sanitized.file_content !== 'string') {
    errors.push({ field: 'file_content', message: 'file_content is required', code: 'required' });
  }
  
  if (!sanitized.category || typeof sanitized.category !== 'string') {
    errors.push({ field: 'category', message: 'category is required', code: 'required' });
  }
  
  // Validate base64 isn't excessively large (10MB limit)
  if (sanitized.file_content && sanitized.file_content.length > 10 * 1024 * 1024 * 1.37) {
    errors.push({ field: 'file_content', message: 'file too large (max 10MB)', code: 'too_long' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// SOFIA BITRIX LEAD SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface SofiaBitrixLeadPayload {
  conversaId: string;
  phone: string;
  clienteNome?: string;
  dadosColetados: {
    nome?: string;
    cpf?: string;
    cnpj?: string;
    email?: string;
    telefone?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    consumo?: number;
    valorFatura?: number;
    distribuidora?: string;
    numeroInstalacao?: string;
    tipoCliente?: 'PF' | 'PJ';
    rawAnalysis?: string;
  };
  arquivoNovo?: {
    tipo: 'fatura' | 'documento_identidade' | 'contrato_social';
    base64: string;
    mimeType: string;
    fileName: string;
  };
  forcarMovimentacao?: boolean;
  agent_id?: string;
}

export function validateSofiaBitrixLead(body: unknown): ValidationResult<SofiaBitrixLeadPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<SofiaBitrixLeadPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (!sanitized.conversaId || typeof sanitized.conversaId !== 'string') {
    errors.push({ field: 'conversaId', message: 'conversaId is required', code: 'required' });
  }
  
  if (!sanitized.phone || typeof sanitized.phone !== 'string') {
    errors.push({ field: 'phone', message: 'phone is required', code: 'required' });
  }
  
  if (!sanitized.dadosColetados || typeof sanitized.dadosColetados !== 'object') {
    errors.push({ field: 'dadosColetados', message: 'dadosColetados is required', code: 'required' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// VOICE WEBHOOK SCHEMA (Retell Voice)
// ═══════════════════════════════════════════════════════════════

export interface VoiceWebhookPayload {
  request_type: 'response_required' | 'reminder_required' | 'end_of_call_webhook';
  response_id?: string;
  interaction_type?: string;
  transcript?: string;
  agent_id?: string;
  call?: {
    call_id?: string;
    from_number?: string;
    to_number?: string;
    call_status?: string;
    metadata?: Record<string, unknown>;
  };
}

export function validateVoiceWebhook(body: unknown): ValidationResult<VoiceWebhookPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<VoiceWebhookPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (!sanitized.request_type) {
    errors.push({ field: 'request_type', message: 'request_type is required', code: 'required' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// PROCESS RAG DOCUMENT SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface ProcessRagDocumentPayload {
  document_id?: string;
  file_path?: string;
  file_name: string;
  file_type?: string;
  category?: string;
  subcategory?: string;
  content?: string;
  source_type?: string;
  source_id?: string;
  source_path?: string;
}

export type ProcessRagDocumentPayloadType = ProcessRagDocumentPayload;

export function validateProcessRagDocument(body: unknown): ValidationResult<ProcessRagDocumentPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<ProcessRagDocumentPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // file_name is required
  if (!sanitized.file_name || typeof sanitized.file_name !== 'string') {
    errors.push({ field: 'file_name', message: 'file_name is required', code: 'required' });
  } else if (sanitized.file_name.length > 255) {
    errors.push({ field: 'file_name', message: 'file_name too long (max 255)', code: 'too_long' });
  }
  
  // Validate optional strings
  if (sanitized.document_id !== undefined && typeof sanitized.document_id !== 'string') {
    errors.push({ field: 'document_id', message: 'document_id must be a string', code: 'invalid_type' });
  }
  
  if (sanitized.file_path !== undefined && typeof sanitized.file_path !== 'string') {
    errors.push({ field: 'file_path', message: 'file_path must be a string', code: 'invalid_type' });
  }
  
  // Validate content size (max 500KB)
  if (sanitized.content !== undefined && typeof sanitized.content === 'string' && sanitized.content.length > 500000) {
    errors.push({ field: 'content', message: 'content too long (max 500KB)', code: 'too_long' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULER PAYLOAD SCHEMA (for cron-triggered internal functions)
// ═══════════════════════════════════════════════════════════════

export interface SchedulerPayload {
  triggered_by?: string;
  dry_run?: boolean;
  batch_size?: number;
}

export function validateSchedulerPayload(body: unknown): ValidationResult<SchedulerPayload> {
  // Schedulers may receive empty body - that's fine
  if (body === null || body === undefined) {
    return { success: true, data: {} };
  }
  
  if (!isObject(body)) {
    return { success: true, data: {} }; // Be lenient for schedulers
  }
  
  const sanitized = sanitizeObject<SchedulerPayload>(body);
  if (!sanitized) {
    return { success: true, data: {} };
  }
  
  const errors: ValidationError[] = [];
  
  if (sanitized.triggered_by !== undefined && typeof sanitized.triggered_by !== 'string') {
    errors.push({ field: 'triggered_by', message: 'triggered_by must be a string', code: 'invalid_type' });
  }
  
  if (sanitized.batch_size !== undefined) {
    if (typeof sanitized.batch_size !== 'number') {
      errors.push({ field: 'batch_size', message: 'batch_size must be a number', code: 'invalid_type' });
    } else if (sanitized.batch_size < 1 || sanitized.batch_size > 500) {
      errors.push({ field: 'batch_size', message: 'batch_size must be between 1 and 500', code: 'out_of_range' });
    }
  }
  
if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// PROCESS KB DOCUMENT SCHEMA (internal API)
// ═══════════════════════════════════════════════════════════════

export interface ProcessKbDocumentPayload {
  file_path: string;
  file_name: string;
  agent_id?: string;
}

export function validateProcessKbDocument(body: unknown): ValidationResult<ProcessKbDocumentPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<ProcessKbDocumentPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (!sanitized.file_path || typeof sanitized.file_path !== 'string') {
    errors.push({ field: 'file_path', message: 'file_path is required', code: 'required' });
  } else if (sanitized.file_path.length > 500) {
    errors.push({ field: 'file_path', message: 'file_path too long (max 500)', code: 'too_long' });
  }
  
  if (!sanitized.file_name || typeof sanitized.file_name !== 'string') {
    errors.push({ field: 'file_name', message: 'file_name is required', code: 'required' });
  } else if (sanitized.file_name.length > 255) {
    errors.push({ field: 'file_name', message: 'file_name too long (max 255)', code: 'too_long' });
  }
  
  if (sanitized.agent_id !== undefined && typeof sanitized.agent_id !== 'string') {
    errors.push({ field: 'agent_id', message: 'agent_id must be a string', code: 'invalid_type' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// VOICE OUTBOUND WEBHOOK SCHEMA (Retell format)
// ═══════════════════════════════════════════════════════════════

export interface VoiceOutboundPayload {
  call_id?: string;
  transcribed_text?: string;
  conversation_history?: Array<{ role: string; content: string }>;
  current_stage?: string;
  retell_llm_dynamic_variables?: {
    customer_name?: string;
    customer_phone?: string;
    last_consumption?: number;
    last_proposal_discount?: number;
    days_since_contact?: number;
    bitrix_lead_id?: string;
    queue_id?: string;
    last_distributor?: string;
    greeting_template?: string;
  };
  metadata?: Record<string, unknown>;
}

export function validateVoiceOutbound(body: unknown): ValidationResult<VoiceOutboundPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<VoiceOutboundPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Failed to parse request body', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (sanitized.call_id !== undefined && typeof sanitized.call_id !== 'string') {
    errors.push({ field: 'call_id', message: 'call_id must be a string', code: 'invalid_type' });
  }
  
  if (sanitized.transcribed_text !== undefined && typeof sanitized.transcribed_text !== 'string') {
    errors.push({ field: 'transcribed_text', message: 'transcribed_text must be a string', code: 'invalid_type' });
  } else if (sanitized.transcribed_text && sanitized.transcribed_text.length > 10000) {
    errors.push({ field: 'transcribed_text', message: 'transcribed_text too long (max 10000)', code: 'too_long' });
  }
  
  if (sanitized.conversation_history !== undefined && !isArray(sanitized.conversation_history)) {
    errors.push({ field: 'conversation_history', message: 'conversation_history must be an array', code: 'invalid_type' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// BITRIX DEAL WEBHOOK SCHEMA (form-urlencoded or JSON)
// ═══════════════════════════════════════════════════════════════

export interface BitrixDealPayload {
  dealId: string;
}

export function validateBitrixDeal(dealId: unknown): ValidationResult<BitrixDealPayload> {
  const errors: ValidationError[] = [];
  
  if (!dealId || typeof dealId !== 'string') {
    errors.push({ field: 'dealId', message: 'dealId is required', code: 'required' });
  } else if (dealId.length > 50) {
    errors.push({ field: 'dealId', message: 'dealId too long (max 50)', code: 'too_long' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: { dealId: dealId as string } };
}

// ═══════════════════════════════════════════════════════════════
// BITRIX LINK WEBHOOK SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface BitrixLinkPayload {
  leadId: string;
}

export function validateBitrixLink(leadId: unknown): ValidationResult<BitrixLinkPayload> {
  const errors: ValidationError[] = [];
  
  if (!leadId || typeof leadId !== 'string') {
    errors.push({ field: 'leadId', message: 'leadId is required', code: 'required' });
  } else if (leadId.length > 50) {
    errors.push({ field: 'leadId', message: 'leadId too long (max 50)', code: 'too_long' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: { leadId: leadId as string } };
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION EMAIL SCHEMA (internal trigger from pg_net)
// ═══════════════════════════════════════════════════════════════

export interface NotificationEmailPayload {
  notification_id: string;
  admin_user_id: string;
  title: string;
  message: string;
  type: string;
  entity_type?: string;
  entity_id?: string;
  created_by_nome?: string;
}

export function validateNotificationEmail(body: unknown): ValidationResult<NotificationEmailPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<NotificationEmailPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (!sanitized.notification_id || typeof sanitized.notification_id !== 'string') {
    errors.push({ field: 'notification_id', message: 'notification_id is required', code: 'required' });
  }
  if (!sanitized.admin_user_id || typeof sanitized.admin_user_id !== 'string') {
    errors.push({ field: 'admin_user_id', message: 'admin_user_id is required', code: 'required' });
  }
  if (!sanitized.title || typeof sanitized.title !== 'string') {
    errors.push({ field: 'title', message: 'title is required', code: 'required' });
  } else if (sanitized.title.length > 500) {
    errors.push({ field: 'title', message: 'title too long (max 500)', code: 'too_long' });
  }
  if (!sanitized.message || typeof sanitized.message !== 'string') {
    errors.push({ field: 'message', message: 'message is required', code: 'required' });
  } else if (sanitized.message.length > 5000) {
    errors.push({ field: 'message', message: 'message too long (max 5000)', code: 'too_long' });
  }
  if (!sanitized.type || typeof sanitized.type !== 'string') {
    errors.push({ field: 'type', message: 'type is required', code: 'required' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL SCHEDULER TRIGGER (no body / empty body allowed)
// ═══════════════════════════════════════════════════════════════

export interface InternalSchedulerPayload {
  force?: boolean;
  dryRun?: boolean;
  batchSize?: number;
}

export function validateInternalScheduler(body: unknown): ValidationResult<InternalSchedulerPayload> {
  // Allow empty body for cron triggers
  if (body === null || body === undefined || (isObject(body) && Object.keys(body).length === 0)) {
    return { success: true, data: {} };
  }
  
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<InternalSchedulerPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  if (sanitized.force !== undefined && typeof sanitized.force !== 'boolean') {
    errors.push({ field: 'force', message: 'force must be boolean', code: 'invalid_type' });
  }
  if (sanitized.dryRun !== undefined && typeof sanitized.dryRun !== 'boolean') {
    errors.push({ field: 'dryRun', message: 'dryRun must be boolean', code: 'invalid_type' });
  }
  if (sanitized.batchSize !== undefined) {
    if (typeof sanitized.batchSize !== 'number') {
      errors.push({ field: 'batchSize', message: 'batchSize must be number', code: 'invalid_type' });
    } else if (sanitized.batchSize < 1 || sanitized.batchSize > 1000) {
      errors.push({ field: 'batchSize', message: 'batchSize must be 1-1000', code: 'out_of_range' });
    }
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// HOT LEAD ALERT PAYLOAD
// ═══════════════════════════════════════════════════════════════

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
}

export function validateHotLeadAlert(body: unknown): ValidationResult<HotLeadAlertPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<HotLeadAlertPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // Required fields
  if (!sanitized.nome || typeof sanitized.nome !== 'string') {
    errors.push({ field: 'nome', message: 'nome is required', code: 'required' });
  } else if (sanitized.nome.length > 200) {
    errors.push({ field: 'nome', message: 'nome too long (max 200)', code: 'too_long' });
  }
  
  if (!sanitized.telefone || typeof sanitized.telefone !== 'string') {
    errors.push({ field: 'telefone', message: 'telefone is required', code: 'required' });
  } else if (!/^[\d+\-\s()]{8,20}$/.test(sanitized.telefone)) {
    errors.push({ field: 'telefone', message: 'telefone format invalid', code: 'invalid_format' });
  }
  
  // Optional fields validation
  if (sanitized.email !== undefined && typeof sanitized.email !== 'string') {
    errors.push({ field: 'email', message: 'email must be string', code: 'invalid_type' });
  }
  if (sanitized.cidade !== undefined && typeof sanitized.cidade !== 'string') {
    errors.push({ field: 'cidade', message: 'cidade must be string', code: 'invalid_type' });
  }
  if (sanitized.valor_conta !== undefined && typeof sanitized.valor_conta !== 'number') {
    errors.push({ field: 'valor_conta', message: 'valor_conta must be number', code: 'invalid_type' });
  }
  if (sanitized.economia_estimada !== undefined && typeof sanitized.economia_estimada !== 'number') {
    errors.push({ field: 'economia_estimada', message: 'economia_estimada must be number', code: 'invalid_type' });
  }
  if (sanitized.lead_score !== undefined) {
    if (typeof sanitized.lead_score !== 'number') {
      errors.push({ field: 'lead_score', message: 'lead_score must be number', code: 'invalid_type' });
    } else if (sanitized.lead_score < 0 || sanitized.lead_score > 100) {
      errors.push({ field: 'lead_score', message: 'lead_score must be 0-100', code: 'out_of_range' });
    }
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// TTS (TEXT TO SPEECH) SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface TTSPayload {
  text: string;
  voiceId?: string;
}

export function validateTTS(body: unknown): ValidationResult<TTSPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<TTSPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // text is required
  if (!sanitized.text || typeof sanitized.text !== 'string') {
    errors.push({ field: 'text', message: 'text is required', code: 'required' });
  } else if (sanitized.text.length > 5000) {
    errors.push({ field: 'text', message: 'text too long (max 5000 chars)', code: 'too_long' });
  } else if (sanitized.text.trim().length === 0) {
    errors.push({ field: 'text', message: 'text cannot be empty', code: 'required' });
  }
  
  // voiceId optional validation
  if (sanitized.voiceId !== undefined && typeof sanitized.voiceId !== 'string') {
    errors.push({ field: 'voiceId', message: 'voiceId must be string', code: 'invalid_type' });
  }
  if (sanitized.voiceId && sanitized.voiceId.length > 100) {
    errors.push({ field: 'voiceId', message: 'voiceId too long (max 100)', code: 'too_long' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD PDF SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface UploadPDFPayload {
  proposalId: string;
  pdfBase64: string;
  filename?: string;
}

export function validateUploadPDF(body: unknown): ValidationResult<UploadPDFPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<UploadPDFPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // proposalId is required (UUID format)
  if (!sanitized.proposalId || typeof sanitized.proposalId !== 'string') {
    errors.push({ field: 'proposalId', message: 'proposalId is required', code: 'required' });
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitized.proposalId)) {
    errors.push({ field: 'proposalId', message: 'proposalId must be a valid UUID', code: 'invalid_format' });
  }
  
  // pdfBase64 is required
  if (!sanitized.pdfBase64 || typeof sanitized.pdfBase64 !== 'string') {
    errors.push({ field: 'pdfBase64', message: 'pdfBase64 is required', code: 'required' });
  } else if (sanitized.pdfBase64.length > 20 * 1024 * 1024) { // 20MB limit for base64
    errors.push({ field: 'pdfBase64', message: 'PDF too large (max ~15MB)', code: 'too_long' });
  }
  
  // filename optional validation
  if (sanitized.filename !== undefined && typeof sanitized.filename !== 'string') {
    errors.push({ field: 'filename', message: 'filename must be string', code: 'invalid_type' });
  }
  if (sanitized.filename && sanitized.filename.length > 255) {
    errors.push({ field: 'filename', message: 'filename too long (max 255)', code: 'too_long' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// BITRIX24 UPDATE LEAD SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface Bitrix24UpdateLeadPayload {
  propostaInicialId: string;
  dados: {
    cpf_cnpj?: string;
    endereco?: string;
    cep?: string;
    cidade?: string;
    uf?: string;
    numero_instalacao?: string;
    numero_ucs?: number;
    tipo_instalacao?: string;
    consumo_medio_real?: number;
    tipo_pessoa?: 'PF' | 'PJ';
    documento_identificacao_url?: string;
    conta_luz_url?: string;
    contrato_social_url?: string;
    nome_retificado?: string;
    concessionaria?: string;
    divergencias?: unknown[] | null;
    // Additional optional fields
    [key: string]: unknown;
  };
}

export function validateBitrix24UpdateLead(body: unknown): ValidationResult<Bitrix24UpdateLeadPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<Bitrix24UpdateLeadPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // propostaInicialId is required (UUID format)
  if (!sanitized.propostaInicialId || typeof sanitized.propostaInicialId !== 'string') {
    errors.push({ field: 'propostaInicialId', message: 'propostaInicialId is required', code: 'required' });
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitized.propostaInicialId)) {
    errors.push({ field: 'propostaInicialId', message: 'propostaInicialId must be a valid UUID', code: 'invalid_format' });
  }
  
  // dados is required and must be object
  if (!sanitized.dados || !isObject(sanitized.dados)) {
    errors.push({ field: 'dados', message: 'dados object is required', code: 'required' });
  } else {
    // Validate tipo_pessoa if present
    if (sanitized.dados.tipo_pessoa !== undefined && 
        sanitized.dados.tipo_pessoa !== 'PF' && 
        sanitized.dados.tipo_pessoa !== 'PJ') {
      errors.push({ field: 'dados.tipo_pessoa', message: 'tipo_pessoa must be PF or PJ', code: 'invalid_enum' });
    }
    
    // Validate UF format if present
    if (sanitized.dados.uf !== undefined && typeof sanitized.dados.uf === 'string') {
      if (!/^[A-Z]{2}$/i.test(sanitized.dados.uf)) {
        errors.push({ field: 'dados.uf', message: 'UF must be 2 letters', code: 'invalid_format' });
      }
    }
    
    // Validate CEP format if present
    if (sanitized.dados.cep !== undefined && typeof sanitized.dados.cep === 'string') {
      const cleanCep = sanitized.dados.cep.replace(/\D/g, '');
      if (cleanCep.length !== 8) {
        errors.push({ field: 'dados.cep', message: 'CEP must have 8 digits', code: 'invalid_format' });
      }
    }
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}


// ═══════════════════════════════════════════════════════════════
// ANEEL BANDEIRAS SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface AneelBandeirasPayload {
  sync?: boolean;
  anoMes?: string;
  apenasVigente?: boolean;
  limite?: number;
}

export function validateAneelBandeiras(body: unknown): ValidationResult<AneelBandeirasPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<AneelBandeirasPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // Validate sync if present
  if (sanitized.sync !== undefined && typeof sanitized.sync !== 'boolean') {
    errors.push({ field: 'sync', message: 'sync must be boolean', code: 'invalid_type' });
  }
  
  // Validate anoMes format if present (YYYY-MM)
  if (sanitized.anoMes !== undefined && typeof sanitized.anoMes === 'string') {
    if (!/^\d{4}-\d{2}$/.test(sanitized.anoMes)) {
      errors.push({ field: 'anoMes', message: 'anoMes must be YYYY-MM format', code: 'invalid_format' });
    }
  }
  
  // Validate apenasVigente if present
  if (sanitized.apenasVigente !== undefined && typeof sanitized.apenasVigente !== 'boolean') {
    errors.push({ field: 'apenasVigente', message: 'apenasVigente must be boolean', code: 'invalid_type' });
  }
  
  // Validate limite if present
  if (sanitized.limite !== undefined) {
    if (typeof sanitized.limite !== 'number') {
      errors.push({ field: 'limite', message: 'limite must be number', code: 'invalid_type' });
    } else if (sanitized.limite < 1 || sanitized.limite > 1000) {
      errors.push({ field: 'limite', message: 'limite must be between 1 and 1000', code: 'out_of_range' });
    }
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// ANEEL TARIFAS SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface AneelTarifasPayload {
  distribuidora?: string;
  subgrupo?: string;
  modalidade?: string;
  classe?: string;
  subclasse?: string;
  base_tarifaria?: string;
  sync?: boolean;
  apenas_vigente?: boolean;
}

export function validateAneelTarifas(body: unknown): ValidationResult<AneelTarifasPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<AneelTarifasPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // Validate distribuidora if present
  if (sanitized.distribuidora !== undefined && typeof sanitized.distribuidora !== 'string') {
    errors.push({ field: 'distribuidora', message: 'distribuidora must be string', code: 'invalid_type' });
  }
  if (sanitized.distribuidora && sanitized.distribuidora.length > 100) {
    errors.push({ field: 'distribuidora', message: 'distribuidora too long (max 100)', code: 'too_long' });
  }
  
  // Validate subgrupo if present
  if (sanitized.subgrupo !== undefined && typeof sanitized.subgrupo !== 'string') {
    errors.push({ field: 'subgrupo', message: 'subgrupo must be string', code: 'invalid_type' });
  }
  
  // Validate sync if present
  if (sanitized.sync !== undefined && typeof sanitized.sync !== 'boolean') {
    errors.push({ field: 'sync', message: 'sync must be boolean', code: 'invalid_type' });
  }
  
  // Validate apenas_vigente if present
  if (sanitized.apenas_vigente !== undefined && typeof sanitized.apenas_vigente !== 'boolean') {
    errors.push({ field: 'apenas_vigente', message: 'apenas_vigente must be boolean', code: 'invalid_type' });
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}

// ═══════════════════════════════════════════════════════════════
// EXTRAIR DADOS CONTRATO SOCIAL SCHEMA
// ═══════════════════════════════════════════════════════════════

export interface ExtrairDadosContratoSocialPayload {
  contratoSocialBase64: string;
}

export function validateExtrairDadosContratoSocial(body: unknown): ValidationResult<ExtrairDadosContratoSocialPayload> {
  if (!isObject(body)) {
    return { success: false, errors: [{ field: 'body', message: 'Must be object', code: 'invalid_type' }] };
  }
  
  const sanitized = sanitizeObject<ExtrairDadosContratoSocialPayload>(body);
  if (!sanitized) {
    return { success: false, errors: [{ field: 'body', message: 'Parse error', code: 'parse_error' }] };
  }
  
  const errors: ValidationError[] = [];
  
  // contratoSocialBase64 is required
  if (!sanitized.contratoSocialBase64 || typeof sanitized.contratoSocialBase64 !== 'string') {
    errors.push({ field: 'contratoSocialBase64', message: 'contratoSocialBase64 is required', code: 'required' });
  } else {
    // Validate data URI format
    const validDataUri = /^data:(application\/pdf|image\/(jpeg|jpg|png));base64,/;
    if (!validDataUri.test(sanitized.contratoSocialBase64)) {
      errors.push({ field: 'contratoSocialBase64', message: 'Invalid format. Only PDF, JPEG, PNG accepted', code: 'invalid_format' });
    }
    
    // Validate size (max ~20MB in base64)
    if (sanitized.contratoSocialBase64.length > 28 * 1024 * 1024) {
      errors.push({ field: 'contratoSocialBase64', message: 'File too large (max 20MB)', code: 'too_long' });
    }
  }
  
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: sanitized };
}
