import type { Invoice } from './invoices';

export interface InvoiceKPIs {
  totalOutstandingCents: number;
  totalCollectedCents: number;
  openCount: number;
  paidCount: number;
  paidThisMonthCents: number;
  paidThisMonthCount: number;
  overdueCount: number;
  overdueCents: number;
  totalCount: number;
}

/**
 * Single-pass KPI computation over an invoice array.
 * Outstanding = sum(total_cents) where status === 'open'.
 * Collected   = sum(total_cents) where status === 'paid'.
 * Overdue     = open invoices past due_date.
 * Paid This Month = paid invoices where paid_at is in the current calendar month.
 * Draft, void, and uncollectible are excluded from both.
 */
export function computeInvoiceKPIs(invoices: Invoice[]): InvoiceKPIs {
  let totalOutstandingCents = 0;
  let totalCollectedCents = 0;
  let openCount = 0;
  let paidCount = 0;
  let paidThisMonthCents = 0;
  let paidThisMonthCount = 0;
  let overdueCount = 0;
  let overdueCents = 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const inv of invoices) {
    if (inv.status === 'open') {
      totalOutstandingCents += inv.total_cents;
      openCount++;
      if (inv.due_date && new Date(inv.due_date) < now) {
        overdueCount++;
        overdueCents += inv.total_cents;
      }
    } else if (inv.status === 'paid') {
      totalCollectedCents += inv.total_cents;
      paidCount++;
      if (inv.paid_at && new Date(inv.paid_at) >= monthStart) {
        paidThisMonthCents += inv.total_cents;
        paidThisMonthCount++;
      }
    }
  }

  return {
    totalOutstandingCents,
    totalCollectedCents,
    openCount,
    paidCount,
    paidThisMonthCents,
    paidThisMonthCount,
    overdueCount,
    overdueCents,
    totalCount: invoices.length,
  };
}
