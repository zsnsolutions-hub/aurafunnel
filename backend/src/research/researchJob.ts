import { safeFetchHtml } from './safeFetchHtml.js';
import { extractSignals } from './extractSignals.js';
import type { ResearchInput, ResearchResult, PageResult, AggregatedSignals, PageSignals } from './types.js';
import { JobState } from './types.js';

const STANDARD_PATHS = ['/about', '/about-us', '/pricing', '/contact', '/contact-us', '/services', '/products', '/team'];
const MAX_CONCURRENT = 2;
const MAX_SUCCESSFUL_PAGES = 4;
const MAX_TOTAL_ATTEMPTS = 6;
const JOB_TIMEOUT_MS = 30_000;

function buildUrls(domain: string): string[] {
  const base = `https://${domain}`;
  return [base + '/', ...STANDARD_PATHS.map((p) => base + p)];
}

/** Simple concurrency-limited runner */
async function fetchWithConcurrency(
  urls: string[],
  maxConcurrent: number,
  maxSuccessful: number,
  maxAttempts: number,
): Promise<PageResult[]> {
  const results: PageResult[] = [];
  let successCount = 0;
  let attemptCount = 0;
  let urlIndex = 0;
  let running = 0;

  return new Promise((resolve) => {
    function tryNext() {
      while (running < maxConcurrent && urlIndex < urls.length && attemptCount < maxAttempts && successCount < maxSuccessful) {
        const url = urls[urlIndex++];
        attemptCount++;
        running++;

        safeFetchHtml(url).then((result) => {
          running--;
          results.push(result);
          if (result.status === 'ok') successCount++;

          if (successCount >= maxSuccessful || (attemptCount >= maxAttempts && running === 0) || (urlIndex >= urls.length && running === 0)) {
            resolve(results);
          } else {
            tryNext();
          }
        });
      }

      // All URLs consumed and nothing running
      if (running === 0 && (urlIndex >= urls.length || attemptCount >= maxAttempts)) {
        resolve(results);
      }
    }

    tryNext();
  });
}

function aggregateSignals(pages: PageSignals[]): AggregatedSignals {
  if (pages.length === 0) {
    return { title: '', description: '', headings: [], bodyText: '', emails: [], phones: [], socialLinks: {} };
  }

  // Pick best title (longest non-empty)
  const title = pages
    .map((p) => p.title)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? '';

  // Pick best description
  const description = pages
    .map((p) => p.metaDescription)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? '';

  // Deduplicated headings
  const headingSet = new Set<string>();
  for (const p of pages) {
    for (const h of p.headings) headingSet.add(h);
  }
  const headings = [...headingSet].slice(0, 30);

  // Concatenate body text up to 5000 chars
  let bodyText = '';
  for (const p of pages) {
    if (bodyText.length >= 5000) break;
    const remaining = 5000 - bodyText.length;
    bodyText += (bodyText ? ' ' : '') + p.cleanedText.slice(0, remaining);
  }

  // Deduplicated emails
  const emails = [...new Set(pages.flatMap((p) => p.emails))];

  // Deduplicated phones
  const phones = [...new Set(pages.flatMap((p) => p.phones))];

  // Merge social links (first occurrence wins)
  const socialLinks: Record<string, string> = {};
  for (const p of pages) {
    for (const [key, val] of Object.entries(p.socialLinks)) {
      if (!socialLinks[key]) socialLinks[key] = val;
    }
  }

  return { title, description, headings, bodyText, emails, phones, socialLinks };
}

export async function runResearchJob(input: ResearchInput): Promise<ResearchResult> {
  const start = Date.now();
  let state: JobState = JobState.INIT;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('JOB_TIMEOUT')), JOB_TIMEOUT_MS),
  );

  try {
    const result = await Promise.race([
      (async (): Promise<ResearchResult> => {
        // INIT — build URL list
        const urls = buildUrls(input.domain);

        // FETCHING
        state = JobState.FETCHING;
        const pageResults = await fetchWithConcurrency(urls, MAX_CONCURRENT, MAX_SUCCESSFUL_PAGES, MAX_TOTAL_ATTEMPTS);

        const successfulPages = pageResults.filter((p) => p.status === 'ok' && p.html);

        if (successfulPages.length === 0) {
          state = JobState.FAILED;
          return {
            status: 'failed',
            domain: input.domain,
            pages: pageResults,
            signals: aggregateSignals([]),
            durationMs: Date.now() - start,
            error: 'No pages fetched successfully',
          };
        }

        // EXTRACTING
        state = JobState.EXTRACTING;
        for (const page of successfulPages) {
          page.signals = extractSignals(page.url, page.html!);
        }

        // AGGREGATING
        state = JobState.AGGREGATING;
        const allSignals = successfulPages.map((p) => p.signals!);
        const signals = aggregateSignals(allSignals);

        state = JobState.DONE;
        return {
          status: 'completed',
          domain: input.domain,
          pages: pageResults,
          signals,
          durationMs: Date.now() - start,
        };
      })(),
      timeoutPromise,
    ]);

    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state = msg === 'JOB_TIMEOUT' ? JobState.TIMED_OUT : JobState.FAILED;
    return {
      status: msg === 'JOB_TIMEOUT' ? 'timeout' : 'failed',
      domain: input.domain,
      pages: [],
      signals: aggregateSignals([]),
      durationMs: Date.now() - start,
      error: msg,
    };
  }
}
