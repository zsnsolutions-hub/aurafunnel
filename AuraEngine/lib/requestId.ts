/**
 * Request ID utilities for idempotency and traceability.
 *
 * Every mutation that hits an edge function or RPC should include a request_id.
 * If the same request_id is sent twice, the backend can return the cached response
 * instead of re-executing the operation.
 */

/** Generate a v4-ish UUID request ID */
export function getRequestId(): string {
  // Use crypto.randomUUID if available (all modern browsers), fallback to manual
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Attach request_id to a payload object (for edge function bodies) */
export function withRequestId<T extends Record<string, unknown>>(
  payload: T,
  requestId?: string,
): T & { request_id: string } {
  return { ...payload, request_id: requestId ?? getRequestId() };
}

/** Attach request_id to fetch headers */
export function requestIdHeaders(requestId?: string): Record<string, string> {
  return { 'X-Request-ID': requestId ?? getRequestId() };
}
