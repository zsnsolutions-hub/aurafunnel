/**
 * Dev-only performance event tracker.
 * Records query timings, retries, navigation events.
 * No-ops in production (tree-shaken).
 */

export interface PerfEntry {
  id: string;
  label: string;
  type: 'success' | 'error' | 'abort' | 'retry' | 'nav';
  elapsed?: number;
  attempt?: number;
  delay?: number;
  error?: string;
  ts: number;
}

type PerfListener = (entries: PerfEntry[]) => void;

const MAX_ENTRIES = 200;

class PerfTracker {
  private entries: PerfEntry[] = [];
  private listeners = new Set<PerfListener>();

  record(entry: Omit<PerfEntry, 'ts'>) {
    if (import.meta.env.PROD) return;
    const full: PerfEntry = { ...entry, ts: Date.now() };
    this.entries.push(full);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.notify();
  }

  getEntries(): PerfEntry[] {
    return this.entries;
  }

  clear() {
    this.entries = [];
    this.notify();
  }

  subscribe(fn: PerfListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) {
      try { fn(this.entries); } catch {}
    }
  }
}

export const perfTracker = new PerfTracker();
