import React, { useState, useEffect, useMemo } from 'react';
import { loadStripe, StripeCardElement } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Plan, User } from '../../types';
import { BoltIcon, ShieldIcon, SparklesIcon, CheckIcon, CreditCardIcon, LockIcon } from '../Icons';
import { processStripePayment, getStripeConfig } from '../../lib/stripe';

interface StripeCheckoutModalProps {
  plan: Plan;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#1e293b',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      '::placeholder': { color: '#cbd5e1' },
    },
    invalid: {
      color: '#dc2626',
    },
  },
};

const CheckoutForm: React.FC<{
  plan: Plan;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ plan, user, onClose, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [step, setStep] = useState<'checkout' | 'processing' | 'success'>('checkout');
  const [error, setError] = useState<string | null>(null);
  const [cardName, setCardName] = useState(user.name || '');

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please try again.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('Card element not found.');
      return;
    }

    setError(null);
    setStep('processing');

    const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement as unknown as StripeCardElement,
      billing_details: { name: cardName },
    });

    if (stripeError) {
      setStep('checkout');
      setError(stripeError.message || 'Payment method creation failed.');
      return;
    }

    const success = await processStripePayment({
      planName: plan.name,
      amount: plan.price,
      credits: plan.credits,
      userId: user.id,
      paymentMethodId: paymentMethod.id,
    });

    if (success) {
      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2500);
    } else {
      setStep('checkout');
      setError('Payment authorization failed. Please verify your billing details or contact support.');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-500" onClick={() => step !== 'processing' && onClose()}></div>

      <div className="relative bg-white w-full max-w-5xl md:rounded-[3rem] shadow-3xl overflow-hidden flex flex-col md:flex-row min-h-screen md:min-h-0 animate-in zoom-in-95 duration-500">

        {/* Left Side: Professional Order Summary */}
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
                <span className="text-slate-500 font-medium">Billed Monthly</span>
                <span className="text-slate-900 font-bold">{plan.price}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div className="flex flex-col">
                  <span className="text-slate-500 font-medium">Compute Credits</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Monthly reset</span>
                </div>
                <span className="text-indigo-600 font-bold">+{plan.credits.toLocaleString()} Gen</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Neural Insights</span>
                <span className="text-emerald-600 font-bold uppercase text-[10px] tracking-widest bg-emerald-50 px-2 py-1 rounded">Enabled</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline pt-4">
              <span className="text-lg font-bold text-slate-900 font-heading">Total Charge</span>
              <div className="text-right">
                <span className="text-3xl font-black text-slate-900 font-heading">{plan.price}</span>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Tax Included</p>
              </div>
            </div>
          </div>

          <div className="mt-12 p-5 bg-white rounded-2xl border border-slate-200 flex items-start space-x-3 shadow-sm">
            <ShieldIcon className="w-5 h-5 text-emerald-500 mt-0.5" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-relaxed">
              Payments are secured by Stripe. Scaliyo does not store full card information.
              <br />
              <span className="text-indigo-600">Encrypted AES-256 GCM</span>
            </p>
          </div>
        </div>

        {/* Right Side: High-Fidelity Checkout Form */}
        <div className="w-full md:w-[60%] p-8 md:p-16 bg-white flex flex-col justify-center relative">

          {step === 'checkout' && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 font-heading">Secure Checkout</h2>
                  <p className="text-slate-500 text-sm mt-1">Complete your subscription to unlock advanced AI features.</p>
                </div>
                <div className="hidden sm:flex items-center space-x-1 opacity-20">
                  <CreditCardIcon className="w-6 h-6" />
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-xl animate-in shake">
                  {error}
                </div>
              )}

              <form onSubmit={handleCheckout} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Name on Card</label>
                  <input
                    type="text"
                    required
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all placeholder:text-slate-300"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Card Information</label>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-4 focus-within:ring-indigo-100 focus-within:border-indigo-500 transition-all">
                    <CardElement options={CARD_ELEMENT_OPTIONS} />
                  </div>
                </div>

                <div className="pt-8 space-y-4">
                  <button
                    type="submit"
                    disabled={!stripe}
                    className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-2xl shadow-indigo-100 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <LockIcon className="w-5 h-5" />
                    <span>Pay {plan.price} Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
                  >
                    Cancel Transaction
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center text-center space-y-8 animate-in zoom-in-95 duration-500">
              <div className="relative">
                <div className="w-32 h-32 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 animate-pulse">
                      <BoltIcon className="w-8 h-8" />
                   </div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-900 font-heading">Authorizing Payment</h3>
                <p className="text-slate-400 text-sm max-w-[280px] mx-auto leading-relaxed">Securely communicating with Stripe neural gateway for <span className="text-indigo-600 font-bold">{plan.name}</span>...</p>
              </div>
              <div className="w-64 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full animate-progress-indefinite"></div>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center justify-center text-center space-y-8 animate-in zoom-in-95 duration-500">
              <div className="w-28 h-28 bg-emerald-500 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-emerald-200 animate-bounce">
                <CheckIcon className="w-14 h-14" />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-slate-900 font-heading">Payment Successful</h3>
                <p className="text-slate-500 text-sm">Provisioning advanced compute resources to your account.</p>
              </div>
              <div className="flex flex-col items-center space-y-2 pt-4">
                <span className="px-4 py-1.5 bg-slate-100 text-slate-500 text-[9px] font-black rounded-lg uppercase tracking-widest">RECEIPT: #{Math.random().toString(36).substring(7).toUpperCase()}</span>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.4em]">Transaction Finalized</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StripeCheckoutModal: React.FC<StripeCheckoutModalProps> = (props) => {
  const [stripeKey, setStripeKey] = useState<string>(
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
  );

  useEffect(() => {
    if (!stripeKey) {
      getStripeConfig().then(setStripeKey);
    }
  }, [stripeKey]);

  const stripePromise = useMemo(
    () => (stripeKey ? loadStripe(stripeKey) : null),
    [stripeKey]
  );

  if (!stripePromise) {
    return null;
  }

  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm {...props} />
    </Elements>
  );
};

export default StripeCheckoutModal;
