import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { LockIcon, EyeIcon } from '../../components/Icons';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => navigate('/auth'), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#1C1A17] flex items-center justify-center px-6">
      <div className="max-w-[420px] w-full">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center mb-8 group">
            <img src="/scaliyo-logo-light.webp" alt="Scaliyo" width={106} height={40} className="h-10 w-auto group-hover:scale-105 transition-transform duration-300" />
          </Link>
          <h2 className="font-display text-3xl font-medium text-[#1C1A17] tracking-tight">Set new password</h2>
          <p className="text-[#6F6860] mt-2 text-sm">
            Enter your new password below.
          </p>
        </div>

        <div className="bg-white p-8 rounded-[1.5rem] border border-[#EAE3D6] shadow-chic">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-red-600 text-xs font-black">!</span>
              </div>
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          {success ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#EAF2EF] flex items-center justify-center">
                <svg className="w-7 h-7 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-display text-lg font-medium text-[#1C1A17]">Password updated</h3>
              <p className="text-[#6F6860] text-sm">Redirecting you to sign in...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-[#A79E90] uppercase tracking-widest mb-2">New Password</label>
                <div className="relative">
                  <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A798]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8+ characters"
                    className="w-full pl-11 pr-11 py-3.5 rounded-xl bg-white border border-[#EAE3D6] text-[#1C1A17] placeholder-[#B0A798] focus:outline-none focus:border-teal-600/50 focus:ring-2 focus:ring-teal-600/20 transition-all font-medium text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#B0A798] hover:text-[#6F6860] transition-colors">
                    <EyeIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#A79E90] uppercase tracking-widest mb-2">Confirm Password</label>
                <div className="relative">
                  <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A798]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white border border-[#EAE3D6] text-[#1C1A17] placeholder-[#B0A798] focus:outline-none focus:border-teal-600/50 focus:ring-2 focus:ring-teal-600/20 transition-all font-medium text-sm"
                  />
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full py-4 rounded-full bg-[#1C1A17] text-white font-semibold text-sm transition-all flex items-center justify-center space-x-2 hover:bg-black shadow-chic hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                {isSubmitting ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Updating...</span></>
                ) : (
                  <span>Update password</span>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center space-x-2 text-[10px] text-[#A79E90]">
            <LockIcon className="w-3 h-3" />
            <span>256-bit SSL encryption</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
