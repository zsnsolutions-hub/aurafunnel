import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (vi.hoisted runs before vi.mock factories) ───
const { mockSupabaseChain, mockSupabase, mockSendTrackedEmail, mockScheduleEmailBlock, mockGeneratePersonalizedEmail } = vi.hoisted(() => {
  const mockSupabaseChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
  };

  return {
    mockSupabaseChain,
    mockSupabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-123' } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      },
      from: vi.fn(() => mockSupabaseChain),
    },
    mockSendTrackedEmail: vi.fn(),
    mockScheduleEmailBlock: vi.fn(),
    mockGeneratePersonalizedEmail: vi.fn(),
  };
});

vi.mock('../supabase', () => ({ supabase: mockSupabase }));
vi.mock('../emailTracking', () => ({
  sendTrackedEmail: (...args: any[]) => mockSendTrackedEmail(...args),
  scheduleEmailBlock: (...args: any[]) => mockScheduleEmailBlock(...args),
}));
vi.mock('../gemini', () => ({
  generatePersonalizedEmail: (...args: any[]) => mockGeneratePersonalizedEmail(...args),
}));

// ─── Import after mocks ───
import { executeWorkflow, type Workflow, type WorkflowNode } from '../automationEngine';
import type { Lead } from '../../types';

// ─── Test Data ───

const testLead: Lead = {
  id: 'lead-001',
  client_id: 'client-001',
  name: 'Jane Smith',
  company: 'Acme Corp',
  email: 'jane@acme.com',
  score: 85,
  status: 'New',
  lastActivity: '2026-02-19',
  insights: 'Recently raised Series B funding',
  knowledgeBase: {
    industry: 'SaaS',
    title: 'VP of Sales',
    companyOverview: 'Cloud-based CRM for SMBs',
  },
};

const leadNoEmail: Lead = {
  ...testLead,
  id: 'lead-002',
  name: 'Bob NoEmail',
  email: '',
};

function buildWorkflow(nodes: WorkflowNode[]): Workflow {
  return {
    id: 'wf-test-001',
    name: 'Test Workflow',
    description: 'Test',
    status: 'active',
    nodes,
    createdAt: new Date().toISOString(),
    stats: { leadsProcessed: 0, conversionRate: 0, timeSavedHrs: 0, roi: 0 },
  };
}

// ─── Tests ───

