// File: AuraEngine/hooks/useCreatePost.ts
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface PostTarget {
  channel: string;
  target_id: string;
  target_label?: string;
}

interface PostPayload {
  content_text: string;
  link_url?: string;
  media_paths?: string[];
  targets: PostTarget[];
  track_clicks?: boolean;
}

interface SchedulePayload extends PostPayload {
  scheduled_at: string;
  timezone?: string;
}

interface PostResult {
  post_id: string;
  status: string;
  results?: { target_id: string; channel: string; status: string; error?: string }[];
}

async function callEdgeFunction(name: string, body: any): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Edge function error: ${res.status}`);
  return data;
}

export function usePublishNow() {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostResult | null>(null);

  const publishNow = useCallback(async (payload: PostPayload) => {
    setPublishing(true);
    setError(null);
    setResult(null);
    try {
      const data = await callEdgeFunction('social-post-now', payload);
      setResult(data);
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Publish failed';
      setError(msg);
      return null;
    } finally {
      setPublishing(false);
    }
  }, []);

  return { publishNow, publishing, error, result };
}

export function useSchedulePost() {
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostResult | null>(null);

  const schedulePost = useCallback(async (payload: SchedulePayload) => {
    setScheduling(true);
    setError(null);
    setResult(null);
    try {
      const data = await callEdgeFunction('social-schedule', payload);
      setResult(data);
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Schedule failed';
      setError(msg);
      return null;
    } finally {
      setScheduling(false);
    }
  }, []);

  return { schedulePost, scheduling, error, result };
}

export function useOAuthStart() {
  const startMetaOAuth = useCallback(async () => {
    const data = await callEdgeFunction('meta-oauth-start', {});
    if (data.url) window.location.href = data.url;
  }, []);

  const startLinkedInOAuth = useCallback(async () => {
    const data = await callEdgeFunction('linkedin-oauth-start', {});
    if (data.url) window.location.href = data.url;
  }, []);

  return { startMetaOAuth, startLinkedInOAuth };
}
