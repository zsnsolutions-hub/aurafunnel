import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ───
const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

// ─── Import after mocks ───
import {
  incrementUsage,
  checkEmailAllowed,
  checkLinkedInAllowed,
  checkThreshold,
  trackEmailSend,
  trackLinkedInAction,
} from '../usageTracker';

// ─── Helpers ───

function mockRpcImpl(responses: Record<string, unknown>) {
  mockRpc.mockImplementation((name: string) => {
    if (name in responses) {
      return { data: responses[name], error: null };
    }
    return { data: null, error: { message: `Unknown RPC: ${name}` } };
  });
}

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const SENDER_ID = '22222222-2222-2222-2222-222222222222';

// ─── Tests ───

describe('incrementUsage — idempotency', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns duplicate: false on first call', async () => {
    mockRpc.mockResolvedValue({
      data: { duplicate: false, event_type: 'email_sent', quantity: 1 },
      error: null,
    });

    const result = await incrementUsage({
      workspaceId: WORKSPACE_ID,
      eventType: 'email_sent',
      sourceEventId: 'email:msg:abc-123',
      senderAccountId: SENDER_ID,
    });

    expect(result.duplicate).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith('increment_usage', expect.objectContaining({
      p_workspace_id: WORKSPACE_ID,
      p_event_type: 'email_sent',
      p_source_event_id: 'email:msg:abc-123',
      p_sender_account_id: SENDER_ID,
    }));
  });

  it('returns duplicate: true on second call with same sourceEventId', async () => {
    mockRpc.mockResolvedValue({
      data: { duplicate: true, source_event_id: 'email:msg:abc-123' },
      error: null,
    });

    const result = await incrementUsage({
      workspaceId: WORKSPACE_ID,
      eventType: 'email_sent',
      sourceEventId: 'email:msg:abc-123',
    });

    expect(result.duplicate).toBe(true);
  });
});

describe('checkEmailAllowed — monthly limit enforcement', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns MONTHLY_EMAIL when counter is at limit', async () => {
    mockRpcImpl({
      get_sender_daily_sent: 5, // under daily
      get_workspace_monthly_usage: [{
        total_emails_sent: 1000,
        total_linkedin_actions: 0,
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
    });

    const result = await checkEmailAllowed(WORKSPACE_ID, SENDER_ID, 'Starter');
    expect(result).toEqual({ code: 'LIMIT_REACHED', type: 'MONTHLY_EMAIL' });
  });

  it('returns null when under limits', async () => {
    mockRpcImpl({
      get_sender_daily_sent: 5,
      get_workspace_monthly_usage: [{
        total_emails_sent: 500,
        total_linkedin_actions: 0,
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
    });

    const result = await checkEmailAllowed(WORKSPACE_ID, SENDER_ID, 'Starter');
    expect(result).toBeNull();
  });
});

describe('checkEmailAllowed — per-sender daily limit', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns DAILY_EMAIL when sender daily count is at cap', async () => {
    mockRpcImpl({
      get_sender_daily_sent: 40, // Starter cap = 40/day
      get_workspace_monthly_usage: [{
        total_emails_sent: 100,
        total_linkedin_actions: 0,
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
    });

    const result = await checkEmailAllowed(WORKSPACE_ID, SENDER_ID, 'Starter');
    expect(result).toEqual({ code: 'LIMIT_REACHED', type: 'DAILY_EMAIL' });
  });
});

