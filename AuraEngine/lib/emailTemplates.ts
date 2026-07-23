// AuraEngine/lib/emailTemplates.ts
//
// Roadmap 3.3 — reusable email templates. The email_templates table + 6 seeded
// system defaults already existed but had zero app usage; this is the CRUD layer.
// Templates hold {{merge}} tokens (see lib/campaigns MERGE_FIELDS) resolved at
// preview/send time. RLS scopes access (own + system defaults).

import { supabase } from './supabase';
import { resolveWorkspaceId } from './tenancy';
import { activeBusinessId } from './businessScope';

export type TemplateCategory = 'welcome' | 'follow_up' | 'case_study' | 'demo_invite' | 'nurture' | 'custom';

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ['welcome', 'follow_up', 'case_study', 'demo_invite', 'nurture', 'custom'];

export interface EmailTemplate {
  id: string;
  owner_id: string | null; // null = system default (read-only)
  name: string;
  category: TemplateCategory;
  subject_template: string;
  body_template: string;
  is_default: boolean;
  created_at: string;
}

const COLS = 'id,owner_id,name,category,subject_template,body_template,is_default,created_at';

/** All templates the user can see (own + system defaults), defaults first. */
export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select(COLS)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });
  if (error) { console.error('listEmailTemplates failed:', error.message); return []; }
  return (data ?? []) as EmailTemplate[];
}

export async function createEmailTemplate(input: {
  name: string;
  category: TemplateCategory;
  subject: string;
  body: string;
}): Promise<EmailTemplate | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const workspaceId = await resolveWorkspaceId(user.id);
  const { data, error } = await supabase
    .from('email_templates')
    .insert({
      owner_id: user.id,
      workspace_id: workspaceId,
      business_id: activeBusinessId(),
      name: input.name.trim() || 'Untitled template',
      category: input.category,
      subject_template: input.subject,
      body_template: input.body,
      is_default: false,
    })
    .select(COLS)
    .single();
  if (error || !data) { console.error('createEmailTemplate failed:', error?.message); return null; }
  return data as EmailTemplate;
}

export async function updateEmailTemplate(
  id: string,
  patch: Partial<Pick<EmailTemplate, 'name' | 'category' | 'subject_template' | 'body_template'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('email_templates')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('updateEmailTemplate failed:', error.message);
  return !error;
}

/** Delete an OWN template (RLS blocks deleting system defaults). */
export async function deleteEmailTemplate(id: string): Promise<boolean> {
  const { error } = await supabase.from('email_templates').delete().eq('id', id);
  if (error) console.error('deleteEmailTemplate failed:', error.message);
  return !error;
}
