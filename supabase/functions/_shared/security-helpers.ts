/**
 * Security Helpers Module
 * Centralized security utilities for edge functions
 * 
 * Features:
 * - CORS configuration with domain whitelist
 * - Request validation and sanitization
 * - Rate limiting helpers
 * - Input sanitization
 * 
 * @module security-helpers
 * @version 2.0.1
 */

// ═══════════════════════════════════════════════════════════════
// CORS CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/**
 * Allowed origins for CORS
 * Production domains that can access internal APIs
 */
const ALLOWED_ORIGINS = [
  'https://coesaenergia.com.br',
  'https://www.coesaenergia.com.br',
  'https://coesasolar.com.br',
  'https://www.coesasolar.com.br',
  'https://coesa-propose-craft.lovable.app',
  'https://id-preview--ff2f9802-9605-4d7d-9ad9-b405b9717438.lovable.app',
  // Lovable preview runtime (random subdomains)
  // NOTE: We intentionally allow any subdomain to support the editor/preview environment.
  // This is still restricted to Lovable-owned domains.
  // Example: https://<id>.lovableproject.com
  // (Origin matching uses suffix check in isAllowedOrigin())
  // Development
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // Allow Lovable preview origins with dynamic subdomains
  // e.g. https://ff2f9802-... .lovableproject.com
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:') return false;

    return hostname === 'lovableproject.com' || hostname.endsWith('.lovableproject.com');
  } catch {
    return false;
  }
}

/**
 * Endpoints that accept requests from any origin
 * These are webhooks from external services (Z-API, Bitrix, etc.)
 */
const PUBLIC_WEBHOOK_ENDPOINTS = [
  'z-api-webhook',
  'sofia-webhook',
  'maria-webhook',
  'julia-webhook',
  'iago-webhook',
  'jaime-webhook',
  'bitrix24-webhook',
  'bitrix24-deal-webhook',
  'bitrix24-link-webhook',
  'contract-sent-webhook',
  'retell-call-webhook',
  'sofia-voice-webhook',
  'sofia-voice-outbound-webhook',
  'create-lead-from-site',
  'public-proposal',
];

export type CorsMode = 'strict' | 'permissive' | 'auto';

export interface CorsOptions {
  mode?: CorsMode;
  allowCredentials?: boolean;
  maxAge?: number;
  allowedMethods?: string[];
}

/**
 * Get CORS headers based on request origin and endpoint
 * 
 * @param req - The incoming request
 * @param options - CORS configuration options
 * @returns CORS headers object
 */
export function getCorsHeaders(
  req: Request,
  options: CorsOptions = {}
): Record<string, string> {
  const {
    mode = 'auto',
    allowCredentials = false,
    maxAge = 86400, // 24 hours
    allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  } = options;

  const origin = req.headers.get('Origin') || '';
  const url = new URL(req.url);
  const endpoint = url.pathname.split('/').pop() || '';

  let allowedOrigin = ALLOWED_ORIGINS[0]; // Default to main domain

  if (mode === 'permissive') {
    // Allow any origin (for public webhooks)
    allowedOrigin = '*';
  } else if (mode === 'strict') {
    // Only allow whitelisted origins
    allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  } else {
    // Auto mode: check if endpoint is a public webhook
    if (PUBLIC_WEBHOOK_ENDPOINTS.includes(endpoint)) {
      allowedOrigin = '*';
    } else {
      allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
    }
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 
      'authorization, x-client-info, apikey, content-type, client-token, ' +
      'x-supabase-client-platform, x-supabase-client-platform-version, ' +
      'x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': allowedMethods.join(', '),
    'Access-Control-Max-Age': maxAge.toString(),
  };

  if (allowCredentials && allowedOrigin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

/**
 * Legacy CORS headers (permissive) for backward compatibility
 * @deprecated Use getCorsHeaders() with explicit mode instead
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 
    'authorization, x-client-info, apikey, content-type, client-token, ' +
    'x-supabase-client-platform, x-supabase-client-platform-version, ' +
    'x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Strict CORS headers for internal APIs
 */
export function getStrictCorsHeaders(req: Request): Record<string, string> {
  return getCorsHeaders(req, { mode: 'strict' });
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPrelight(req: Request, options?: CorsOptions): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req, options),
  });
}

// ═══════════════════════════════════════════════════════════════
// REQUEST VALIDATION
// ═══════════════════════════════════════════════════════════════

export interface RequestValidationResult {
  isValid: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Maximum allowed request body size (1MB)
 */
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * Validate incoming request
 * Checks method, content-type, body size, etc.
 */
export async function validateRequest(
  req: Request,
  options: {
    allowedMethods?: string[];
    requireContentType?: string;
    maxBodySize?: number;
    requireAuth?: boolean;
  } = {}
): Promise<RequestValidationResult> {
  const {
    allowedMethods = ['POST'],
    requireContentType = 'application/json',
    maxBodySize = MAX_BODY_SIZE,
    requireAuth = false,
  } = options;

  // Check method
  if (!allowedMethods.includes(req.method)) {
    return {
      isValid: false,
      error: `Method ${req.method} not allowed`,
      statusCode: 405,
    };
  }

  // Check content-type for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && requireContentType) {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes(requireContentType)) {
      return {
        isValid: false,
        error: `Content-Type must be ${requireContentType}`,
        statusCode: 415,
      };
    }
  }

  // Check content-length
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > maxBodySize) {
    return {
      isValid: false,
      error: `Request body too large (max ${maxBodySize} bytes)`,
      statusCode: 413,
    };
  }

  // Check auth if required
  if (requireAuth) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        isValid: false,
        error: 'Authorization header required',
        statusCode: 401,
      };
    }
  }

  return { isValid: true };
}