describe('send_email pipeline — end to end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth mock
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user-123' } } });
    // Default: sendTrackedEmail succeeds
    mockSendTrackedEmail.mockResolvedValue({ success: true, messageId: 'msg-001' });
    // Default: scheduleEmailBlock succeeds
    mockScheduleEmailBlock.mockResolvedValue({ scheduled: 1, failed: 0, errors: [] });
    // Default: AI personalization succeeds
    mockGeneratePersonalizedEmail.mockResolvedValue({
      subject: 'AI-enhanced subject for Jane',
      htmlBody: '<p>AI-enhanced body mentioning Acme Corp Series B</p>',
      tokensUsed: 150,
    });
    // Default: Supabase template fetch returns a template
    mockSupabaseChain.limit.mockResolvedValue({
      data: [{
        id: 'tpl-001',
        owner_id: null,
        name: 'Welcome Email',
        category: 'welcome',
        subject_template: 'Welcome to {{sender_company}}, {{first_name}}!',
        body_template: '<p>Hi {{first_name}},</p><p>We noticed {{company}} is doing great work.</p>',
        is_default: true,
      }],
      error: null,
    });
    // DB writes succeed
    mockSupabaseChain.insert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'exec-001' }, error: null }),
      }),
    });
  });

  it('sends email immediately with template + personalization', async () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send welcome email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: false,
          timing: 'immediate',
          fallbackEnabled: false,
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);

    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result.status).toBe('success');
    expect(result.steps).toHaveLength(2);

    // Step 1: trigger passed
    expect(result.steps[0].status).toBe('pass');

    // Step 2: email sent
    expect(result.steps[1].status).toBe('pass');
    expect(result.steps[1].message).toContain('Email sent to jane@acme.com');
    expect(result.steps[1].message).toContain('template: welcome');

    // sendTrackedEmail was called with personalized content
    expect(mockSendTrackedEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendTrackedEmail.mock.calls[0][0];
    expect(emailCall.toEmail).toBe('jane@acme.com');
    expect(emailCall.leadId).toBe('lead-001');
    // Subject should have {{first_name}} resolved to "Jane"
    expect(emailCall.subject).toContain('Jane');
    // Body should have {{company}} resolved
    expect(emailCall.htmlBody).toContain('Acme Corp');
    // AI was NOT called
    expect(mockGeneratePersonalizedEmail).not.toHaveBeenCalled();
  });

  it('sends email with AI personalization enabled', async () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send AI email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: true,
          timing: 'immediate',
          fallbackEnabled: false,
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);

    expect(results[0].status).toBe('success');
    expect(results[0].steps[1].status).toBe('pass');
    expect(results[0].steps[1].message).toContain('AI-enhanced');

    // AI was called
    expect(mockGeneratePersonalizedEmail).toHaveBeenCalledTimes(1);
    const aiInput = mockGeneratePersonalizedEmail.mock.calls[0][0];
    expect(aiInput.lead.name).toBe('Jane Smith');

    // sendTrackedEmail used AI-enhanced content
    const emailCall = mockSendTrackedEmail.mock.calls[0][0];
    expect(emailCall.subject).toBe('AI-enhanced subject for Jane');
    expect(emailCall.htmlBody).toContain('AI-enhanced body');
  });

  it('schedules email for morning instead of sending immediately', async () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send morning email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: false,
          timing: 'morning',
          fallbackEnabled: false,
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);

    expect(results[0].status).toBe('success');
    expect(results[0].steps[1].status).toBe('pass');
    expect(results[0].steps[1].message).toContain('scheduled');
    expect(results[0].steps[1].message).toContain('timing: morning');

    // sendTrackedEmail was NOT called (scheduled instead)
    expect(mockSendTrackedEmail).not.toHaveBeenCalled();
    // scheduleEmailBlock was called
    expect(mockScheduleEmailBlock).toHaveBeenCalledTimes(1);
    const schedCall = mockScheduleEmailBlock.mock.calls[0][0];
    expect(schedCall.leads[0].email).toBe('jane@acme.com');
    expect(schedCall.scheduledAt.getHours()).toBe(9);
  });

  it('uses custom content when template is __custom__', async () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Custom email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: '__custom__',
          customSubject: 'Hey {{first_name}}, let us talk about {{company}}',
          customBody: '<p>Hi {{first_name}}, I saw {{company}} is growing fast.</p>',
          aiPersonalization: false,
          timing: 'immediate',
          fallbackEnabled: false,
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);

    expect(results[0].steps[1].status).toBe('pass');

    const emailCall = mockSendTrackedEmail.mock.calls[0][0];
    expect(emailCall.subject).toBe('Hey Jane, let us talk about Acme Corp');
    expect(emailCall.htmlBody).toContain('Hi Jane');
    expect(emailCall.htmlBody).toContain('Acme Corp is growing fast');
  });

  it('fails gracefully when lead has no email', async () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: false,
          timing: 'immediate',
          fallbackEnabled: false,
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [leadNoEmail]);

    expect(results[0].status).toBe('failed');
    expect(results[0].steps[1].status).toBe('fail');
    expect(results[0].steps[1].message).toContain('No email address');
    expect(mockSendTrackedEmail).not.toHaveBeenCalled();
  });

  it('executes fallback (create_alert) when send fails', async () => {
    mockSendTrackedEmail.mockResolvedValue({ success: false, error: 'Provider timeout' });

    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: false,
          timing: 'immediate',
          fallbackEnabled: true,
          fallbackAction: 'create_alert',
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);

    // Fallback should make it "pass" (alert created instead of hard fail)
    expect(results[0].steps[1].status).toBe('pass');
    expect(results[0].steps[1].message).toContain('fallback alert created');
    expect(results[0].steps[1].message).toContain('Provider timeout');

    // Verify audit_logs insert was called for fallback alert
    const fromCalls = mockSupabase.from.mock.calls.map((c: any) => c[0]);
    expect(fromCalls).toContain('audit_logs');
  });

  it('executes fallback (retry) — schedules retry in 1 hour', async () => {
    mockSendTrackedEmail.mockResolvedValue({ success: false, error: 'Rate limited' });
    // Mock the scheduled_emails insert for retry
    mockSupabaseChain.insert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'retry-001' }, error: null }),
      }),
    });

    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: false,
          timing: 'immediate',
          fallbackEnabled: true,
          fallbackAction: 'retry',
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);

    expect(results[0].steps[1].status).toBe('pass');
    expect(results[0].steps[1].message).toContain('retry scheduled');

    // Verify scheduled_emails was written to
    const fromCalls = mockSupabase.from.mock.calls.map((c: any) => c[0]);
    expect(fromCalls).toContain('scheduled_emails');
  });

  it('fallback skip — marks pass and continues', async () => {
    mockSendTrackedEmail.mockResolvedValue({ success: false, error: 'Bounce' });

    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: false,
          timing: 'immediate',
          fallbackEnabled: true,
          fallbackAction: 'skip',
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);
    expect(results[0].steps[1].status).toBe('pass');
    expect(results[0].steps[1].message).toContain('skipping per fallback');
  });

  it('without fallback — hard fails when send fails', async () => {
    mockSendTrackedEmail.mockResolvedValue({ success: false, error: 'Bounce' });

    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: false,
          timing: 'immediate',
          fallbackEnabled: false,
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);
    expect(results[0].status).toBe('failed');
    expect(results[0].steps[1].status).toBe('fail');
    expect(results[0].steps[1].message).toContain('Bounce');
  });

  it('AI personalization fails gracefully — uses tag-resolved content', async () => {
    mockGeneratePersonalizedEmail.mockRejectedValue(new Error('Gemini API down'));

    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Lead created',
        description: 'Trigger', config: { triggerType: 'lead_created' },
      },
      {
        id: 'n2', type: 'action', title: 'Send AI email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: true,
          timing: 'immediate',
          fallbackEnabled: false,
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead]);

    // Should still succeed — AI failure is graceful
    expect(results[0].steps[1].status).toBe('pass');
    // Email was sent with tag-resolved content (not AI)
    const emailCall = mockSendTrackedEmail.mock.calls[0][0];
    expect(emailCall.subject).toContain('Jane');
    expect(emailCall.htmlBody).toContain('Acme Corp');
  });

  it('runs full workflow on multiple leads with condition branching', async () => {
    const lead2: Lead = {
      ...testLead,
      id: 'lead-003',
      name: 'Mike Johnson',
      company: 'Beta Inc',
      email: 'mike@beta.com',
      score: 40,
    };

    const nodes: WorkflowNode[] = [
      {
        id: 'n1', type: 'trigger', title: 'Score check',
        description: 'Check score', config: { triggerType: 'score_change', threshold: 50 },
      },
      {
        id: 'n2', type: 'condition', title: 'Score > 50?',
        description: 'Condition', config: { field: 'score', operator: 'gt', value: 50 },
      },
      {
        id: 'n3', type: 'action', title: 'Send email',
        description: 'Send email', config: {
          actionType: 'send_email',
          template: 'welcome',
          aiPersonalization: false,
          timing: 'immediate',
          fallbackEnabled: false,
        },
      },
    ];

    const results = await executeWorkflow(buildWorkflow(nodes), [testLead, lead2]);

    expect(results).toHaveLength(2);

    // Lead 1 (score 85) — passes condition, email sent
    expect(results[0].status).toBe('success');
    expect(results[0].steps[1].status).toBe('pass'); // condition passes
    expect(results[0].steps[2].status).toBe('pass'); // email sent

    // Lead 2 (score 40) — fails condition, email skipped
    expect(results[1].steps[1].status).toBe('skip'); // condition fails
    expect(results[1].steps[2].status).toBe('skip'); // skipped downstream

    // Only 1 email sent (for lead 1)
    expect(mockSendTrackedEmail).toHaveBeenCalledTimes(1);
  });
});
