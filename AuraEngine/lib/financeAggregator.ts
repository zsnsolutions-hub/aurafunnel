import type { Invoice } from './invoices';

export interface InvoiceKPIs {
  totalOutstandingCents: number;
  totalCollectedCents: number;
  openCount: number;
  paidCount: number;
  totalCount: number;
}

/**
 * Single-pass KPI computation over an invoice array.
 * Outstanding = sum(total_cents) where status === 'open'.
 * Collected   = sum(total_cents) where status === 'paid'.
 * Draft, void, and uncollectible are excluded from both.
 */
export function computeInvoiceKPIs(invoices: Invoice[]): InvoiceKPIs {
  let totalOutstandingCents = 0;
  let totalCollectedCents = 0;
  let openCount = 0;
  let paidCount = 0;

  for (const inv of invoices) {
    if (inv.status === 'open') {
      totalOutstandingCents += inv.total_cents;
      openCount++;
    } else if (inv.status === 'paid') {
      totalCollectedCents += inv.total_cents;
      paidCount++;
    }
  }

  return {
    totalOutstandingCents,
    totalCollectedCents,
    openCount,
    paidCount,
    totalCount: invoices.length,
  };
}
