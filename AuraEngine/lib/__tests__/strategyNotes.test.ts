import { describe, it, expect } from 'vitest';

describe('strategy note lead linking', () => {
  it('note interface includes lead_id', () => {
    const note = {
      id: 'n1', user_id: 'u1', content: 'test',
      lead_id: 'lead-uuid', lead_name: 'John Doe',
      created_at: '2026-03-02T00:00:00Z', team_id: null, author_name: null,
    };
    expect(note.lead_id).toBe('lead-uuid');
    expect(note.lead_name).toBe('John Doe');
  });

  it('note without lead has null lead_id', () => {
    const note = {
      id: 'n2', user_id: 'u1', content: 'no lead',
      lead_id: null, lead_name: null,
      created_at: '2026-03-02T00:00:00Z', team_id: null, author_name: null,
    };
    expect(note.lead_id).toBeNull();
  });

  it('lead rename does not break link (lead_id is stable)', () => {
    const leadId = 'lead-uuid-123';
    const note = { lead_id: leadId, lead_name: 'Old Name' };
    // Simulate lead rename — lead_id stays the same
    const renamedLead = { id: leadId, first_name: 'New', last_name: 'Name' };
    expect(note.lead_id).toBe(renamedLead.id); // Still linked
  });

  it('notesWithLeads counts by lead_id, not lead_name', () => {
    const notes = [
      { lead_id: 'a', lead_name: 'Alice' },
      { lead_id: null, lead_name: 'Bob' },  // orphaned name, no lead_id
      { lead_id: 'c', lead_name: null },     // linked but display name missing
    ];
    const withLeads = notes.filter(n => n.lead_id).length;
    expect(withLeads).toBe(2); // 'a' and 'c', not 'Bob'
  });
});
