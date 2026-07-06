import React, { useState, useCallback, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createTrialAccount } from '../../lib/trialApi';
import { supabase } from '../../lib/supabase';
import { track } from '../../lib/analytics';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

interface FormErrors {
  email?: string;
  password?: string;
  terms?: string;
}

const inputBase =
  'w-full px-4 py-3 rounded-xl bg-white border text-[#1C1A17] placeholder-[#B0A798] outline-none transition-colors focus:ring-2 focus:ring-teal-600/20';

const TrialSignupPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [formState, setFormState] = useState<FormState>('idle');
  const [serverError, setServerError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Store selected plan from pricing page so it survives email verification
  useEffect(() => {
    const plan = searchParams.get('plan');
    if (plan) localStorage.setItem('scaliyo_selected_plan', plan);
  }, [searchParams]);

  const validate = useCallback((): boolean => {
    const next: FormErrors = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'Please enter a valid email address.';
    }
    if (!password || password.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    }
    if (!agreed) {
      next.terms = 'You must agree to the terms.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [email, password, agreed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    track('signup_start', { email });
    setFormState('submitting');
    setServerError('');

    const result = await createTrialAccount({ email, password, company });

    if (result.ok) {
      track('signup_success', { email });
      setFormState('success');
    } else {
      track('signup_error', { email, error: result.error });
      setServerError(result.error || 'Something went wrong. Please try again.');
      setFormState('error');
    }
  };

  const handleResend = async () => {
    setResendStatus('sending');
    await supabase.auth.resend({ type: 'signup', email });
    setResendStatus('sent');
    setTimeout(() => setResendStatus('idle'), 5000);
  };

  /* ── Success state: Check your email ── */
  if (formState === 'success') {
    return (
      <div className="bg-[#FBFAF7] text-[#1C1A17] min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#EAF2EF] flex items-center justify-center">
            <svg className="w-8 h-8 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-medium mb-3">Check your email</h1>
          <p className="text-[#6F6860] mb-2">
            We&rsquo;ve sent a confirmation link to <strong className="text-[#1C1A17]">{email}</strong>.
          </p>
          <p className="text-sm text-[#9A9189] mb-6">
            Click the link in the email to activate your account, then sign in.
          </p>
          <button
            onClick={handleResend}
            disabled={resendStatus === 'sending'}
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition-colors disabled:opacity-50"
          >
            {resendStatus === 'sent' ? 'Email resent!' : resendStatus === 'sending' ? 'Sending...' : "Didn’t get it? Resend email"}
          </button>
          <div className="mt-6">
            <Link to="/auth" className="text-sm text-[#9A9189] hover:text-[#1C1A17] transition-colors">
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FBFAF7] text-[#1C1A17] min-h-screen flex items-center justify-center px-6 pt-16 pb-16 relative overflow-hidden">
      {/* Soft pastel wash */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-[32rem] h-[32rem] rounded-full bg-[#E7F0ED] blur-3xl opacity-70" />
        <div className="absolute -bottom-24 -right-24 w-[30rem] h-[30rem] rounded-full bg-[#F5E7DF] blur-3xl opacity-60" />
      </div>

      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <Link to="/" className="inline-block mb-8">
            <img src="/scaliyo-logo-light.webp" alt="Scaliyo" width={106} height={40} className="h-10 w-auto" />
          </Link>
          <h1 className="font-display text-3xl font-medium mb-2">Start your free trial</h1>
          <p className="text-[#6F6860]">
            14 days free. No credit card required. Setup in under 5 minutes.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5 bg-white border border-[#EAE3D6] rounded-[1.5rem] shadow-chic p-8">
          {/* Server error */}
          {serverError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-[#1C1A17] mb-1.5">
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
              className={`${inputBase} ${errors.email ? 'border-red-300' : 'border-[#EAE3D6] focus:border-teal-600/50'}`}
              placeholder="you@company.com"
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-[#1C1A17] mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
              className={`${inputBase} ${errors.password ? 'border-red-300' : 'border-[#EAE3D6] focus:border-teal-600/50'}`}
              placeholder="8+ characters"
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
          </div>

          {/* Company (optional) */}
          <div>
            <label htmlFor="company" className="block text-sm font-semibold text-[#1C1A17] mb-1.5">
              Company <span className="text-[#9A9189] font-normal">(optional)</span>
            </label>
            <input
              id="company"
              type="text"
              autoComplete="organization"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={`${inputBase} border-[#EAE3D6] focus:border-teal-600/50`}
              placeholder="Acme Inc."
            />
          </div>

          {/* Terms checkbox */}
          <div className="flex items-start gap-3">
            <input
              id="terms"
              type="checkbox"
              checked={agreed}
              onChange={(e) => { setAgreed(e.target.checked); setErrors((p) => ({ ...p, terms: undefined })); }}
              className="mt-1 w-4 h-4 rounded border-[#D9D0C0] bg-white text-teal-600 focus:ring-teal-600/30 focus:ring-offset-0"
            />
            <label htmlFor="terms" className="text-sm text-[#6F6860] leading-snug">
              I agree to the{' '}
              <span className="text-teal-700 hover:text-teal-800 cursor-pointer font-medium">Terms of Service</span>{' '}
              and{' '}
              <span className="text-teal-700 hover:text-teal-800 cursor-pointer font-medium">Privacy Policy</span>.
            </label>
          </div>
          {errors.terms && <p className="text-xs text-red-600 -mt-2">{errors.terms}</p>}

          {/* Submit */}
          <button
            type="submit"
            disabled={formState === 'submitting'}
            className="w-full py-3.5 rounded-full bg-[#1C1A17] text-white font-semibold text-base transition-all duration-300 hover:bg-black hover:-translate-y-0.5 active:translate-y-0 shadow-chic disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {formState === 'submitting' ? (
              <span className="inline-flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating your account...
              </span>
            ) : (
              'Start free trial'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-[#9A9189] mt-8">
          Already have an account?{' '}
          <Link to="/auth" className="text-teal-700 font-semibold hover:text-teal-800 transition-colors">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default TrialSignupPage;
