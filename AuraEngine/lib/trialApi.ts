import { supabase } from './supabase';

export interface TrialSignupPayload {
  email: string;
  password: string;
  company?: string;
}

export interface TrialSignupResponse {
  ok: boolean;
  email?: string;
  error?: string;
}

export async function createTrialAccount(
  payload: TrialSignupPayload,
): Promise<TrialSignupResponse> {
  if (!payload.email || !payload.email.includes('@')) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!payload.password || payload.password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: { full_name: payload.company || '' },
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // Supabase returns a user with identities=[] when the email is already registered
  // and "Confirm email" is enabled
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { ok: false, error: 'An account with this email already exists.' };
  }

  return { ok: true, email: payload.email };
}
