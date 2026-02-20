import React, { useState, useEffect, useRef } from 'react';
import { Drawer } from '../ui/Drawer';
import { supabase } from '../../lib/supabase';
import { createAndSendInvoice, sendInvoiceEmail, resendInvoice, copyInvoiceLink, fetchPackages, type CreateInvoiceLineItem, type InvoicePackage } from '../../lib/invoices';
import InvoicePreviewPanel from './InvoicePreviewPanel';
import { PlusIcon, XIcon, ChevronDownIcon, EyeIcon, ArrowLeftIcon } from '../Icons';
import type { User } from '../../types';

interface CreateInvoiceDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedLeadId?: string;
  user: User;
}

interface LeadOption {
  id: string;
  name: string;
  email: string;
}

const emptyLineItem = (): CreateInvoiceLineItem & { _key: string } => ({
  _key: crypto.randomUUID(),
  description: '',
  quantity: 1,
  unit_price_cents: 0,
});

const CreateInvoiceDrawer: React.FC<CreateInvoiceDrawerProps> = ({
  open,
  onClose,
  onSuccess,
  preselectedLeadId,
  user,
}) => {
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState(preselectedLeadId || '');
  const [lineItems, setLineItems] = useState<(CreateInvoiceLineItem & { _key: string })[]>([emptyLineItem()]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [packages, setPackages] = useState<InvoicePackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState('');

  // Phase: form → preview → sent
  const [phase, setPhase] = useState<'form' | 'preview' | 'sent'>('form');

  // Post-creation state
  const [createdInvoice, setCreatedInvoice] = useState<{ id: string; hosted_url: string | null } | null>(null);
  const [sendingCrm, setSendingCrm] = useState(false);
  const [sendDropdownOpen, setSendDropdownOpen] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load leads and packages for selectors
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, name, email')
        .order('name', { ascending: true })
        .limit(500);
      setLeads((data || []).filter((l: any) => l.email));
    })();
    fetchPackages().then(setPackages).catch(() => {});
  }, [open]);

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      setSelectedLeadId(preselectedLeadId || '');
      setLineItems([emptyLineItem()]);
      setDueDate('');
      setNotes('');
      setError('');
      setLeadSearch('');
      setSelectedPackageId('');
      setCreatedInvoice(null);
      setSendFeedback(null);
      setPhase('form');
    }
  }, [open, preselectedLeadId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!sendDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSendDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sendDropdownOpen]);

  const filteredLeads = leadSearch
    ? leads.filter(
        (l) =>
          l.name.toLowerCase().includes(leadSearch.toLowerCase()) ||
          l.email.toLowerCase().includes(leadSearch.toLowerCase())
      )
    : leads;

  const selectedLead = leads.find((l) => l.id === selectedLeadId);

  const updateLineItem = (index: number, field: string, value: any) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  };

  const handlePackageSelect = (packageId: string) => {
    setSelectedPackageId(packageId);
    if (!packageId) return;
    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) return;
    setLineItems(
      pkg.items.map((item) => ({
        _key: crypto.randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
      }))
    );
  };

  const subtotalCents = lineItems.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unit_price_cents || 0),
    0
  );

  const formatDollars = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  const handlePreview = () => {
    setError('');

    if (!selectedLeadId) {
      setError('Please select a lead.');
      return;
    }

    const validItems = lineItems.filter(
      (item) => item.description.trim() && item.unit_price_cents > 0
    );
    if (validItems.length === 0) {
      setError('Add at least one line item with a description and price.');
      return;
    }

    setPhase('preview');
  };

  const handleSubmit = async () => {
    setError('');

    const validItems = lineItems.filter(
      (item) => item.description.trim() && item.unit_price_cents > 0
    );

    try {
      setSending(true);
      const result = await createAndSendInvoice({
        lead_id: selectedLeadId,
        line_items: validItems.map(({ description, quantity, unit_price_cents }) => ({
          description,
          quantity,
          unit_price_cents,
        })),
        due_date: dueDate || undefined,
        notes: notes || undefined,
      });
      setCreatedInvoice({ id: result.invoice_id, hosted_url: result.hosted_url });
      setPhase('sent');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleSendCrm = async () => {
    if (!createdInvoice) return;
    try {
      setSendingCrm(true);
      setSendFeedback(null);
      const result = await sendInvoiceEmail(createdInvoice.id, user);
      if (result.success) {
        setSendFeedback({ type: 'success', message: 'Invoice sent via CRM email!' });
      } else {
        setSendFeedback({ type: 'error', message: result.error || 'Failed to send email' });
      }
    } catch (err) {
      setSendFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSendingCrm(false);
    }
  };

  const handleSendStripe = async () => {
    if (!createdInvoice) return;
    setSendDropdownOpen(false);
    try {
      setSendingCrm(true);
      setSendFeedback(null);
      await resendInvoice(createdInvoice.id);
      setSendFeedback({ type: 'success', message: 'Invoice sent via Stripe!' });
    } catch (err) {
      setSendFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSendingCrm(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdInvoice?.hosted_url) return;
    setSendDropdownOpen(false);
    try {
      await copyInvoiceLink(createdInvoice.hosted_url);
      setSendFeedback({ type: 'success', message: 'Payment link copied!' });
    } catch {
      setSendFeedback({ type: 'error', message: 'Failed to copy link' });
    }
  };

  const handleDone = () => {
    onSuccess();
    onClose();
  };

  return (
    <Drawer open={open} onClose={onClose} title="Create Invoice" width="w-[640px]">
      <div className="space-y-6">
        {phase === 'sent' && createdInvoice ? (
          /* ── Post-creation: send options ── */
          <div className="space-y-5">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-sm font-bold text-emerald-800">Invoice created successfully!</p>
              <p className="text-xs text-emerald-600 mt-1">Choose how to send it to your client.</p>
            </div>

            {/* Send feedback */}
            {sendFeedback && (
              <div className={`p-3 rounded-lg text-sm font-medium ${
                sendFeedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {sendFeedback.message}
              </div>
            )}

            {/* Split button */}
            <div className="flex items-stretch" ref={dropdownRef}>
              <button
                onClick={handleSendCrm}
                disabled={sendingCrm}
                className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-l-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {sendingCrm ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send Invoice</span>
                )}
              </button>
              <div className="relative">
                <button
                  onClick={() => setSendDropdownOpen(!sendDropdownOpen)}
                  disabled={sendingCrm}
                  className="h-full px-3 bg-indigo-700 text-white rounded-r-xl hover:bg-indigo-800 transition-colors disabled:opacity-50 border-l border-indigo-500"
                >
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
                {sendDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                    <button
                      onClick={handleSendStripe}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Send via Stripe
                    </button>
                    {createdInvoice.hosted_url && (
                      <button
                        onClick={handleCopyLink}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Copy Payment Link
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleDone}
              className="w-full py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
            >
              Done
            </button>
          </div>
        ) : phase === 'preview' ? (
          /* ── Preview phase ── */
          <div className="space-y-5">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-2">
              <EyeIcon className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">Invoice Preview</p>
                <p className="text-xs text-amber-600">Review before sending. This is how your invoice will look.</p>
              </div>
            </div>

            <InvoicePreviewPanel
              recipientName={selectedLead?.name || ''}
              recipientEmail={selectedLead?.email || ''}
              invoiceNumber={null}
              lineItems={lineItems.filter((item) => item.description.trim() && item.unit_price_cents > 0)}
              subtotalCents={subtotalCents}
              dueDate={dueDate || null}
              notes={notes || null}
            />

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
                {error}
              </div>
            )}

            <div className="flex items-center space-x-3">
              <button
                onClick={() => { setPhase('form'); setError(''); }}
                className="flex-1 py-3 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center space-x-2"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span>Edit</span>
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending}
                className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating Invoice...</span>
                  </>
                ) : (
                  <span>Create & Send</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ── Invoice creation form ── */
          <>
            {/* Lead Selector */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Recipient</label>
              {selectedLead ? (
                <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{selectedLead.name}</p>
                    <p className="text-xs text-slate-500">{selectedLead.email}</p>
                  </div>
                  {!preselectedLeadId && (
                    <button
                      onClick={() => setSelectedLeadId('')}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Search leads by name or email..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  />
                  {filteredLeads.length > 0 && (
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {filteredLeads.slice(0, 20).map((lead) => (
                        <button
                          key={lead.id}
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setLeadSearch('');
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors"
                        >
                          <p className="text-sm font-semibold text-slate-700">{lead.name}</p>
                          <p className="text-xs text-slate-400">{lead.email}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Package Selector */}
            {packages.length > 0 && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Package</label>
                <select
                  value={selectedPackageId}
                  onChange={(e) => handlePackageSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white"
                >
                  <option value="">Add items manually</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                        pkg.items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0) / 100
                      )})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedPackageId
                    ? 'Items loaded from package — you can still edit them below.'
                    : 'Select a package to auto-fill line items, or add them manually.'}
                </p>
              </div>
            )}

            {/* Line Items */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Line Items</label>
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={item._key} className="flex items-start space-x-2">
                    <div className="flex-grow">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                        placeholder="Description"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                      />
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        placeholder="Qty"
                        className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                      />
                    </div>
                    <div className="w-28">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unit_price_cents ? (item.unit_price_cents / 100).toFixed(2) : ''}
                          onChange={(e) =>
                            updateLineItem(index, 'unit_price_cents', Math.round(parseFloat(e.target.value || '0') * 100))
                          }
                          placeholder="0.00"
                          className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => removeLineItem(index)}
                      disabled={lineItems.length <= 1}
                      className="p-2 text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addLineItem}
                className="mt-2 flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>Add line item</span>
              </button>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional note to include on the invoice..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
            </div>

            {/* Summary */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-600">Subtotal</span>
                <span className="text-lg font-bold text-slate-800">{formatDollars(subtotalCents)}</span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
                {error}
              </div>
            )}

            {/* Preview Button */}
            <button
              onClick={handlePreview}
              className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2"
            >
              <EyeIcon className="w-4 h-4" />
              <span>Preview Invoice</span>
            </button>
          </>
        )}
      </div>
    </Drawer>
  );
};

export default CreateInvoiceDrawer;
