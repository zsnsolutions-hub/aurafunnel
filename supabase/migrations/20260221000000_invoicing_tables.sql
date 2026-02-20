-- ============================================================
-- Invoices table: Stripe-backed invoices sent to leads
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id            UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_invoice_id  TEXT,
  invoice_number     TEXT,
  status             TEXT DEFAULT 'draft' CHECK (status IN ('draft','open','paid','void','uncollectible')),
  currency           TEXT DEFAULT 'usd',
  subtotal_cents     INTEGER DEFAULT 0,
  total_cents        INTEGER DEFAULT 0,
  due_date           DATE,
  notes              TEXT,
  stripe_hosted_url  TEXT,
  stripe_pdf_url     TEXT,
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoices_owner ON invoices(owner_id);
CREATE INDEX idx_invoices_lead ON invoices(lead_id);
CREATE INDEX idx_invoices_stripe_invoice ON invoices(stripe_invoice_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  USING (owner_id = auth.uid());

-- ============================================================
-- Invoice line items table
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description      TEXT NOT NULL,
  quantity         INTEGER DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  amount_cents     INTEGER NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoice line items"
  ON invoice_line_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_line_items.invoice_id AND invoices.owner_id = auth.uid()));

CREATE POLICY "Users can insert own invoice line items"
  ON invoice_line_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_line_items.invoice_id AND invoices.owner_id = auth.uid()));
