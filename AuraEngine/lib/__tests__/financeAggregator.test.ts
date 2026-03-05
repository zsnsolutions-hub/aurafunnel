import { describe, it, expect } from 'vitest';
import { computeInvoiceKPIs } from '../financeAggregator';
import type { Invoice } from '../invoices';

function fakeInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'test',
    owner_id: 'owner',
    lead_id: 'lead',
    stripe_customer_id: null,
    stripe_invoice_id: null,
    invoice_number: null,
    status: 'open',
    currency: 'usd',
    subtotal_cents: 0,
    total_cents: 0,
    due_date: null,
    notes: null,
    stripe_hosted_url: null,
    stripe_pdf_url: null,
    paid_at: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeInvoiceKPIs', () => {
  it('returns zeros for empty array', () => {
    const kpis = computeInvoiceKPIs([]);
    expect(kpis).toEqual({
      totalOutstandingCents: 0,
      totalCollectedCents: 0,
      openCount: 0,
      paidCount: 0,
      paidThisMonthCents: 0,
      paidThisMonthCount: 0,
      overdueCount: 0,
      overdueCents: 0,
      totalCount: 0,
    });
  });

  it('sums open invoices as outstanding', () => {
    const invoices = [
      fakeInvoice({ status: 'open', total_cents: 1000 }),
      fakeInvoice({ status: 'open', total_cents: 2500 }),
    ];
    const kpis = computeInvoiceKPIs(invoices);
    expect(kpis.totalOutstandingCents).toBe(3500);
    expect(kpis.openCount).toBe(2);
  });

  it('sums paid invoices as collected', () => {
    const invoices = [
      fakeInvoice({ status: 'paid', total_cents: 5000 }),
      fakeInvoice({ status: 'paid', total_cents: 3000 }),
    ];
    const kpis = computeInvoiceKPIs(invoices);
    expect(kpis.totalCollectedCents).toBe(8000);
    expect(kpis.paidCount).toBe(2);
  });

  it('excludes draft, void, and uncollectible from KPIs', () => {
    const invoices = [
      fakeInvoice({ status: 'draft', total_cents: 1000 }),
      fakeInvoice({ status: 'void', total_cents: 2000 }),
      fakeInvoice({ status: 'uncollectible', total_cents: 3000 }),
    ];
    const kpis = computeInvoiceKPIs(invoices);
    expect(kpis.totalOutstandingCents).toBe(0);
    expect(kpis.totalCollectedCents).toBe(0);
    expect(kpis.openCount).toBe(0);
    expect(kpis.paidCount).toBe(0);
    expect(kpis.totalCount).toBe(3);
  });

  it('handles mixed statuses correctly', () => {
    const invoices = [
      fakeInvoice({ status: 'open', total_cents: 1000 }),
      fakeInvoice({ status: 'paid', total_cents: 2000 }),
      fakeInvoice({ status: 'void', total_cents: 500 }),
      fakeInvoice({ status: 'draft', total_cents: 750 }),
      fakeInvoice({ status: 'paid', total_cents: 3000 }),
    ];
    const kpis = computeInvoiceKPIs(invoices);
    expect(kpis.totalOutstandingCents).toBe(1000);
    expect(kpis.totalCollectedCents).toBe(5000);
    expect(kpis.openCount).toBe(1);
    expect(kpis.paidCount).toBe(2);
    expect(kpis.totalCount).toBe(5);
  });

  it('detects overdue invoices', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invoices = [
      fakeInvoice({ status: 'open', total_cents: 1000, due_date: pastDate }),
      fakeInvoice({ status: 'open', total_cents: 2000, due_date: futureDate }),
      fakeInvoice({ status: 'open', total_cents: 500, due_date: null }),
    ];
    const kpis = computeInvoiceKPIs(invoices);
    expect(kpis.overdueCount).toBe(1);
    expect(kpis.overdueCents).toBe(1000);
    expect(kpis.openCount).toBe(3);
  });

  it('counts paid this month', () => {
    const thisMonth = new Date().toISOString();
    const lastYear = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const invoices = [
      fakeInvoice({ status: 'paid', total_cents: 5000, paid_at: thisMonth }),
      fakeInvoice({ status: 'paid', total_cents: 3000, paid_at: lastYear }),
    ];
    const kpis = computeInvoiceKPIs(invoices);
    expect(kpis.paidThisMonthCount).toBe(1);
    expect(kpis.paidThisMonthCents).toBe(5000);
    expect(kpis.paidCount).toBe(2);
  });
});
