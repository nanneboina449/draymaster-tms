// ==============================================================================
// DRAYMASTER TMS - Idempotency Key Management
// ==============================================================================
// Addresses P0 Critical Issue: No Idempotency Keys - Duplicate Order Creation
// Provides client-side and server-side idempotency support

import { supabase } from './supabase';
import crypto from 'crypto';

// ==============================================================================
// TYPES
// ==============================================================================

export interface IdempotencyRecord {
  id: string;
  idempotency_key: string;
  request_path: string;
  request_method: string;
  request_hash: string;
  response_status: number | null;
  response_body: any;
  result_id: string | null;
  result_type: string | null;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string;
}

export interface IdempotencyCheckResult {
  isExisting: boolean;
  record: IdempotencyRecord | null;
  isComplete: boolean;
  cachedResponse: any;
}

// ==============================================================================
// CLIENT-SIDE HELPERS
// ==============================================================================

/**
 * Generate a unique idempotency key for a request
 * Uses UUID v4 for uniqueness
 */
export function generateIdempotencyKey(): string {
  // Generate UUID without external library
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a deterministic key based on request content
 * Useful for deduplicating identical requests
 */
export function createDeterministicKey(data: any): string {
  const content = JSON.stringify(data, Object.keys(data).sort());
  // Simple hash for browser compatibility
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `det-${Math.abs(hash).toString(16)}`;
}

/**
 * Wrapper for fetch with automatic idempotency handling
 */
export async function fetchWithIdempotency(
  url: string,
  options: RequestInit & {
    idempotencyKey?: string;
    retryOnConflict?: boolean;
    maxRetries?: number;
  } = {}
): Promise<Response> {
  const {
    idempotencyKey = generateIdempotencyKey(),
    retryOnConflict = true,
    maxRetries = 3,
    ...fetchOptions
  } = options;

  const headers = new Headers(fetchOptions.headers);
  headers.set('Idempotency-Key', idempotencyKey);

  let lastError: Error | null = null;
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      // If we get a 409 Conflict (duplicate), handle it
      if (response.status === 409 && retryOnConflict) {
        const body = await response.json();
        if (body.cachedResponse) {
          // Return the cached response as a new Response object
          return new Response(JSON.stringify(body.cachedResponse), {
            status: body.originalStatus || 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      retries++;

      if (retries <= maxRetries) {
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 100));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// ==============================================================================
// SERVER-SIDE FUNCTIONS
// ==============================================================================

/**
 * Check if a request with this idempotency key already exists
 */
export async function checkIdempotencyKey(
  idempotencyKey: string
): Promise<IdempotencyCheckResult> {
  const { data, error } = await supabase
    .from('idempotency_keys')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .single();

  if (error || !data) {
    return {
      isExisting: false,
      record: null,
      isComplete: false,
      cachedResponse: null,
    };
  }

  return {
    isExisting: true,
    record: data as IdempotencyRecord,
    isComplete: data.status === 'COMPLETED',
    cachedResponse: data.response_body,
  };
}

/**
 * Create or update an idempotency record
 */
export async function createIdempotencyRecord(
  idempotencyKey: string,
  requestPath: string,
  requestMethod: string,
  requestBody?: any
): Promise<IdempotencyRecord | null> {
  // Calculate hash of request body
  const requestHash = requestBody
    ? hashRequestBody(JSON.stringify(requestBody))
    : '';

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24-hour expiry

  const { data, error } = await supabase
    .from('idempotency_keys')
    .insert({
      idempotency_key: idempotencyKey,
      request_path: requestPath,
      request_method: requestMethod,
      request_hash: requestHash,
      status: 'PROCESSING',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    // If insert fails due to duplicate key, check existing
    if (error.code === '23505') { // Unique violation
      const existing = await checkIdempotencyKey(idempotencyKey);
      return existing.record;
    }
    console.error('Error creating idempotency record:', error);
    return null;
  }

  return data as IdempotencyRecord;
}

/**
 * Complete an idempotency record with response
 */
export async function completeIdempotencyRecord(
  idempotencyKey: string,
  responseStatus: number,
  responseBody: any,
  resultId?: string,
  resultType?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('idempotency_keys')
    .update({
      status: 'COMPLETED',
      response_status: responseStatus,
      response_body: responseBody,
      result_id: resultId || null,
      result_type: resultType || null,
      completed_at: new Date().toISOString(),
    })
    .eq('idempotency_key', idempotencyKey);

  return !error;
}

/**
 * Mark an idempotency record as failed
 */
export async function failIdempotencyRecord(
  idempotencyKey: string,
  errorMessage: string
): Promise<boolean> {
  const { error } = await supabase
    .from('idempotency_keys')
    .update({
      status: 'FAILED',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('idempotency_key', idempotencyKey);

  return !error;
}

/**
 * Hash request body for comparison
 */
function hashRequestBody(body: string): string {
  // Simple hash for consistency checking
  let hash = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// ==============================================================================
// API ROUTE HELPER
// ==============================================================================

/**
 * Wrapper for Next.js API routes with idempotency support
 */
export async function withIdempotency<T>(
  request: Request,
  handler: () => Promise<{ status: number; body: T; resultId?: string; resultType?: string }>
): Promise<Response> {
  // Get idempotency key from header
  const idempotencyKey = request.headers.get('Idempotency-Key');

  // If no key provided, just run the handler
  if (!idempotencyKey) {
    const result = await handler();
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check for existing record
  const existing = await checkIdempotencyKey(idempotencyKey);

  if (existing.isExisting) {
    if (existing.isComplete && existing.cachedResponse) {
      // Return cached response
      return new Response(JSON.stringify(existing.cachedResponse), {
        status: existing.record?.response_status || 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Replayed': 'true',
        },
      });
    }

    if (existing.record?.status === 'PROCESSING') {
      // Request is still processing
      return new Response(
        JSON.stringify({ error: 'Request is still processing', idempotencyKey }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // Create new record
  const url = new URL(request.url);
  const body = request.method !== 'GET' ? await request.clone().json().catch(() => null) : null;

  await createIdempotencyRecord(
    idempotencyKey,
    url.pathname,
    request.method,
    body
  );

  try {
    // Run the handler
    const result = await handler();

    // Store the result
    await completeIdempotencyRecord(
      idempotencyKey,
      result.status,
      result.body,
      result.resultId,
      result.resultType
    );

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await failIdempotencyRecord(idempotencyKey, errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ==============================================================================
// CLEANUP
// ==============================================================================

/**
 * Clean up expired idempotency keys
 * Should be called periodically (e.g., daily cron job)
 */
export async function cleanupExpiredKeys(): Promise<number> {
  const { data, error } = await supabase
    .from('idempotency_keys')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('Error cleaning up expired keys:', error);
    return 0;
  }

  return data?.length || 0;
}
