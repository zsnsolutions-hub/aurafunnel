// AuraEngine/components/portal/LeadCallPanel.tsx
//
// In-app VOIP calling for a lead (Twilio Voice browser SDK). Renders a "Call"
// button; while a call is active it shows a floating panel with live state, a
// talk timer, mute and hang-up. A lead_call_logs row is created on dial and
// updated on disconnect with the client-measured duration + outcome; the
// twilio-call-status webhook later fills in the recording URL.
//
// Calling is gated server-side: if Twilio secrets aren't set, twilio-token
// returns { configured:false } and we show a friendly "not set up" note.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { PhoneIcon } from '../Icons';
import { supabase } from '../../lib/supabase';
import { fetchVoiceToken, toE164, formatDuration } from '../../lib/twilioVoice';

type CallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended' | 'error';

interface Props {
  leadId: string;
  clientId: string;
  businessId: string | null;
  phone: string;
  leadName: string;
  onLogged?: () => void;
  triggerClassName?: string;
}

const DEFAULT_TRIGGER =
  'flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors';

const LeadCallPanel: React.FC<Props> = ({ leadId, clientId, businessId, phone, leadName, onLogged, triggerClassName }) => {
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIdRef = useRef<string | null>(null);
  const acceptedRef = useRef(false);

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const teardown = useCallback(() => {
    clearTimer();
    try { callRef.current?.disconnect(); } catch { /* noop */ }
    callRef.current = null;
    try { deviceRef.current?.destroy(); } catch { /* noop */ }
    deviceRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // Persist the final call outcome once the call ends.
  const finalizeLog = useCallback(async (status: string) => {
    const id = logIdRef.current;
    if (!id) return;
    const patch: Record<string, unknown> = { status, duration_seconds: seconds };
    if (acceptedRef.current) patch.outcome = 'connected';
    else if (status === 'no-answer') patch.outcome = 'no_answer';
    else if (status === 'busy') patch.outcome = 'busy';
    await supabase.from('lead_call_logs').update(patch).eq('id', id);
    onLogged?.();
  }, [seconds, onLogged]);

  const endCall = useCallback((status: string) => {
    clearTimer();
    setState(prev => (prev === 'error' ? 'error' : 'ended'));
    void finalizeLog(status);
    callRef.current = null;
  }, [finalizeLog]);

  const ensureDevice = useCallback(async (): Promise<Device | null> => {
    if (deviceRef.current) return deviceRef.current;
    const res = await fetchVoiceToken();
    if (!res.configured || !res.token) { setNotConfigured(true); return null; }
    const device = new Device(res.token, { logLevel: 'error', codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU] });
    device.on('tokenWillExpire', async () => {
      try { const r = await fetchVoiceToken(); if (r.token) device.updateToken(r.token); } catch { /* noop */ }
    });
    device.on('error', (e: { message?: string }) => { setError(e?.message || 'Calling error'); setState('error'); });
    deviceRef.current = device;
    return device;
  }, []);

  const startCall = useCallback(async () => {
    setError(null); setNotConfigured(false); setMuted(false); setSeconds(0);
    acceptedRef.current = false;
    const number = toE164(phone);
    if (!number || number.length < 8) { setError('This lead has no valid phone number.'); setState('error'); return; }

    setState('connecting');
    try {
      const device = await ensureDevice();
      if (!device) { setState('idle'); return; } // notConfigured shown

      // Create the log row up-front so the status webhook can enrich it.
      const { data, error: insErr } = await supabase.from('lead_call_logs')
        .insert({ lead_id: leadId, client_id: clientId, business_id: businessId,
                  direction: 'outbound', phone_number: number, status: 'dialing' })
        .select('id').single();
      if (insErr) throw new Error(insErr.message);
      logIdRef.current = data.id;

      const call = await device.connect({ params: { To: number, callLogId: data.id } });
      callRef.current = call;

      call.on('ringing', () => setState('ringing'));
      call.on('accept', () => {
        acceptedRef.current = true;
        setState('live');
        clearTimer();
        timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      });
      call.on('disconnect', () => endCall('completed'));
      call.on('cancel', () => endCall('no-answer'));
      call.on('reject', () => endCall('busy'));
      call.on('error', (e: { message?: string }) => { setError(e?.message || 'Call failed'); setState('error'); endCall('failed'); });
    } catch (e) {
      setError((e as Error).message || 'Could not place the call.');
      setState('error');
    }
  }, [phone, leadId, clientId, businessId, ensureDevice, endCall]);

  const hangUp = useCallback(() => { try { callRef.current?.disconnect(); } catch { /* noop */ } }, []);
  const toggleMute = useCallback(() => {
    const c = callRef.current; if (!c) return;
    const next = !muted; c.mute(next); setMuted(next);
  }, [muted]);

  const active = state === 'connecting' || state === 'ringing' || state === 'live';

  return (
    <>
      <button
        onClick={startCall}
        disabled={active}
        className={triggerClassName || DEFAULT_TRIGGER}
      >
        <PhoneIcon className="w-4 h-4" />
        <span>{active ? 'On call…' : 'Call'}</span>
      </button>

      {notConfigured && (
        <p className="mt-2 text-xs text-amber-600 font-medium">
          Calling isn’t set up yet. Add your Twilio credentials in project secrets to enable in-app calls.
        </p>
      )}
      {state === 'error' && error && !notConfigured && (
        <p className="mt-2 text-xs text-rose-600 font-medium">{error}</p>
      )}

      {(active || state === 'ended') && (
        <div className="fixed bottom-6 right-6 z-[120] w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${state === 'live' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
              <PhoneIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{leadName || 'Lead'}</p>
              <p className="text-xs text-slate-400 truncate">{toE164(phone)}</p>
            </div>
          </div>

          <div className="text-center mb-4">
            {state === 'connecting' && <p className="text-xs font-semibold text-slate-500">Connecting…</p>}
            {state === 'ringing' && <p className="text-xs font-semibold text-indigo-500">Ringing…</p>}
            {state === 'live' && <p className="text-lg font-black text-slate-900 tabular-nums">{formatDuration(seconds)}</p>}
            {state === 'ended' && <p className="text-xs font-semibold text-slate-400">Call ended{seconds > 0 ? ` · ${formatDuration(seconds)}` : ''}</p>}
          </div>

          {active ? (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${muted ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={hangUp}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
              >
                Hang up
              </button>
            </div>
          ) : (
            <button
              onClick={() => setState('idle')}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default LeadCallPanel;
