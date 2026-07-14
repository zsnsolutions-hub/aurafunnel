// AuraEngine/components/portal/IncomingCallProvider.tsx
//
// App-wide incoming-call handling (Twilio Voice). Mounted once in the portal
// layout: registers a Device under the user's identity, heartbeats presence to
// voip_inbound_routes so the twilio-incoming webhook knows to ring this client,
// and shows an Accept/Decline card when a call arrives. Matched inbound calls
// (caller number → lead) are logged to lead_call_logs (direction 'inbound').
//
// Dormant until Twilio secrets are set (twilio-token → { configured:false }).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { PhoneIcon } from '../Icons';
import { supabase } from '../../lib/supabase';
import { fetchVoiceToken, toE164, formatDuration } from '../../lib/twilioVoice';

interface Props { userId: string }

interface Caller { name: string; number: string; leadId: string | null; businessId: string | null }

const HEARTBEAT_MS = 60_000;

const IncomingCallProvider: React.FC<Props> = ({ userId }) => {
  const [ringing, setRinging] = useState(false);
  const [live, setLive] = useState(false);
  const [caller, setCaller] = useState<Caller | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIdRef = useRef<string | null>(null);
  const acceptedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const resetCall = useCallback(() => {
    clearTimer();
    setRinging(false); setLive(false); setCaller(null); setSeconds(0); setMuted(false);
    callRef.current = null; logIdRef.current = null; acceptedRef.current = false; startedAtRef.current = null;
  }, []);

  const finalizeLog = useCallback(async (status: string, talkSeconds: number) => {
    const id = logIdRef.current;
    if (!id) return;
    await supabase.from('lead_call_logs').update({
      status, duration_seconds: talkSeconds,
      outcome: acceptedRef.current ? 'connected' : null,
    }).eq('id', id);
  }, []);

  // Reverse-lookup the caller number → a lead owned by this user (best-effort,
  // normalized match on primary_phone / phones[]).
  const matchLead = useCallback(async (from: string): Promise<Caller> => {
    const target = toE164(from);
    const fallback: Caller = { name: 'Unknown caller', number: from, leadId: null, businessId: null };
    try {
      const { data } = await supabase.from('leads')
        .select('id, first_name, last_name, primary_phone, phones, business_id')
        .eq('client_id', userId)
        .not('primary_phone', 'is', null)
        .limit(2000);
      for (const r of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; primary_phone: string | null; phones: string[] | null; business_id: string | null }[]) {
        const hit = (r.primary_phone && toE164(r.primary_phone) === target) ||
                    (r.phones ?? []).some(p => toE164(p) === target);
        if (hit) {
          const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || from;
          return { name, number: from, leadId: r.id, businessId: r.business_id };
        }
      }
    } catch { /* fall through to unknown */ }
    return fallback;
  }, [userId]);

  const onIncoming = useCallback((call: Call) => {
    // Ignore a second call while one is active.
    if (callRef.current) { try { call.reject(); } catch { /* noop */ } return; }
    callRef.current = call;
    setRinging(true); setLive(false);

    const from = String(call.parameters?.From ?? call.parameters?.Caller ?? 'Unknown');
    void matchLead(from).then(setCaller);

    call.on('cancel', () => resetCall());       // caller hung up before answer
    call.on('reject', () => resetCall());
    call.on('disconnect', () => {
      const talk = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;
      void finalizeLog('completed', talk);
      resetCall();
    });
    call.on('error', () => resetCall());
  }, [matchLead, resetCall, finalizeLog]);

  const accept = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    acceptedRef.current = true;
    startedAtRef.current = Date.now();
    call.accept();
    setRinging(false); setLive(true);
    clearTimer();
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);

    // Log every inbound call — attributed to a lead when the caller matched one,
    // otherwise a lead-less row keyed by the caller's number.
    const { data } = await supabase.from('lead_call_logs')
      .insert({ lead_id: caller?.leadId ?? null, client_id: userId, business_id: caller?.businessId ?? null,
                direction: 'inbound', phone_number: caller?.number ?? null, status: 'in-progress',
                notes: caller?.leadId ? null : 'Inbound call — no matching lead',
                call_sid: String(call.parameters?.CallSid ?? '') || null })
      .select('id').single();
    if (data) logIdRef.current = data.id;
  }, [caller, userId]);

  const decline = useCallback(() => { try { callRef.current?.reject(); } catch { /* noop */ } resetCall(); }, [resetCall]);
  const hangUp = useCallback(() => { try { callRef.current?.disconnect(); } catch { /* noop */ } }, []);
  const toggleMute = useCallback(() => {
    const c = callRef.current; if (!c) return;
    const next = !muted; c.mute(next); setMuted(next);
  }, [muted]);

  // ── Device setup + presence heartbeat ──
  useEffect(() => {
    let disposed = false;
    const beat = async () => {
      try { await supabase.from('voip_inbound_routes').upsert({ user_id: userId, last_seen: new Date().toISOString() }); } catch { /* noop */ }
    };

    (async () => {
      let res;
      try { res = await fetchVoiceToken(); } catch { return; }
      if (disposed || !res.configured || !res.token) return;

      const device = new Device(res.token, { logLevel: 'error', codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU] });
      device.on('tokenWillExpire', async () => {
        try { const r = await fetchVoiceToken(); if (r.token) device.updateToken(r.token); } catch { /* noop */ }
      });
      device.on('registered', () => { void beat(); });
      device.on('incoming', (call: Call) => onIncoming(call));
      device.on('error', () => { /* transient; SDK auto-retries registration */ });
      try { await device.register(); } catch { /* noop */ }
      if (disposed) { try { device.destroy(); } catch { /* noop */ } return; }
      deviceRef.current = device;
      heartbeatRef.current = setInterval(beat, HEARTBEAT_MS);
    })();

    return () => {
      disposed = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      clearTimer();
      try { callRef.current?.disconnect(); } catch { /* noop */ }
      try { deviceRef.current?.destroy(); } catch { /* noop */ }
      deviceRef.current = null;
      // Best-effort presence removal so we stop being rung after leaving.
      void supabase.from('voip_inbound_routes').delete().eq('user_id', userId);
    };
    // onIncoming is stable enough; re-running setup on its identity change would
    // tear down the device mid-call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!ringing && !live) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[130] w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center ${live ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600 animate-pulse'}`}>
          <PhoneIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{caller?.name ?? 'Incoming call'}</p>
          <p className="text-xs text-slate-400 truncate">
            {live ? formatDuration(seconds) : (caller?.number ? `${caller.number} · incoming` : 'Incoming call…')}
          </p>
        </div>
      </div>

      {live ? (
        <div className="flex items-center gap-2">
          <button onClick={toggleMute}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${muted ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={hangUp}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors">
            Hang up
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button onClick={decline}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
            Decline
          </button>
          <button onClick={accept}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
            Accept
          </button>
        </div>
      )}
    </div>
  );
};

export default IncomingCallProvider;
