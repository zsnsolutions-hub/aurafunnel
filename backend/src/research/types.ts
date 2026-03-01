export interface ResearchInput {
  domain: string;
  companyName?: string;
}

export interface PageSignals {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  cleanedText: string;
  emails: string[];
  phones: string[];
  socialLinks: Record<string, string>;
}

export interface PageResult {
  url: string;
  status: 'ok' | 'failed' | 'timeout' | 'blocked' | 'too_large';
  html?: string;
  signals?: PageSignals;
  error?: string;
  durationMs: number;
}

export interface AggregatedSignals {
  title: string;
  description: string;
  headings: string[];
  bodyText: string;
  emails: string[];
  phones: string[];
  socialLinks: Record<string, string>;
}

export interface ResearchResult {
  status: 'completed' | 'failed' | 'timeout';
  domain: string;
  pages: PageResult[];
  signals: AggregatedSignals;
  durationMs: number;
  error?: string;
}

export enum JobState {
  INIT = 'INIT',
  FETCHING = 'FETCHING',
  EXTRACTING = 'EXTRACTING',
  AGGREGATING = 'AGGREGATING',
  DONE = 'DONE',
  FAILED = 'FAILED',
  TIMED_OUT = 'TIMED_OUT',
}
