// AuraEngine/lib/discovery.ts
//
// Roadmap 1.4 — lead discovery via People Data Labs. The `pdl-search` edge
// function holds the PDL key and returns normalized prospects; importing the
// selected ones goes through the SAME workspace-correct path as CSV import
// (executeImport → import_leads_batch RPC), so workspace_id / business_id /
// source / import_batch_id are all stamped correctly. Search is metered by the
// caller via consumeCredits('lead_discovery') before invoking.

import { supabase } from './supabase';
import { executeImport, type ColumnMapping, type ImportResult } from './leadImporter';

export interface DiscoveryParams {
  titles?: string[];
  keywords?: string;
  industries?: string[];
  locations?: string[];
  company_sizes?: string[];
  require_email?: boolean;
  size?: number;
}

export interface DiscoveredPerson {
  pdl_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  title: string;
  company: string;
  website: string;
  email: string;
  linkedin_url: string;
  location: string;
  industry: string;
  company_size: string;
  phone: string;
}

export interface DiscoveryResult {
  people: DiscoveredPerson[];
  total: number;
  /** True when PDL_API_KEY isn't configured — the UI shows a setup state. */
  notConfigured?: boolean;
}

/** PDL's controlled company-size buckets (job_company_size values). */
export const PDL_COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'] as const;

/**
 * Search for prospects. Returns `{ people, total }`, or `notConfigured: true`
 * when the PDL key isn't set. Throws on a real provider/network error so the UI
 * can surface it (and the caller should refund/skip the credit accordingly).
 */
export async function searchProspects(params: DiscoveryParams): Promise<DiscoveryResult> {
  const { data, error } = await supabase.functions.invoke('pdl-search', { body: params });
  if (error) throw new Error(error.message || 'Discovery request failed');
  if (data?.not_configured) return { people: [], total: 0, notConfigured: true };
  if (data?.error) throw new Error(data.error);
  return { people: (data?.people ?? []) as DiscoveredPerson[], total: (data?.total ?? 0) as number };
}

// Column headers we emit for the importer, each mapped to a canonical LeadField.
const IMPORT_MAPPING: ColumnMapping = {
  first_name: 'first_name',
  last_name: 'last_name',
  primary_email: 'primary_email',
  primary_phone: 'primary_phone',
  company: 'company',
  website: 'website',
  linkedin_url: 'linkedin_url',
  title: 'title',
  location: 'location',
  industry: 'industry',
  company_size: 'company_size',
  source: 'source',
};

/**
 * Import selected discovered prospects into the current workspace/business via
 * the import_leads_batch RPC. Skips duplicates (dedupe_strategy: 'skip').
 */
export async function importProspects(
  people: DiscoveredPerson[],
  opts: { workspaceId: string; businessId?: string; planName: string },
): Promise<ImportResult> {
  const rows = people.map((p) => ({
    first_name: p.first_name,
    last_name: p.last_name,
    primary_email: p.email,
    primary_phone: p.phone,
    company: p.company,
    website: p.website,
    linkedin_url: p.linkedin_url,
    title: p.title,
    location: p.location,
    industry: p.industry,
    company_size: p.company_size,
    source: 'discovery',
  }));

  return executeImport(
    opts.workspaceId,
    IMPORT_MAPPING,
    rows,
    { dedupe_strategy: 'skip', plan_name: opts.planName, business_id: opts.businessId },
    'Lead discovery (PDL)',
    'discovery',
  );
}
