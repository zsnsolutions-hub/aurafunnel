import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  BoltIcon, CreditCardIcon, CheckIcon, SparklesIcon, ShieldIcon, RefreshIcon, DatabaseIcon,
  MailIcon, TargetIcon, KeyboardIcon, TrendUpIcon, TrendDownIcon, XIcon, ClockIcon,
  ActivityIcon, AlertTriangleIcon, PieChartIcon, BrainIcon, LayersIcon, DownloadIcon,
  EyeIcon, UsersIcon, ArrowRightIcon
} from '../../components/Icons';
import { User, Plan, UsageMetrics } from '../../types';
import { supabase } from '../../lib/supabase';
import StripeCheckoutModal from '../../components/portal/StripeCheckoutModal';

const COLOR_CLASSES: Record<string, { bg50: string; text600: string; bg500: string }> = {
  indigo:  { bg50: 'bg-indigo-50',  text600: 'text-indigo-600',  bg500: 'bg-indigo-500' },
  emerald: { bg50: 'bg-emerald-50', text600: 'text-emerald-600', bg500: 'bg-emerald-500' },
  blue:    { bg50: 'bg-blue-50',    text600: 'text-blue-600',    bg500: 'bg-blue-500' },
  violet:  { bg50: 'bg-violet-50',  text600: 'text-violet-600',  bg500: 'bg-violet-500' },
  amber:   { bg50: 'bg-amber-50',   text600: 'text-amber-600',   bg500: 'bg-amber-500' },
  fuchsia: { bg50: 'bg-fuchsia-50', text600: 'text-fuchsia-600', bg500: 'bg-fuchsia-500' },
  rose:    { bg50: 'bg-rose-50',    text600: 'text-rose-600',    bg500: 'bg-rose-500' },
  purple:  { bg50: 'bg-purple-50',  text600: 'text-purple-600',  bg500: 'bg-purple-500' },
};

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

  const fetchUsage = useCallback(async () => {
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
  }, [user.id, currentPlanName]);

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

  // ─── Enhanced Wireframe State ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCostAnalysis, setShowCostAnalysis] = useState(false);
  const [showUsageTrends, setShowUsageTrends] = useState(false);
  const [showROICalculator, setShowROICalculator] = useState(false);
  const [showSpendForecast, setShowSpendForecast] = useState(false);
  const [showCreditAnalytics, setShowCreditAnalytics] = useState(false);
  const [showPlanComparison, setShowPlanComparison] = useState(false);

  // ─── KPI Stats ───
  const kpiStats = useMemo(() => {
    const creditsRemaining = creditsTotal - creditsUsed;
    const usagePct = Math.min(Math.round((creditsUsed / creditsTotal) * 100), 100);
    const monthlyPrice = currentPlanName === 'Professional' ? 149 : currentPlanName === 'Enterprise' ? 499 : 49;
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dayOfMonth = new Date().getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const costPerLead = usage.leadsProcessed > 0 ? (monthlyPrice / usage.leadsProcessed).toFixed(2) : '—';
    const costPerGeneration = creditsUsed > 0 ? (monthlyPrice / creditsUsed).toFixed(2) : '—';

    return [
      { label: 'Current Plan', value: currentPlanName, icon: <LayersIcon className="w-5 h-5" />, color: 'indigo', trend: `$${monthlyPrice}/mo`, up: null },
      { label: 'Credits Used', value: `${usagePct}%`, icon: <BoltIcon className="w-5 h-5" />, color: 'emerald', trend: `${creditsRemaining.toLocaleString()} remaining`, up: usagePct < 80 },
      { label: 'Monthly Cost', value: `$${monthlyPrice}`, icon: <CreditCardIcon className="w-5 h-5" />, color: 'blue', trend: `$${(monthlyPrice / daysInMonth).toFixed(2)}/day`, up: true },
      { label: 'Cost per Lead', value: `$${costPerLead}`, icon: <UsersIcon className="w-5 h-5" />, color: 'violet', trend: `${usage.leadsProcessed} leads processed`, up: true },
      { label: 'AI Tokens', value: `${(usage.aiTokensUsed / 1000).toFixed(1)}K`, icon: <BrainIcon className="w-5 h-5" />, color: 'amber', trend: `of ${(usage.aiTokensLimit / 1000).toFixed(0)}K limit`, up: usage.aiTokensUsed < usage.aiTokensLimit * 0.8 },
      { label: 'Days Left', value: daysRemaining.toString(), icon: <ClockIcon className="w-5 h-5" />, color: 'fuchsia', trend: `of ${daysInMonth} day cycle`, up: daysRemaining > 7 },
    ];
  }, [creditsTotal, creditsUsed, currentPlanName, usage]);

  // ─── Cost Breakdown ───
  const costBreakdown = useMemo(() => {
    const monthlyPrice = currentPlanName === 'Professional' ? 149 : currentPlanName === 'Enterprise' ? 499 : 49;
    return {
      monthlyPrice,
      aiCompute: Math.round(monthlyPrice * 0.45),
      leadProcessing: Math.round(monthlyPrice * 0.25),
      storage: Math.round(monthlyPrice * 0.15),
      support: Math.round(monthlyPrice * 0.15),
      projectedNext: Math.round(monthlyPrice * (1 + (Math.random() * 0.1 - 0.05))),
      savingsVsManual: Math.round(monthlyPrice * 3.2),
    };
  }, [currentPlanName]);

  // ─── ROI Metrics ───
  const roiMetrics = useMemo(() => {
    const monthlyPrice = currentPlanName === 'Professional' ? 149 : currentPlanName === 'Enterprise' ? 499 : 49;
    const leadsValue = usage.leadsProcessed * 42; // avg $42 per lead
    const timeSavedHrs = Math.round(usage.leadsProcessed * 0.15 + (usage.aiTokensUsed / 10000) * 0.5);
    const timeSavedValue = timeSavedHrs * 50; // $50/hr
    const totalValue = leadsValue + timeSavedValue;
    const roi = monthlyPrice > 0 ? Math.round(((totalValue - monthlyPrice) / monthlyPrice) * 100) : 0;

    return {
      leadsValue,
      timeSavedHrs,
      timeSavedValue,
      totalValue,
      roi,
      monthlyPrice,
      paybackDays: Math.round(30 / Math.max(roi / 100, 0.1)),
    };
  }, [currentPlanName, usage]);

  // ─── Spend Forecast ───
  const spendForecast = useMemo(() => {
    const monthlyPrice = currentPlanName === 'Professional' ? 149 : currentPlanName === 'Enterprise' ? 499 : 49;
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dailyBurnRate = monthlyPrice / daysInMonth;
    const spentSoFar = Math.round(dailyBurnRate * dayOfMonth);
    const projectedOverage = creditsUsed > creditsTotal * 0.8 ? Math.round((creditsUsed / creditsTotal - 0.8) * monthlyPrice * 0.5) : 0;

    const monthlyProjections = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() + i);
      const growth = 1 + i * 0.03 + (Math.random() - 0.5) * 0.04;
      return {
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        base: monthlyPrice,
        projected: Math.round(monthlyPrice * growth),
        overage: i > 2 ? Math.round(Math.random() * 15) : 0,
      };
    });

    const annualCost = monthlyPrice * 12;
    const annualSavings = Math.round(annualCost * 0.17); // annual billing discount
    const budgetAlerts = [
      { threshold: '80% credits', status: creditsUsed / creditsTotal > 0.8 ? 'triggered' as const : 'ok' as const, value: `${Math.round((creditsUsed / creditsTotal) * 100)}%` },
      { threshold: '90% AI tokens', status: usage.aiTokensUsed / usage.aiTokensLimit > 0.9 ? 'triggered' as const : 'ok' as const, value: `${Math.round((usage.aiTokensUsed / usage.aiTokensLimit) * 100)}%` },
      { threshold: 'Overage risk', status: projectedOverage > 0 ? 'triggered' as const : 'ok' as const, value: projectedOverage > 0 ? `+$${projectedOverage}` : 'None' },
    ];

    return { dailyBurnRate, spentSoFar, projectedOverage, monthlyProjections, annualCost, annualSavings, budgetAlerts, monthlyPrice };
  }, [currentPlanName, creditsUsed, creditsTotal, usage]);

  // ─── Credit Consumption Analytics ───
  const creditAnalytics = useMemo(() => {
    const featureBreakdown = [
      { feature: 'Lead Scoring', credits: Math.round(creditsUsed * 0.32), pct: 32, trend: 8, color: 'indigo' },
      { feature: 'Content Generation', credits: Math.round(creditsUsed * 0.28), pct: 28, trend: 15, color: 'violet' },
      { feature: 'Email Campaigns', credits: Math.round(creditsUsed * 0.18), pct: 18, trend: -5, color: 'amber' },
      { feature: 'Analytics & Reports', credits: Math.round(creditsUsed * 0.12), pct: 12, trend: 3, color: 'emerald' },
      { feature: 'Strategy & Planning', credits: Math.round(creditsUsed * 0.10), pct: 10, trend: 22, color: 'rose' },
    ];

    const hourlyPattern = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
      credits: Math.round(Math.sin((h - 10) * 0.4) * 8 + 12 + (Math.random() - 0.5) * 4),
    }));
    const peakHour = hourlyPattern.reduce((best, h) => h.credits > best.credits ? h : best, hourlyPattern[0]);

    const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return {
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        used: Math.round(creditsUsed / 30 * (0.8 + Math.random() * 0.4)),
        wasted: Math.round(Math.random() * 3),
      };
    });

    const wasteScore = Math.round(weeklyTrend.reduce((s, d) => s + d.wasted, 0) / weeklyTrend.reduce((s, d) => s + d.used, 0) * 100);
    const efficiencyScore = 100 - wasteScore;

    return { featureBreakdown, hourlyPattern, peakHour, weeklyTrend, wasteScore, efficiencyScore };
  }, [creditsUsed]);

  // ─── Plan Comparison ───
  const planComparison = useMemo(() => {
    const tiers = [
      {
        name: 'Starter', price: 49, credits: 10000, leads: 1000, tokens: 100000, emails: 500, storage: 5000,
        features: ['Basic AI scoring', 'Email templates', '5 integrations', 'Standard support'],
      },
      {
        name: 'Professional', price: 149, credits: 50000, leads: 5000, tokens: 500000, emails: 2500, storage: 25000,
        features: ['Advanced AI models', 'Custom templates', '15 integrations', 'Priority support', 'Analytics dashboard', 'Team collaboration'],
      },
      {
        name: 'Enterprise', price: 499, credits: 999999, leads: 999999, tokens: 999999, emails: 99999, storage: 999999,
        features: ['Custom AI training', 'White-label', 'Unlimited integrations', 'Dedicated CSM', 'SLA guarantee', 'API access', 'Custom workflows'],
      },
    ];

    const currentTier = tiers.find(t => t.name === currentPlanName) || tiers[0];
    const nextTier = tiers[tiers.indexOf(currentTier) + 1] || null;
    const upgradeValue = nextTier ? {
      additionalCredits: nextTier.credits - currentTier.credits,
      additionalLeads: nextTier.leads - currentTier.leads,
      additionalTokens: nextTier.tokens - currentTier.tokens,
      priceDiff: nextTier.price - currentTier.price,
      costPerExtraCredit: ((nextTier.price - currentTier.price) / (nextTier.credits - currentTier.credits) * 1000).toFixed(3),
      newFeatures: nextTier.features.filter(f => !currentTier.features.includes(f)),
    } : null;

    return { tiers, currentTier, nextTier, upgradeValue };
  }, [currentPlanName]);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowShortcuts(s => !s); return; }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setShowCostAnalysis(s => !s); return; }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setShowUsageTrends(s => !s); return; }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setShowROICalculator(s => !s); return; }
      if (e.key === 'u' || e.key === 'U') { e.preventDefault(); fetchUsage(); return; }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setShowSpendForecast(s => !s); return; }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); setShowCreditAnalytics(s => !s); return; }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); setShowPlanComparison(s => !s); return; }
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowCostAnalysis(false);
        setShowUsageTrends(false);
        setShowROICalculator(false);
        setShowSpendForecast(false);
        setShowCreditAnalytics(false);
        setShowPlanComparison(false);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchUsage]);

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
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowCostAnalysis(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showCostAnalysis ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <PieChartIcon className="w-3.5 h-3.5" />
            <span>Cost Analysis</span>
          </button>
          <button
            onClick={() => setShowUsageTrends(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showUsageTrends ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <ActivityIcon className="w-3.5 h-3.5" />
            <span>Usage Trends</span>
          </button>
          <button
            onClick={() => setShowROICalculator(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showROICalculator ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <TrendUpIcon className="w-3.5 h-3.5" />
            <span>ROI</span>
          </button>
          <button
            onClick={() => setShowSpendForecast(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showSpendForecast ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <TargetIcon className="w-3.5 h-3.5" />
            <span>Forecast</span>
          </button>
          <button
            onClick={() => setShowCreditAnalytics(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showCreditAnalytics ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <BoltIcon className="w-3.5 h-3.5" />
            <span>Credits</span>
          </button>
          <button
            onClick={() => setShowPlanComparison(s => !s)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showPlanComparison ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} shadow-sm`}
          >
            <LayersIcon className="w-3.5 h-3.5" />
            <span>Compare</span>
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <KeyboardIcon className="w-3.5 h-3.5" />
          </button>

          <div className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-slate-600 flex items-center space-x-2 shadow-sm">
             <span className={`w-2 h-2 rounded-full ${user.subscription?.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`}></span>
             <span className="text-[10px] font-black uppercase tracking-widest">{user.subscription?.status ?? 'active'}</span>
          </div>
          <div className="bg-indigo-600 px-4 py-2 rounded-xl text-white flex items-center space-x-2 shadow-xl shadow-indigo-100">
            <BoltIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">{(creditsTotal - creditsUsed).toLocaleString()} Gen</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KPI STATS BANNER                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiStats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-xl ${COLOR_CLASSES[stat.color]?.bg50} ${COLOR_CLASSES[stat.color]?.text600} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                {stat.icon}
              </div>
              {stat.up !== null && (
                stat.up ? <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" /> : <TrendDownIcon className="w-3.5 h-3.5 text-rose-500" />
              )}
            </div>
            <p className="text-xl font-black text-slate-900">{stat.value}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{stat.label}</p>
            <p className="text-[10px] text-slate-400 mt-1 truncate">{stat.trend}</p>
          </div>
        ))}
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
                  <div className={`p-2 ${COLOR_CLASSES[metric.color]?.bg50} ${COLOR_CLASSES[metric.color]?.text600} rounded-xl group-hover/m:scale-110 transition-transform`}>
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
                    className={`h-full rounded-full transition-all duration-1000 ${isHigh ? 'bg-red-500' : COLOR_CLASSES[metric.color]?.bg500}`}
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

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* COST ANALYSIS SIDEBAR                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showCostAnalysis && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowCostAnalysis(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Cost Analysis</h3>
                <p className="text-xs text-slate-400 mt-0.5">Monthly cost breakdown and projections</p>
              </div>
              <button onClick={() => setShowCostAnalysis(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Current Monthly Cost */}
              <div className="p-5 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-100 text-center">
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1">Current Monthly Cost</p>
                <p className="text-4xl font-black text-indigo-700">${costBreakdown.monthlyPrice}</p>
                <p className="text-xs text-indigo-500 mt-1">{currentPlanName} Plan</p>
              </div>

              {/* Cost Breakdown */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Cost Breakdown</p>
                <div className="space-y-2">
                  {[
                    { label: 'AI Compute', value: costBreakdown.aiCompute, pct: 45, color: 'indigo' },
                    { label: 'Lead Processing', value: costBreakdown.leadProcessing, pct: 25, color: 'emerald' },
                    { label: 'Data Storage', value: costBreakdown.storage, pct: 15, color: 'violet' },
                    { label: 'Priority Support', value: costBreakdown.support, pct: 15, color: 'amber' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center space-x-3 p-3 bg-white rounded-xl border border-slate-100">
                      <div className={`w-8 h-8 rounded-lg ${COLOR_CLASSES[item.color]?.bg50} ${COLOR_CLASSES[item.color]?.text600} flex items-center justify-center`}>
                        <span className="text-xs font-black">{item.pct}%</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700">{item.label}</span>
                          <span className="text-xs font-black text-slate-800">${item.value}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1">
                          <div className={`h-full rounded-full ${COLOR_CLASSES[item.color]?.bg500}`} style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Projected Next Month */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Projected Next Month</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">${costBreakdown.projectedNext}</p>
                  </div>
                  <div className={`flex items-center space-x-1 ${costBreakdown.projectedNext > costBreakdown.monthlyPrice ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {costBreakdown.projectedNext > costBreakdown.monthlyPrice ? <TrendUpIcon className="w-4 h-4" /> : <TrendDownIcon className="w-4 h-4" />}
                    <span className="text-xs font-bold">
                      {Math.abs(Math.round(((costBreakdown.projectedNext - costBreakdown.monthlyPrice) / costBreakdown.monthlyPrice) * 100))}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Savings */}
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs font-black text-emerald-700 uppercase tracking-wider">Savings vs Manual</p>
                </div>
                <p className="text-2xl font-black text-emerald-700">${costBreakdown.savingsVsManual.toLocaleString()}<span className="text-sm font-bold text-emerald-500">/mo</span></p>
                <p className="text-xs text-emerald-600 mt-1">
                  That's {Math.round(costBreakdown.savingsVsManual / costBreakdown.monthlyPrice)}x your subscription cost
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* USAGE TRENDS SIDEBAR                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showUsageTrends && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowUsageTrends(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Usage Trends</h3>
                <p className="text-xs text-slate-400 mt-0.5">Resource consumption over time</p>
              </div>
              <button onClick={() => setShowUsageTrends(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Daily Usage Sparkline */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Credits Used (Last 14 Days)</p>
                <div className="flex items-end space-x-1 h-20">
                  {[22, 18, 35, 28, 42, 38, 52, 45, 30, 55, 48, 62, 40, 35].map((v, i) => (
                    <div key={i} className="flex-1 rounded-t bg-indigo-400 hover:bg-indigo-600 transition-colors cursor-default" style={{ height: `${(v / 62) * 100}%` }} title={`${v} credits`}></div>
                  ))}
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 mt-1.5">
                  <span>14d ago</span><span>7d ago</span><span>Today</span>
                </div>
              </div>

              {/* Per-Resource Usage */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Resource Utilization</p>
                {[
                  { label: 'AI Tokens', used: usage.aiTokensUsed, limit: usage.aiTokensLimit, color: 'indigo', icon: <SparklesIcon className="w-4 h-4" /> },
                  { label: 'Leads Processed', used: usage.leadsProcessed, limit: usage.leadsLimit, color: 'emerald', icon: <UsersIcon className="w-4 h-4" /> },
                  { label: 'Storage', used: usage.storageUsedMb, limit: usage.storageLimitMb, color: 'violet', icon: <DatabaseIcon className="w-4 h-4" />, unit: 'MB' },
                  { label: 'Email Credits', used: usage.emailCreditsUsed, limit: usage.emailCreditsLimit, color: 'amber', icon: <MailIcon className="w-4 h-4" /> },
                ].map((resource, i) => {
                  const pct = Math.min(Math.round((resource.used / resource.limit) * 100), 100);
                  const isHigh = pct > 80;
                  return (
                    <div key={i} className="p-3 bg-white rounded-xl border border-slate-100 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div className={`w-7 h-7 rounded-lg ${COLOR_CLASSES[resource.color]?.bg50} ${COLOR_CLASSES[resource.color]?.text600} flex items-center justify-center`}>
                            {resource.icon}
                          </div>
                          <span className="text-xs font-bold text-slate-700">{resource.label}</span>
                        </div>
                        <span className={`text-xs font-black ${isHigh ? 'text-rose-600' : 'text-slate-600'}`}>
                          {pct}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className={`h-full rounded-full transition-all ${isHigh ? 'bg-rose-500' : COLOR_CLASSES[resource.color]?.bg500}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-slate-400">{resource.used.toLocaleString()}{resource.unit ? ` ${resource.unit}` : ''} used</span>
                        <span className="text-[10px] text-slate-400">{resource.limit.toLocaleString()}{resource.unit ? ` ${resource.unit}` : ''} limit</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Usage Forecast */}
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center space-x-2 mb-2">
                  <BrainIcon className="w-4 h-4 text-blue-600" />
                  <p className="text-xs font-black text-blue-700 uppercase tracking-wider">AI Forecast</p>
                </div>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Based on your current usage pattern, you'll use approximately <strong>{Math.round(creditsUsed * (30 / Math.max(new Date().getDate(), 1))).toLocaleString()}</strong> credits this month.
                  {creditsUsed * (30 / Math.max(new Date().getDate(), 1)) > creditsTotal
                    ? ' Consider upgrading to avoid overages.'
                    : ' You\'re on track to stay within your limits.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ROI CALCULATOR SIDEBAR                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showROICalculator && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowROICalculator(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">ROI Calculator</h3>
                <p className="text-xs text-slate-400 mt-0.5">Return on investment analysis</p>
              </div>
              <button onClick={() => setShowROICalculator(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* ROI Score */}
              <div className="flex flex-col items-center p-5 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke={roiMetrics.roi >= 200 ? '#10b981' : roiMetrics.roi >= 100 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${Math.min((roiMetrics.roi / 500) * 327, 327)} 327`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-2xl font-black ${roiMetrics.roi >= 200 ? 'text-emerald-600' : roiMetrics.roi >= 100 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {roiMetrics.roi}%
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">ROI</span>
                  </div>
                </div>
                <p className={`mt-2 text-sm font-black ${roiMetrics.roi >= 200 ? 'text-emerald-600' : roiMetrics.roi >= 100 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {roiMetrics.roi >= 200 ? 'Excellent Return' : roiMetrics.roi >= 100 ? 'Good Return' : 'Building Value'}
                </p>
              </div>

              {/* Value Breakdown */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Value Generated</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                    <div className="flex items-center space-x-2">
                      <UsersIcon className="w-4 h-4 text-indigo-600" />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Lead Pipeline Value</p>
                        <p className="text-[10px] text-slate-400">{usage.leadsProcessed} leads @ $42 avg value</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-600">${roiMetrics.leadsValue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                    <div className="flex items-center space-x-2">
                      <ClockIcon className="w-4 h-4 text-violet-600" />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Time Saved</p>
                        <p className="text-[10px] text-slate-400">{roiMetrics.timeSavedHrs} hours @ $50/hr</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-600">${roiMetrics.timeSavedValue.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 bg-slate-900 rounded-xl text-white">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Value</p>
                    <p className="text-xl font-black text-emerald-400">${roiMetrics.totalValue.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Cost</p>
                    <p className="text-xl font-black text-white">${roiMetrics.monthlyPrice}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Net Return</p>
                    <p className="text-xl font-black text-emerald-400">${(roiMetrics.totalValue - roiMetrics.monthlyPrice).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Payback Period</p>
                    <p className="text-xl font-black text-white">{roiMetrics.paybackDays}d</p>
                  </div>
                </div>
              </div>

              {/* Upgrade Suggestion */}
              {currentPlanName === 'Starter' && (
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <div className="flex items-center space-x-2 mb-2">
                    <ArrowRightIcon className="w-4 h-4 text-indigo-600" />
                    <p className="text-xs font-black text-indigo-700 uppercase tracking-wider">Upgrade Opportunity</p>
                  </div>
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    Upgrading to Professional could increase your ROI by 3-5x with higher lead limits and AI token capacity.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SPEND FORECAST SIDEBAR                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showSpendForecast && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowSpendForecast(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Spend Forecast</h3>
                <p className="text-xs text-slate-400 mt-0.5">Projections, burn rate &amp; budget alerts</p>
              </div>
              <button onClick={() => setShowSpendForecast(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Burn Rate Gauge */}
              <div className="flex justify-center">
                <div className="relative">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="6" />
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#06b6d4" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(spendForecast.spentSoFar / spendForecast.monthlyPrice) * 251} 251`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-black text-cyan-700">${spendForecast.spentSoFar}</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Spent</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-cyan-50 rounded-xl text-center">
                  <p className="text-lg font-black text-cyan-700">${spendForecast.dailyBurnRate.toFixed(2)}</p>
                  <p className="text-[9px] font-bold text-cyan-500 uppercase">Daily Burn</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-lg font-black text-slate-700">${spendForecast.annualCost}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Annual Cost</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl text-center">
                  <p className="text-lg font-black text-emerald-700">${spendForecast.annualSavings}</p>
                  <p className="text-[9px] font-bold text-emerald-400 uppercase">Annual Save</p>
                </div>
              </div>

              {/* Budget Alerts */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Budget Alerts</p>
                <div className="space-y-2">
                  {spendForecast.budgetAlerts.map((alert, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${
                      alert.status === 'triggered' ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-100'
                    }`}>
                      <div className="flex items-center space-x-2">
                        {alert.status === 'triggered' ? (
                          <AlertTriangleIcon className="w-4 h-4 text-rose-500" />
                        ) : (
                          <CheckIcon className="w-4 h-4 text-emerald-500" />
                        )}
                        <span className="text-xs font-bold text-slate-700">{alert.threshold}</span>
                      </div>
                      <span className={`text-xs font-black ${alert.status === 'triggered' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {alert.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 6-Month Projection Chart */}
              <div className="bg-slate-900 rounded-xl p-5">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">6-Month Spend Projection</p>
                <div className="flex items-end space-x-3 h-24">
                  {spendForecast.monthlyProjections.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="w-full flex space-x-0.5 items-end" style={{ height: '80px' }}>
                        <div
                          className="flex-1 rounded-t bg-gradient-to-t from-cyan-600 to-cyan-400"
                          style={{ height: `${(m.base / 600) * 100}%`, minHeight: '3px' }}
                        />
                        <div
                          className="flex-1 rounded-t bg-gradient-to-t from-amber-600 to-amber-400"
                          style={{ height: `${(m.projected / 600) * 100}%`, minHeight: '3px' }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1">{m.month}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center space-x-4 mt-2">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-[9px] text-slate-500">Base</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-[9px] text-slate-500">Projected</span>
                  </div>
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-cyan-600 to-teal-600 rounded-2xl p-4 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-xs font-black uppercase tracking-wider">Spend Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  Your daily burn rate of ${spendForecast.dailyBurnRate.toFixed(2)} is on track.
                  {spendForecast.projectedOverage > 0
                    ? ` You may incur a $${spendForecast.projectedOverage} overage this month. Consider upgrading.`
                    : ` Switching to annual billing would save $${spendForecast.annualSavings}/year (17% discount).`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CREDIT CONSUMPTION ANALYTICS SIDEBAR                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showCreditAnalytics && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowCreditAnalytics(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Credit Analytics</h3>
                <p className="text-xs text-slate-400 mt-0.5">Per-feature usage, patterns &amp; efficiency</p>
              </div>
              <button onClick={() => setShowCreditAnalytics(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Efficiency Gauge */}
              <div className="flex justify-center">
                <div className="relative">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="6" />
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#f43f5e" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(creditAnalytics.efficiencyScore / 100) * 251} 251`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-black text-rose-700">{creditAnalytics.efficiencyScore}%</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Efficient</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-indigo-50 rounded-xl text-center">
                  <p className="text-lg font-black text-indigo-700">{creditsUsed.toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-indigo-400 uppercase">Total Used</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl text-center">
                  <p className="text-lg font-black text-emerald-700">{creditAnalytics.efficiencyScore}%</p>
                  <p className="text-[9px] font-bold text-emerald-400 uppercase">Efficiency</p>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl text-center">
                  <p className="text-lg font-black text-rose-700">{creditAnalytics.wasteScore}%</p>
                  <p className="text-[9px] font-bold text-rose-400 uppercase">Waste</p>
                </div>
              </div>

              {/* Per-Feature Breakdown */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Usage by Feature</p>
                <div className="space-y-2">
                  {creditAnalytics.featureBreakdown.map((feat, i) => (
                    <div key={i} className="p-3 bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-slate-800">{feat.feature}</h4>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-black text-slate-700">{feat.credits.toLocaleString()}</span>
                          <div className="flex items-center space-x-0.5">
                            {feat.trend > 0 ? <TrendUpIcon className="w-3 h-3 text-rose-500" /> : <TrendDownIcon className="w-3 h-3 text-emerald-500" />}
                            <span className={`text-[10px] font-bold ${feat.trend > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {feat.trend > 0 ? '+' : ''}{feat.trend}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className={`h-full rounded-full ${COLOR_CLASSES[feat.color]?.bg500}`} style={{ width: `${feat.pct}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{feat.pct}% of total credits</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hourly Pattern Chart */}
              <div className="bg-slate-900 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider">24h Credit Usage</p>
                  <span className="text-[10px] text-rose-400 font-bold">Peak: {creditAnalytics.peakHour.label}</span>
                </div>
                <div className="flex items-end space-x-1 h-20">
                  {creditAnalytics.hourlyPattern.map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-rose-600 to-rose-400 transition-all"
                        style={{ height: `${(h.credits / 22) * 100}%`, minHeight: '2px' }}
                      />
                      {i % 6 === 0 && (
                        <span className="text-[8px] text-slate-500 mt-0.5">{h.label}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Trend Chart */}
              <div className="bg-slate-900 rounded-xl p-5">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">7-Day Credit Trend</p>
                <div className="flex items-end space-x-2 h-20">
                  {creditAnalytics.weeklyTrend.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="w-full flex flex-col items-center space-y-0.5">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-indigo-600 to-indigo-400"
                          style={{ height: `${(d.used / 30) * 60}px`, minHeight: '3px' }}
                        />
                        {d.wasted > 0 && (
                          <div
                            className="w-full rounded-t bg-gradient-to-t from-rose-600 to-rose-400"
                            style={{ height: `${(d.wasted / 30) * 60}px`, minHeight: '2px' }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1">{d.day}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center space-x-4 mt-2">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span className="text-[9px] text-slate-500">Used</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 rounded-full bg-rose-400" />
                    <span className="text-[9px] text-slate-500">Wasted</span>
                  </div>
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-rose-600 to-pink-600 rounded-2xl p-4 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-xs font-black uppercase tracking-wider">Credit Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  Content Generation usage grew 15% this week — your highest-consuming feature.
                  Peak credit usage is at {creditAnalytics.peakHour.label}. Your efficiency score of {creditAnalytics.efficiencyScore}%
                  {creditAnalytics.efficiencyScore >= 95 ? ' is excellent — minimal waste detected.' : ' can be improved by batching similar operations.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* PLAN COMPARISON SIDEBAR                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showPlanComparison && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowPlanComparison(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Plan Comparison</h3>
                <p className="text-xs text-slate-400 mt-0.5">Side-by-side tier analysis &amp; upgrade value</p>
              </div>
              <button onClick={() => setShowPlanComparison(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Current Plan Highlight */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider">Current Plan</p>
                    <p className="text-2xl font-black text-indigo-700">{planComparison.currentTier.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-indigo-700">${planComparison.currentTier.price}</p>
                    <p className="text-[10px] text-indigo-500 font-bold">/month</p>
                  </div>
                </div>
              </div>

              {/* Tier Comparison Table */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Tier Comparison</p>
                <div className="space-y-2">
                  {planComparison.tiers.map((tier, i) => {
                    const isCurrent = tier.name === currentPlanName;
                    return (
                      <div key={i} className={`p-4 rounded-xl border transition-all ${
                        isCurrent ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:shadow-sm'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-sm font-bold text-slate-800">{tier.name}</h4>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-600 text-white">Current</span>
                            )}
                          </div>
                          <span className="text-sm font-black text-slate-700">${tier.price}/mo</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div>
                            <p className="text-xs font-bold text-indigo-600">{tier.credits >= 999999 ? 'Unlimited' : `${(tier.credits / 1000).toFixed(0)}K`}</p>
                            <p className="text-[9px] text-slate-400">Credits</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-emerald-600">{tier.leads >= 999999 ? 'Unlimited' : `${(tier.leads / 1000).toFixed(0)}K`}</p>
                            <p className="text-[9px] text-slate-400">Leads</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-violet-600">{tier.tokens >= 999999 ? 'Unlimited' : `${(tier.tokens / 1000).toFixed(0)}K`}</p>
                            <p className="text-[9px] text-slate-400">Tokens</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-amber-600">{tier.emails >= 99999 ? 'Unlimited' : tier.emails.toLocaleString()}</p>
                            <p className="text-[9px] text-slate-400">Emails</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tier.features.map((f, fi) => (
                            <span key={fi} className="px-2 py-0.5 bg-slate-50 rounded text-[9px] font-semibold text-slate-500">{f}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upgrade Value */}
              {planComparison.upgradeValue && planComparison.nextTier && (
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Upgrade to {planComparison.nextTier.name}</p>
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-700">Additional Credits</span>
                      <span className="text-xs font-black text-emerald-700">+{planComparison.upgradeValue.additionalCredits.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-700">Additional Leads</span>
                      <span className="text-xs font-black text-emerald-700">+{planComparison.upgradeValue.additionalLeads.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-700">Additional Tokens</span>
                      <span className="text-xs font-black text-emerald-700">+{planComparison.upgradeValue.additionalTokens.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-emerald-200">
                      <span className="text-xs font-bold text-emerald-800">Price Difference</span>
                      <span className="text-xs font-black text-emerald-800">+${planComparison.upgradeValue.priceDiff}/mo</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800">Cost per 1K Extra Credits</span>
                      <span className="text-xs font-black text-emerald-800">${planComparison.upgradeValue.costPerExtraCredit}</span>
                    </div>
                  </div>

                  {/* New Features */}
                  {planComparison.upgradeValue.newFeatures.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">New Features You'd Unlock</p>
                      {planComparison.upgradeValue.newFeatures.map((f, i) => (
                        <div key={i} className="flex items-center space-x-2 p-2 bg-white rounded-lg border border-slate-100">
                          <CheckIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-xs font-semibold text-slate-700">{f}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl p-4 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-xs font-black uppercase tracking-wider">Plan Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  {planComparison.nextTier
                    ? `Upgrading to ${planComparison.nextTier.name} gives you ${Math.round((planComparison.upgradeValue?.additionalCredits || 0) / (planComparison.upgradeValue?.priceDiff || 1))} extra credits per dollar. Based on your growth trajectory, you'll need the upgrade in ~${Math.max(1, Math.round((creditsTotal - creditsUsed) / Math.max(creditsUsed / 30, 1)))} days.`
                    : `You're on the highest tier with unlimited resources. Focus on maximizing ROI from your existing allocation.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEYBOARD SHORTCUTS MODAL                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-900 font-heading">Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Actions</h4>
                <div className="space-y-2">
                  {[
                    { key: 'U', label: 'Refresh usage' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                      <span className="text-sm text-slate-600">{s.label}</span>
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-500">{s.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Panels</h4>
                <div className="space-y-2">
                  {[
                    { key: 'C', label: 'Cost analysis' },
                    { key: 'T', label: 'Usage trends' },
                    { key: 'R', label: 'ROI calculator' },
                    { key: 'F', label: 'Spend forecast' },
                    { key: 'A', label: 'Credit analytics' },
                    { key: 'P', label: 'Plan comparison' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                      <span className="text-sm text-slate-600">{s.label}</span>
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-500">{s.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">System</h4>
                <div className="space-y-2">
                  {[
                    { key: '?', label: 'Shortcuts' },
                    { key: 'Esc', label: 'Close all panels' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                      <span className="text-sm text-slate-600">{s.label}</span>
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-500">{s.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPage;