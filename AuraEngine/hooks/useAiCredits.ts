import { useState, useEffect, useCallback } from 'react';
import {
  checkAiAllowed,
  checkAiThreshold,
  getAiUsageSnapshot,
  trackAiUsage,
} from '../lib/aiUsage.service';
import type {
  AiLimitError,
  AiThresholdWarning,
  AiUsageSnapshot,
} from '../lib/aiUsage.service';

interface UseAiCreditsReturn {
  /** Current AI usage snapshot. */
  usage: AiUsageSnapshot | null;
  /** Active threshold warning (80%+). */
  warning: AiThresholdWarning | null;
  /** Set when an AI check fails — use to drive the AiUpgradeModal. */
  aiError: AiLimitError | null;
  /** Clear the current AI error (e.g. after modal is dismissed). */
  clearAiError: () => void;
  /**
   * Check if an AI action is allowed. Returns true if OK.
   * Call before making a Gemini API call.
   */
  checkAi: () => Promise<boolean>;
  /**
   * Track usage after a Gemini response.
   * Returns credits deducted.
   */
  recordUsage: (tokensUsed: number) => Promise<number>;
  /** Force-refresh usage snapshot and warnings. */
  refresh: () => void;
  /** Whether usage data is still loading. */
  loading: boolean;
}

export function useAiCredits(
  workspaceId: string | undefined,
  planName: string | undefined,
): UseAiCreditsReturn {
  const [usage, setUsage] = useState<AiUsageSnapshot | null>(null);
  const [warning, setWarning] = useState<AiThresholdWarning | null>(null);
  const [aiError, setAiError] = useState<AiLimitError | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAiError = useCallback(() => setAiError(null), []);

  // Fetch snapshot + warnings
  const fetchData = useCallback(async () => {
    if (!workspaceId || !planName) {
      setLoading(false);
      return;
    }
    try {
      const [snap, warn] = await Promise.all([
        getAiUsageSnapshot(workspaceId, planName),
        checkAiThreshold(workspaceId, planName),
      ]);
      setUsage(snap);
      setWarning(warn);
    } catch {
      // Silently fail — banner just won't show
    } finally {
      setLoading(false);
    }
  }, [workspaceId, planName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const checkAi = useCallback(async (): Promise<boolean> => {
    if (!workspaceId || !planName) return false;
    const err = await checkAiAllowed(workspaceId, planName);
    if (err) {
      setAiError(err);
      fetchData(); // refresh usage data
      return false;
    }
    return true;
  }, [workspaceId, planName, fetchData]);

  const recordUsage = useCallback(async (tokensUsed: number): Promise<number> => {
    if (!workspaceId || !planName) return 0;
    const result = await trackAiUsage(workspaceId, planName, tokensUsed);
    fetchData(); // refresh after deduction
    return result.creditsDeducted;
  }, [workspaceId, planName, fetchData]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { usage, warning, aiError, clearAiError, checkAi, recordUsage, refresh, loading };
}