describe('checkEmailAllowed — non-UUID inboxId graceful degradation', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('skips per-sender check for non-UUID inboxId, still checks monthly', async () => {
    mockRpcImpl({
      get_workspace_monthly_usage: [{
        total_emails_sent: 500,
        total_linkedin_actions: 0,
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
    });

    // 'default' is not a UUID — should skip get_sender_daily_sent entirely
    const result = await checkEmailAllowed(WORKSPACE_ID, 'default', 'Starter');
    expect(result).toBeNull();

    // Verify get_sender_daily_sent was NOT called
    const rpcCalls = mockRpc.mock.calls.map((c: unknown[]) => c[0]);
    expect(rpcCalls).not.toContain('get_sender_daily_sent');
  });

  it('does not crash with email-style inboxId', async () => {
    mockRpcImpl({
      get_workspace_monthly_usage: [{
        total_emails_sent: 100,
        total_linkedin_actions: 0,
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
    });

    const result = await checkEmailAllowed(WORKSPACE_ID, 'user@example.com', 'Starter');
    expect(result).toBeNull();
  });
});

describe('checkLinkedInAllowed — daily + monthly', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns DAILY_LINKEDIN when daily LinkedIn limit is reached', async () => {
    mockRpcImpl({
      get_workspace_daily_usage: [{
        emails_sent: 0,
        linkedin_actions: 20, // Starter daily = 20
        ai_credits_used: 0,
        warmup_emails_sent: 0,
      }],
      get_workspace_monthly_usage: [{
        total_emails_sent: 0,
        total_linkedin_actions: 100,
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
    });

    const result = await checkLinkedInAllowed(WORKSPACE_ID, 'Starter');
    expect(result).toEqual({ code: 'LIMIT_REACHED', type: 'DAILY_LINKEDIN' });
  });

  it('returns MONTHLY_LINKEDIN when monthly LinkedIn limit is reached', async () => {
    mockRpcImpl({
      get_workspace_daily_usage: [{
        emails_sent: 0,
        linkedin_actions: 10, // under daily
        ai_credits_used: 0,
        warmup_emails_sent: 0,
      }],
      get_workspace_monthly_usage: [{
        total_emails_sent: 0,
        total_linkedin_actions: 600, // Starter monthly = 600
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
    });

    const result = await checkLinkedInAllowed(WORKSPACE_ID, 'Starter');
    expect(result).toEqual({ code: 'LIMIT_REACHED', type: 'MONTHLY_LINKEDIN' });
  });
});

describe('checkThreshold — warnings at 80%+', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns warnings when usage is at 80%', async () => {
    mockRpcImpl({
      get_workspace_monthly_usage: [{
        total_emails_sent: 800, // 80% of 1000
        total_linkedin_actions: 480, // 80% of 600
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
      get_workspace_daily_usage: [{
        emails_sent: 0,
        linkedin_actions: 16, // 80% of 20
        ai_credits_used: 0,
        warmup_emails_sent: 0,
      }],
    });

    const warnings = await checkThreshold(WORKSPACE_ID, 'Starter');
    expect(warnings).toHaveLength(3);

    const emailWarning = warnings.find(w => w.type === 'MONTHLY_EMAIL');
    expect(emailWarning).toBeDefined();
    expect(emailWarning!.percent).toBe(80);
    expect(emailWarning!.current).toBe(800);
    expect(emailWarning!.limit).toBe(1000);

    const dailyLinkedIn = warnings.find(w => w.type === 'DAILY_LINKEDIN');
    expect(dailyLinkedIn).toBeDefined();
    expect(dailyLinkedIn!.percent).toBe(80);
  });

  it('returns warnings at 95%', async () => {
    mockRpcImpl({
      get_workspace_monthly_usage: [{
        total_emails_sent: 950, // 95%
        total_linkedin_actions: 0,
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
      get_workspace_daily_usage: [{
        emails_sent: 0,
        linkedin_actions: 0,
        ai_credits_used: 0,
        warmup_emails_sent: 0,
      }],
    });

    const warnings = await checkThreshold(WORKSPACE_ID, 'Starter');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('MONTHLY_EMAIL');
    expect(warnings[0].percent).toBe(95);
  });

  it('returns empty array when under 80%', async () => {
    mockRpcImpl({
      get_workspace_monthly_usage: [{
        total_emails_sent: 500, // 50%
        total_linkedin_actions: 200,
        total_ai_credits_used: 0,
        total_warmup_sent: 0,
      }],
      get_workspace_daily_usage: [{
        emails_sent: 0,
        linkedin_actions: 5,
        ai_credits_used: 0,
        warmup_emails_sent: 0,
      }],
    });

    const warnings = await checkThreshold(WORKSPACE_ID, 'Starter');
    expect(warnings).toHaveLength(0);
  });
});

describe('Dashboard query consistency', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('checkThreshold reads same data as checkEmailAllowed', async () => {
    const monthlyData = [{
      total_emails_sent: 999,
      total_linkedin_actions: 0,
      total_ai_credits_used: 0,
      total_warmup_sent: 0,
    }];
    const dailyData = [{
      emails_sent: 0,
      linkedin_actions: 0,
      ai_credits_used: 0,
      warmup_emails_sent: 0,
    }];

    mockRpcImpl({
      get_sender_daily_sent: 0,
      get_workspace_monthly_usage: monthlyData,
      get_workspace_daily_usage: dailyData,
    });

    // checkThreshold should show 100% warning (999/1000 = 99.9% rounds to 100%)
    const warnings = await checkThreshold(WORKSPACE_ID, 'Starter');
    const emailWarning = warnings.find(w => w.type === 'MONTHLY_EMAIL');
    expect(emailWarning).toBeDefined();
    expect(emailWarning!.current).toBe(999);

    // checkEmailAllowed should still allow (999 < 1000)
    const limitErr = await checkEmailAllowed(WORKSPACE_ID, SENDER_ID, 'Starter');
    expect(limitErr).toBeNull();
  });
});

describe('trackEmailSend / trackLinkedInAction', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('trackEmailSend calls increment_usage with correct params', async () => {
    mockRpc.mockResolvedValue({
      data: { duplicate: false, event_type: 'email_sent', quantity: 1 },
      error: null,
    });

    await trackEmailSend(WORKSPACE_ID, SENDER_ID, 'email:msg:test-123');

    expect(mockRpc).toHaveBeenCalledWith('increment_usage', expect.objectContaining({
      p_workspace_id: WORKSPACE_ID,
      p_event_type: 'email_sent',
      p_source_event_id: 'email:msg:test-123',
      p_sender_account_id: SENDER_ID,
    }));
  });

  it('trackLinkedInAction calls increment_usage with correct params', async () => {
    mockRpc.mockResolvedValue({
      data: { duplicate: false, event_type: 'linkedin_action', quantity: 1 },
      error: null,
    });

    await trackLinkedInAction(WORKSPACE_ID, 'li:action:test-456');

    expect(mockRpc).toHaveBeenCalledWith('increment_usage', expect.objectContaining({
      p_workspace_id: WORKSPACE_ID,
      p_event_type: 'linkedin_action',
      p_source_event_id: 'li:action:test-456',
      p_sender_account_id: null,
    }));
  });
});
