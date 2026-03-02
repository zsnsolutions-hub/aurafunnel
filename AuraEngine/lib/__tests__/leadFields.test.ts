import { describe, it, expect } from 'vitest';
import { normalizeLeads, leadDisplayName, leadInitials } from '../queries';
import { mapLeadPayloadToCanonical } from '../leadFieldMapper';
import { resolvePersonalizationTags } from '../personalization';

// ─── normalizeLeads ───

describe('normalizeLeads', () => {
  it('computes name/email from canonical fields', () => {
    const rows = [{
      first_name: 'John',
      last_name: 'Doe',
      primary_email: 'john@example.com',
      primary_phone: '+1234567890',
      last_activity: '2026-01-01T00:00:00Z',
      company: 'Acme',
      score: 80,
      status: 'New',
    }];
    const [lead] = normalizeLeads(rows);
    expect(lead.name).toBe('John Doe');
    expect(lead.email).toBe('john@example.com');
    expect(lead.lastActivity).toBe('2026-01-01T00:00:00Z');
    expect(lead.first_name).toBe('John');
    expect(lead.last_name).toBe('Doe');
    expect(lead.primary_email).toBe('john@example.com');
  });

  it('falls back to empty strings when canonical fields are null', () => {
    const rows = [{
      first_name: null,
      last_name: null,
      primary_email: null,
      primary_phone: null,
      last_activity: null,
      company: null,
    }];
    const [lead] = normalizeLeads(rows);
    expect(lead.first_name).toBe('');
    expect(lead.last_name).toBe('');
    expect(lead.primary_email).toBe('');
    expect(lead.primary_phone).toBe('');
    expect(lead.name).toBe('');
    expect(lead.email).toBe('');
    expect(lead.company).toBe('');
  });

  it('handles first_name only (no last_name)', () => {
    const rows = [{ first_name: 'Jane', last_name: '', primary_email: 'jane@x.com' }];
    const [lead] = normalizeLeads(rows);
    expect(lead.name).toBe('Jane');
  });
});

// ─── leadDisplayName ───

describe('leadDisplayName', () => {
  it('returns full name from first + last', () => {
    expect(leadDisplayName({ first_name: 'John', last_name: 'Doe' })).toBe('John Doe');
  });

  it('returns first name only when last is empty', () => {
    expect(leadDisplayName({ first_name: 'John', last_name: '' })).toBe('John');
  });

  it('returns "Unknown" when both are empty', () => {
    expect(leadDisplayName({ first_name: '', last_name: '' })).toBe('Unknown');
  });
});

// ─── leadInitials ───

describe('leadInitials', () => {
  it('returns initials from first + last', () => {
    expect(leadInitials({ first_name: 'John', last_name: 'Doe' })).toBe('JD');
  });

  it('returns single initial when only first name', () => {
    expect(leadInitials({ first_name: 'John', last_name: '' })).toBe('J');
  });

  it('returns "?" when both are empty', () => {
    expect(leadInitials({ first_name: '', last_name: '' })).toBe('?');
  });
});

// ─── mapLeadPayloadToCanonical ───

describe('mapLeadPayloadToCanonical', () => {
  it('maps email to primary_email', () => {
    const result = mapLeadPayloadToCanonical({ email: 'test@x.com', name: 'Jane Doe' });
    expect(result.primary_email).toBe('test@x.com');
    expect(result.first_name).toBe('Jane');
    expect(result.last_name).toBe('Doe');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('name');
  });

  it('maps phone to primary_phone', () => {
    const result = mapLeadPayloadToCanonical({ phone: '+1234567890' });
    expect(result.primary_phone).toBe('+1234567890');
    expect(result).not.toHaveProperty('phone');
  });

  it('maps lastActivity to last_activity', () => {
    const result = mapLeadPayloadToCanonical({ lastActivity: '2026-01-01T00:00:00Z' });
    expect(result.last_activity).toBe('2026-01-01T00:00:00Z');
    expect(result).not.toHaveProperty('lastActivity');
  });

  it('does not overwrite existing canonical fields', () => {
    const result = mapLeadPayloadToCanonical({
      email: 'legacy@x.com',
      primary_email: 'canonical@x.com',
      name: 'Legacy Name',
      first_name: 'Canonical',
    });
    expect(result.primary_email).toBe('canonical@x.com');
    expect(result.first_name).toBe('Canonical');
  });

  it('handles single-word name', () => {
    const result = mapLeadPayloadToCanonical({ name: 'Madonna' });
    expect(result.first_name).toBe('Madonna');
    expect(result.last_name).toBe('');
  });

  it('handles multi-word last name', () => {
    const result = mapLeadPayloadToCanonical({ name: 'Jean Claude Van Damme' });
    expect(result.first_name).toBe('Jean');
    expect(result.last_name).toBe('Claude Van Damme');
  });
});

// ─── resolvePersonalizationTags ───

describe('resolvePersonalizationTags with canonical fields', () => {
  it('resolves {{first_name}} from lead.first_name', () => {
    const result = resolvePersonalizationTags(
      'Hi {{first_name}}, welcome to {{company}}!',
      { first_name: 'Jane', last_name: 'Smith', primary_email: 'jane@x.com', company: 'Acme' }
    );
    expect(result).toBe('Hi Jane, welcome to Acme!');
  });

  it('resolves {{full_name}} from first + last', () => {
    const result = resolvePersonalizationTags(
      'Dear {{full_name}}',
      { first_name: 'Jane', last_name: 'Smith' }
    );
    expect(result).toBe('Dear Jane Smith');
  });

  it('resolves {{email}} from primary_email', () => {
    const result = resolvePersonalizationTags(
      'Reply to {{email}}',
      { primary_email: 'jane@x.com' }
    );
    expect(result).toBe('Reply to jane@x.com');
  });

  it('strips unresolved tags', () => {
    const result = resolvePersonalizationTags(
      'Hello {{first_name}}, {{unknown_tag}}',
      { first_name: 'Jane' }
    );
    expect(result).toBe('Hello Jane, ');
  });
});
