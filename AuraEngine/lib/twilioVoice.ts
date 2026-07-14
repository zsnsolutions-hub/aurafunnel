// AuraEngine/lib/twilioVoice.ts
//
// Thin client for the twilio-token edge function. The Device lifecycle itself is
// owned by the calling component (LeadCallPanel) via refs — this just mints the
// Voice access token the SDK needs, and reports whether calling is configured.

import { supabase } from './supabase';

export interface VoiceTokenResult {
  configured: boolean;
  token?: string;
  identity?: string;
}

export async function fetchVoiceToken(): Promise<VoiceTokenResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You need to be signed in to make calls.');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not start calling.');
  return data as VoiceTokenResult;
}

/** Normalize a display phone to E.164-ish (digits + leading +). Best-effort. */
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/[^\d]/g, '');
  const digits = trimmed.replace(/[^\d]/g, '');
  // 10-digit US number → assume +1; otherwise prepend + and hope the number is full.
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
