/**
 * useAiThread — persistence layer for AI Command Center.
 *
 * - Creates/loads threads from ai_threads table
 * - Persists messages to ai_messages table
 * - Periodically flushes streaming content (every 1s or 500 chars)
 * - On page load, restores last thread with incomplete messages
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface AiThread {
  id: string;
  workspace_id: string;
  mode: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  thread_id: string;
  workspace_id: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  status: 'pending' | 'streaming' | 'complete' | 'error' | 'aborted';
  mode: string;
  tokens_used: number;
  latency_ms: number;
  confidence: number;
  created_at: string;
  finished_at: string | null;
}

interface UseAiThreadOptions {
  workspaceId: string | undefined;
  mode: string;
}

export function useAiThread({ workspaceId, mode }: UseAiThreadOptions) {
  const [thread, setThread] = useState<AiThread | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastFlushedLenRef = useRef(0);

  // Load or create thread on mount
  const loadOrCreateThread = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }

    try {
      // Try to load most recent thread for this mode
      const { data: existing } = await supabase
        .from('ai_threads')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('mode', mode)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        setThread(existing as AiThread);
        // Load messages for this thread
        const { data: msgs } = await supabase
          .from('ai_messages')
          .select('*')
          .eq('thread_id', existing.id)
          .order('created_at', { ascending: true });
        setMessages((msgs || []) as AiMessage[]);
      } else {
        // Create new thread
        const { data: newThread, error } = await supabase
          .from('ai_threads')
          .insert({ workspace_id: workspaceId, mode })
          .select()
          .single();
        if (error) throw error;
        setThread(newThread as AiThread);
        setMessages([]);
      }
    } catch (err) {
      console.warn('Failed to load AI thread:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, mode]);

  useEffect(() => {
    loadOrCreateThread();
  }, [loadOrCreateThread]);

  // Create a new thread (clear chat)
  const createNewThread = useCallback(async () => {
    if (!workspaceId) return null;
    try {
      const { data, error } = await supabase
        .from('ai_threads')
        .insert({ workspace_id: workspaceId, mode })
        .select()
        .single();
      if (error) throw error;
      setThread(data as AiThread);
      setMessages([]);
      return data as AiThread;
    } catch (err) {
      console.warn('Failed to create new thread:', err);
      return null;
    }
  }, [workspaceId, mode]);

  // Persist a user or system message
  const addMessage = useCallback(async (
    role: 'user' | 'ai' | 'system',
    content: string,
    opts?: { status?: string; confidence?: number }
  ): Promise<string | null> => {
    if (!thread || !workspaceId) return null;
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .insert({
          thread_id: thread.id,
          workspace_id: workspaceId,
          role,
          content,
          status: opts?.status || 'complete',
          mode,
          confidence: opts?.confidence || 0,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    } catch (err) {
      console.warn('Failed to persist message:', err);
      return null;
    }
  }, [thread, workspaceId, mode]);

  // Periodic flush of streaming content to DB
  const flushStreamContent = useCallback(async (messageId: string, content: string) => {
    if (!messageId || content.length - lastFlushedLenRef.current < 500) return;
    lastFlushedLenRef.current = content.length;
    try {
      await supabase
        .from('ai_messages')
        .update({ content })
        .eq('id', messageId);
    } catch {
      // Silently fail — final flush on completion will catch up
    }
  }, []);

  // Start periodic flushing during a stream
  const startFlushLoop = useCallback((messageId: string, getContent: () => string) => {
    lastFlushedLenRef.current = 0;
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    flushTimerRef.current = setInterval(() => {
      flushStreamContent(messageId, getContent());
    }, 1000);
  }, [flushStreamContent]);

  const stopFlushLoop = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
  }, []);

  // Finalize a streaming message
  const finalizeMessage = useCallback(async (
    messageId: string,
    content: string,
    status: 'complete' | 'error' | 'aborted',
    meta?: { tokensUsed?: number; latencyMs?: number }
  ) => {
    stopFlushLoop();
    if (!messageId) return;
    try {
      await supabase
        .from('ai_messages')
        .update({
          content,
          status,
          tokens_used: meta?.tokensUsed || 0,
          latency_ms: meta?.latencyMs || 0,
          finished_at: new Date().toISOString(),
        })
        .eq('id', messageId);
    } catch (err) {
      console.warn('Failed to finalize message:', err);
    }
  }, [stopFlushLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, []);

  return {
    thread,
    messages,
    loading,
    createNewThread,
    addMessage,
    startFlushLoop,
    stopFlushLoop,
    finalizeMessage,
    refreshMessages: loadOrCreateThread,
  };
}
