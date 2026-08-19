/**
 * Response Helpers Module
 * Centralized HTTP response utilities for edge functions
 * 
 * Eliminates ~50 duplicate response patterns across the codebase
 * 
 * @module response-helpers
 */

import { corsHeaders, getCorsHeaders, type CorsOptions } from './security-helpers.ts';

// ═══════════════════════════════════════════════════════════════
// CORE RESPONSE BUILDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a JSON response with CORS headers
 * 
 * @example
 * return jsonResponse({ status: 'ok', data: result });
 * return jsonResponse({ error: 'Not found' }, 404, req);
 */
export function jsonResponse<T extends Record<string, unknown>>(
  data: T,
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
 * Create a success response (200 OK)
 * 
 * @example
 * return successResponse({ message: 'Created successfully', id: newId });
 */
export function successResponse<T extends Record<string, unknown>>(
  data: T,
  req?: Request
): Response {
  return jsonResponse({ success: true, ...data }, 200, req);
}

/**
 * Create an error response with proper status code
 * 
 * @example
 * return errorResponse('User not found', 404, req);
 * return errorResponse('Internal server error', 500, req);
 */
export function errorResponse(
  error: string,
  status = 500,
  req?: Request,
  additionalData?: Record<string, unknown>
): Response {
  return jsonResponse(
    { success: false, error, ...additionalData },
    status,
    req
  );
}

// ═══════════════════════════════════════════════════════════════
// SPECIALIZED RESPONSES
// ═══════════════════════════════════════════════════════════════

/**
 * Create a webhook acknowledgment response
 * Lightweight response for webhook endpoints
 */
export function webhookAck(
  status: string = 'ok',
  additionalData?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({ status, ...additionalData }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a validation error response (400 Bad Request)
 */
export function validationError(
  message: string,
  details?: unknown,
  req?: Request
): Response {
  return jsonResponse(
    { 
      success: false, 
      error: 'Validation Error', 
      message,
      details,
    },
    400,
    req
  );
}

/**
 * Create an unauthorized response (401)
 */
export function unauthorizedResponse(
  message = 'Unauthorized',
  req?: Request
): Response {
  return errorResponse(message, 401, req);
}

/**
 * Create a forbidden response (403)
 */
export function forbiddenResponse(
  message = 'Forbidden',
  req?: Request
): Response {
  return errorResponse(message, 403, req);
}

/**
 * Create a not found response (404)
 */
export function notFoundResponse(
  resource: string,
  req?: Request
): Response {
  return errorResponse(`${resource} not found`, 404, req);
}

/**
 * Create a rate limit exceeded response (429)
 */
export function rateLimitResponse(
  retryAfterSeconds?: number,
  req?: Request
): Response {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  const responseHeaders: Record<string, string> = {
    ...headers,
    'Content-Type': 'application/json',
  };
  
  if (retryAfterSeconds) {
    responseHeaders['Retry-After'] = retryAfterSeconds.toString();
  }

  return new Response(
    JSON.stringify({ 
      success: false, 
      error: 'Rate limit exceeded',
      retryAfter: retryAfterSeconds,
    }),
    { status: 429, headers: responseHeaders }
  );
}

/**
 * Create a method not allowed response (405)
 */
export function methodNotAllowed(
  allowedMethods: string[],
  req?: Request
): Response {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: `Method ${req?.method || 'UNKNOWN'} not allowed`,
      allowedMethods,
    }),
    { 
      status: 405, 
      headers: { 
        ...headers, 
        'Content-Type': 'application/json',
        'Allow': allowedMethods.join(', '),
      } 
    }
  );
}

/**
 * Create a service unavailable response (503)
 */
export function serviceUnavailable(
  message = 'Service temporarily unavailable',
  retryAfterSeconds?: number,
  req?: Request
): Response {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  const responseHeaders: Record<string, string> = {
    ...headers,
    'Content-Type': 'application/json',
  };
  
  if (retryAfterSeconds) {
    responseHeaders['Retry-After'] = retryAfterSeconds.toString();
  }

  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status: 503, headers: responseHeaders }
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGINATION RESPONSE
// ═══════════════════════════════════════════════════════════════

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Create a paginated response
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  req?: Request
): Response {
  const totalPages = Math.ceil(total / pageSize);
  
  return jsonResponse(
    {
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
    200,
    req
  );
}

// ═══════════════════════════════════════════════════════════════
// STREAMING RESPONSE
// ═══════════════════════════════════════════════════════════════

/**
 * Create a streaming text response (for SSE/streaming)
 */
export function streamResponse(
  stream: ReadableStream,
  req?: Request
): Response {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  
  return new Response(stream, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
