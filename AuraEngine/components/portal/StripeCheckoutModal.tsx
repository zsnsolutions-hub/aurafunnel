import React, { useState } from 'react';
import { Plan, User } from '../../types';
import { BoltIcon, SparklesIcon, CheckIcon, ShieldIcon, LockIcon, XIcon } from '../Icons';
import { createSubscriptionCheckout } from '../../lib/stripe';
import { CREDIT_LIMITS } from '../../config/creditLimits';

interface StripeCheckoutModalProps {
  plan: Plan;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
  billingInterval?: 'monthly' | 'annual';
}

const StripeCheckoutModal: React.FC<StripeCheckoutModalProps> = ({
  plan,
  user,
  onClose,
  onSuccess,
  billingInterval = 'monthly',
}) => {
  const [step, setStep] = useState<'confirm' | 'redirecting' | 'error'>('confirm');
  const [error, setError] = useState<string | null>(null);

  const stripePriceId = billingInterval === 'annual'
    ? (plan as any).stripe_price_id_annual || plan.stripe_price_id
    : plan.stripe_price_id;

  const handleCheckout = async () => {
    if (!stripePriceId) {
      setError('This plan is not yet available for purchase. Please contact support.');
      setStep('error');
      return;
    }

    setStep('redirecting');
    setError(null);

    try {
      const { url } = await createSubscriptionCheckout({
        planName: plan.name,
        stripePriceId,
        billingInterval,
      });
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message || 'Failed to start checkout. Please try again.');
      setStep('error');
    }
  };

  const planKey = plan.name.toLowerCase() as keyof typeof CREDIT_LIMITS;
  const creditLimit = CREDIT_LIMITS[planKey] ?? 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-6 overflow-y-auto">
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-500"
        onClick={() => step !== 'redirecting' && onClose()}
      />

      <div className="relative bg-white w-full max-w-5xl md:rounded-[3rem] shadow-3xl overflow-hidden flex flex-col md:flex-row min-h-screen md:min-h-0 animate-in zoom-in-95 duration-500">

        {/* Left: Order Summary */}
        <div className="w-full md:w-[40%] bg-slate-50 p-8 md:p-12 flex flex-col border-r border-slate-200">
          <div className="flex items-center space-x-3 mb-12">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <SparklesIcon className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold text-slate-900 font-heading">Scaliyo</span>
          </div>

          <div className="flex-grow space-y-8">
            <div className="animate-in fade-in slide-in-from-left-4 duration-700">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Upgrade Selection</p>
              <h3 className="text-3xl font-bold text-slate-900 font-heading">{plan.name} Plan</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">{plan.description}</p>
            </div>

            <div className="py-8 border-y border-slate-200 space-y-5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">
                  Billed {billingInterval === 'annual' ? 'Annually' : 'Monthly'}
                </span>
                <span className="text-slate-900 font-bold">{plan.price}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div className="flex flex-col">
                  <span className="text-slate-500 font-medium">AI Credits</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Monthly reset</span>
                </div>
                <span className="text-indigo-600 font-bold">+{creditLimit.toLocaleString()} /mo</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Full AI Engine</span>
                <span className="text-emerald-600 font-bold uppercase text-[10px] tracking-widest bg-emerald-50 px-2 py-1 rounded">Enabled</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline pt-4">
              <span className="text-lg font-bold text-slate-900 font-heading">Total Charge</span>
              <div className="text-right">
                <span className="text-3xl font-black text-slate-900 font-heading">{plan.price}</span>
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  {billingInterval === 'annual' ? 'Per month, billed annually' : 'Per month'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 p-5 bg-white rounded-2xl border border-slate-200 flex items-start space-x-3 shadow-sm">
            <ShieldIcon className="w-5 h-5 text-emerald-500 mt-0.5" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-relaxed">
              You&apos;ll be redirected to Stripe&apos;s secure checkout. Scaliyo never sees your card details.
              <br />
              <span className="text-indigo-600">PCI Level 1 Certified</span>
            </p>
          </div>
        </div>

        {/* Right: CTA */}
        <div className="w-full md:w-[60%] p-8 md:p-16 bg-white flex flex-col justify-center relative">

          {/* Close button */}
          {step !== 'redirecting' && (
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-slate-300 hover:text-slate-500 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          )}

          {step === 'confirm' && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 font-heading">Ready to upgrade?</h2>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                  You&apos;ll be redirected to Stripe&apos;s secure checkout page to complete your subscription.
                  You can cancel anytime from your billing dashboard.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  'Instant access after payment',
                  'Cancel or change plans anytime',
                  '14-day money-back guarantee',
                  'Credits reset monthly',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-emerald-50 rounded-lg flex items-center justify-center">
                      <CheckIcon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <span className="text-sm text-slate-600 font-medium">{item}</span>
                  </div>
                ))}
              </div>

              <div className="pt-8 space-y-4">
                <button
                  onClick={handleCheckout}
                  className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-2xl shadow-indigo-100 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3"
                >
                  <LockIcon className="w-5 h-5" />
                  <span>Continue to Checkout</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 'redirecting' && (
            <div className="flex flex-col items-center justify-center text-center space-y-8 animate-in zoom-in-95 duration-500">
              <div className="relative">
                <div className="w-32 h-32 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 animate-pulse">
                    <BoltIcon className="w-8 h-8" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-900 font-heading">Redirecting to Stripe</h3>
                <p className="text-slate-400 text-sm max-w-[280px] mx-auto leading-relaxed">
                  Taking you to secure checkout for <span className="text-indigo-600 font-bold">{plan.name}</span>...
                </p>
              </div>
              <div className="w-64 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full animate-progress-indefinite" />
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm font-bold rounded-xl">
                {error}
              </div>
              <div className="space-y-4">
                <button
                  onClick={() => { setStep('confirm'); setError(null); }}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StripeCheckoutModal;
