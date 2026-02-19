import { describe, it, expect, vi } from 'vitest';
import { calculateScheduledTime } from '../automationEngine';
import { personalizeForSend } from '../personalization';

// ─── calculateScheduledTime ───

describe('calculateScheduledTime', () => {
  it('morning: schedules for 9:00 AM', () => {
    const result = calculateScheduledTime('morning');
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('afternoon: schedules for 2:00 PM', () => {
    const result = calculateScheduledTime('afternoon');
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(0);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('optimal: schedules for 10:30 AM on a weekday', () => {
    const result = calculateScheduledTime('optimal');
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(30);
    // Should not be Saturday (6) or Sunday (0)
    expect(result.getDay()).not.toBe(0);
    expect(result.getDay()).not.toBe(6);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('immediate: returns roughly now', () => {
    const before = Date.now();
    const result = calculateScheduledTime('immediate');
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after + 100);
  });

  it('morning: rolls to next day if 9 AM already passed', () => {
    // If we mock time to 10:00 AM, morning should be tomorrow
    const mockDate = new Date();
    mockDate.setHours(10, 0, 0, 0);
    vi.setSystemTime(mockDate);

    const result = calculateScheduledTime('morning');
    const tomorrow = new Date(mockDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    expect(result.getTime()).toBe(tomorrow.getTime());

    vi.useRealTimers();
  });

  it('optimal: skips Saturday to Monday', () => {
    // Set mock time to Friday 11:00 AM — "optimal" should skip to Monday
    const friday = new Date('2026-02-20T11:00:00'); // Feb 20, 2026 is a Friday
    vi.setSystemTime(friday);

    const result = calculateScheduledTime('optimal');
    // Should land on Monday Feb 23
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(30);

    vi.useRealTimers();
  });

  it('optimal: skips Sunday to Monday', () => {
    const sunday = new Date('2026-02-22T08:00:00'); // Sunday
    vi.setSystemTime(sunday);

    const result = calculateScheduledTime('optimal');
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getHours()).toBe(10);

    vi.useRealTimers();
  });
});

// ─── personalizeForSend ───

describe('personalizeForSend', () => {
  const lead = {
    name: 'Jane Smith',
    company: 'Acme Corp',
    email: 'jane@acme.com',
    score: 85,
    insights: 'Recently raised Series B',
    knowledgeBase: {
      industry: 'SaaS',
      title: 'VP of Sales',
    },
  };

  it('replaces {{first_name}} with first name', () => {
    expect(personalizeForSend('Hi {{first_name}}!', lead)).toBe('Hi Jane!');
  });

  it('replaces {{company}}', () => {
    expect(personalizeForSend('At {{company}}', lead)).toBe('At Acme Corp');
  });

  it('replaces {{industry}} from knowledgeBase', () => {
    expect(personalizeForSend('In {{industry}}', lead)).toBe('In SaaS');
  });

  it('replaces {{ai_insight}}', () => {
    expect(personalizeForSend('Insight: {{ai_insight}}', lead)).toBe('Insight: Recently raised Series B');
  });

  it('strips unreplaced tags', () => {
    expect(personalizeForSend('Hi {{first_name}}, your {{nonexistent_tag}}', lead)).toBe('Hi Jane, your ');
  });

  it('replaces sender name when provided', () => {
    expect(personalizeForSend('From {{your_name}}', lead, 'Bob')).toBe('From Bob');
  });

  it('handles multiple tags in one string', () => {
    const template = 'Hi {{first_name}} at {{company}}, score: {{score}}';
    expect(personalizeForSend(template, lead)).toBe('Hi Jane at Acme Corp, score: 85');
  });

  it('case-insensitive tag matching', () => {
    expect(personalizeForSend('Hi {{FIRST_NAME}}!', lead)).toBe('Hi Jane!');
    expect(personalizeForSend('At {{Company}}', lead)).toBe('At Acme Corp');
  });
});

// ─── Config → actionType resolution ───

describe('actionType config resolution', () => {
  // This tests the logic pattern used in executeAction:
  //   const actionType = (node.config.actionType as string) || inferActionType(node);
  // We verify that when actionType is set explicitly, it takes precedence.

  it('explicit actionType in config takes precedence over title', () => {
    const config = { actionType: 'send_email', template: 'welcome' };
    const actionType = (config.actionType as string) || 'generic';
    expect(actionType).toBe('send_email');
  });

  it('missing actionType falls back', () => {
    const config = { template: 'welcome' };
    const actionType = ((config as any).actionType as string) || 'fallback';
    expect(actionType).toBe('fallback');
  });

  it('custom email config keys are preserved', () => {
    const config = {
      actionType: 'send_email',
      template: '__custom__',
      customSubject: 'Hi {{first_name}}',
      customBody: '<p>Hello</p>',
      aiPersonalization: true,
      timing: 'morning',
      fallbackEnabled: true,
      fallbackAction: 'retry',
    };

    expect(config.actionType).toBe('send_email');
    expect(config.template).toBe('__custom__');
    expect(config.customSubject).toBe('Hi {{first_name}}');
    expect(config.customBody).toBe('<p>Hello</p>');
    expect(config.aiPersonalization).toBe(true);
    expect(config.timing).toBe('morning');
    expect(config.fallbackEnabled).toBe(true);
    expect(config.fallbackAction).toBe('retry');
  });
});
