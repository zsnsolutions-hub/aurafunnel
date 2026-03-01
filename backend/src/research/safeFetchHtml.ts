import type { PageResult } from './types.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 4_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredDelay(attempt: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return exp * (0.5 + Math.random() * 0.5);
}

async function fetchOnce(url: string): Promise<PageResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (res.status === 403 || res.status === 429) {
      return { url, status: 'blocked', durationMs: Date.now() - start, error: `HTTP ${res.status}` };
    }

    if (!res.ok) {
      return { url, status: 'failed', durationMs: Date.now() - start, error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return { url, status: 'failed', durationMs: Date.now() - start, error: `Non-HTML content-type: ${contentType}` };
    }

    // Stream body with size limit
    const reader = res.body?.getReader();
    if (!reader) {
      return { url, status: 'failed', durationMs: Date.now() - start, error: 'No response body' };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        return { url, status: 'too_large', durationMs: Date.now() - start, error: `Body exceeded ${MAX_BODY_BYTES} bytes` };
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder();
    const html = chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();

    return { url, status: 'ok', html, durationMs: Date.now() - start };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('abort') || msg.includes('AbortError');
    return {
      url,
      status: isTimeout ? 'timeout' : 'failed',
      durationMs: Date.now() - start,
      error: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function safeFetchHtml(url: string): Promise<PageResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await fetchOnce(url);

    // Don't retry on these — they're deterministic
    if (result.status === 'ok' || result.status === 'blocked' || result.status === 'too_large') {
      return result;
    }

    if (attempt < MAX_RETRIES) {
      await sleep(jitteredDelay(attempt));
    } else {
      return result;
    }
  }

  // Unreachable, but satisfies TypeScript
  return { url, status: 'failed', durationMs: 0, error: 'Exhausted retries' };
}
