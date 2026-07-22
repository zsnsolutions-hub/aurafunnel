// AuraEngine/lib/leads.ts
//
// Shared lead mutation helpers. Lead-list *reads* live in lib/queries.ts; lead
// status *writes* were historically inlined at ~4 call sites (LeadManagement,
// LeadProfile, LeadActionsModal, ClientDashboard). This is the canonical write
// seam — the lead analogue of lib/deals.ts setDealStage — so the kanban
// drag-and-drop and the "advance stage" buttons share one path.

import { supabase } from './supabase';
import type { Lead } from '../types';

export type LeadStatus = Lead['status'];

/** The 5 pipeline statuses, in flow order (matches the leads_status_check constraint). */
export const LEAD_STATUSES: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];

/**
 * Move a lead to a pipeline status and stamp last_activity. Returns the error
 * message (null on success) so callers keep their own optimistic UI + rollback.
 * `at` lets the caller reuse the exact timestamp it applied optimistically so the
 * on-screen value and the persisted value never drift.
 */
export async function setLeadStatus(
  leadId: string,
  status: LeadStatus,
  at: string = new Date().toISOString(),
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('leads').update({ status, last_activity: at }).eq('id', leadId);
  if (error) console.error('setLeadStatus failed:', error.message);
  return { error: error?.message ?? null };
}
