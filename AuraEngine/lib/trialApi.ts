/**
 * Mock trial signup API.
 * Structured so it's easy to swap with a real backend later.
 */

export interface TrialSignupPayload {
  email: string;
  password: string;
  company?: string;
}

export interface TrialSignupResponse {
  ok: boolean;
  next?: string;
  error?: string;
}

/** Simulate latency + in-memory user store */
const registeredEmails = new Set<string>();

export async function createTrialAccount(
  payload: TrialSignupPayload,
): Promise<TrialSignupResponse> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 1200));

  // Basic validation
  if (!payload.email || !payload.email.includes('@')) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!payload.password || payload.password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (registeredEmails.has(payload.email)) {
    return { ok: false, error: 'An account with this email already exists.' };
  }

  // "Create" the user
  registeredEmails.add(payload.email);

  return { ok: true, next: '/portal' };
}
