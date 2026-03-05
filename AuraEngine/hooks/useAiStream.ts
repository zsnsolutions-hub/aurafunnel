/**
 * useAiStream — SSE streaming hook for AI Command Center.
 *
 * - Consumes SSE from /ai-chat-stream edge function
 * - Buffers chunks and flushes to state at ~15fps max (67ms throttle)
 * - AbortController for "Stop generating"
 * - Robust error handling — never triggers page reload
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error' | 'aborted';

export interface StreamMetadata {
  tokensUsed: number;
  latencyMs: number;
  totalLength: number;
}

interface UseAiStreamOptions {
  onChunk?: (accumulated: string) => void;
  onDone?: (fullText: string, meta: StreamMetadata) => void;
  onError?: (error: string) => void;
  throttleMs?: number;
}

interface StreamRequest {
  mode: string;
  prompt: string;
  history: { role: string; content: string }[];
  leadContext: string;
  pipelineStats: string;
  businessContext: string;
  threadId?: string;
  messageId?: string;
}

export function useAiStream(opts: UseAiStreamOptions = {}) {
  const { throttleMs = 67 } = opts;

  const [status, setStatus] = useState<StreamStatus>('idle');
  const [accumulated, setAccumulated] = useState('');
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onChunkRef = useRef(opts.onChunk);
  const onDoneRef = useRef(opts.onDone);
  const onErrorRef = useRef(opts.onError);
  onChunkRef.current = opts.onChunk;
  onDoneRef.current = opts.onDone;
  onErrorRef.current = opts.onError;

  const flushBuffer = useCallback(() => {
    const current = bufferRef.current;
    if (!current) return;
    setAccumulated(current);
    onChunkRef.current?.(current);
  }, []);

  const startStream = useCallback(async (request: StreamRequest) => {
    // Abort any in-flight stream
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    bufferRef.current = '';
    setAccumulated('');
    setMetadata(null);
    setError(null);
    setStatus('streaming');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const url = `${supabaseUrl}/functions/v1/ai-chat-stream`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        let msg = `Server error (${response.status})`;
        try {
          msg = JSON.parse(errBody).error || msg;
        } catch { /* use default */ }
        throw new Error(msg);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partial = '';

      // Throttled flush loop
      const scheduleFlush = () => {
        if (flushTimerRef.current) return;
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = undefined;
          flushBuffer();
        }, throttleMs);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'chunk') {
              bufferRef.current += event.text;
              scheduleFlush();
            } else if (event.type === 'done') {
              // Final flush
              if (flushTimerRef.current) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = undefined;
              }
              flushBuffer();

              const meta: StreamMetadata = {
                tokensUsed: event.tokensUsed || 0,
                latencyMs: event.latencyMs || 0,
                totalLength: event.totalLength || 0,
              };
              setMetadata(meta);
              setStatus('done');
              onDoneRef.current?.(bufferRef.current, meta);
              return;
            } else if (event.type === 'error') {
              throw new Error(event.message || 'Stream error');
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      // Stream ended without 'done' event — treat as complete
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = undefined;
      }
      flushBuffer();
      setStatus('done');
      onDoneRef.current?.(bufferRef.current, { tokensUsed: 0, latencyMs: 0, totalLength: bufferRef.current.length });
    } catch (err) {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = undefined;
      }

      if ((err as Error).name === 'AbortError') {
        // Final flush of whatever we have
        flushBuffer();
        setStatus('aborted');
        return;
      }

      const msg = (err as Error).message || 'Stream failed';
      setError(msg);
      setStatus('error');
      onErrorRef.current?.(msg);
    }
  }, [throttleMs, flushBuffer]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    bufferRef.current = '';
    setAccumulated('');
    setStatus('idle');
    setMetadata(null);
    setError(null);
  }, []);

  return {
    startStream,
    abort,
    reset,
    status,
    accumulated,
    metadata,
    error,
  };
}
