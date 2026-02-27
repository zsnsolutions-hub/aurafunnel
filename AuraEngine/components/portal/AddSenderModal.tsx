import React, { useState } from 'react';
import { Mail, X, AlertTriangle, ExternalLink, Check, Loader2 } from 'lucide-react';
import type { SenderProvider } from '../../types';
import { canAddInbox, addSenderAccount, PROVIDER_META } from '../../lib/senderAccounts';
import { supabase } from '../../lib/supabase';

interface AddSenderModalProps {
  workspaceId: string;
  planName: string;
  onClose: () => void;
  onAdded: () => void;
}

type Step = 'choose' | 'gmail' | 'smtp' | 'sendgrid' | 'mailchimp';

const PROVIDERS: { key: SenderProvider; icon: string }[] = [
  { key: 'gmail', icon: 'G' },
  { key: 'smtp', icon: 'S' },
  { key: 'sendgrid', icon: 'SG' },
  { key: 'mailchimp', icon: 'MC' },
];

const AddSenderModal: React.FC<AddSenderModalProps> = ({ workspaceId, planName, onClose, onAdded }) => {
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // SMTP fields
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');

  // SendGrid fields
  const [sgApiKey, setSgApiKey] = useState('');
  const [sgFromEmail, setSgFromEmail] = useState('');
  const [sgFromName, setSgFromName] = useState('');

  // Gmail fields (OAuth redirect)
  const [gmailEmail, setGmailEmail] = useState('');

  // Mailchimp fields
  const [mcApiKey, setMcApiKey] = useState('');

  const selectProvider = async (provider: SenderProvider) => {
    setError(null);

    // Check inbox limit for outreach providers
    if (provider !== 'mailchimp') {
      try {
        const { allowed, current, max } = await canAddInbox(workspaceId, planName);
        if (!allowed) {
          setError(`You\u2019ve reached your inbox limit (${current}/${max}). Upgrade your plan to add more.`);
          return;
        }
      } catch {
        setError('Failed to check inbox capacity.');
        return;
      }
    }

    setStep(provider);
  };

  const handleConnectSMTP = async () => {
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFromEmail) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Call edge function to validate + store secrets server-side
      const { error: fnError } = await supabase.functions.invoke('connect-smtp', {
        body: {
          workspaceId,
          host: smtpHost,
          port: parseInt(smtpPort),
          user: smtpUser,
          pass: smtpPass,
          fromEmail: smtpFromEmail,
          fromName: smtpFromName,
        },
      });
      if (fnError) throw new Error(fnError.message);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectSendGrid = async () => {
    if (!sgApiKey || !sgFromEmail) {
      setError('API key and sender email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: fnError } = await supabase.functions.invoke('connect-sendgrid', {
        body: {
          workspaceId,
          apiKey: sgApiKey,
          fromEmail: sgFromEmail,
          fromName: sgFromName,
        },
      });
      if (fnError) throw new Error(fnError.message);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGmail = async () => {
    setSaving(true);
    setError(null);
    try {
      // Redirect to Gmail OAuth endpoint (edge function returns auth URL)
      const { data, error: fnError } = await supabase.functions.invoke('connect-gmail-oauth', {
        body: { workspaceId, hint: gmailEmail },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth initiation failed.');
      setSaving(false);
    }
  };

  const handleConnectMailchimp = async () => {
    if (!mcApiKey) {
      setError('API key is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: fnError } = await supabase.functions.invoke('connect-mailchimp-oauth', {
        body: { workspaceId, apiKey: mcApiKey },
      });
      if (fnError) throw new Error(fnError.message);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-3xl overflow-hidden animate-in zoom-in-95 duration-500">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-300 hover:text-slate-500 transition-colors z-10">
          <X size={20} />
        </button>

        <div className="px-8 pt-8 pb-6">
          <h2 className="text-xl font-bold text-slate-900 font-heading">
            {step === 'choose' ? 'Add Sender Account' : `Connect ${PROVIDER_META[step as SenderProvider]?.label ?? step}`}
          </h2>
          {step === 'choose' && (
            <p className="text-slate-500 text-sm mt-1">Choose a provider to connect.</p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-8 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="px-8 pb-8">
          {/* Step: Choose provider */}
          {step === 'choose' && (
            <div className="grid grid-cols-2 gap-3">
              {PROVIDERS.map(({ key }) => {
                const meta = PROVIDER_META[key];
                return (
                  <button
                    key={key}
                    onClick={() => selectProvider(key)}
                    className="flex flex-col items-start p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-left"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Mail size={18} className="text-slate-600" />
                      <span className="text-sm font-bold text-slate-900">{meta.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{meta.description}</p>
                    {!meta.outreachSafe && (
                      <span className="mt-2 text-[9px] font-bold text-amber-500 uppercase">Marketing only</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Step: Gmail OAuth */}
          {step === 'gmail' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                You&apos;ll be redirected to Google to authorize Scaliyo. We request offline access to send emails on your behalf.
              </p>
              <input type="email" placeholder="Gmail address (optional hint)" value={gmailEmail} onChange={e => setGmailEmail(e.target.value)} className={inputCls} />
              <button onClick={handleConnectGmail} disabled={saving} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                {saving ? 'Redirecting...' : 'Connect with Google'}
              </button>
              <button onClick={() => { setStep('choose'); setError(null); }} className="w-full text-sm text-slate-400 hover:text-slate-600 font-bold">Back</button>
            </div>
          )}

          {/* Step: SMTP */}
          {step === 'smtp' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="SMTP Host" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className={inputCls} />
                <input placeholder="Port (587)" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className={inputCls} />
              </div>
              <input placeholder="Username" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} className={inputCls} />
              <input type="password" placeholder="Password / App Password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} className={inputCls} />
              <input type="email" placeholder="From Email" value={smtpFromEmail} onChange={e => setSmtpFromEmail(e.target.value)} className={inputCls} />
              <input placeholder="From Name (optional)" value={smtpFromName} onChange={e => setSmtpFromName(e.target.value)} className={inputCls} />
              <p className="text-[10px] text-slate-400">Credentials are stored encrypted server-side. They are never exposed to the browser.</p>
              <button onClick={handleConnectSMTP} disabled={saving} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {saving ? 'Validating...' : 'Connect SMTP'}
              </button>
              <button onClick={() => { setStep('choose'); setError(null); }} className="w-full text-sm text-slate-400 hover:text-slate-600 font-bold">Back</button>
            </div>
          )}

          {/* Step: SendGrid */}
          {step === 'sendgrid' && (
            <div className="space-y-3">
              <input type="password" placeholder="SendGrid API Key" value={sgApiKey} onChange={e => setSgApiKey(e.target.value)} className={inputCls} />
              <input type="email" placeholder="Verified Sender Email" value={sgFromEmail} onChange={e => setSgFromEmail(e.target.value)} className={inputCls} />
              <input placeholder="From Name (optional)" value={sgFromName} onChange={e => setSgFromName(e.target.value)} className={inputCls} />
              <p className="text-[10px] text-slate-400">API key is stored server-side only. Ensure the sender email is verified in SendGrid.</p>
              <button onClick={handleConnectSendGrid} disabled={saving} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {saving ? 'Validating...' : 'Connect SendGrid'}
              </button>
              <button onClick={() => { setStep('choose'); setError(null); }} className="w-full text-sm text-slate-400 hover:text-slate-600 font-bold">Back</button>
            </div>
          )}

          {/* Step: Mailchimp */}
          {step === 'mailchimp' && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs text-amber-700 font-medium">
                  {PROVIDER_META.mailchimp.complianceNote}
                </p>
              </div>
              <input type="password" placeholder="Mailchimp API Key" value={mcApiKey} onChange={e => setMcApiKey(e.target.value)} className={inputCls} />
              <p className="text-[10px] text-slate-400">Used for newsletters and marketing campaigns only. Not for cold outreach sequences.</p>
              <button onClick={handleConnectMailchimp} disabled={saving} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {saving ? 'Connecting...' : 'Connect Mailchimp'}
              </button>
              <button onClick={() => { setStep('choose'); setError(null); }} className="w-full text-sm text-slate-400 hover:text-slate-600 font-bold">Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddSenderModal;
