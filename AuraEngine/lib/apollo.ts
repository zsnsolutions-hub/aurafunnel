import { supabase } from './supabase';
import { ApolloContact, ApolloSearchParams } from '../types';

export interface ApolloSearchResult {
  people: ApolloContact[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
  search_log_id: string | null;
}

export interface ApolloImportResult {
  imported: number;
  skipped: number;
  failed: number;
  duplicates: { name: string; reason: string }[];
  imported_leads: { id: string; name: string; email: string; company: string; score: number }[];
}

export async function searchApollo(params: ApolloSearchParams): Promise<ApolloSearchResult> {
  const { data, error } = await supabase.functions.invoke('apollo-search', {
    body: params,
  });

  if (error) {
    // supabase-js v2 may put the response body inside error.context
    const msg = (error as any)?.context?.body
      ? await (error as any).context.json().catch(() => null)
      : null;
    throw new Error(msg?.error || error.message || 'Apollo search failed');
  }
  if (data?.error) throw new Error(data.error);
  return data as ApolloSearchResult;
}

export async function importApolloContacts(
  contacts: ApolloContact[],
  searchLogId: string | null
): Promise<ApolloImportResult> {
  const { data, error } = await supabase.functions.invoke('apollo-import', {
    body: { contacts, search_log_id: searchLogId },
  });

  if (error) {
    const msg = (error as any)?.context?.body
      ? await (error as any).context.json().catch(() => null)
      : null;
    throw new Error(msg?.error || error.message || 'Apollo import failed');
  }
  if (data?.error) throw new Error(data.error);
  return data as ApolloImportResult;
}
