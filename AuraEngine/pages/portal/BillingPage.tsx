import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BoltIcon, CreditCardIcon, CheckIcon, SparklesIcon, ShieldIcon, RefreshIcon, DatabaseIcon, MailIcon, TargetIcon } from '../../components/Icons';
import { User, Plan, UsageMetrics } from '../../types';
import { supabase } from '../../lib/supabase';
import StripeCheckoutModal from '../../components/portal/StripeCheckoutModal';

const BillingPage: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const creditsTotal = user.credits_total ?? 500;
  const creditsUsed = user.credits_used ?? 0;
  const currentPlanName = user.subscription?.plan_name || user.plan || 'Starter';

  const fetchPlans = async (isManual = false) => {
    if (isManual) setLoadingPlans(true);
    setFetchError(false);
    
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('credits', { ascending: true });
      
      if (error) throw error;
      if (data) setPlans(data);
    } catch (err) {
      console.error("Error fetching plans:", err);
      setFetchError(true);
    } finally {
      setLoadingPlans(false);
    }
  };

  const [usage, setUsage] = useState<UsageMetrics>({
    aiTokensUsed: 0, aiTokensLimit: 100000,
    leadsProcessed: 0, leadsLimit: 1000,
    storageUsedMb: 0, storageLimitMb: 5000,
    emailCreditsUsed: 0, emailCreditsLimit: 500
  });

  useEffect(() => {
    fetchPlans();
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const [tokensRes, leadsRes, emailRes] = await Promise.all([
        supabase.from('ai_usage_logs').select('tokens_used').eq('user_id', user.id),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', user.id),
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('action', 'AI_CONTENT_GENERATED'),
      ]);

      const totalTokens = tokensRes.data?.reduce((acc: number, r: any) => acc + (r.tokens_used || 0), 0) || 0;
      const tierLimits = currentPlanName === 'Professional' ? { leads: 5000, tokens: 500000, email: 2500 } :
                          currentPlanName === 'Enterprise' ? { leads: 999999, tokens: 999999, email: 99999 } :
                          { leads: 1000, tokens: 100000, email: 500 };

      setUsage({
        aiTokensUsed: totalTokens,
        aiTokensLimit: tierLimits.tokens,
        leadsProcessed: leadsRes.count || 0,
        leadsLimit: tierLimits.leads,
        storageUsedMb: Math.round((totalTokens / 1000) * 0.5 + (leadsRes.count || 0) * 0.02),
        storageLimitMb: 5000,
        emailCreditsUsed: emailRes.count || 0,
        emailCreditsLimit: tierLimits.email
      });
    } catch (err) {
      console.error("Usage fetch error:", err);
    }
  };

  const invoices = useMemo(() => {
    const history = [];
    const subscriptionDate = user.subscription?.created_at ? new Date(user.subscription.created_at) : new Date(user.createdAt || Date.now());
    const now = new Date();
    
    let currentIter = new Date(now.getFullYear(), now.getMonth(), 1);
    while (currentIter > subscriptionDate && history.length < 4) {
      currentIter.setMonth(currentIter.getMonth() - 1);
      const invoiceDate = new Date(currentIter.getFullYear(), currentIter.getMonth(), 15);
      
      history.push({
        id: `INV-${invoiceDate.getFullYear()}-${(invoiceDate.getMonth() + 1).toString().padStart(2, '0')}`,
        date: invoiceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        amount: currentPlanName === 'Starter' ? '$49.00' : currentPlanName === 'Professional' ? '$149.00' : '$0.00',
        status: 'Paid',
        cycle: `${invoiceDate.getMonth() + 1}/${invoiceDate.getFullYear().toString().slice(-2)}`
      });
    }
    return history;
  }, [currentPlanName, user.subscription, user.createdAt]);

  const handleUpgradeClick = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsCheckoutOpen(true);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Billing & Subscription</h1>
          <p className="text-slate-500 mt-1">Manage your enterprise compute allocation and payment methods.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-600 flex items-center space-x-2 shadow-sm">
             <span className={`w-2.5 h-2.5 rounded-full ${user.subscription?.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'} animate-pulse`}></span>
             <span className="text-[10px] font-black uppercase tracking-widest">{user.subscription?.status ?? 'active'}</span>
          </div>
          <div className="bg-indigo-600 px-5 py-2.5 rounded-xl text-white flex items-center space-x-2 shadow-xl shadow-indigo-100 transition-transform hover:scale-105 active:scale-95">
            <BoltIcon className="w-4 h-4" />
            <span className="text-sm font-bold">{(creditsTotal - creditsUsed).toLocaleString()} Gen Remaining</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loadingPlans && plans.length === 0 ? (
          [1, 2, 3].map(i => (
            <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 animate-pulse h-[450px]"></div>
          ))
        ) : fetchError && plans.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
            <RefreshIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium mb-6">Failed to sync with intelligence grid.</p>
            <button onClick={() => fetchPlans(true)} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg">Retry Connection</button>
          </div>
        ) : (
          plans.map((plan) => {
            const isCurrent = currentPlanName === plan.name;
            return (
              <div 
                key={plan.id} 
                className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all relative flex flex-col group ${
                  isCurrent 
                    ? 'border-indigo-600 shadow-2xl shadow-indigo-100 scale-105 z-10' 
                    : 'border-slate-100 hover:border-indigo-200 hover:-translate-y-2'
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center space-x-2">
                    <CheckIcon className="w-3 h-3" />
                    <span>Current Tier</span>
                  </span>
                )}
                <h3 className="text-xl font-bold text-slate-900 mb-2 font-heading">{plan.name}</h3>
                <div className="flex items-baseline space-x-1 mb-6">
                  <span className="text-4xl font-black text-slate-900 font-heading">{plan.price}</span>
                  {plan.price !== 'Custom' && <span className="text-sm font-semibold leading-6">/ month</span>}
                </div>
                
                <div className="p-4 bg-slate-50 rounded-2xl mb-8 border border-slate-100 group-hover:bg-indigo-50 transition-colors">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Monthly Capacity</p>
                  <p className="font-bold text-slate-900 group-hover:text-indigo-900 transition-colors">{(plan.credits ?? 0).toLocaleString()} AI Generations</p>
                </div>

                <ul className="space-y-4 mb-10 flex-grow">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start space-x-3 text-slate-600 text-sm font-medium leading-relaxed">
                      <div className="mt-1 w-4 h-4 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <CheckIcon className="w-2.5 h-2.5" />
                      </div>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                
                <button 
                  onClick={() => handleUpgradeClick(plan)}
                  disabled={isCurrent}
                  className={`w-full py-4 rounded-2xl font-bold transition-all transform active:scale-95 ${
                    isCurrent 
                      ? 'bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-100' 
                      : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-xl shadow-indigo-100'
                  }`}
                >
                  {isCurrent ? 'Active Plan' : plan.price === 'Custom' ? 'Contact Enterprise' : `Upgrade to ${plan.name}`}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Usage Dashboard */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-10">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-bold text-slate-900 font-heading">Usage Dashboard</h3>
          <button onClick={fetchUsage} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
            <RefreshIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'AI Tokens Used', used: usage.aiTokensUsed, limit: usage.aiTokensLimit, icon: <SparklesIcon className="w-5 h-5" />, color: 'indigo' },
            { label: 'Leads Processed', used: usage.leadsProcessed, limit: usage.leadsLimit, icon: <TargetIcon className="w-5 h-5" />, color: 'emerald' },
            { label: 'Storage Used', used: usage.storageUsedMb, limit: usage.storageLimitMb, icon: <DatabaseIcon className="w-5 h-5" />, color: 'purple', unit: 'MB' },
            { label: 'Email Credits', used: usage.emailCreditsUsed, limit: usage.emailCreditsLimit, icon: <MailIcon className="w-5 h-5" />, color: 'amber' },
          ].map((metric) => {
            const pct = Math.min(Math.round((metric.used / metric.limit) * 100), 100);
            const isHigh = pct > 80;
            return (
              <div key={metric.label} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-all group/m">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 bg-${metric.color}-50 text-${metric.color}-600 rounded-xl group-hover/m:scale-110 transition-transform`}>
                    {metric.icon}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isHigh ? 'text-red-500' : 'text-slate-400'}`}>
                    {pct}%
                  </span>
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{metric.label}</p>
                <p className="text-lg font-black text-slate-900 font-heading">
                  {metric.used.toLocaleString()}{metric.unit ? ` ${metric.unit}` : ''}
                  <span className="text-xs font-bold text-slate-400 ml-1">/ {metric.limit.toLocaleString()}</span>
                </p>
                <div className="mt-3 w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${isHigh ? 'bg-red-500' : `bg-${metric.color}-500`}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Subscription Tier Comparison */}
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tier</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Leads/Mo</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Credits</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { name: 'Starter', leads: '1,000', credits: '10,000' },
                { name: 'Professional', leads: '5,000', credits: '50,000' },
                { name: 'Enterprise', leads: 'Unlimited', credits: 'Unlimited' },
              ].map(tier => (
                <tr key={tier.name} className={`${currentPlanName === tier.name ? 'bg-indigo-50/50' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-slate-800">{tier.name}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{tier.leads}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{tier.credits}</td>
                  <td className="px-4 py-3">
                    {currentPlanName === tier.name ? (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-600 text-white px-2.5 py-1 rounded-full">Current</span>
                    ) : (
                      <span className="text-[10px] text-slate-300">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-10 flex flex-col group">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-900 font-heading">Financial Control</h3>
            <div className="p-2.5 bg-slate-50 rounded-xl group-hover:bg-indigo-50 transition-colors">
              <CreditCardIcon className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
            </div>
          </div>
          
          <div className="flex-grow space-y-8">
            <div className="relative group/card overflow-hidden bg-slate-950 rounded-3xl p-8 text-white shadow-2xl transition-transform hover:scale-[1.02]">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover/card:opacity-10 transition-opacity">
                <SparklesIcon className="w-32 h-32" />
              </div>
              <div className="relative z-10 h-full flex flex-col justify-between min-h-[160px]">
                <div className="flex justify-between items-start">
                  <div className="w-14 h-9 bg-white/10 rounded-lg border border-white/20 flex items-center justify-center backdrop-blur-md">
                    <span className="text-[10px] font-black italic tracking-tighter">VISA</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Neural Card</span>
                </div>
                
                <div className="mt-8">
                  <p className="text-2xl font-bold tracking-[0.25em] mb-4">•••• •••• •••• 4242</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">Card Member</p>
                      <p className="text-xs font-bold uppercase tracking-widest truncate max-w-[120px]">{user.name || user.email.split('@')[0]}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">Exp Date</p>
                      <p className="text-xs font-bold font-mono">12 / 26</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-colors">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                <p className="text-sm font-bold text-emerald-600 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                  Active Auto-pay
                </p>
              </div>
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-colors">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Next Settlement</p>
                <p className="text-sm font-bold text-slate-800">
                   {user.subscription?.current_period_end 
                    ? new Date(user.subscription.current_period_end).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                    : 'Scheduled'}
                </p>
              </div>
            </div>
          </div>

          <button className="mt-8 w-full py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 hover:text-slate-900 transition-all active:scale-95 shadow-sm">
            Modify Payment Details
          </button>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-10 flex flex-col group">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-900 font-heading">Invoice Archive</h3>
            <div className="p-2.5 bg-slate-50 rounded-xl group-hover:bg-indigo-50 transition-colors">
              <ShieldIcon className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
            </div>
          </div>

          <div className="flex-grow space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
            {invoices.length > 0 ? (
              invoices.map((inv) => (
                <div key={inv.id} className="group/item flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 hover:border-indigo-100 transition-all">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-slate-50 group-hover/item:bg-indigo-50 text-slate-400 group-hover/item:text-indigo-600 rounded-xl flex items-center justify-center transition-colors">
                      <BoltIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 group-hover/item:text-indigo-600 transition-colors">{inv.id}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{inv.date} • Cycle {inv.cycle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{inv.amount}</p>
                    <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100 hover:border-indigo-600 transition-all mt-1">Download</button>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                <RefreshIcon className="w-12 h-12 mb-4 animate-spin-slow" />
                <p className="text-sm font-bold uppercase tracking-widest">Awaiting First Transaction</p>
              </div>
            )}
          </div>
          
          <p className="mt-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em]">Vault Protected • End of Line</p>
        </div>
      </div>

      {isCheckoutOpen && selectedPlan && (
        <StripeCheckoutModal 
          plan={selectedPlan}
          user={user}
          onClose={() => setIsCheckoutOpen(false)}
          onSuccess={refreshProfile}
        />
      )}
    </div>
  );
};

export default BillingPage;