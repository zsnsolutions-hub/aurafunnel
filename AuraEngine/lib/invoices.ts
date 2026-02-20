import { supabase } from './supabase';
import { buildEmailCtaButtonHTML } from './emailCtaButton';
import { fetchConnectedEmailProvider, sendTrackedEmail } from './emailTracking';
import type { SendEmailResult } from './emailTracking';
import type { User } from '../types';

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

// ── CRM Invoice Email ──

export function buildInvoiceEmailHtml(params: {
  leadName: string;
  invoiceNumber: string;
  totalFormatted: string;
  dueDate: string | null;
  hostedUrl: string;
  businessName?: string;
  lineItems?: { description: string; quantity: number; unit_price_cents: number; amount_cents: number }[];
  currency?: string;
  notes?: string;
}): string {
  const firstName = params.leadName.split(' ')[0] || params.leadName;
  const from = params.businessName || 'us';
  const dueDateDisplay = params.dueDate
    ? new Date(params.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Upon receipt';
  const cur = (params.currency || 'usd').toUpperCase();
  const fmtCents = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(c / 100);

  const ctaHtml = buildEmailCtaButtonHTML({
    text: 'View & Pay Invoice',
    url: params.hostedUrl,
    variant: 'primary',
    align: 'center',
  });

  // Build line items rows
  let lineItemsHtml = '';
  if (params.lineItems && params.lineItems.length > 0) {
    const rows = params.lineItems.map((item) =>
      `<tr><td style="padding:8px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;">${item.description}</td><td style="padding:8px 16px;font-size:13px;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;">${item.quantity}</td><td style="padding:8px 16px;font-size:13px;font-weight:600;color:#1e293b;text-align:right;border-bottom:1px solid #e2e8f0;">${fmtCents(item.amount_cents)}</td></tr>`
    ).join('');

    lineItemsHtml = [
      '<tr><td style="padding:16px 32px 0 32px;">',
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">',
      '<tr><td style="padding:8px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Description</td><td style="padding:8px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;text-align:center;border-bottom:1px solid #e2e8f0;">Qty</td><td style="padding:8px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;text-align:right;border-bottom:1px solid #e2e8f0;">Amount</td></tr>',
      rows,
      '</table>',
      '</td></tr>',
    ].join('');
  }

  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:#f8fafc;font-family:sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f8fafc;">',
    '<tr><td align="center" style="padding:32px 16px;">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">',
    // Header
    '<tr><td style="padding:32px 32px 16px 32px;">',
    `<p style="margin:0 0 8px;font-size:16px;color:#1e293b;">Hi ${firstName},</p>`,
    `<p style="margin:0;font-size:15px;color:#475569;">Here's your invoice from ${from}.</p>`,
    '</td></tr>',
    // Summary table
    '<tr><td style="padding:0 32px;">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">',
    `<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Invoice #</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1e293b;text-align:right;border-bottom:1px solid #e2e8f0;">${params.invoiceNumber}</td></tr>`,
    `<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Amount</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1e293b;text-align:right;border-bottom:1px solid #e2e8f0;">${params.totalFormatted}</td></tr>`,
    `<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;">Due Date</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1e293b;text-align:right;">${dueDateDisplay}</td></tr>`,
    '</table>',
    '</td></tr>',
    // Line items
    lineItemsHtml,
    // Notes
    params.notes ? `<tr><td style="padding:16px 32px 0 32px;"><div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:12px 16px;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Package Details</p><p style="margin:0;font-size:13px;color:#1e293b;white-space:pre-wrap;">${params.notes}</p></div></td></tr>` : '',
    // CTA button
    '<tr><td style="padding:8px 32px 0 32px;">',
    ctaHtml,
    '</td></tr>',
    // Fallback link
    '<tr><td style="padding:0 32px 32px 32px;">',
    `<p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">Or copy this link: <a href="${params.hostedUrl}" style="color:#4F46E5;word-break:break-all;">${params.hostedUrl}</a></p>`,
    '</td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');
}

export interface PrepareInvoiceSendResult {
  invoice_number: string;
  total_cents: number;
  currency: string;
  due_date: string | null;
  lead_email: string;
  lead_name: string;
  hosted_url: string | null;
  lead_id: string;
}

export async function prepareInvoiceSend(invoiceId: string): Promise<PrepareInvoiceSendResult> {
  const { data, error } = await supabase.functions.invoke('billing-actions', {
    body: { action: 'send_email', invoice_id: invoiceId },
  });

  if (error) {
    const msg = (error as any)?.context?.body
      ? await (error as any).context.json().catch(() => null)
      : null;
    throw new Error(msg?.error || error.message || 'Failed to prepare invoice send');
  }
  if (data?.error) throw new Error(data.error);
  return {
    invoice_number: data.invoice_number,
    total_cents: data.total_cents,
    currency: data.currency,
    due_date: data.due_date,
    lead_email: data.lead_email,
    lead_name: data.lead_name,
    hosted_url: data.hosted_url,
    lead_id: data.lead_id,
  };
}

export async function sendInvoiceEmail(invoiceId: string, user: User): Promise<SendEmailResult> {
  const invoiceData = await prepareInvoiceSend(invoiceId);

  if (!invoiceData.hosted_url) {
    return { success: false, error: 'Invoice has no payment link available' };
  }

  const provider = await fetchConnectedEmailProvider();
  if (!provider) {
    return { success: false, error: 'No email provider connected. Configure one in Settings.' };
  }

  // Fetch line items and notes for the email
  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('description, quantity, unit_price_cents, amount_cents')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true });

  const { data: invoiceRow } = await supabase
    .from('invoices')
    .select('notes')
    .eq('id', invoiceId)
    .single();

  const totalFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (invoiceData.currency || 'usd').toUpperCase(),
  }).format(invoiceData.total_cents / 100);

  const businessName = user.businessProfile?.companyName || user.name;

  const htmlBody = buildInvoiceEmailHtml({
    leadName: invoiceData.lead_name,
    invoiceNumber: invoiceData.invoice_number,
    totalFormatted,
    dueDate: invoiceData.due_date,
    hostedUrl: invoiceData.hosted_url,
    businessName,
    lineItems: lineItems || [],
    currency: invoiceData.currency,
    notes: invoiceRow?.notes || undefined,
  });

  const subject = `Invoice #${invoiceData.invoice_number} from ${businessName}`;

  return sendTrackedEmail({
    leadId: invoiceData.lead_id,
    toEmail: invoiceData.lead_email,
    subject,
    htmlBody,
    provider: provider.provider as any,
    trackOpens: true,
    trackClicks: true,
  });
}

export async function copyInvoiceLink(url: string): Promise<void> {
  await navigator.clipboard.writeText(url);
}