// ═══════════════════════════════════════════════════════════════
// INPUT SANITIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Sanitize string input
 * Removes dangerous characters and trims
 */
export function sanitizeString(input: string, maxLength = 5000): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .slice(0, maxLength)
    // Remove null bytes
    .replace(/\x00/g, '')
    // Remove control characters (except newlines/tabs)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitize phone number
 * Keeps only digits and limits length
 */
export function sanitizePhone(input: string): string {
  if (typeof input !== 'string') return '';
  
  const digits = input.replace(/\D/g, '');
  // Brazilian phones are 10-13 digits (with country code)
  return digits.slice(0, 15);
}

/**
 * Sanitize email
 * Lowercases and validates format
 */
export function sanitizeEmail(input: string): string | null {
  if (typeof input !== 'string') return null;
  
  const email = input.trim().toLowerCase().slice(0, 255);
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  
  return emailRegex.test(email) ? email : null;
}

/**
 * Remove potentially dangerous properties from objects
 * Prevents prototype pollution attacks
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const sanitized = { ...obj };

  for (const key of dangerous) {
    delete (sanitized as Record<string, unknown>)[key];
  }

  // Recursively sanitize nested objects
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      (sanitized as Record<string, unknown>)[key] = sanitizeObject(value as Record<string, unknown>);
    }
  }

  return sanitized;
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Create JSON response with CORS headers
 */
export function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
  req?: Request,
  corsOptions?: CorsOptions
): Response {
  const headers = req 
    ? getCorsHeaders(req, corsOptions)
    : corsHeaders;

  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/**
 * Create success response
 */
export function successResponse(
  data: Record<string, unknown>,
  req?: Request
): Response {
  return jsonResponse(data, 200, req);
}

/**
 * Create error response
 */
export function errorResponse(
  error: string,
  status = 500,
  req?: Request
): Response {
  return jsonResponse({ error }, status, req);
}

// ═══════════════════════════════════════════════════════════════
// LOG SANITIZATION
// ═══════════════════════════════════════════════════════════════

const SENSITIVE_KEYS = [
  'token', 'api_key', 'apikey', 'secret', 'password', 
  'authorization', 'auth', 'client_secret', 'bearer',
  'access_token', 'refresh_token', 'private_key',
  'webhook_secret', 'signing_secret', 'api_secret',
  'credentials', 'private', 'key', 'jwt',
];

/**
 * Patterns to redact in strings (API keys, tokens, etc.)
 */
const SENSITIVE_PATTERNS = [
  // OpenAI/Anthropic style keys
  /\b(sk-|pk-|tok_|key_|secret_|api_)[a-zA-Z0-9]{10,}\b/g,
  // Bearer tokens
  /Bearer\s+[a-zA-Z0-9\-_\.]+/gi,
  // JWT tokens (3 base64 parts separated by dots)
  /eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g,
  // Generic API key patterns
  /\b[a-f0-9]{32,}\b/gi, // 32+ hex chars (common API key format)
  // Supabase anon/service keys
  /\beyJ[a-zA-Z0-9\-_]{100,}\b/g,
];

/**
 * Sanitize data for logging
 * Redacts sensitive values including tokens, API keys, and passwords
 * 
 * @example
 * console.log('[BITRIX] Payload:', sanitizeForLog(payload));
 * // Output: { api_key: '[REDACTED]', lead_id: '9541', ... }
 */
export function sanitizeForLog(data: unknown): unknown {
  if (typeof data === 'string') {
    // Redact all sensitive patterns in strings
    let sanitized = data;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }

  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeForLog(item));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      // Also sanitize string values for embedded tokens
      sanitized[key] = sanitizeForLog(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Structured logging with automatic sanitization
 * Use instead of console.log for sensitive operations
 */
export function secureLog(
  level: 'info' | 'warn' | 'error',
  tag: string,
  message: string,
  data?: unknown
): void {
  const prefix = `[${tag}]`;
  const sanitizedData = data ? sanitizeForLog(data) : undefined;
  
  switch (level) {
    case 'error':
      console.error(prefix, message, sanitizedData ?? '');
      break;
    case 'warn':
      console.warn(prefix, message, sanitizedData ?? '');
      break;
    default:
      console.log(prefix, message, sanitizedData ?? '');
  }
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK TOKEN VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validate webhook security token
 */
export function validateWebhookToken(
  req: Request,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) {
    // If no token configured, skip validation
    return true;
  }

  const clientToken = req.headers.get('client-token');
  if (clientToken === expectedToken) {
    return true;
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    if (token === expectedToken) {
      return true;
    }
  }

  return false;
}
