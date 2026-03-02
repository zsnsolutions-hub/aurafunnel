/** Maps incoming payload keys from legacy to canonical field names */
export function mapLeadPayloadToCanonical(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };

  // email → primary_email
  if ('email' in out && !('primary_email' in out)) {
    out.primary_email = out.email;
  }
  delete out.email;

  // name → first_name + last_name
  if ('name' in out && !('first_name' in out)) {
    const full = (out.name as string) || '';
    out.first_name = full.split(' ')[0] || '';
    out.last_name = full.split(' ').slice(1).join(' ') || '';
  }
  delete out.name;

  // phone → primary_phone
  if ('phone' in out && !('primary_phone' in out)) {
    out.primary_phone = out.phone;
  }
  delete out.phone;

  // lastActivity → last_activity
  if ('lastActivity' in out && !('last_activity' in out)) {
    out.last_activity = out.lastActivity;
  }
  delete out.lastActivity;

  return out;
}
