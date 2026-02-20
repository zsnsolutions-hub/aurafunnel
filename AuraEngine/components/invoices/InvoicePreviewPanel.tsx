import React from 'react';
import InvoiceStatusBadge from './InvoiceStatusBadge';

interface LineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

interface InvoicePreviewPanelProps {
  recipientName: string;
  recipientEmail: string;
  businessName?: string;
  businessEmail?: string;
  invoiceNumber?: string | null;
  lineItems: LineItem[];
  subtotalCents: number;
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
  status?: string;
  paidAt?: string | null;
  stripeHostedUrl?: string | null;
  stripePdfUrl?: string | null;
  createdAt?: string | null;
  compact?: boolean;
}

const formatCents = (cents: number, currency = 'USD'): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);

const InvoicePreviewPanel: React.FC<InvoicePreviewPanelProps> = ({
  recipientName,
  recipientEmail,
  businessName,
  businessEmail,
  invoiceNumber,
  lineItems,
  subtotalCents,
  currency = 'USD',
  dueDate,
  notes,
  status,
  paidAt,
  stripeHostedUrl,
  stripePdfUrl,
  createdAt,
  compact = false,
}) => {
  const padding = compact ? 'p-4' : 'p-6';

  return (
    <div className={`${padding} bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-5 shadow-inner`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {businessName && (
            <p className="text-sm font-bold text-slate-800">{businessName}</p>
          )}
          {businessEmail && (
            <p className="text-xs text-slate-400">{businessEmail}</p>
          )}
          <p className={`${compact ? 'text-base' : 'text-lg'} font-bold text-slate-800 ${businessName ? 'mt-2' : ''}`}>
            {invoiceNumber || 'DRAFT'}
          </p>
          {createdAt && (
            <p className="text-xs text-slate-400 mt-0.5">
              Issued {new Date(createdAt).toLocaleDateString()}
            </p>
          )}
          {dueDate && (
            <p className="text-xs text-slate-400">
              Due {new Date(dueDate).toLocaleDateString()}
            </p>
          )}
          {paidAt && (
            <p className="text-xs text-emerald-600 font-medium">
              Paid {new Date(paidAt).toLocaleDateString()}
            </p>
          )}
        </div>
        {status && <InvoiceStatusBadge status={status} />}
      </div>

      {/* Bill To */}
      <div className="bg-white rounded-xl p-3 border border-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bill To</p>
        <p className="text-sm font-bold text-slate-800">{recipientName}</p>
        <p className="text-xs text-slate-500">{recipientEmail}</p>
      </div>

      {/* Line Items Table */}
      {lineItems.length > 0 ? (
        <div className="border border-slate-100 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</th>
                <th className="text-center px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-16">Qty</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Price</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-700">{item.description}</td>
                  <td className="px-3 py-2 text-center text-slate-500">{item.quantity}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{formatCents(item.unit_price_cents, currency)}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">{formatCents(item.quantity * item.unit_price_cents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t-2 border-slate-200 px-3 py-2.5 flex items-center justify-between bg-slate-100">
            <span className="text-sm font-bold text-slate-600">Total</span>
            <span className="text-sm font-bold text-slate-800">{formatCents(subtotalCents, currency)}</span>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-white rounded-xl border border-slate-100 text-center">
          <p className="text-xs text-slate-400">No line items</p>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className="bg-white rounded-lg p-3 border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap">{notes}</p>
        </div>
      )}

      {/* Quick links for existing invoices */}
      {(stripeHostedUrl || stripePdfUrl) && (
        <div className="flex items-center space-x-3 pt-1">
          {stripeHostedUrl && (
            <a
              href={stripeHostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              View on Stripe
            </a>
          )}
          {stripePdfUrl && (
            <a
              href={stripePdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Download PDF
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default InvoicePreviewPanel;
