import React, { useState, useEffect, useRef } from 'react';
import { fetchLeadInvoices, resendInvoice, voidInvoice, sendInvoiceEmail, copyInvoiceLink, type Invoice } from '../../lib/invoices';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import { PlusIcon } from '../Icons';
import type { User } from '../../types';

interface LeadInvoicesTabProps {
  leadId: string;
  leadName: string;
  user: User;
  onCreateInvoice: () => void;
}

const formatCents = (cents: number, currency = 'usd'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
};

const LeadInvoicesTab: React.FC<LeadInvoicesTabProps> = ({ leadId, leadName, user, onCreateInvoice }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchLeadInvoices(leadId);
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [leadId]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const handleResend = async (inv: Invoice) => {
    setOpenMenuId(null);
    if (!confirm(`Resend invoice ${inv.invoice_number || inv.id.slice(0, 8)} to ${leadName} via Stripe?`)) return;
    try {
      setActionLoading(inv.id);
      await resendInvoice(inv.id);
      setToast({ type: 'success', message: `Invoice sent via Stripe` });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: (err as Error).message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoid = async (inv: Invoice) => {
    setOpenMenuId(null);
    if (!confirm(`Void invoice ${inv.invoice_number || inv.id.slice(0, 8)}? This cannot be undone.`)) return;
    try {
      setActionLoading(inv.id);
      await voidInvoice(inv.id);
      await load();
    } catch (err) {
      setToast({ type: 'error', message: (err as Error).message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendCrm = async (inv: Invoice) => {
    setOpenMenuId(null);
    try {
      setActionLoading(inv.id);
      const result = await sendInvoiceEmail(inv.id, user);
      if (result.success) {
        setToast({ type: 'success', message: `Invoice sent via CRM email` });
        await load();
      } else {
        setToast({ type: 'error', message: result.error || 'Failed to send' });
      }
    } catch (err) {
      setToast({ type: 'error', message: (err as Error).message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyLink = async (inv: Invoice) => {
    setOpenMenuId(null);
    if (!inv.stripe_hosted_url) return;
    try {
      await copyInvoiceLink(inv.stripe_hosted_url);
      setToast({ type: 'success', message: 'Payment link copied!' });
    } catch {
      setToast({ type: 'error', message: 'Failed to copy link' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-600">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
        <button
          onClick={onCreateInvoice}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>Create Invoice</span>
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 border-dashed text-center">
          <svg className="w-8 h-8 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sm font-bold text-slate-600 mb-1">No invoices yet</p>
          <p className="text-xs text-slate-400">Create an invoice to bill {leadName}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-slate-800">
                    {inv.invoice_number || `INV-${inv.id.slice(0, 8)}`}
                  </span>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
                <span className="text-sm font-bold text-slate-800">
                  {formatCents(inv.total_cents, inv.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {inv.due_date ? `Due ${new Date(inv.due_date).toLocaleDateString()}` : 'No due date'}
                  {' · '}
                  {new Date(inv.created_at).toLocaleDateString()}
                </span>
                <div className="relative" ref={openMenuId === inv.id ? menuRef : undefined}>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === inv.id ? null : inv.id)}
                    disabled={actionLoading === inv.id}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === inv.id ? (
                      <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    )}
                  </button>
                  {openMenuId === inv.id && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                      {inv.status === 'open' && (
                        <>
                          <button
                            onClick={() => handleSendCrm(inv)}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            Send (CRM)
                          </button>
                          <button
                            onClick={() => handleResend(inv)}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            Send via Stripe
                          </button>
                        </>
                      )}
                      {inv.stripe_hosted_url && (
                        <>
                          <button
                            onClick={() => handleCopyLink(inv)}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            Copy Link
                          </button>
                          <a
                            href={inv.stripe_hosted_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                            onClick={() => setOpenMenuId(null)}
                          >
                            View
                          </a>
                        </>
                      )}
                      {inv.status === 'open' && (
                        <button
                          onClick={() => handleVoid(inv)}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Void
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default LeadInvoicesTab;
