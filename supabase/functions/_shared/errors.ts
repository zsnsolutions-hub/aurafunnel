/**
 * Shared error handling utilities for Supabase Edge Functions.
 * Provides structured error responses with correlation IDs for tracing.
 */

export type ErrorCode =
  | 'AUTH_MISSING'
  | 'AUTH_INVALID'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'PROVIDER_ERROR'
  | 'INTERNAL_ERROR';

interface ErrorResponseOpts {
  code: ErrorCode;
  message: string;
  status?: number;
  corsHeaders: Record<string, string>;
  details?: Record<string, unknown>;
}

const STATUS_MAP: Record<ErrorCode, number> = {
  AUTH_MISSING: 401,
  AUTH_INVALID: 401,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
};

/** Generate a short correlation ID for request tracing */
export function correlationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Build a structured JSON error response with correlation ID */
export function errorResponse(opts: ErrorResponseOpts): Response {
  const reqId = correlationId();
  const status = opts.status ?? STATUS_MAP[opts.code] ?? 500;

  console.error(`[${reqId}] ${opts.code}: ${opts.message}`, opts.details ?? '');

  return new Response(
    JSON.stringify({
      error: opts.message,
      code: opts.code,
      requestId: reqId,
      ...(opts.details ? { details: opts.details } : {}),
    }),
    {
      status,
      headers: { ...opts.corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
