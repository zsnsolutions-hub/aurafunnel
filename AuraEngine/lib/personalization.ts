import type { Lead, BusinessProfile } from '../types';

/**
 * Resolve all {{tag}} placeholders in text using lead data, knowledge base, and business profile.
 * Unreplaced tags with missing data are stripped (replaced with empty string).
 */
export function resolvePersonalizationTags(
  text: string,
  lead: Partial<Lead>,
  businessProfile?: BusinessProfile
): string {
  const firstName = lead.name?.split(' ')[0] || '';
  const lastName = lead.name?.split(' ').slice(1).join(' ') || '';
  const kb = lead.knowledgeBase;
  const insights = lead.insights || '';

  let result = text
    // Lead identity
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{last_name\}\}/gi, lastName)
    .replace(/\{\{full_name\}\}/gi, lead.name || '')
    .replace(/\{\{name\}\}/gi, lead.name || '')
    .replace(/\{\{lead_name\}\}/gi, lead.name || '')
    .replace(/\{\{company\}\}/gi, lead.company || '')
    .replace(/\{\{email\}\}/gi, lead.email || '')
    // KB structured fields
    .replace(/\{\{title\}\}/gi, kb?.title || '')
    .replace(/\{\{job_title\}\}/gi, kb?.title || '')
    .replace(/\{\{industry\}\}/gi, kb?.industry || '')
    .replace(/\{\{location\}\}/gi, kb?.location || '')
    .replace(/\{\{company_overview\}\}/gi, kb?.companyOverview || '')
    .replace(/\{\{talking_point\}\}/gi, kb?.talkingPoints?.[0] || '')
    .replace(/\{\{outreach_angle\}\}/gi, kb?.outreachAngle || '')
    .replace(/\{\{mentioned_on_website\}\}/gi, kb?.mentionedOnWebsite || '')
    .replace(/\{\{company_size\}\}/gi, kb?.employeeCount || '')
    .replace(/\{\{employee_count\}\}/gi, kb?.employeeCount || '')
    // AI insights (multiple alias tags)
    .replace(/\{\{ai_insight\}\}/gi, insights)
    .replace(/\{\{insights\}\}/gi, insights)
    .replace(/\{\{insight_1\}\}/gi, insights)
    .replace(/\{\{recent_activity\}\}/gi, lead.lastActivity || insights)
    // Lead metadata
    .replace(/\{\{score\}\}/gi, lead.score != null ? String(lead.score) : '')
    // Business profile / sender fields
    .replace(/\{\{sender_company\}\}/gi, businessProfile?.companyName || '')
    .replace(/\{\{sender_name\}\}/gi, '')  // caller can override with actual auth user name
    .replace(/\{\{your_name\}\}/gi, '')    // caller can override
    .replace(/\{\{value_prop\}\}/gi, businessProfile?.valueProp || '')
    .replace(/\{\{value_proposition\}\}/gi, businessProfile?.valueProp || '')
    .replace(/\{\{products_services\}\}/gi, businessProfile?.productsServices || '')
    .replace(/\{\{target_audience\}\}/gi, businessProfile?.targetAudience || '');

  // Strip any remaining unreplaced {{...}} tags so raw placeholders never reach customers
  result = result.replace(/\{\{[a-z_]+\}\}/gi, '');

  return result;
}

/**
 * Convenience wrapper that also handles sender name replacement.
 */
export function personalizeForSend(
  text: string,
  lead: Partial<Lead>,
  senderName?: string,
  businessProfile?: BusinessProfile
): string {
  let result = text;

  // Replace sender-specific tags before general resolution
  if (senderName) {
    result = result
      .replace(/\{\{your_name\}\}/gi, senderName)
      .replace(/\{\{sender_name\}\}/gi, senderName);
  }

  return resolvePersonalizationTags(result, lead, businessProfile);
}
