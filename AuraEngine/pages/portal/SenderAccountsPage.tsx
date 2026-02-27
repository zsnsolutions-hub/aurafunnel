import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Mail, Plus, Shield, Trash2, Star, AlertTriangle, CheckCircle, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import type { User, SenderAccount, SenderProvider } from '../../types';
import {
  listSenderAccounts,
  setDefaultSender,
  removeSenderAccount,
  updateSenderStatus,
  toggleWarmup,
  canAddInbox,
  PROVIDER_META,
  getProviderLabel,
} from '../../lib/senderAccounts';
import { resolvePlanName } from '../../lib/credits';
import { getOutboundLimits } from '../../lib/planLimits';
import AddSenderModal from '../../components/portal/AddSenderModal';

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  connected: { className: 'bg-emerald-100 text-emerald-700', label: 'Connected' },
  needs_reauth: { className: 'bg-amber-100 text-amber-700', label: 'Needs Reauth' },
  disabled: { className: 'bg-slate-100 text-slate-500', label: 'Disabled' },
};

const PROVIDER_ICON_COLOR: Record<SenderProvider, string> = {
  gmail: 'text-red-500',
  smtp: 'text-blue-500',
  sendgrid: 'text-indigo-500',
  mailchimp: 'text-yellow-600',
};

const SenderAccountsPage: React.FC = () => {
  const { user } = useOutletContext<{ user: User }>();
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const currentPlan = resolvePlanName(user.subscription?.plan_name || user.plan || 'Starter');
  const limits = getOutboundLimits(currentPlan);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSenderAccounts(user.id);
      setAccounts(data);
    } catch (err) {
      console.error('Failed to load sender accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const outreachCount = accounts.filter(a => a.use_for_outreach && a.status !== 'disabled').length;

  const handleSetDefault = async (id: string) => {
    await setDefaultSender(user.id, id);
    fetchAccounts();
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this sender account? This cannot be undone.')) return;
    setRemoving(id);
    try {
      await removeSenderAccount(id);
      fetchAccounts();
    } finally {
      setRemoving(null);
    }
  };

  const handleToggleWarmup = async (id: string, current: boolean) => {
    await toggleWarmup(id, !current);
    fetchAccounts();
  };

  const handleReauth = async (id: string) => {
    await updateSenderStatus(id, 'connected');
    fetchAccounts();
  };

  const handleAdded = () => {
    setShowAddModal(false);
    fetchAccounts();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading accounts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Sender Accounts</h1>
          <p className="text-slate-500 mt-1">
            Connect your email providers. {outreachCount} of {limits.maxInboxes} outreach {limits.maxInboxes === 1 ? 'inbox' : 'inboxes'} used.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <Plus size={16} />
          Add Account
        </button>
      </div>

      {/* Inbox capacity bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-slate-400" />
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Outreach Inbox Capacity</span>
          </div>
          <span className="text-sm font-bold text-slate-900">{outreachCount} / {limits.maxInboxes}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              outreachCount >= limits.maxInboxes ? 'bg-red-500' : outreachCount >= limits.maxInboxes * 0.8 ? 'bg-amber-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.min((outreachCount / limits.maxInboxes) * 100, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">
          {currentPlan} plan: {limits.emailsPerDayPerInbox} emails/day per inbox, {limits.emailsPerMonth.toLocaleString()} emails/month total.
          Limits protect your deliverability.
        </p>
      </div>

      {/* Mailchimp compliance note */}
      {accounts.some(a => a.provider === 'mailchimp') && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Mailchimp is for marketing only</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Mailchimp accounts are used for newsletters and opt-in campaigns. They are not included in outreach sequences.
              Using Mailchimp for cold outreach violates their acceptable use policy.
            </p>
          </div>
        </div>
      )}

      {/* Account list */}
      {accounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Mail size={40} className="text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">No sender accounts yet</h3>
          <p className="text-sm text-slate-400 mb-6">Connect Gmail, SMTP, or SendGrid to start sending outreach.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
          >
            Add Your First Account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => {
            const badge = STATUS_BADGE[account.status] ?? STATUS_BADGE.disabled;
            const iconColor = PROVIDER_ICON_COLOR[account.provider] ?? 'text-slate-400';
            const providerMeta = PROVIDER_META[account.provider];
            const dailyMax = account.use_for_outreach ? limits.emailsPerDayPerInbox : 0;
            const dailySent = account.daily_sent_date === new Date().toISOString().slice(0, 10)
              ? account.daily_sent_today
              : 0;

            return (
              <div
                key={account.id}
                className={`bg-white rounded-2xl border p-5 transition-colors ${
                  account.is_default ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Provider icon */}
                    <div className={`w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 ${iconColor}`}>
                      <Mail size={20} />
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {account.display_name || account.from_email}
                        </p>
                        {account.is_default && (
                          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-black uppercase tracking-wider">Default</span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badge.className}`}>{badge.label}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-slate-400">{account.from_email}</span>
                        <span className="text-[10px] text-slate-300">{getProviderLabel(account.provider)}</span>
                        {!account.use_for_outreach && (
                          <span className="text-[9px] text-amber-500 font-bold uppercase">Marketing only</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats + Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Daily sent counter */}
                    {account.use_for_outreach && account.status === 'connected' && (
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-slate-400 font-bold">Today</p>
                        <p className={`text-sm font-bold ${dailySent >= dailyMax ? 'text-red-500' : 'text-slate-700'}`}>
                          {dailySent}/{dailyMax}
                        </p>
                      </div>
                    )}

                    {/* Health badge */}
                    {account.health_score !== null && account.health_score < 80 && (
                      <AlertTriangle size={16} className="text-amber-400" />
                    )}
                    {account.health_score !== null && account.health_score >= 80 && account.status === 'connected' && (
                      <CheckCircle size={16} className="text-emerald-400" />
                    )}

                    {/* Warm-up toggle */}
                    {account.use_for_outreach && currentPlan !== 'Starter' && (
                      <button
                        onClick={() => handleToggleWarmup(account.id, account.warmup_enabled)}
                        className="text-slate-400 hover:text-indigo-500 transition-colors"
                        title={account.warmup_enabled ? 'Disable warm-up' : 'Enable warm-up'}
                      >
                        {account.warmup_enabled ? <ToggleRight size={20} className="text-indigo-500" /> : <ToggleLeft size={20} />}
                      </button>
                    )}

                    {/* Reauth */}
                    {account.status === 'needs_reauth' && (
                      <button
                        onClick={() => handleReauth(account.id)}
                        className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Reconnect"
                      >
                        <RefreshCw size={16} />
                      </button>
                    )}

                    {/* Set default */}
                    {!account.is_default && account.use_for_outreach && account.status === 'connected' && (
                      <button
                        onClick={() => handleSetDefault(account.id)}
                        className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Set as default"
                      >
                        <Star size={16} />
                      </button>
                    )}

                    {/* Remove */}
                    <button
                      onClick={() => handleRemove(account.id)}
                      disabled={removing === account.id}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Sender Modal */}
      {showAddModal && (
        <AddSenderModal
          workspaceId={user.id}
          planName={currentPlan}
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
};

export default SenderAccountsPage;
