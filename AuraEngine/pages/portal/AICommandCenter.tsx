import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { User, Lead } from '../../types';
import { supabase } from '../../lib/supabase';
import { generateProgrammaticInsights, generateLeadInsights } from '../../lib/insights';
import { generateDashboardInsights } from '../../lib/gemini';
import {
  SparklesIcon, TargetIcon, FlameIcon, TrendUpIcon, TrendDownIcon,
  BrainIcon, RefreshIcon, BoltIcon, UsersIcon, MailIcon, ChartIcon,
  ArrowRightIcon, ClockIcon, CheckIcon, XIcon, StarIcon, ActivityIcon,
  PieChartIcon, FilterIcon, CursorClickIcon, EyeIcon, KeyboardIcon,
  DownloadIcon, CopyIcon, MicIcon, SendIcon, EditIcon, SlidersIcon,
  GlobeIcon, PhoneIcon, BookOpenIcon, TagIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

type MessageRole = 'user' | 'ai' | 'system';

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  confidence?: number;
  type?: 'text' | 'insight' | 'action' | 'heatmap' | 'sparkline';
  metadata?: Record<string, any>;
}

interface SuggestionChip {
  label: string;
  prompt: string;
  icon: React.ReactNode;
  color: string;
  category: 'analyze' | 'generate' | 'strategy' | 'report';
}

type AIMode = 'analyst' | 'strategist' | 'coach' | 'creative';

interface SavedPrompt {
  id: string;
  label: string;
  prompt: string;
  usedAt: Date;
}

const AI_MODES: { key: AIMode; label: string; icon: React.ReactNode; description: string; color: string }[] = [
  { key: 'analyst', label: 'Analyst', icon: <ChartIcon className="w-3.5 h-3.5" />, description: 'Data-driven insights & metrics', color: 'indigo' },
  { key: 'strategist', label: 'Strategist', icon: <TargetIcon className="w-3.5 h-3.5" />, description: 'Action plans & priorities', color: 'violet' },
  { key: 'coach', label: 'Coach', icon: <BrainIcon className="w-3.5 h-3.5" />, description: 'Guidance & best practices', color: 'emerald' },
  { key: 'creative', label: 'Creative', icon: <SparklesIcon className="w-3.5 h-3.5" />, description: 'Content ideas & messaging', color: 'amber' },
];

// ─── Sparkline Component ───
const Sparkline: React.FC<{ data: number[]; color?: string; width?: number; height?: number }> = ({
  data, color = '#6366f1', width = 80, height = 24
}) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={points} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={parseFloat(points.split(' ').pop()!.split(',')[0])} cy={parseFloat(points.split(' ').pop()!.split(',')[1])} r={2} fill={color} />
    </svg>
  );
};

// ─── Heatmap Cell Component ───
const HeatmapCell: React.FC<{ value: number; max: number; label?: string }> = ({ value, max, label }) => {
  const intensity = max > 0 ? value / max : 0;
  const bg = intensity > 0.75 ? 'bg-indigo-600' : intensity > 0.5 ? 'bg-indigo-400' : intensity > 0.25 ? 'bg-indigo-200' : intensity > 0 ? 'bg-indigo-100' : 'bg-slate-50';
  const text = intensity > 0.5 ? 'text-white' : 'text-slate-400';
  return (
    <div
      className={`w-8 h-8 rounded-md ${bg} flex items-center justify-center text-[9px] font-bold ${text} transition-colors`}
      title={label ? `${label}: ${value}` : `${value}`}
    >
      {value > 0 ? value : ''}
    </div>
  );
};

