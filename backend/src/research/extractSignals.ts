import * as cheerio from 'cheerio';
import type { PageSignals } from './types.js';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Require explicit separator (dash/space/dot) or parenthesized area code to avoid matching SVG/numeric data
const PHONE_RE = /(?:\+?1[-\s.])?(?:\(\d{3}\)[-\s.]|\d{3}[-\s])\d{3}[-\s.]\d{4}/g;

const SOCIAL_DOMAINS: Record<string, string> = {
  'linkedin.com': 'linkedin',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'facebook.com': 'facebook',
  'instagram.com': 'instagram',
  'youtube.com': 'youtube',
};

const MAX_HEADINGS = 30;
const MIN_TEXT_LENGTH = 2_000;
const MAX_TEXT_LENGTH = 5_000;

export function extractSignals(url: string, html: string): PageSignals {
  const $ = cheerio.load(html);

  // Title
  const title = $('title').first().text().trim();

  // Meta description
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() ??
    $('meta[property="og:description"]').attr('content')?.trim() ??
    '';

  // Headings (h1-h3, deduplicated)
  const headingSet = new Set<string>();
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text && headingSet.size < MAX_HEADINGS) {
      headingSet.add(text);
    }
  });
  const headings = [...headingSet];

  // Cleaned text — remove non-content tags, extract text
  $('script, style, nav, footer, header, noscript, svg, iframe').remove();
  let cleanedText = $('body').text().replace(/\s+/g, ' ').trim();
  if (cleanedText.length > MAX_TEXT_LENGTH) {
    cleanedText = cleanedText.slice(0, MAX_TEXT_LENGTH);
  }
  // Pad with heading/meta text if too short
  if (cleanedText.length < MIN_TEXT_LENGTH) {
    const extra = [title, metaDescription, ...headings].join(' ');
    cleanedText = (cleanedText + ' ' + extra).trim().slice(0, MAX_TEXT_LENGTH);
  }

  // Emails
  const emailMatches = html.match(EMAIL_RE) ?? [];
  const emails = [...new Set(emailMatches)].filter(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg')
  );

  // Phones — scan cleaned text (no SVG/script noise) plus visible text
  const textForPhones = $('body').text();
  const phoneMatches = textForPhones.match(PHONE_RE) ?? [];
  const phones = [...new Set(phoneMatches.map((p) => p.trim()))];

  // Social links
  const socialLinks: Record<string, string> = {};
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    for (const [domain, key] of Object.entries(SOCIAL_DOMAINS)) {
      if (href.includes(domain) && !socialLinks[key]) {
        socialLinks[key] = href;
      }
    }
  });

  return { url, title, metaDescription, headings, cleanedText, emails, phones, socialLinks };
}
