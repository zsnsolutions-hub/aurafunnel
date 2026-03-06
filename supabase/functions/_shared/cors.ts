/**
 * Shared CORS configuration for Supabase Edge Functions.
 * Restricts Access-Control-Allow-Origin to known app domains.
 */

const ALLOWED_ORIGINS = [
  'https://scaliyo.com',
  'https://app.scaliyo.com',
  'https://www.scaliyo.com',
];

// In development, also allow localhost
if (Deno.env.get('ENVIRONMENT') === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000');
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}