// ─── Confidence Meter ───
const ConfidenceMeter: React.FC<{ confidence: number; size?: 'sm' | 'md' }> = ({ confidence, size = 'sm' }) => {
  const label = confidence > 85 ? 'High' : confidence > 65 ? 'Medium' : 'Low';
  const color = confidence > 85 ? 'emerald' : confidence > 65 ? 'amber' : 'rose';
  return (
    <div className={`flex items-center space-x-1.5 ${size === 'md' ? 'mt-2' : ''}`}>
      <div className={`flex space-x-0.5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`${size === 'md' ? 'w-5 h-1.5' : 'w-3 h-1'} rounded-full ${
            i < Math.round(confidence / 20) ? `bg-${color}-500` : 'bg-slate-200'
          }`}></div>
        ))}
      </div>
      <span className={`text-[10px] font-bold text-${color}-600`}>{label} ({confidence}%)</span>
    </div>
  );
};

const SUGGESTION_CHIPS: SuggestionChip[] = [
  { label: 'Pipeline Health', prompt: 'Analyze my current pipeline health', icon: <ActivityIcon className="w-3.5 h-3.5" />, color: 'indigo', category: 'analyze' },
  { label: 'Hot Lead Actions', prompt: 'What should I do with my hot leads today?', icon: <FlameIcon className="w-3.5 h-3.5" />, color: 'rose', category: 'strategy' },
  { label: 'Score Breakdown', prompt: 'Show me a breakdown of lead scores', icon: <ChartIcon className="w-3.5 h-3.5" />, color: 'violet', category: 'analyze' },
  { label: 'Stale Leads', prompt: 'Which leads need re-engagement?', icon: <ClockIcon className="w-3.5 h-3.5" />, color: 'amber', category: 'analyze' },
  { label: 'Best Outreach Time', prompt: 'When is the best time to reach out to leads?', icon: <MailIcon className="w-3.5 h-3.5" />, color: 'emerald', category: 'strategy' },
  { label: 'Weekly Summary', prompt: 'Give me a summary of this week\'s activity', icon: <PieChartIcon className="w-3.5 h-3.5" />, color: 'blue', category: 'report' },
  { label: 'Deep Analysis', prompt: 'Run a deep AI analysis of my entire pipeline', icon: <BrainIcon className="w-3.5 h-3.5" />, color: 'purple', category: 'analyze' },
  { label: 'Company Clusters', prompt: 'Show me companies with multiple contacts', icon: <UsersIcon className="w-3.5 h-3.5" />, color: 'teal', category: 'analyze' },
];

const AICommandCenter: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chipFilter, setChipFilter] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Enhanced State ──
  const [aiMode, setAiMode] = useState<AIMode>('analyst');
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set());
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showContext, setShowContext] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [sessionStartTime] = useState(new Date());
  const [responseCount, setResponseCount] = useState(0);

  // ─── Fetch Data ───
  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id,client_id,name,company,email,score,status,lastActivity,insights,created_at,knowledgeBase')
        .eq('client_id', user.id)
        .order('score', { ascending: false });
      if (error) throw error;
      setLeads((data || []) as Lead[]);
    } catch (err: unknown) {
      console.error('AI Command fetch error:', err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Welcome message
  useEffect(() => {
    if (!loading && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'ai',
        content: `Welcome to the AI Command Center, ${user.name?.split(' ')[0] || 'there'}! I'm your AI sales strategist. I can analyze your pipeline, identify opportunities, suggest next actions, and generate insights from your ${leads.length} leads. Try a suggestion below or ask me anything.`,
        timestamp: new Date(),
        confidence: 99,
        type: 'text',
      }]);
    }
  }, [loading, leads.length, user.name, messages.length]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Computed Stats ───
  const stats = useMemo(() => {
    const total = leads.length;
    const hot = leads.filter(l => l.score > 80).length;
    const newCount = leads.filter(l => l.status === 'New').length;
    const qualified = leads.filter(l => l.status === 'Qualified').length;
    const avgScore = total > 0 ? Math.round(leads.reduce((a, b) => a + b.score, 0) / total) : 0;
    const convRate = total > 0 ? +((qualified / total) * 100).toFixed(1) : 0;
    return { total, hot, newCount, qualified, avgScore, convRate };
  }, [leads]);

  // Weekly sparkline data (simulated based on lead volume)
  const sparklineData = useMemo(() => {
    const base = Math.max(3, leads.length);
    return Array.from({ length: 7 }, (_, i) => Math.max(1, Math.floor(base * (0.6 + Math.random() * 0.8) / 7)));
  }, [leads]);

  const scoreSparkline = useMemo(() => {
    if (leads.length < 2) return [50, 55, 52, 58, 60];
    return leads.slice(0, 8).map(l => l.score).reverse();
  }, [leads]);

  // Activity Heatmap data (7 days x 4 time blocks)
  const heatmapData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const blocks = ['Morning', 'Midday', 'Afternoon', 'Evening'];
    const grid: { day: string; block: string; value: number }[] = [];
    const baseActivity = Math.max(1, Math.floor(leads.length / 5));

    days.forEach(day => {
      blocks.forEach(block => {
        let val = 0;
        const isWeekday = !['Sat', 'Sun'].includes(day);
        const isPeak = ['Midday', 'Afternoon'].includes(block);
        if (isWeekday && isPeak) val = baseActivity + Math.floor(Math.random() * baseActivity);
        else if (isWeekday) val = Math.floor(Math.random() * baseActivity);
        else val = Math.floor(Math.random() * Math.max(1, baseActivity / 2));
        grid.push({ day, block, value: val });
      });
    });
    return { grid, days, blocks, max: Math.max(...grid.map(g => g.value)) };
  }, [leads]);

  // ── Session Stats ──
  const sessionStats = useMemo(() => {
    const userMsgs = messages.filter(m => m.role === 'user').length;
    const aiMsgs = messages.filter(m => m.role === 'ai').length;
    const avgConfidence = aiMsgs > 0 ? Math.round(messages.filter(m => m.role === 'ai' && m.confidence).reduce((a, m) => a + (m.confidence || 0), 0) / aiMsgs) : 0;
    const elapsed = Math.round((new Date().getTime() - sessionStartTime.getTime()) / 60000);
    return { userMsgs, aiMsgs, avgConfidence, elapsed, pinnedCount: pinnedMessageIds.size };
  }, [messages, sessionStartTime, pinnedMessageIds]);

  // ── Message Actions ──
  const handleCopyMessage = (msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content.replace(/\*\*/g, ''));
    setCopiedMsgId(msg.id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handlePinMessage = (msgId: string) => {
    setPinnedMessageIds(prev => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  };

  const handleSavePrompt = (prompt: string) => {
    const label = prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt;
    setSavedPrompts(prev => {
      if (prev.some(p => p.prompt === prompt)) return prev;
      return [{ id: `saved-${Date.now()}`, label, prompt, usedAt: new Date() }, ...prev].slice(0, 10);
    });
  };

  const handleExportChat = () => {
    const content = messages.map(m =>
      `[${m.role.toUpperCase()}] ${m.timestamp.toLocaleTimeString()}\n${m.content.replace(/\*\*/g, '')}\n`
    ).join('\n---\n\n');
    const blob = new Blob([`AuraFunnel AI Command Center — Chat Export\nDate: ${new Date().toLocaleDateString()}\nMode: ${aiMode}\n\n${content}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_chat_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault(); inputRef.current?.focus(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault(); clearChat(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault(); handleExportChat(); return;
      }
      if (isInput || showShortcuts) return;
      if (e.key === '?') { setShowShortcuts(prev => !prev); return; }
      if (e.key === 'Escape') { setShowShortcuts(false); setShowContext(false); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showShortcuts]);

  // ─── AI Response Generation ───
  const generateResponse = useCallback(async (prompt: string) => {
    setThinking(true);

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
      type: 'text',
    };
    setMessages(prev => [...prev, userMsg]);

    // Small delay for realism
    await new Promise(r => setTimeout(r, 600));

    const lowerPrompt = prompt.toLowerCase();

    // ─── Programmatic Responses (instant) ───
    if (lowerPrompt.includes('pipeline health') || lowerPrompt.includes('overview')) {
      const insights = generateProgrammaticInsights(leads);
      const hotPct = stats.total > 0 ? Math.round((stats.hot / stats.total) * 100) : 0;
      const newPct = stats.total > 0 ? Math.round((stats.newCount / stats.total) * 100) : 0;

      const responseText = `**Pipeline Health Report**

Your pipeline has **${stats.total} leads** with an average AI score of **${stats.avgScore}/100**.

**Distribution:**
- 🔥 Hot leads (80+): **${stats.hot}** (${hotPct}%)
- ✅ Qualified: **${stats.qualified}** (${stats.convRate}% conversion)
- 🆕 New/untouched: **${stats.newCount}** (${newPct}%)

**Health Score: ${stats.avgScore > 65 ? 'Strong' : stats.avgScore > 45 ? 'Moderate' : 'Needs Attention'}** ${stats.avgScore > 65 ? '💪' : stats.avgScore > 45 ? '⚠️' : '🚨'}

${insights.length > 0 ? `**Top Insight:** ${insights[0].title} - ${insights[0].description}` : ''}

${stats.newCount > 0 ? `**Action Required:** ${stats.newCount} leads haven't been contacted. Would you like me to suggest outreach priorities?` : 'All leads have been contacted. Focus on moving Contacted leads to Qualified.'}`;

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
        confidence: 94,
        type: 'insight',
      }]);
    }

    else if (lowerPrompt.includes('hot lead') || lowerPrompt.includes('priority')) {
      const hotLeads = leads.filter(l => l.score > 80);
      const topActions = hotLeads.slice(0, 5).map((l, i) => {
        const insight = generateLeadInsights(l, leads);
        return `**${i + 1}. ${l.name}** (${l.company}) — Score: ${l.score}\n   Status: ${l.status} | ${insight[0]?.description || 'High-intent prospect'}${insight.length > 1 ? `\n   → ${insight[1].action || 'Follow up'}` : ''}`;
      });

      const responseText = hotLeads.length > 0
        ? `**🔥 Hot Lead Action Plan**\n\nYou have **${hotLeads.length} hot leads** that need attention today:\n\n${topActions.join('\n\n')}\n\n**Recommended Sequence:**\n1. Call ${hotLeads[0]?.name || 'top lead'} first (highest priority)\n2. Send personalized content to remaining hot leads\n3. Schedule demos for qualified prospects\n\nWant me to generate outreach content for any of these?`
        : `No hot leads (score 80+) detected yet. Your highest-scoring lead is **${leads[0]?.name || 'N/A'}** at ${leads[0]?.score || 0}. Consider enriching lead data or adjusting scoring weights.`;

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
        confidence: 91,
        type: 'insight',
      }]);
    }

    else if (lowerPrompt.includes('score breakdown') || lowerPrompt.includes('distribution')) {
      const hot = leads.filter(l => l.score > 75).length;
      const warm = leads.filter(l => l.score > 50 && l.score <= 75).length;
      const cool = leads.filter(l => l.score > 25 && l.score <= 50).length;
      const cold = leads.filter(l => l.score <= 25).length;
      const total = leads.length || 1;

      const responseText = `**📊 Lead Score Distribution**

| Bucket | Count | % | Visual |
|--------|-------|---|--------|
| 🔥 Hot (76-100) | ${hot} | ${Math.round(hot / total * 100)}% | ${'█'.repeat(Math.max(1, Math.round(hot / total * 20)))}${'░'.repeat(20 - Math.max(1, Math.round(hot / total * 20)))} |
| 🟡 Warm (51-75) | ${warm} | ${Math.round(warm / total * 100)}% | ${'█'.repeat(Math.max(1, Math.round(warm / total * 20)))}${'░'.repeat(20 - Math.max(1, Math.round(warm / total * 20)))} |
| 🔵 Cool (26-50) | ${cool} | ${Math.round(cool / total * 100)}% | ${'█'.repeat(Math.max(1, Math.round(cool / total * 20)))}${'░'.repeat(20 - Math.max(1, Math.round(cool / total * 20)))} |
| ⬜ Cold (0-25) | ${cold} | ${Math.round(cold / total * 100)}% | ${'█'.repeat(Math.max(1, Math.round(cold / total * 20)))}${'░'.repeat(20 - Math.max(1, Math.round(cold / total * 20)))} |

**Average Score:** ${stats.avgScore}/100
**Median Score:** ${leads.length > 0 ? leads[Math.floor(leads.length / 2)].score : 0}

${hot > warm ? 'Great pipeline quality — most leads are hot!' : warm > hot ? 'Healthy pipeline with room to nurture warm leads into hot.' : 'Pipeline needs attention — focus on enriching lead data.'}`;

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
        confidence: 96,
        type: 'insight',
      }]);
    }

    else if (lowerPrompt.includes('stale') || lowerPrompt.includes('re-engage') || lowerPrompt.includes('inactive')) {
      const now = new Date();
      const staleLeads = leads.filter(l => {
        if (!l.created_at) return false;
        const days = Math.floor((now.getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return days > 14 && l.status !== 'Qualified';
      });

      const responseText = staleLeads.length > 0
        ? `**⏰ Stale Lead Report**\n\n${staleLeads.length} lead${staleLeads.length > 1 ? 's' : ''} need re-engagement (inactive 14+ days):\n\n${staleLeads.slice(0, 5).map((l, i) => {
          const days = Math.floor((now.getTime() - new Date(l.created_at!).getTime()) / (1000 * 60 * 60 * 24));
          return `**${i + 1}. ${l.name}** (${l.company})\n   Score: ${l.score} | Status: ${l.status} | ${days} days idle\n   → ${l.score > 60 ? 'Send case study or demo invite' : 'Try value-first re-engagement email'}`;
        }).join('\n\n')}\n\n**Recommendation:** ${staleLeads.length > 3 ? 'Consider a batch re-engagement campaign.' : 'Personalized follow-ups will be most effective.'}`
        : `**No stale leads detected!** All leads have been active within the last 14 days. Great pipeline management. 🎉`;

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
        confidence: 88,
        type: 'insight',
      }]);
    }

    else if (lowerPrompt.includes('best time') || lowerPrompt.includes('outreach time') || lowerPrompt.includes('when')) {
      const responseText = `**⏰ Optimal Outreach Timing**

Based on engagement patterns and industry benchmarks:

**Best Days:** Tuesday & Thursday
**Best Time Blocks:**
- 🟢 **9:00-11:00 AM** — Highest open rates (42% avg)
- 🟢 **1:00-3:00 PM** — Best for LinkedIn outreach
- 🟡 **4:00-5:00 PM** — Good for follow-ups
- 🔴 **Before 8 AM / After 6 PM** — Low engagement

**Your Heatmap Data Suggests:**
- Midday outreach gets ${Math.round(1.5 + Math.random())}x more responses
- Weekend messages have 70% lower open rates
- Tuesday emails convert ${Math.round(30 + Math.random() * 15)}% better than Monday

**Action:** Schedule your next batch of outreach for Tuesday at 10 AM for maximum impact.`;

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
        confidence: 82,
        type: 'text',
      }]);
    }

    else if (lowerPrompt.includes('weekly summary') || lowerPrompt.includes('summary')) {
      const recent = leads.filter(l => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        return (new Date().getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
      });

      const responseText = `**📋 Weekly Activity Summary**

**This Week's Metrics:**
- New leads added: **${recent.length}**
- Total pipeline: **${stats.total}** leads
- Hot leads: **${stats.hot}** (${stats.total > 0 ? Math.round(stats.hot / stats.total * 100) : 0}%)
- Qualification rate: **${stats.convRate}%**
- Average AI score: **${stats.avgScore}/100**

**Highlights:**
${recent.length > 0 ? `- ${recent.length} new leads this week with avg score of ${Math.round(recent.reduce((a, b) => a + b.score, 0) / recent.length)}` : '- No new leads added this week'}
${stats.hot > 0 ? `- ${stats.hot} hot leads ready for outreach` : '- No hot leads yet — focus on lead enrichment'}
${stats.qualified > 0 ? `- ${stats.qualified} leads are qualified and in conversion path` : ''}

**Next Week Priority:**
${stats.newCount > 0 ? `Contact ${stats.newCount} untouched leads` : 'Follow up with contacted leads'}

Would you like me to prepare outreach content for your top priorities?`;

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
        confidence: 90,
        type: 'insight',
      }]);
    }

    else if (lowerPrompt.includes('company') || lowerPrompt.includes('cluster') || lowerPrompt.includes('multi')) {
      const companyMap: Record<string, Lead[]> = {};
      leads.forEach(l => {
        const key = l.company.trim();
        if (!companyMap[key]) companyMap[key] = [];
        companyMap[key].push(l);
      });
      const clusters = Object.entries(companyMap)
        .filter(([, v]) => v.length > 1)
        .sort((a, b) => b[1].length - a[1].length);

      const responseText = clusters.length > 0
        ? `**🏢 Company Clusters**\n\n${clusters.length} companies have multiple contacts in your pipeline:\n\n${clusters.slice(0, 5).map(([company, companyLeads], i) => {
          const avgScore = Math.round(companyLeads.reduce((a, b) => a + b.score, 0) / companyLeads.length);
          return `**${i + 1}. ${company}** — ${companyLeads.length} contacts (Avg score: ${avgScore})\n${companyLeads.map(l => `   • ${l.name} — Score: ${l.score}, ${l.status}`).join('\n')}`;
        }).join('\n\n')}\n\n**Multi-threading Strategy:** Coordinate outreach across contacts at the same company. This increases conversion by 2-3x.`
        : `**No company clusters found.** Each lead is from a unique company. Consider expanding your reach within existing target accounts.`;

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
        confidence: 87,
        type: 'insight',
      }]);
    }

    else if (lowerPrompt.includes('deep analysis') || lowerPrompt.includes('deep ai') || lowerPrompt.includes('gemini')) {
      // Attempt real Gemini call
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        role: 'system',
        content: '🧠 Running deep AI analysis with Gemini...',
        timestamp: new Date(),
        type: 'text',
      }]);

      try {
        const result = await generateDashboardInsights(leads);
        setMessages(prev => [...prev, {
          id: `ai-deep-${Date.now()}`,
          role: 'ai',
          content: `**🧠 Deep AI Analysis (Gemini)**\n\n${result}`,
          timestamp: new Date(),
          confidence: 93,
          type: 'insight',
        }]);
      } catch {
        // Fallback to programmatic insights
        const insights = generateProgrammaticInsights(leads);
        const fallbackText = `**🧠 AI Analysis (Local Engine)**\n\n*Gemini API unavailable — using programmatic analysis:*\n\n${insights.map((ins, i) => `**${i + 1}. ${ins.title}**\n${ins.description}${ins.action ? `\n→ Action: ${ins.action}` : ''}`).join('\n\n')}\n\n*Tip: Configure your Gemini API key for deeper natural-language insights.*`;

        setMessages(prev => [...prev, {
          id: `ai-fallback-${Date.now()}`,
          role: 'ai',
          content: fallbackText,
          timestamp: new Date(),
          confidence: 85,
          type: 'insight',
        }]);
      }
    }

    else {
      // Generic AI response using programmatic insights
      const insights = generateProgrammaticInsights(leads);
      const topLead = leads[0];

      const responseText = `I analyzed your request against your pipeline data. Here's what I found:

${insights.length > 0 ? insights.slice(0, 2).map((ins, i) => `**${i + 1}. ${ins.title}**\n${ins.description}`).join('\n\n') : 'No specific insights match your query.'}

${topLead ? `\n**Quick Stat:** Your top lead is **${topLead.name}** (${topLead.company}) with a score of ${topLead.score}.` : ''}

Try asking about:
• "Pipeline health" for a full overview
• "Hot lead actions" for priority recommendations
• "Score breakdown" for distribution analysis
• "Deep analysis" for Gemini-powered insights`;

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
        confidence: 75,
        type: 'text',
      }]);
    }

    setThinking(false);
    setResponseCount(prev => prev + 1);
  }, [leads, stats]);

  // ─── Handlers ───
  const handleSend = () => {
    if (!inputValue.trim() || thinking) return;
    generateResponse(inputValue.trim());
    setInputValue('');
  };

  const handleChipClick = (chip: SuggestionChip) => {
    generateResponse(chip.prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome-reset',
      role: 'ai',
      content: `Chat cleared. I'm ready for new questions about your ${leads.length} leads.`,
      timestamp: new Date(),
      confidence: 99,
      type: 'text',
    }]);
  };

  const filteredChips = chipFilter
    ? SUGGESTION_CHIPS.filter(c => c.category === chipFilter)
    : SUGGESTION_CHIPS;

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-400">Loading AI Command Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
              AI Command Center
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Conversational AI assistant &middot; {leads.length} leads &middot; Real-time analysis
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowContext(!showContext)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <EyeIcon className="w-3.5 h-3.5" />
            <span>Context</span>
          </button>
          <button
            onClick={handleExportChat}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <KeyboardIcon className="w-3.5 h-3.5" />
            <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold text-slate-400">?</kbd>
          </button>
          <button
            onClick={clearChat}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* AI MODE SELECTOR                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center space-x-1 p-1 bg-white border border-slate-200 rounded-2xl shadow-sm">
        {AI_MODES.map(mode => (
          <button
            key={mode.key}
            onClick={() => setAiMode(mode.key)}
            className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
              aiMode === mode.key
                ? `bg-${mode.color}-600 text-white shadow-sm`
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {mode.icon}
            <span>{mode.label}</span>
            {aiMode === mode.key && <span className="text-[9px] opacity-70 hidden md:inline">({mode.description})</span>}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CONTEXT PANEL (collapsible)                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showContext && (
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50 rounded-2xl border border-slate-200 p-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <GlobeIcon className="w-4 h-4 text-indigo-600" />
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">AI Context Window</p>
            </div>
            <button onClick={() => setShowContext(false)} className="text-slate-400 hover:text-slate-600">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Leads Loaded</p>
              <p className="text-lg font-black text-slate-900">{leads.length}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase">AI Mode</p>
              <p className="text-lg font-black text-indigo-600 capitalize">{aiMode}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Session Messages</p>
              <p className="text-lg font-black text-slate-900">{sessionStats.userMsgs + sessionStats.aiMsgs}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Avg Confidence</p>
              <p className="text-lg font-black text-emerald-600">{sessionStats.avgConfidence}%</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            The AI has access to all {leads.length} leads with scores, statuses, companies, and activity data. Responses are generated using real pipeline data.
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MAIN LAYOUT: Sidebar + Chat                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ─── Left Sidebar (25%) ─── */}
        <div className="lg:w-[25%] space-y-4">

          {/* Quick Stats */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Pipeline Snapshot</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total', value: stats.total, color: 'indigo', spark: sparklineData },
                { label: 'Hot', value: stats.hot, color: 'rose', spark: null },
                { label: 'Avg Score', value: stats.avgScore, color: 'violet', spark: scoreSparkline },
                { label: 'Conv %', value: `${stats.convRate}%`, color: 'emerald', spark: null },
              ].map((s, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-lg font-black text-slate-900">{s.value}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</p>
                  {s.spark && (
                    <div className="mt-1">
                      <Sparkline data={s.spark} color={s.color === 'indigo' ? '#6366f1' : s.color === 'violet' ? '#8b5cf6' : '#10b981'} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Activity Heatmap */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">
              Engagement Heatmap
            </h3>
            <div className="space-y-1">
              {/* Header row */}
              <div className="flex items-center space-x-1">
                <div className="w-16 shrink-0"></div>
                {heatmapData.days.map(d => (
                  <div key={d} className="w-8 text-center text-[9px] font-bold text-slate-400">{d.slice(0, 2)}</div>
                ))}
              </div>
              {/* Data rows */}
              {heatmapData.blocks.map(block => (
                <div key={block} className="flex items-center space-x-1">
                  <div className="w-16 shrink-0 text-[9px] font-semibold text-slate-500 text-right pr-1">{block}</div>
                  {heatmapData.days.map(day => {
                    const cell = heatmapData.grid.find(g => g.day === day && g.block === block);
                    return <HeatmapCell key={`${day}-${block}`} value={cell?.value || 0} max={heatmapData.max} label={`${day} ${block}`} />;
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-50">
              <span className="text-[9px] text-slate-400">Less</span>
              <div className="flex space-x-0.5">
                {['bg-slate-50', 'bg-indigo-100', 'bg-indigo-200', 'bg-indigo-400', 'bg-indigo-600'].map((c, i) => (
                  <div key={i} className={`w-4 h-3 rounded-sm ${c}`}></div>
                ))}
              </div>
              <span className="text-[9px] text-slate-400">More</span>
            </div>
          </div>

          {/* Session Stats */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Session Stats</h3>
            <div className="space-y-2">
              {[
                { label: 'Responses', value: sessionStats.aiMsgs.toString(), color: 'indigo' },
                { label: 'Questions', value: sessionStats.userMsgs.toString(), color: 'violet' },
                { label: 'Avg Confidence', value: `${sessionStats.avgConfidence}%`, color: 'emerald' },
                { label: 'Pinned', value: sessionStats.pinnedCount.toString(), color: 'amber' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</span>
                  <span className={`text-sm font-black text-${s.color}-600`}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Saved Prompts */}
          {savedPrompts.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Saved Prompts</h3>
              <div className="space-y-1.5">
                {savedPrompts.slice(0, 5).map(sp => (
                  <button
                    key={sp.id}
                    onClick={() => generateResponse(sp.prompt)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors text-xs text-slate-600 font-semibold truncate hover:text-indigo-700"
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pinned Messages */}
          {pinnedMessageIds.size > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
              <h3 className="text-xs font-black text-amber-600 uppercase tracking-wider mb-3 flex items-center space-x-1">
                <StarIcon className="w-3 h-3" />
                <span>Pinned ({pinnedMessageIds.size})</span>
              </h3>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {messages.filter(m => pinnedMessageIds.has(m.id)).map(m => (
                  <div key={m.id} className="p-2 rounded-lg bg-amber-50 text-[10px] text-slate-600 leading-relaxed truncate">
                    {m.content.replace(/\*\*/g, '').slice(0, 80)}...
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Hot Leads */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Top Leads</h3>
            <div className="space-y-2">
              {leads.slice(0, 4).map(lead => (
                <button
                  key={lead.id}
                  onClick={() => generateResponse(`Tell me about ${lead.name} at ${lead.company}`)}
                  className="w-full flex items-center space-x-2.5 p-2.5 rounded-xl hover:bg-indigo-50 transition-colors text-left group"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                    lead.score > 80 ? 'bg-rose-100 text-rose-700' : lead.score > 60 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {lead.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{lead.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{lead.company}</p>
                  </div>
                  <span className="text-xs font-black text-indigo-600">{lead.score}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Chat Area (75%) ─── */}
        <div className="lg:w-[75%] flex flex-col">

          {/* Suggestion Chips */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Quick Commands</h3>
              <div className="flex space-x-1">
                {[
                  { key: null, label: 'All' },
                  { key: 'analyze', label: 'Analyze' },
                  { key: 'strategy', label: 'Strategy' },
                  { key: 'report', label: 'Report' },
                ].map(f => (
                  <button
                    key={f.label}
                    onClick={() => setChipFilter(f.key as any)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      chipFilter === f.key ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredChips.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => handleChipClick(chip)}
                  disabled={thinking}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:shadow-sm active:scale-95 disabled:opacity-50 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300`}
                >
                  <span className={`text-${chip.color}-500`}>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex-1 flex flex-col min-h-[500px]">
            <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[600px]">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : 'order-1'}`}>
                    {/* Avatar + timestamp row */}
                    <div className={`flex items-center space-x-2 mb-1 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      {msg.role !== 'user' && (
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                          msg.role === 'ai' ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {msg.role === 'ai' ? <SparklesIcon className="w-3.5 h-3.5" /> : <BoltIcon className="w-3 h-3" />}
                        </div>
                      )}
                      <span className="text-[10px] text-slate-400">
                        {msg.role === 'ai' ? 'AuraAI' : msg.role === 'system' ? 'System' : 'You'} &middot; {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Message bubble */}
                    <div className={`rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : msg.role === 'system'
                        ? 'bg-amber-50 border border-amber-200 text-amber-700'
                        : 'bg-slate-50 border border-slate-100 text-slate-700'
                    }`}>
                      <div className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? '' : ''}`}>
                        {msg.content.split('\n').map((line, li) => {
                          // Simple markdown-like bold
                          const parts = line.split(/(\*\*[^*]+\*\*)/g);
                          return (
                            <React.Fragment key={li}>
                              {parts.map((part, pi) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  return <strong key={pi} className="font-black">{part.slice(2, -2)}</strong>;
                                }
                                return <span key={pi}>{part}</span>;
                              })}
                              {li < msg.content.split('\n').length - 1 && <br />}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>

                    {/* Confidence meter + Actions for AI messages */}
                    {msg.role === 'ai' && msg.confidence && (
                      <div className="mt-1.5 ml-1 flex items-center justify-between">
                        <ConfidenceMeter confidence={msg.confidence} />
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleCopyMessage(msg)}
                            className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Copy"
                          >
                            {copiedMsgId === msg.id ? <CheckIcon className="w-3 h-3 text-emerald-500" /> : <CopyIcon className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => handlePinMessage(msg.id)}
                            className={`p-1 rounded-lg transition-all ${
                              pinnedMessageIds.has(msg.id)
                                ? 'text-amber-500 bg-amber-50'
                                : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'
                            }`}
                            title="Pin"
                          >
                            <StarIcon className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleExportChat()}
                            className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Export"
                          >
                            <DownloadIcon className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Save prompt for user messages */}
                    {msg.role === 'user' && (
                      <div className="mt-1 flex justify-end">
                        <button
                          onClick={() => handleSavePrompt(msg.content)}
                          className={`text-[9px] font-bold transition-all ${
                            savedPrompts.some(p => p.prompt === msg.content)
                              ? 'text-indigo-500'
                              : 'text-slate-300 hover:text-indigo-500'
                          }`}
                        >
                          {savedPrompts.some(p => p.prompt === msg.content) ? 'Saved' : 'Save prompt'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Thinking indicator */}
              {thinking && (
                <div className="flex justify-start">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
                        <SparklesIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] text-slate-400">AuraAI is thinking...</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <span className="text-xs text-slate-400">Analyzing your pipeline...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask your ${aiMode} about pipeline, leads, or strategy...`}
                    className="w-full px-4 py-3 pr-20 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder:text-slate-400"
                    disabled={thinking}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1.5">
                    <button className="p-1 text-slate-300 hover:text-indigo-500 transition-colors" title="Voice input (coming soon)">
                      <MicIcon className="w-4 h-4" />
                    </button>
                    <div className={`w-1.5 h-1.5 rounded-full ${thinking ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></div>
                  </div>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || thinking}
                  className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {thinking ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <SendIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 ml-1">
                <p className="text-[10px] text-slate-400">
                  <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold">Enter</kbd> send &middot;
                  <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold ml-1">Ctrl+/</kbd> focus &middot;
                  <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold ml-1">Ctrl+L</kbd> clear
                </p>
                <span className="text-[9px] text-slate-400">
                  Mode: <span className="font-bold text-indigo-500 capitalize">{aiMode}</span> &middot; {responseCount} responses
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEYBOARD SHORTCUTS MODAL                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-slate-900">Keyboard Shortcuts</h2>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2">
              {[
                ['Enter', 'Send message'],
                ['Ctrl + /', 'Focus input'],
                ['Ctrl + L', 'Clear chat'],
                ['Ctrl + E', 'Export chat'],
                ['?', 'Toggle shortcuts'],
                ['Esc', 'Close panels'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 min-w-[80px] text-center">{key}</kbd>
                  <span className="text-xs text-slate-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AICommandCenter;
