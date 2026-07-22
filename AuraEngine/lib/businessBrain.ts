// AuraEngine/lib/businessBrain.ts
//
// Roadmap 2.1 — unify the business brain. BusinessSettingsPage writes the
// per-business `business_profiles` table (positioning/brand) + the `businesses`
// row (identity), but AI generators historically read the OLD per-USER
// `profiles.businessProfile` JSONB — so the per-business brand settings never
// reached generation. This resolves the ACTIVE business's brain into the
// BusinessProfile shape the generators already understand, so every generation
// uses the right business's context.
//
// Fallback-safe: returns null unless the per-business brain has real positioning
// content, so callers keep using the old profile for users who never filled
// BusinessSettings — no regression before any backfill. See [[growth-platform-v2]].

import { supabase } from './supabase';
import { getBusinessProfile } from './businesses';
import { activeBusinessId } from './businessScope';
import type { BusinessProfile } from '../types';

interface BizIdentity {
  name: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  default_tone: string | null;
}

function mapToBusinessProfile(biz: BizIdentity | null, prof: Record<string, unknown> | null): BusinessProfile {
  const p = (prof ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const arr = (v: unknown) => (Array.isArray(v) && v.length ? (v as string[]) : undefined);
  return {
    companyName: str(biz?.name),
    companyWebsite: str(biz?.website),
    industry: str(biz?.industry),
    businessDescription: str(biz?.description),
    productsServices: str(p.products_services),
    targetAudience: str(p.audience),
    valueProp: str(p.value_prop),
    competitiveAdvantage: str(p.competitive_advantage),
    companyStory: str(p.company_story),
    contentTone: str(p.tone) ?? str(p.brand_voice) ?? str(biz?.default_tone),
    uniqueSellingPoints: arr(p.unique_selling_points),
    businessEmail: str(p.sender_email),
  };
}

/** True when the brain carries real positioning (not just a business name), so we
 *  only override the old profile when there's something worth overriding with. */
function hasSubstance(bp: BusinessProfile): boolean {
  return !!(bp.productsServices || bp.valueProp || bp.targetAudience || bp.competitiveAdvantage
    || bp.companyStory || bp.contentTone || bp.uniqueSellingPoints?.length);
}

/**
 * The active business's brain as a BusinessProfile, or null when there's no
 * active business or its profile has no substantive content (caller falls back).
 */
export async function getActiveBusinessBrain(): Promise<BusinessProfile | null> {
  const bizId = activeBusinessId();
  if (!bizId) return null;
  try {
    const [{ data: biz }, prof] = await Promise.all([
      supabase.from('businesses').select('name,website,industry,description,default_tone').eq('id', bizId).maybeSingle(),
      getBusinessProfile(bizId),
    ]);
    const mapped = mapToBusinessProfile(biz as BizIdentity | null, prof as Record<string, unknown> | null);
    return hasSubstance(mapped) ? mapped : null;
  } catch (err) {
    console.warn('[businessBrain] resolve failed; falling back:', err);
    return null;
  }
}

/**
 * Prefer the active business's brain; fall back to a passed-in (old) profile.
 * The single seam generators use so per-business context wins when present.
 */
export async function resolveBrain(passed?: BusinessProfile): Promise<BusinessProfile | undefined> {
  return (await getActiveBusinessBrain()) ?? passed;
}
