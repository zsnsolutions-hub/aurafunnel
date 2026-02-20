-- ============================================================
-- Invoice Packages: reusable bundles of line items
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_packages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoice_packages_owner ON invoice_packages(owner_id);

ALTER TABLE invoice_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own packages"
  ON invoice_packages FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own packages"
  ON invoice_packages FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own packages"
  ON invoice_packages FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own packages"
  ON invoice_packages FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================
-- Invoice Package Items: line items belonging to a package
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_package_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id       UUID NOT NULL REFERENCES invoice_packages(id) ON DELETE CASCADE,
  description      TEXT NOT NULL,
  quantity         INTEGER DEFAULT 1,
  unit_price_cents INTEGER NOT NULL
);

CREATE INDEX idx_invoice_package_items_package ON invoice_package_items(package_id);

ALTER TABLE invoice_package_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own package items"
  ON invoice_package_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM invoice_packages WHERE invoice_packages.id = invoice_package_items.package_id AND invoice_packages.owner_id = auth.uid()));

CREATE POLICY "Users can insert own package items"
  ON invoice_package_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM invoice_packages WHERE invoice_packages.id = invoice_package_items.package_id AND invoice_packages.owner_id = auth.uid()));

CREATE POLICY "Users can update own package items"
  ON invoice_package_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM invoice_packages WHERE invoice_packages.id = invoice_package_items.package_id AND invoice_packages.owner_id = auth.uid()));

CREATE POLICY "Users can delete own package items"
  ON invoice_package_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM invoice_packages WHERE invoice_packages.id = invoice_package_items.package_id AND invoice_packages.owner_id = auth.uid()));
