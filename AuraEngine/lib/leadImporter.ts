import { supabase } from './supabase';
import { resolvePlanName, TIER_LIMITS } from './credits';

// ── Types ───────────────────────────────────────────────────────────────────

export type LeadField =
  | 'full_name' | 'first_name' | 'last_name'
  | 'primary_email' | 'primary_phone'
  | 'company' | 'linkedin_url' | 'title' | 'location'
  | 'source' | 'industry' | 'company_size' | 'insights';

export interface ColumnMapping {
  [csvHeader: string]: LeadField | `custom:${string}` | 'skip';
}

export type DedupeStrategy = 'merge' | 'overwrite' | 'skip';

export interface ImportOptions {
  dedupe_strategy: DedupeStrategy;
  plan_name: string;
}

export interface ImportResult {
  batch_id: string;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  skipped_rows: { row: number; reason: string; identifier?: string }[];
  plan_limit: number;
  contacts_before: number;
  contacts_after: number;
}

export interface ContactsCapacity {
  current: number;
  max: number;
  remaining: number;
}

// ── Auto-map rules ──────────────────────────────────────────────────────────

const AUTO_MAP_RULES: [RegExp, LeadField | `custom:${string}`][] = [
  // Name
  [/^(full[\s_-]?name|name|contact[\s_-]?name)$/i, 'full_name'],
  [/^(first[\s_-]?name|given[\s_-]?name|fname)$/i, 'first_name'],
  [/^(last[\s_-]?name|surname|family[\s_-]?name|lname)$/i, 'last_name'],

  // Email
  [/^(email|e[\s_-]?mail|email[\s_-]?address|work[\s_-]?email|primary[\s_-]?email)$/i, 'primary_email'],

  // Phone
  [/^(phone|phone[\s_-]?number|mobile|tel|telephone|work[\s_-]?phone|direct[\s_-]?phone|primary[\s_-]?phone)$/i, 'primary_phone'],

  // Company
  [/^(company|company[\s_-]?name|organization|org|employer|account[\s_-]?name|business)$/i, 'company'],

  // LinkedIn
  [/^(linkedin|linkedin[\s_-]?url|linkedin[\s_-]?profile|li[\s_-]?url|person[\s_-]?linkedin[\s_-]?url)$/i, 'linkedin_url'],

  // Title / Role
  [/^(title|job[\s_-]?title|role|position|designation)$/i, 'title'],

  // Location
  [/^(location|city|region|geography|address|country|state)$/i, 'location'],

  // Source
  [/^(source|lead[\s_-]?source|origin|channel)$/i, 'source'],

  // Industry
  [/^(industry|sector|vertical)$/i, 'industry'],

  // Company Size
  [/^(company[\s_-]?size|employees|employee[\s_-]?count|headcount|size|num[\s_-]?employees)$/i, 'company_size'],

  // Notes / Insights
  [/^(notes|insights|description|comments|remarks)$/i, 'insights'],
];

/** Auto-detect column mappings from CSV/XLSX headers. */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const trimmed = header.trim();
    if (!trimmed) continue;

    let matched = false;
    for (const [pattern, field] of AUTO_MAP_RULES) {
      if (pattern.test(trimmed) && !usedFields.has(field)) {
        mapping[trimmed] = field;
        usedFields.add(field);
        matched = true;
        break;
      }
    }

    if (!matched) {
      mapping[trimmed] = 'skip';
    }
  }

  return mapping;
}

// ── Capacity check ──────────────────────────────────────────────────────────

/** Check how many contacts the workspace can still add under their plan. */
export async function checkContactsCapacity(
  workspaceId: string,
  planName: string
): Promise<ContactsCapacity> {
  const resolved = resolvePlanName(planName);
  const max = TIER_LIMITS[resolved]?.contacts ?? TIER_LIMITS.Starter.contacts;

  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', workspaceId);

  if (error) throw new Error(error.message);
  const current = count ?? 0;
  return { current, max, remaining: Math.max(0, max - current) };
}

// ── Execute import ──────────────────────────────────────────────────────────

const CHUNK_SIZE = 500;

/** Execute a file import via the import_leads_batch RPC. Chunks large imports. */
export async function executeImport(
  workspaceId: string,
  mapping: ColumnMapping,
  rows: Record<string, string>[],
  options: ImportOptions,
  fileName: string,
  fileType: string
): Promise<ImportResult> {
  // For small imports, single RPC call
  if (rows.length <= CHUNK_SIZE) {
    const { data, error } = await supabase.rpc('import_leads_batch', {
      p_workspace_id: workspaceId,
      p_file_name: fileName,
      p_file_type: fileType,
      p_rows: rows,
      p_mapping: mapping,
      p_options: options,
    });

    if (error) throw new Error(error.message);
    return data as ImportResult;
  }

  // Chunk large imports
  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let allSkippedRows: ImportResult['skipped_rows'] = [];
  let lastResult: ImportResult | null = null;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

    const { data, error } = await supabase.rpc('import_leads_batch', {
      p_workspace_id: workspaceId,
      p_file_name: `${fileName} (chunk ${chunkNum})`,
      p_file_type: fileType,
      p_rows: chunk,
      p_mapping: mapping,
      p_options: options,
    });

    if (error) throw new Error(error.message);
    const result = data as ImportResult;

    totalImported += result.imported_count;
    totalUpdated += result.updated_count;
    totalSkipped += result.skipped_count;
    allSkippedRows = allSkippedRows.concat(
      result.skipped_rows.map(r => ({ ...r, row: r.row + i }))
    );
    lastResult = result;
  }

  return {
    batch_id: lastResult!.batch_id,
    imported_count: totalImported,
    updated_count: totalUpdated,
    skipped_count: totalSkipped,
    skipped_rows: allSkippedRows,
    plan_limit: lastResult!.plan_limit,
    contacts_before: lastResult!.contacts_before,
    contacts_after: lastResult!.contacts_after,
  };
}

/** All core fields the column mapper should show */
export const CORE_FIELDS: { value: LeadField; label: string }[] = [
  { value: 'full_name', label: 'Full Name' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'primary_email', label: 'Email' },
  { value: 'primary_phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'title', label: 'Job Title' },
  { value: 'location', label: 'Location' },
  { value: 'source', label: 'Source' },
  { value: 'industry', label: 'Industry' },
  { value: 'company_size', label: 'Company Size' },
  { value: 'insights', label: 'Notes / Insights' },
];
