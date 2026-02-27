import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const ConfirmEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'recovery' | 'email_change';

    if (!tokenHash || !type) {
      setStatus('error');
      setErrorMsg('Invalid confirmation link. Missing token or type.');
      return;
    }

    const verify = async () => {
      try {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          setStatus('error');
          setErrorMsg(error.message);
        } else {
          setStatus('success');
          if (type === 'recovery') {
            setTimeout(() => navigate('/reset-password'), 2000);
          } else {
            setTimeout(() => navigate('/auth'), 3000);
          }
        }
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Verification failed.');
      }
    };

    verify();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-white flex items-center justify-center px-6">
      <div className="max-w-[420px] w-full">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center mb-8 group">
            <img src="/scaliyo-logo-dark.webp" alt="Scaliyo" width={106} height={40} className="h-10 w-auto group-hover:scale-105 transition-transform duration-300" />
          </Link>
        </div>

        <div className="bg-[#0F1D32] p-8 rounded-2xl border border-slate-700/50 shadow-2xl shadow-black/20">
          {status === 'verifying' && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
              <h3 className="text-lg font-bold text-white">Verifying your email...</h3>
              <p className="text-slate-400 text-sm">Please wait while we confirm your email address.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-teal-500/15 flex items-center justify-center">
                <svg className="w-7 h-7 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white">Email confirmed!</h3>
              <p className="text-slate-400 text-sm">Your email has been verified. Redirecting you to sign in...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-500/15 flex items-center justify-center">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white">Verification failed</h3>
              <p className="text-slate-400 text-sm">{errorMsg || 'The confirmation link may have expired.'}</p>
              <Link
                to="/auth"
                className="inline-block mt-4 px-6 py-3 rounded-xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-400 transition-colors"
              >
                Go to Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmEmailPage;
