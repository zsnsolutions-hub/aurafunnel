import { supabase } from './supabase';

// ── Types ──

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  owner_id: string;
  lead_id: string;
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  invoice_number: string | null;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  currency: string;
  subtotal_cents: number;
  total_cents: number;
  due_date: string | null;
  notes: string | null;
  stripe_hosted_url: string | null;
  stripe_pdf_url: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined lead fields
  lead_name?: string;
  lead_email?: string;
  line_items?: InvoiceLineItem[];
}

export interface CreateInvoiceLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

export interface CreateInvoiceParams {
  lead_id: string;
  line_items: CreateInvoiceLineItem[];
  due_date?: string;
  notes?: string;
}

// ── Package Types ──

export interface InvoicePackageItem {
  id: string;
  package_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
}

export interface InvoicePackage {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  items: InvoicePackageItem[];
}

// ── Queries (direct Supabase reads — RLS handles auth) ──

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, leads(name, email), invoice_line_items(*)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => ({
    ...row,
    lead_name: row.leads?.name ?? '',
    lead_email: row.leads?.email ?? '',
    line_items: row.invoice_line_items ?? [],
    leads: undefined,
    invoice_line_items: undefined,
  }));
}

export async function fetchLeadInvoices(leadId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, leads(name, email), invoice_line_items(*)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => ({
    ...row,
    lead_name: row.leads?.name ?? '',
    lead_email: row.leads?.email ?? '',
    line_items: row.invoice_line_items ?? [],
    leads: undefined,
    invoice_line_items: undefined,
  }));
}

// ── Mutations (via edge functions) ──

export async function createAndSendInvoice(
  params: CreateInvoiceParams
): Promise<{ invoice_id: string; hosted_url: string | null }> {
  const { data, error } = await supabase.functions.invoke('billing-create-invoice', {
    body: params,
  });

  if (error) {
    const msg = (error as any)?.context?.body
      ? await (error as any).context.json().catch(() => null)
      : null;
    throw new Error(msg?.error || error.message || 'Failed to create invoice');
  }
  if (data?.error) throw new Error(data.error);
  return { invoice_id: data.invoice_id, hosted_url: data.hosted_url ?? null };
}

export async function resendInvoice(invoiceId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('billing-actions', {
    body: { action: 'resend', invoice_id: invoiceId },
  });

  if (error) {
    const msg = (error as any)?.context?.body
      ? await (error as any).context.json().catch(() => null)
      : null;
    throw new Error(msg?.error || error.message || 'Failed to resend invoice');
  }
  if (data?.error) throw new Error(data.error);
}

export async function voidInvoice(invoiceId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('billing-actions', {
    body: { action: 'void', invoice_id: invoiceId },
  });

  if (error) {
    const msg = (error as any)?.context?.body
      ? await (error as any).context.json().catch(() => null)
      : null;
    throw new Error(msg?.error || error.message || 'Failed to void invoice');
  }
  if (data?.error) throw new Error(data.error);
}

// ── Package Queries (direct Supabase — no edge functions) ──

export async function fetchPackages(): Promise<InvoicePackage[]> {
  const { data, error } = await supabase
    .from('invoice_packages')
    .select('*, invoice_package_items(*)')
    .order('name');

  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => ({
    ...row,
    items: row.invoice_package_items ?? [],
    invoice_package_items: undefined,
  }));
}

export async function savePackage(pkg: {
  id?: string;
  name: string;
  description?: string;
  items: { description: string; quantity: number; unit_price_cents: number }[];
}): Promise<InvoicePackage> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const user = session.user;

  let packageId = pkg.id;

  if (packageId) {
    // Update existing package
    const { error } = await supabase
      .from('invoice_packages')
      .update({ name: pkg.name, description: pkg.description || null, updated_at: new Date().toISOString() })
      .eq('id', packageId);
    if (error) throw new Error(error.message);

    // Delete existing items and re-insert
    const { error: delErr } = await supabase
      .from('invoice_package_items')
      .delete()
      .eq('package_id', packageId);
    if (delErr) throw new Error(delErr.message);
  } else {
    // Insert new package
    const { data, error } = await supabase
      .from('invoice_packages')
      .insert({ owner_id: user.id, name: pkg.name, description: pkg.description || null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    packageId = data.id;
  }

  // Insert items
  if (pkg.items.length > 0) {
    const { error: itemsErr } = await supabase
      .from('invoice_package_items')
      .insert(
        pkg.items.map((item) => ({
          package_id: packageId,
          description: item.description,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
        }))
      );
    if (itemsErr) throw new Error(itemsErr.message);
  }

  // Re-fetch to return complete package
  const { data: result, error: fetchErr } = await supabase
    .from('invoice_packages')
    .select('*, invoice_package_items(*)')
    .eq('id', packageId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  return {
    ...result,
    items: result.invoice_package_items ?? [],
    invoice_package_items: undefined,
  } as InvoicePackage;
}

export async function deletePackage(packageId: string): Promise<void> {
  const { error } = await supabase
    .from('invoice_packages')
    .delete()
    .eq('id', packageId);
  if (error) throw new Error(error.message);
}
