// ─── CTA Button HTML Builder (email-client safe) ───

export type CtaVariant = 'primary' | 'secondary' | 'minimal';
export type CtaAlign = 'left' | 'center' | 'right';

export interface CtaButtonConfig {
  text: string;
  url: string;
  variant: CtaVariant;
  align: CtaAlign;
}

export interface CtaPreset extends CtaButtonConfig {
  id: string;
  createdAt: number;
}

// ─── HTML Builder ───

export function buildEmailCtaButtonHTML({ text, url, variant, align }: CtaButtonConfig): string {
  const safeUrl = url.startsWith('http') ? url : `https://${url}`;
  const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (variant === 'minimal') {
    const color = '#4F46E5';
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="${align}" style="padding:16px 0;"><a href="${safeUrl}" target="_blank" rel="noopener" style="color:${color};font-size:15px;font-weight:700;text-decoration:underline;font-family:sans-serif;">${safeText}</a></td></tr></table>`;
  }

  const isPrimary = variant === 'primary';
  const bgColor = isPrimary ? '#4F46E5' : 'transparent';
  const textColor = isPrimary ? '#ffffff' : '#4F46E5';
  const border = isPrimary ? 'none' : '2px solid #4F46E5';
  const borderRadius = '12px';
  const padding = '12px 24px';

  // MSO (Outlook) VML fallback + standard table-based button
  return [
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">`,
    `<tr><td align="${align}" style="padding:16px 0;">`,
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation">`,
    `<tr><td style="background:${bgColor};border-radius:${borderRadius};border:${border};mso-padding-alt:0;">`,
    `<a href="${safeUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:${padding};font-family:sans-serif;font-size:15px;font-weight:700;color:${textColor};text-decoration:none;border-radius:${borderRadius};background:${bgColor};border:${border};mso-padding-alt:0;">${safeText}</a>`,
    `</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ].join('');
}

// ─── CTA Library (localStorage, last 5) ───

const STORAGE_KEY = 'aura_cta_presets';

export function getCtaPresets(): CtaPreset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCtaPreset(config: CtaButtonConfig): CtaPreset {
  const preset: CtaPreset = { ...config, id: `cta-${Date.now()}`, createdAt: Date.now() };
  const existing = getCtaPresets();
  // Dedupe by text+url, keep newest first, max 5
  const filtered = existing.filter(p => !(p.text === config.text && p.url === config.url));
  const updated = [preset, ...filtered].slice(0, 5);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return preset;
}

export function deleteCtaPreset(id: string): void {
  const updated = getCtaPresets().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
