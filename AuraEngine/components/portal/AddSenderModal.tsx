import React, { useState } from 'react';
import { Mail, X, AlertTriangle, Check, Loader2, ExternalLink } from 'lucide-react';
import type { SenderProvider } from '../../types';
import { canAddInbox, PROVIDER_META } from '../../lib/senderAccounts';
import { supabase } from '../../lib/supabase';

interface AddSenderModalProps {
  workspaceId: string;
  planName: string;
  onClose: () => void;
  onAdded: () => void;
}

// Gmail + Outlook connect via App-Password SMTP (Roadmap 3.2 — the OAuth flow was
// half-built and dead-ended). They're SMTP presets: host/port are prefilled and
// the user supplies their address + an App Password. send-email routes both to
// SMTP; Gmail stays branded 'gmail', Outlook is stored as generic 'smtp'.
type Step = 'choose' | 'gmail' | 'outlook' | 'smtp' | 'sendgrid' | 'mailchimp';

interface SmtpPreset { label: string; description: string; host: string; port: string; appPwUrl: string; appPwHelp: string; providerHint?: 'gmail' }
const SMTP_PRESETS: Record<'gmail' | 'outlook', SmtpPreset> = {
  gmail: {
    label: 'Gmail / Google Workspace',
    description: 'Connect with an App Password. Best for personalized cold outreach.',
    host: 'smtp.gmail.com',
    port: '465',
    appPwUrl: 'https://myaccount.google.com/apppasswords',
    appPwHelp: 'Requires 2-Step Verification. Google Account → Security → App Passwords → generate one for "Mail", then paste it below (not your normal password).',
    providerHint: 'gmail',
  },
  outlook: {
    label: 'Outlook / Microsoft 365',
    description: 'Connect Outlook.com or Microsoft 365 over SMTP.',
    host: 'smtp-mail.outlook.com',
    port: '587',
    appPwUrl: 'https://account.microsoft.com/security',
    appPwHelp: 'If your account has 2-step verification, create an App Password (Microsoft account → Security → Advanced security options → App passwords) and paste it below.',
  },
};

// Choose-screen tiles. gmail/smtp/sendgrid/mailchimp use PROVIDER_META; outlook is
// preset-only (not a stored provider — it's SMTP under the hood).
const CHOICES: { key: Step; label: string; description: string; outreachSafe?: boolean }[] = [
  { key: 'gmail', label: PROVIDER_META.gmail.label, description: SMTP_PRESETS.gmail.description, outreachSafe: true },
  { key: 'outlook', label: SMTP_PRESETS.outlook.label, description: SMTP_PRESETS.outlook.description, outreachSafe: true },
  { key: 'smtp', label: PROVIDER_META.smtp.label, description: PROVIDER_META.smtp.description, outreachSafe: true },
  { key: 'sendgrid', label: PROVIDER_META.sendgrid.label, description: PROVIDER_META.sendgrid.description, outreachSafe: true },
  { key: 'mailchimp', label: PROVIDER_META.mailchimp.label, description: PROVIDER_META.mailchimp.description, outreachSafe: false },
];

const AddSenderModal: React.FC<AddSenderModalProps> = ({ workspaceId, planName, onClose, onAdded }) => {
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // SMTP fields (shared by gmail / outlook / custom smtp)
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

  // Mailchimp fields
  const [mcApiKey, setMcApiKey] = useState('');

  const preset = step === 'gmail' || step === 'outlook' ? SMTP_PRESETS[step] : null;
  const isSmtpForm = step === 'gmail' || step === 'outlook' || step === 'smtp';

  const selectProvider = (choice: Step) => {
    setError(null);
    // Prefill host/port for the branded presets; clear for custom SMTP.
    if (choice === 'gmail' || choice === 'outlook') {
      setSmtpHost(SMTP_PRESETS[choice].host);
      setSmtpPort(SMTP_PRESETS[choice].port);
    } else if (choice === 'smtp') {
      setSmtpHost(''); setSmtpPort('587');
    }
    setStep(choice);

    // Capacity check is advisory; the connect edge functions enforce server-side.
    if (choice !== 'mailchimp') {
      canAddInbox(workspaceId, planName)
        .then(({ allowed, current, max }) => {
          if (!allowed) setError(`You've reached your inbox limit (${current}/${max}). Upgrade your plan to add more.`);
        })
        .catch(() => { /* non-blocking */ });
    }
  };

  const handleConnectSMTP = async () => {
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFromEmail) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: fnError } = await supabase.functions.invoke('connect-smtp', {
        body: {
          workspaceId,
          host: smtpHost,
          port: parseInt(smtpPort),
          user: smtpUser,
          pass: smtpPass,
          fromEmail: smtpFromEmail,
          fromName: smtpFromName,
          provider: preset?.providerHint, // 'gmail' for the Gmail preset; else stored as 'smtp'
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
        body: { workspaceId, apiKey: sgApiKey, fromEmail: sgFromEmail, fromName: sgFromName },
      });
      if (fnError) throw new Error(fnError.message);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
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
  const headerLabel = step === 'choose' ? 'Add Sender Account'
    : preset ? `Connect ${preset.label}`
    : `Connect ${PROVIDER_META[step as SenderProvider]?.label ?? step}`;

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />

      <div className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300 ease-out">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-300 hover:text-slate-500 transition-colors z-10">
          <X size={20} />
        </button>

        <div className="px-8 pt-8 pb-6">
          <h2 className="text-xl font-bold text-slate-900 font-heading">{headerLabel}</h2>
          {step === 'choose' && (
            <p className="text-slate-500 text-sm mt-1">Choose a provider to connect.</p>
          )}
        </div>

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
              {CHOICES.map(({ key, label, description, outreachSafe }) => (
                <button
                  key={key}
                  onClick={() => selectProvider(key)}
                  className="flex flex-col items-start p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Mail size={18} className="text-slate-600" />
                    <span className="text-sm font-bold text-slate-900">{label}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
                  {outreachSafe === false && (
                    <span className="mt-2 text-[9px] font-bold text-amber-500 uppercase">Marketing only</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step: SMTP (also Gmail / Outlook presets) */}
          {isSmtpForm && (
            <div className="space-y-3">
              {preset && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <p className="text-xs text-indigo-800 leading-relaxed">{preset.appPwHelp}</p>
                  <a href={preset.appPwUrl} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                    Create an App Password <ExternalLink size={12} />
                  </a>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="SMTP Host" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className={inputCls} />
                <input placeholder="Port" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className={inputCls} />
              </div>
              <input placeholder={preset ? 'Your email address (username)' : 'Username'} value={smtpUser} onChange={e => setSmtpUser(e.target.value)} className={inputCls} />
              <input type="password" placeholder={preset ? 'App Password' : 'Password / App Password'} value={smtpPass} onChange={e => setSmtpPass(e.target.value)} className={inputCls} />
              <input type="email" placeholder="From Email" value={smtpFromEmail} onChange={e => setSmtpFromEmail(e.target.value)} className={inputCls} />
              <input placeholder="From Name (optional)" value={smtpFromName} onChange={e => setSmtpFromName(e.target.value)} className={inputCls} />
              <p className="text-[10px] text-slate-400">Credentials are stored encrypted server-side. They are never exposed to the browser.</p>
              <button onClick={handleConnectSMTP} disabled={saving} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {saving ? 'Validating...' : `Connect ${preset ? preset.label.split(' ')[0] : 'SMTP'}`}
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
                <p className="text-xs text-amber-700 font-medium">{PROVIDER_META.mailchimp.complianceNote}</p>
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
