import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Lead, KnowledgeBase, User, ContentType } from '../../types';
import {
  TargetIcon, FlameIcon, SparklesIcon, MailIcon, PhoneIcon, ChartIcon,
  TagIcon, UsersIcon, ClockIcon, TrendUpIcon, BoltIcon, CalendarIcon,
  ArrowLeftIcon, CheckIcon, EditIcon, LinkIcon, GlobeIcon, XIcon,
  BrainIcon, AlertTriangleIcon, TrendDownIcon,
  LinkedInIcon, InstagramIcon, FacebookIcon, TwitterIcon, YoutubeIcon,
  StickyNoteIcon, PencilIcon, PlusIcon,
  SendIcon, EyeIcon, CursorClickIcon, TrashIcon
} from '../../components/Icons';
import { supabase } from '../../lib/supabase';
import { useCurrentBusiness } from '../../components/business/BusinessProvider';
import { emailValidationEnabled, validateEmail } from '../../lib/emailValidation';
import EmailValidationControl from '../../components/validation/EmailValidationControl';
import { leadIntelligenceEnabled, recalcLeadScore } from '../../lib/leadScoring';
import LeadScorePanel from '../../components/leads/LeadScorePanel';
import LeadResearchPanel from '../../components/leads/LeadResearchPanel';
import NextActionPanel from '../../components/leads/NextActionPanel';
import LeadCallPanel from '../../components/portal/LeadCallPanel';
import { formatDuration } from '../../lib/twilioVoice';
import FastSendModal from '../../components/leads/FastSendModal';
import { workspaceFlagEnabled } from '../../lib/featureFlags';
import { normalizeLeads, leadDisplayName, leadInitials } from '../../lib/queries';
import { consumeCredits } from '../../lib/credits';
import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import { generateLeadContent, generateLeadResearch, parseLeadResearchResponse } from '../../lib/gemini';
import { fetchLeadEmailEngagement, sendTrackedEmail } from '../../lib/emailTracking';
import { loadWorkflows, executeWorkflow as executeWorkflowEngine, type Workflow as DbWorkflow, type ExecutionResult } from '../../lib/automationEngine';
import type { EmailEngagement } from '../../types';
import EmailEngagementCard from '../../components/dashboard/EmailEngagementCard';
import LeadInvoicesTab from '../../components/invoices/LeadInvoicesTab';
import { AdvancedOnly } from '../../components/ui-mode';
import CreateInvoiceDrawer from '../../components/invoices/CreateInvoiceDrawer';
import LeadColorDot from '../../components/leads/LeadColorDot';
import { fetchStageColors, fetchColorOverrides, setLeadColorOverride, DEFAULT_STAGE_COLORS } from '../../lib/leadColors';
import { listNotes, addNote as persistNote, deleteNote as removeNote } from '../../lib/leadNotes';
import { listTasks, addTask as persistTask, setTaskDone, deleteTask as removeTask } from '../../lib/tasks';
import { listActivities } from '../../lib/leadActivities';
import { resolveWorkspaceId } from '../../lib/tenancy';
import type { ColorToken, StageColorMap, ColorOverrideMap } from '../../lib/leadColors';

// ── Helpers ──
const scoreToStars = (score: number): number => {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  return 1;
};

const StarRating = ({ score }: { score: number }) => {
  const stars = scoreToStars(score);
  return (
    <div className="flex items-center space-x-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-5 h-5 ${i <= stars ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

const getLeadTag = (lead: Lead): string => {
  if (lead.score >= 90) return 'Critical';
  if (lead.score >= 80) return 'Hot Lead';
  if (lead.score >= 65) return 'Warm';
  if (lead.status === 'Contacted') return 'Nurturing';
  return 'Cold';
};

const TAG_BADGE: Record<string, string> = {
  'Critical': 'bg-red-100 text-red-700',
  'Hot Lead': 'bg-orange-100 text-orange-700',
  'Warm': 'bg-amber-100 text-amber-700',
  'Nurturing': 'bg-emerald-100 text-emerald-700',
  'Cold': 'bg-blue-100 text-blue-700',
};

// ── Real company details from the lead's own fields (no fabrication) ──
const FREE_EMAIL_DOMAIN = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|proton|protonmail|aol|gmx|zoho|mail|yandex)\./i;
const deriveCompanyDetails = (lead: Lead) => {
  const email = lead.primary_email || '';
  const emailDomain = email.includes('@') ? email.split('@')[1].toLowerCase() : '';
  // Domain is a SEPARATE entity from the company name — take the real website
  // field, else the business email's domain. Never invent one from the name.
  const bizDomain = emailDomain && !FREE_EMAIL_DOMAIN.test(emailDomain) ? emailDomain : '';
  return {
    industry: lead.industry || '',
    size: lead.company_size || '',
    location: lead.location || '',
    website: (lead as { website?: string }).website || bizDomain || '',
  };
};

const deriveContactInfo = (lead: Lead) => {
  const name = leadDisplayName(lead);
  return {
    phone: lead.primary_phone || '',
    linkedin: lead.linkedin_url || '',
  };
};

// ── Phase 0: fabricated "intelligence" removed ───────────────────────────────
// These functions previously invented conversion probability, deal size,
// behavioral patterns and an engagement timeline (fake "Viewed pricing page",
// "Attended webinar" events) from a lead's — itself random — score. That was
// not real data. They now return honest empty/blank values until a real scoring
// + activity pipeline exists. Signatures are kept so dependent panels render
// honest empty states instead of fabricated numbers.
const derivePredictiveAnalysis = (_lead: Lead) => ({
  conversionProb: 0,
  timeline: '—',
  decisionMaker: '—',
  dealSize: '—',
});

const deriveBehavioralPatterns = (_lead: Lead): string[] => [];

const deriveRecommendedActions = (_lead: Lead): { text: string; priority: string }[] => [];

const deriveEngagementTimeline = (_lead: Lead): { date: Date; label: string; type: string }[] => [];

const formatEventDate = (date: Date): string => {
  const now = new Date();
  const diffH = Math.floor((now.getTime() - date.getTime()) / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const CALL_OUTCOME_LABELS: Record<string, string> = {
  connected: 'Connected',
  voicemail: 'Left voicemail',
  no_answer: 'No answer',
  busy: 'Busy',
  wrong_number: 'Wrong number',
};

const eventTypeIcon = (type: string) => {
  switch (type) {
    case 'page_view': return 'bg-blue-100 text-blue-600';
    case 'download': return 'bg-purple-100 text-purple-600';
    case 'event': return 'bg-amber-100 text-amber-600';
    case 'visit': return 'bg-emerald-100 text-emerald-600';
    case 'email': return 'bg-indigo-100 text-indigo-600';
    case 'demo': return 'bg-red-100 text-red-600';
    case 'created': return 'bg-slate-100 text-slate-600';
    case 'validated': return 'bg-emerald-100 text-emerald-600';
    case 'warning': return 'bg-amber-100 text-amber-600';
    case 'error': return 'bg-red-100 text-red-600';
    case 'call': return 'bg-emerald-100 text-emerald-600';
    case 'meeting': return 'bg-blue-100 text-blue-600';
    case 'reply': return 'bg-indigo-100 text-indigo-600';
    default: return 'bg-slate-100 text-slate-600';
  }
};

type TabKey = 'ai-insights' | 'activity' | 'notes' | 'campaigns' | 'tasks' | 'files' | 'invoices';

// ── Notes State ──
interface NoteItem {
  id: string;
  text: string;
  createdAt: string;
}

// ── Tasks State ──
interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
}

// Short, human due label for a task (e.g. "Jul 24" / "Overdue" / "No due date").
function dueLabel(dueAt: string | null): string {
  if (!dueAt) return 'No due date';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return 'No due date';
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const LeadProfile: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const { currentBusinessId, currentBusiness } = useCurrentBusiness();
  const [valEnabled, setValEnabled] = useState(false);
  const [intelEnabled, setIntelEnabled] = useState(false);
  useEffect(() => { emailValidationEnabled(user.id).then(setValEnabled).catch(() => {}); }, [user.id]);
  useEffect(() => { leadIntelligenceEnabled(user.id).then(setIntelEnabled).catch(() => {}); }, [user.id]);
  const [fastEnabled, setFastEnabled] = useState(false);
  const [fastSendOpen, setFastSendOpen] = useState(false);
  const [validatingEmail, setValidatingEmail] = useState(false);
  const [timeline, setTimeline] = useState<{ date: Date; label: string; type: string; detail?: string }[]>([]);
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [callOutcome, setCallOutcome] = useState('connected');
  const [callNotes, setCallNotes] = useState('');
  const [savingCall, setSavingCall] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingWhen, setMeetingWhen] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [savingMeeting, setSavingMeeting] = useState(false);
  useEffect(() => { workspaceFlagEnabled(user.id, 'fast_send').then(setFastEnabled).catch(() => {}); }, [user.id]);
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('ai-insights');
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);

  // Notes
  const [notes, setNotes] = useState<NoteItem[]>([]);
  // Load persisted notes for this lead (survives reload).
  useEffect(() => {
    if (!lead?.id) return;
    listNotes(lead.id)
      .then(rows => setNotes(rows.map(r => ({ id: r.id, text: r.text, createdAt: r.createdAt }))))
      .catch(() => {});
  }, [lead?.id]);
  const [newNote, setNewNote] = useState('');

  // Tasks — persisted in the tasks table (survives reload).
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  useEffect(() => {
    if (!lead?.id) return;
    listTasks(lead.id)
      .then(rows => setTasks(rows.map(r => ({ id: r.id, title: r.title, done: r.status === 'done', dueAt: r.dueAt }))))
      .catch(() => {});
  }, [lead?.id]);
  const [newTask, setNewTask] = useState('');

  // Quick action feedback
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Menu
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Email Engagement ──
  const [emailEngagement, setEmailEngagement] = useState<EmailEngagement | null>(null);

  // ── Panel State ──
  const [showLeadHealth, setShowLeadHealth] = useState(false);
  const [showConversionIntel, setShowConversionIntel] = useState(false);
  const [showEngagementMap, setShowEngagementMap] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Lead Colors ──
  const [stageColors, setStageColors] = useState<StageColorMap>({ ...DEFAULT_STAGE_COLORS });
  const [colorOverrides, setColorOverrides] = useState<ColorOverrideMap>({});
  useEffect(() => {
    fetchStageColors().then(setStageColors);
    fetchColorOverrides().then(setColorOverrides);
  }, []);
  const handleColorOverride = useCallback(async (leadId: string, token: ColorToken | null) => {
    await setLeadColorOverride(leadId, token);
    if (token === null) {
      setColorOverrides(prev => { const next = { ...prev }; delete next[leadId]; return next; });
    } else {
      setColorOverrides(prev => ({ ...prev, [leadId]: token }));
    }
  }, []);

  // ── Knowledge Base ──
  const [kbDrawerOpen, setKbDrawerOpen] = useState(false);
  const [kbForm, setKbForm] = useState<KnowledgeBase>({});
  const [kbNotesExpanded, setKbNotesExpanded] = useState(false);
  const [kbResearching, setKbResearching] = useState(false);
  // Lets the KB-save handler skip UI state updates after the user leaves the
  // page (the enrichment continues server-side either way).
  const profileMountedRef = useRef(true);
  useEffect(() => { profileMountedRef.current = true; return () => { profileMountedRef.current = false; }; }, []);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbError, setKbError] = useState('');

  // ── Blog Share ──
  const [showBlogShareModal, setShowBlogShareModal] = useState(false);
  const [publishedPosts, setPublishedPosts] = useState<any[]>([]);
  const [blogShareSending, setBlogShareSending] = useState(false);

  // ── Run Workflow ──
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [availableWorkflows, setAvailableWorkflows] = useState<DbWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<ExecutionResult | null>(null);

  // ── Edit Lead ──
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', company: '', phone: '', insights: '' });
  const [editKb, setEditKb] = useState({ website: '', linkedin: '', instagram: '', facebook: '', twitter: '', youtube: '' });
  const [editKbVisible, setEditKbVisible] = useState<Set<string>>(new Set());
  const [editError, setEditError] = useState('');
  const [isEditSaving, setIsEditSaving] = useState(false);

  useEffect(() => {
    if (leadId) fetchLead();
  }, [leadId]);

  const fetchLead = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('id,client_id,first_name,last_name,primary_email,primary_phone,company,score,status,last_activity,insights,created_at,updated_at,knowledgeBase,emails,phones,linkedin_url,location,title,source,industry,company_size,import_batch_id,imported_at,custom_fields')
      .eq('id', leadId)
      .single();
    if (error) {
      console.error('LeadProfile fetch error:', error.message);
    } else if (data) {
      const [normalized] = normalizeLeads([data]);
      setLead(normalized);
      fetchLeadEmailEngagement(normalized.id).then(setEmailEngagement);
    }
    setLoading(false);
  };

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 2500);
  };

  const normalizeUrl = (url: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const openKbDrawer = () => {
    const existing = lead?.knowledgeBase || {};
    // Seed blank fields from what the lead already knows (shown in Company
    // Details / Contact Info) so the drawer isn't empty — website from the
    // company details, LinkedIn from the lead's social URL. Existing KB values
    // always win so we never clobber something the user already saved.
    const company = lead ? deriveCompanyDetails(lead) : { website: '' };
    const linkedinUrl = (lead as { linkedin_url?: string } | null)?.linkedin_url || '';
    setKbForm({
      ...existing,
      website: existing.website || company.website || '',
      linkedin: existing.linkedin || linkedinUrl,
    });
    setKbDrawerOpen(true);
  };

  const openEditDrawer = () => {
    if (!lead) return;
    const kb = lead.knowledgeBase || {};
    setEditForm({
      name: leadDisplayName(lead),
      email: lead.primary_email || '',
      company: lead.company || '',
      phone: lead.primary_phone || (kb as Record<string, string>).phone || '',
      insights: lead.insights || '',
    });
    setEditKb({
      website: kb.website || '',
      linkedin: kb.linkedin || '',
      instagram: kb.instagram || '',
      facebook: kb.facebook || '',
      twitter: kb.twitter || '',
      youtube: kb.youtube || '',
    });
    const visible = new Set<string>();
    if (kb.website) visible.add('website');
    if (kb.linkedin) visible.add('linkedin');
    if (kb.twitter) visible.add('twitter');
    if (kb.instagram) visible.add('instagram');
    if (kb.facebook) visible.add('facebook');
    setEditKbVisible(visible);
    setEditError('');
    setIsEditOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    setEditError('');
    setIsEditSaving(true);
    try {
      const kbCleaned: Record<string, string> = {};
      if (editKb.website.trim()) kbCleaned.website = normalizeUrl(editKb.website);
      if (editKb.linkedin.trim()) kbCleaned.linkedin = normalizeUrl(editKb.linkedin);
      if (editKb.instagram.trim()) kbCleaned.instagram = normalizeUrl(editKb.instagram);
      if (editKb.facebook.trim()) kbCleaned.facebook = normalizeUrl(editKb.facebook);
      if (editKb.twitter.trim()) kbCleaned.twitter = normalizeUrl(editKb.twitter);
      if (editKb.youtube.trim()) kbCleaned.youtube = normalizeUrl(editKb.youtube);
      if (editForm.phone.trim()) kbCleaned.phone = editForm.phone.trim();
      const knowledgeBase = Object.keys(kbCleaned).length > 0 ? kbCleaned : null;

      const payload: Record<string, any> = {
        first_name: editForm.name.trim().split(' ')[0] || '',
        last_name: editForm.name.trim().split(' ').slice(1).join(' ') || '',
        primary_email: editForm.email.trim(),
        company: editForm.company.trim(),
        insights: editForm.insights.trim() || '',
      };
      if (knowledgeBase !== undefined) payload.knowledgeBase = knowledgeBase;

      let { error } = await supabase.from('leads').update(payload).eq('id', lead.id);

      if (error && (error.message?.includes('knowledgeBase') || error.code === 'PGRST204')) {
        delete payload.knowledgeBase;
        const retry = await supabase.from('leads').update(payload).eq('id', lead.id);
        error = retry.error;
      }

      if (error) {
        setEditError(`${error.message}${error.hint ? ` (Hint: ${error.hint})` : ''}`);
        return;
      }

      setLead({ ...lead, ...payload, knowledgeBase: knowledgeBase || lead.knowledgeBase });
      setIsEditOpen(false);
      showFeedback('Lead updated successfully');
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsEditSaving(false);
    }
  };

  const AI_RESEARCH_HEADER = '--- AI Research Brief ---';

  const stripPreviousAIResearch = (notes: string | undefined): string => {
    if (!notes) return '';
    const idx = notes.indexOf(AI_RESEARCH_HEADER);
    return idx === -1 ? notes : notes.substring(0, idx).trim();
  };

  const handleKbSave = async () => {
    if (!lead) return;
    setKbSaving(true);
    setKbError('');

    const cleaned: KnowledgeBase = {};
    if (kbForm.website?.trim()) cleaned.website = normalizeUrl(kbForm.website);
    if (kbForm.linkedin?.trim()) cleaned.linkedin = normalizeUrl(kbForm.linkedin);
    if (kbForm.instagram?.trim()) cleaned.instagram = normalizeUrl(kbForm.instagram);
    if (kbForm.facebook?.trim()) cleaned.facebook = normalizeUrl(kbForm.facebook);
    if (kbForm.twitter?.trim()) cleaned.twitter = normalizeUrl(kbForm.twitter);
    if (kbForm.youtube?.trim()) cleaned.youtube = normalizeUrl(kbForm.youtube);
    if (kbForm.extraNotes?.trim()) cleaned.extraNotes = kbForm.extraNotes.trim();
    const kb = Object.keys(cleaned).length > 0 ? cleaned : null;

    console.log('[KB Save] lead.id:', lead.id, 'user.id:', user.id, 'payload:', JSON.stringify(kb));

    const { data: updateData, error: saveErr, count, status, statusText } = await supabase
      .from('leads')
      .update({ knowledgeBase: kb })
      .eq('id', lead.id)
      .eq('client_id', user.id)
      .select();

    console.log('[KB Save] status:', status, statusText, 'error:', saveErr, 'data:', updateData, 'count:', count);

    if (saveErr) {
      console.error('[KB Save] FAILED:', saveErr.code, saveErr.message, saveErr.details, saveErr.hint);
      setKbError(`${saveErr.message}${saveErr.hint ? ` — ${saveErr.hint}` : ''}`);
      setKbSaving(false);
      return;
    }

    if (!updateData || updateData.length === 0) {
      console.error('[KB Save] No rows returned — update may have matched 0 rows (RLS or wrong id)');
      setKbError('Update returned no data — the lead may not belong to your account or the session expired.');
      setKbSaving(false);
      return;
    }

    setLead({ ...lead, knowledgeBase: kb || undefined });
    setKbDrawerOpen(false);
    setKbSaving(false);
    showFeedback('Knowledge Base updated');

    // Fire background AI research if social URLs are present
    const socialUrls: Record<string, string> = {};
    if (cleaned.website) socialUrls.website = cleaned.website;
    if (cleaned.linkedin) socialUrls.linkedin = cleaned.linkedin;
    if (cleaned.instagram) socialUrls.instagram = cleaned.instagram;
    if (cleaned.facebook) socialUrls.facebook = cleaned.facebook;
    if (cleaned.twitter) socialUrls.twitter = cleaned.twitter;
    if (cleaned.youtube) socialUrls.youtube = cleaned.youtube;

    if (Object.keys(socialUrls).length === 0) return;

    const creditResult = await consumeCredits(supabase, 'lead_research');
    if (!creditResult.success) return;

    // Kick off enrichment as a SERVER-SIDE background job: build the research
    // prompt client-side (fast, prepareOnly), then hand it to the enrich-lead
    // edge function which runs the slow grounded generation + DB write in the
    // background (survives navigation AND full reload). The LeadEnrichmentWatcher
    // polls the job row and shows a live timer.
    setKbResearching(true);
    try {
      const prepared = await generateLeadResearch(lead, socialUrls, user.businessProfile, user.id, true);
      if (!prepared.request) return;
      const label = `Enriching ${lead.company || leadDisplayName(lead) || 'lead'}…`;
      const { error: invokeErr } = await supabase.functions.invoke('enrich-lead', {
        body: {
          lead_id: lead.id,
          prompt: prepared.request.prompt,
          systemInstruction: prepared.request.systemInstruction,
          temperature: prepared.request.temperature,
          topP: prepared.request.topP,
          currentKb: cleaned,
          label,
        },
      });
      showFeedback(invokeErr
        ? 'Could not start enrichment — please retry'
        : 'AI enrichment started — it finishes in the background');
    } catch {
      showFeedback('Could not start enrichment — please retry');
    } finally {
      if (profileMountedRef.current) setKbResearching(false);
    }
  };

  const KB_SOCIAL_LINKS: { key: keyof KnowledgeBase; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'website', label: 'Website', icon: <GlobeIcon className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
    { key: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-3.5 h-3.5" />, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { key: 'instagram', label: 'Instagram', icon: <InstagramIcon className="w-3.5 h-3.5" />, color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
    { key: 'facebook', label: 'Facebook', icon: <FacebookIcon className="w-3.5 h-3.5" />, color: 'bg-blue-50 text-blue-800 hover:bg-blue-100' },
    { key: 'twitter', label: 'X / Twitter', icon: <TwitterIcon className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-800 hover:bg-slate-200' },
    { key: 'youtube', label: 'YouTube', icon: <YoutubeIcon className="w-3.5 h-3.5" />, color: 'bg-red-50 text-red-700 hover:bg-red-100' },
  ];

  const PIPELINE_STAGES: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Converted'];
  const STAGE_COLORS: Record<Lead['status'], { bg: string; text: string; ring: string }> = {
    New: { bg: 'bg-slate-500', text: 'text-slate-700', ring: 'ring-slate-400' },
    Contacted: { bg: 'bg-blue-500', text: 'text-blue-700', ring: 'ring-blue-400' },
    Qualified: { bg: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-400' },
    Converted: { bg: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-400' },
    Lost: { bg: 'bg-red-500', text: 'text-red-700', ring: 'ring-red-400' },
  };

  const getNextStage = (currentStatus: Lead['status']): Lead['status'] | null => {
    const idx = PIPELINE_STAGES.indexOf(currentStatus);
    if (idx === -1 || idx >= PIPELINE_STAGES.length - 1) return null;
    return PIPELINE_STAGES[idx + 1];
  };

  const handleStatusChange = async (newStatus: Lead['status']) => {
    if (!lead) return;
    const newActivity = new Date().toISOString();
    const { error: updateError } = await supabase.from('leads').update({ status: newStatus, last_activity: newActivity }).eq('id', lead.id);
    if (updateError) console.error('Lead status update error:', updateError.message);
    setLead({ ...lead, status: newStatus, last_activity: newActivity });
    const { error: logError } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'LEAD_STATUS_UPDATED',
      details: `${leadDisplayName(lead)} moved to ${newStatus}`
    });
    if (logError) console.error('Audit log error:', logError.message);
    showFeedback(`Status updated to ${newStatus}`);
    setMenuOpen(false);
  };

  // Recompute the lead score from real signals via the canonical scorer
  // (lib/leadScoring: firmographics, email engagement, deliverability, recency,
  // suppression → lead_scores + synced leads.score). Replaces the old "+5/click".
  const handleScoreUpdate = async () => {
    if (!lead) return;
    if (!currentBusinessId) { showFeedback('Select a business to score this lead'); return; }
    try {
      const workspaceId = await resolveWorkspaceId(user.id);
      const s = await recalcLeadScore(currentBusinessId, workspaceId, lead);
      setLead({ ...lead, score: s.total_score });
      showFeedback(`Score recalculated to ${s.total_score} — ${s.reason_summary}`);
    } catch (e) {
      console.error('Score recalc error:', (e as Error).message);
      showFeedback('Could not recalculate score');
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !lead?.id) return;
    const text = newNote.trim();
    setNewNote('');
    const saved = await persistNote(user.id, lead.id, text);
    if (saved) { setNotes(prev => [{ id: saved.id, text: saved.text, createdAt: saved.createdAt }, ...prev]); void loadTimeline(); }
    else setNewNote(text); // restore on failure
  };

  const handleDeleteNote = async (id: string) => {
    const prev = notes;
    setNotes(p => p.filter(n => n.id !== id)); // optimistic
    if (!(await removeNote(id))) setNotes(prev); // rollback on failure
  };

  const handleAddTask = async () => {
    if (!newTask.trim() || !lead?.id) return;
    const title = newTask.trim();
    setNewTask('');
    const saved = await persistTask(user.id, lead.id, { title, businessId: currentBusinessId ?? null });
    if (saved) { setTasks(prev => [...prev, { id: saved.id, title: saved.title, done: saved.status === 'done', dueAt: saved.dueAt }]); void loadTimeline(); }
    else setNewTask(title); // restore on failure
  };

  const toggleTask = async (id: string) => {
    const target = tasks.find(t => t.id === id);
    if (!target) return;
    const next = !target.done;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: next } : t)); // optimistic
    const saved = await setTaskDone(id, next);
    if (!saved) setTasks(prev => prev.map(t => t.id === id ? { ...t, done: target.done } : t)); // rollback
    else void loadTimeline();
  };

  const handleDeleteTask = async (id: string) => {
    const prev = tasks;
    setTasks(p => p.filter(t => t.id !== id)); // optimistic
    if (!(await removeTask(id))) setTasks(prev); // rollback on failure
  };

  // ── Lead Health ──
  const leadHealth = useMemo(() => {
    if (!lead) return { healthScore: 0, tier: 'Cold', factors: [] as { name: string; value: number; max: number }[], risks: [] as string[], strengths: [] as string[], freshness: 0, statusScore: 0, daysSinceCreated: 0 };
    const daysSinceCreated = lead.created_at ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000) : 30;
    const freshness = Math.max(0, 100 - daysSinceCreated * 3);
    const statusScore = lead.status === 'Qualified' ? 100 : lead.status === 'Contacted' ? 66 : lead.status === 'New' ? 33 : 10;
    const healthScore = Math.min(100, Math.round(lead.score * 0.5 + freshness * 0.2 + statusScore * 0.3));
    const tier = lead.score >= 90 ? 'Critical' : lead.score >= 75 ? 'Hot' : lead.score >= 50 ? 'Warm' : 'Cold';
    const factors = [
      { name: 'Lead Score', value: lead.score, max: 100 },
      { name: 'Freshness', value: freshness, max: 100 },
      { name: 'Status Progress', value: statusScore, max: 100 },
      { name: 'Profile Complete', value: lead.insights ? 85 : 45, max: 100 },
    ];
    const risks: string[] = [];
    if (lead.score < 40) risks.push('Low engagement score indicates weak interest');
    if (daysSinceCreated > 14 && lead.status === 'New') risks.push('Lead aging \u2014 no outreach in 2+ weeks');
    if (lead.status === 'Lost') risks.push('Lead marked as lost \u2014 consider re-engagement');
    if (!lead.insights) risks.push('Missing AI insights \u2014 run enrichment');
    const strengths: string[] = [];
    if (lead.score >= 75) strengths.push('High engagement score');
    if (lead.status === 'Qualified') strengths.push('Qualified and ready for conversion');
    if (lead.status === 'Contacted') strengths.push('Active communication established');
    if (freshness >= 70) strengths.push('Recently added \u2014 high intent period');
    if (lead.company) strengths.push(`Company identified: ${lead.company}`);
    return { healthScore, tier, factors, risks, strengths, freshness, statusScore, daysSinceCreated };
  }, [lead]);

  // ── Conversion Intel ──
  const conversionIntel = useMemo(() => {
    if (!lead) return { probability: 0, dealSize: '$0', timeline: 'N/A', signals: [] as { label: string; strength: string }[], stage: 'Unknown', readiness: 0, forecast: [] as { scenario: string; value: string; prob: number }[] };
    // Phase 0: only status-derived facts — no fabricated behavioral "signals".
    const signals: { label: string; strength: string }[] = [];
    if (lead.status === 'Qualified') signals.push({ label: 'Qualification confirmed', strength: 'strong' });
    if (lead.status === 'Contacted') signals.push({ label: 'Outreach in progress', strength: 'medium' });
    if (lead.insights) signals.push({ label: 'Research / notes available', strength: 'medium' });
    const stage = lead.status === 'Qualified' ? 'Qualified' : lead.status === 'Contacted' ? 'In conversation' : lead.status === 'New' ? 'New' : lead.status === 'Converted' ? 'Won' : 'Closed';
    // Conversion probability, deal size, readiness and forecast need a real
    // scoring/pipeline model (later phase). Blank rather than invented.
    return { probability: 0, dealSize: '—', timeline: '—', signals, stage, readiness: 0, forecast: [] as { scenario: string; value: string; prob: number }[] };
  }, [lead]);

  // ── Engagement Map ──
  const engagementMap = useMemo(() => {
    if (!lead) return { depth: 0, channels: [] as { name: string; effectiveness: number; interactions: number; preferred: boolean }[], touchpoints: 0, responsiveness: 'Unknown', preferredChannel: { name: 'N/A', effectiveness: 0 }, interactionScore: 0, bestWindow: 'N/A' };
    // Phase 0: fabricated per-channel effectiveness / interactions / best-window
    // removed. Real channel analytics need real interaction data (email events +
    // connected inbox), which arrives in a later phase.
    return {
      depth: 0,
      channels: [] as { name: string; effectiveness: number; interactions: number; preferred: boolean }[],
      touchpoints: 0,
      responsiveness: '\u2014',
      preferredChannel: { name: '\u2014', effectiveness: 0 },
      interactionScore: 0,
      bestWindow: '\u2014',
    };
  }, [lead]);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;

      if (e.key === 'h') { setShowLeadHealth(prev => !prev); return; }
      if (e.key === 'c') { setShowConversionIntel(prev => !prev); return; }
      if (e.key === 'g') { setShowEngagementMap(prev => !prev); return; }
      if (e.key === '?') { e.preventDefault(); setShowShortcuts(prev => !prev); return; }
      if (e.key === 'Escape') {
        setShowLeadHealth(false); setShowConversionIntel(false);
        setShowEngagementMap(false); setShowShortcuts(false);
        setMenuOpen(false);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Real activity timeline: lead created + email validation (status + Mails.so
  // reason). Declared BEFORE the loading/not-found early returns so hook order
  // stays stable across renders (guards lead being null internally).
  const loadTimeline = useCallback(async () => {
    if (!lead) { setTimeline([]); return; }
    const events: { date: Date; label: string; type: string; detail?: string }[] = [];
    if (lead.created_at) events.push({ date: new Date(lead.created_at), label: 'Lead created', type: 'created' });
    const email = (lead.primary_email || '').trim().toLowerCase();
    if (currentBusinessId && email) {
      const { data } = await supabase.from('email_validation_log')
        .select('status, reason, validated_at')
        .eq('business_id', currentBusinessId).eq('email', email)
        .order('validated_at', { ascending: false }).limit(50);
      for (const row of (data ?? []) as { status: string; reason: string | null; validated_at: string }[]) {
        events.push({
          date: new Date(row.validated_at),
          label: `Email validation — ${row.status}`,
          type: row.status === 'invalid' ? 'error' : row.status === 'risky' ? 'warning' : 'validated',
          detail: row.reason ? `Mails.so reason: ${row.reason}` : undefined,
        });
      }
    }
    // Logged calls (manual + in-app VOIP)
    const { data: calls } = await supabase.from('lead_call_logs')
      .select('outcome, notes, created_at, duration_seconds, recording_url, status')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false }).limit(50);
    for (const c of (calls ?? []) as { outcome: string | null; notes: string | null; created_at: string; duration_seconds: number | null; recording_url: string | null; status: string | null }[]) {
      const label = CALL_OUTCOME_LABELS[c.outcome ?? ''] ?? (c.outcome || c.status || 'Call');
      const dur = c.duration_seconds && c.duration_seconds > 0 ? ` (${formatDuration(c.duration_seconds)})` : '';
      const details = [c.notes || undefined, c.recording_url ? `Recording: ${c.recording_url}` : undefined].filter(Boolean).join('\n');
      events.push({
        date: new Date(c.created_at),
        label: `Call — ${label}${dur}`,
        type: 'call',
        detail: details || undefined,
      });
    }
    // Scheduled meetings
    const { data: meetings } = await supabase.from('lead_meetings')
      .select('title, scheduled_at, notes, status')
      .eq('lead_id', lead.id)
      .order('scheduled_at', { ascending: false }).limit(50);
    for (const m of (meetings ?? []) as { title: string; scheduled_at: string; notes: string | null; status: string }[]) {
      const when = new Date(m.scheduled_at);
      events.push({
        date: when,
        label: `Meeting — ${m.title}${m.status === 'cancelled' ? ' (cancelled)' : ''}`,
        type: 'meeting',
        detail: [when.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }), m.notes || ''].filter(Boolean).join(' · '),
      });
    }
    // Inbound replies (unified inbox)
    const { data: replies } = await supabase.from('inbound_emails')
      .select('subject, body_text, body_html, received_at')
      .eq('lead_id', lead.id)
      .order('received_at', { ascending: false }).limit(50);
    for (const r of (replies ?? []) as { subject: string | null; body_text: string | null; body_html: string | null; received_at: string }[]) {
      const snippet = (r.body_text || (r.body_html ? r.body_html.replace(/<[^>]+>/g, ' ') : '') || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      events.push({
        date: new Date(r.received_at),
        label: `Reply received${r.subject ? ` — ${r.subject}` : ''}`,
        type: 'reply',
        detail: snippet || undefined,
      });
    }
    // Manual activity log (call/email/meeting/note logged from the Leads list)
    for (const a of await listActivities(lead.id)) {
      events.push({
        date: new Date(a.occurredAt),
        label: `${a.type.charAt(0).toUpperCase() + a.type.slice(1)} logged`,
        type: a.type,
        detail: [a.details, a.outcome ? `Outcome: ${a.outcome}` : ''].filter(Boolean).join('\n') || undefined,
      });
    }
    // Notes
    for (const n of await listNotes(lead.id)) {
      events.push({ date: new Date(n.createdAt), label: n.isAi ? 'AI note' : 'Note added', type: 'note', detail: n.text || undefined });
    }
    // Tasks — created, and completed (if done)
    for (const t of await listTasks(lead.id)) {
      events.push({ date: new Date(t.createdAt), label: `Task: ${t.title}`, type: 'task', detail: t.dueAt ? `Due ${new Date(t.dueAt).toLocaleDateString()}` : undefined });
      if (t.status === 'done' && t.completedAt) {
        events.push({ date: new Date(t.completedAt), label: `Task completed: ${t.title}`, type: 'task' });
      }
    }
    events.sort((a, b) => b.date.getTime() - a.date.getTime());
    setTimeline(events);
  }, [lead, currentBusinessId]);
  useEffect(() => { void loadTimeline(); }, [loadTimeline]);

  const handleLogCall = async () => {
    if (!lead) return;
    setSavingCall(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('lead_call_logs').insert({
        lead_id: lead.id,
        client_id: user.id,
        business_id: currentBusinessId,
        outcome: callOutcome,
        notes: callNotes.trim() || null,
        created_by: user.id,
      });
      if (error) throw new Error(error.message);
      // Bump last_activity so the lead reflects the touch.
      await supabase.from('leads').update({ last_activity: now }).eq('id', lead.id).eq('client_id', user.id);
      setLead(prev => (prev ? ({ ...prev, last_activity: now, lastActivity: now } as Lead) : prev));
      showFeedback(`Call logged — ${CALL_OUTCOME_LABELS[callOutcome] ?? callOutcome}`);
      setLogCallOpen(false);
      setCallNotes('');
      setCallOutcome('connected');
      void loadTimeline();
    } catch (e) {
      showFeedback((e as Error).message || 'Could not log the call');
    } finally {
      setSavingCall(false);
    }
  };

  const handleScheduleMeeting = async () => {
    if (!lead) return;
    if (!meetingTitle.trim()) { showFeedback('Add a meeting title'); return; }
    if (!meetingWhen) { showFeedback('Pick a date & time'); return; }
    setSavingMeeting(true);
    try {
      const { error } = await supabase.from('lead_meetings').insert({
        lead_id: lead.id,
        client_id: user.id,
        business_id: currentBusinessId,
        title: meetingTitle.trim(),
        scheduled_at: new Date(meetingWhen).toISOString(),
        notes: meetingNotes.trim() || null,
        created_by: user.id,
      });
      if (error) throw new Error(error.message);
      showFeedback(`Meeting scheduled — ${meetingTitle.trim()}`);
      setMeetingOpen(false);
      setMeetingTitle(''); setMeetingWhen(''); setMeetingNotes('');
      void loadTimeline();
    } catch (e) {
      showFeedback((e as Error).message || 'Could not schedule the meeting');
    } finally {
      setSavingMeeting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-700">
        <div className="h-8 w-40 bg-slate-100 animate-pulse rounded-lg"></div>
        <div className="h-64 bg-slate-100 animate-pulse rounded-2xl"></div>
        <div className="h-96 bg-slate-100 animate-pulse rounded-2xl"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 text-lg">Lead not found.</p>
        <button onClick={() => navigate('/portal/leads')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">
          Back to Leads
        </button>
      </div>
    );
  }

  const tag = getLeadTag(lead);
  const company = deriveCompanyDetails(lead);
  const contact = deriveContactInfo(lead);
  const prediction = derivePredictiveAnalysis(lead);
  const patterns = deriveBehavioralPatterns(lead);
  const actions = deriveRecommendedActions(lead);

  // ── Email engagement computed values ──
  const hasEmailSent = (emailEngagement?.totalSent ?? 0) > 0;
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const recentEvents = (emailEngagement?.recentEvents ?? []).filter(
    e => new Date(e.created_at).getTime() >= thirtyDaysAgo
  );
  const hasRecentOpen = recentEvents.some(e => e.event_type === 'open');
  const hasRecentClick = recentEvents.some(e => e.event_type === 'click');
  const recentOpenCount = recentEvents.filter(e => e.event_type === 'open').length;

  // Mode A: UI-only "Contacted" display
  const displayStatus = (lead.status === 'New' && hasEmailSent) ? 'Contacted' : lead.status;
  const isAutoContacted = lead.status === 'New' && hasEmailSent;

  // Warm lead callout
  const warmLeadCallout = hasRecentClick
    ? { message: 'Clicked your CTA — high intent. Follow up now.', level: 'click' as const }
    : hasRecentOpen
    ? { message: 'Opened your email — follow up today.', level: 'open' as const }
    : null;

  const isPotentialLead = hasRecentClick || recentOpenCount >= 2;

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'ai-insights', label: 'AI Insights' },
    { key: 'activity', label: 'Activity' },
    { key: 'notes', label: 'Notes' },
    { key: 'campaigns', label: 'Campaigns' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'files', label: 'Files' },
    { key: 'invoices', label: 'Invoices' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/portal/leads')}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-2 text-sm text-slate-400 mb-0.5">
              <button onClick={() => navigate('/portal/leads')} className="hover:text-indigo-600 transition-colors">Leads</button>
              <span>/</span>
              <span className="text-slate-600 font-medium">{lead.name}</span>
            </div>
            <div className="flex items-center space-x-2">
              <LeadColorDot size="md" lead={lead} stageColors={stageColors} overrides={colorOverrides} onOverrideChange={handleColorOverride} />
              <h1 className="text-2xl font-bold text-slate-900 font-heading">
                {lead.name} <span className="text-slate-400 font-normal">—</span> <span className="text-slate-600">{lead.company}</span>
              </h1>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <AdvancedOnly>
          <button
            onClick={() => setShowLeadHealth(prev => !prev)}
            className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              showLeadHealth ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-200' : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
            }`}
          >
            <TrendUpIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Health</span>
          </button>
          <button
            onClick={() => setShowConversionIntel(prev => !prev)}
            className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              showConversionIntel ? 'bg-rose-600 text-white shadow-lg shadow-rose-200' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <TargetIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Conversion</span>
          </button>
          <button
            onClick={() => setShowEngagementMap(prev => !prev)}
            className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              showEngagementMap ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <BrainIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Engagement</span>
          </button>
          </AdvancedOnly>
          <button
            onClick={openEditDrawer}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Edit Lead</span>
          </button>
          <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-slate-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-48 overflow-hidden">
              <p className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Change Status</p>
              {(['New', 'Contacted', 'Qualified', 'Converted', 'Lost'] as Lead['status'][]).map(s => (
                <button key={s} onClick={() => handleStatusChange(s)} className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-indigo-50 hover:text-indigo-600 transition-colors ${lead.status === s ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-700'}`}>
                  {s}
                </button>
              ))}
              <div className="border-t border-slate-100">
                <button onClick={() => { navigate('/portal/leads'); }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Back to Leads
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Delete ${lead.name}? This action cannot be undone.`)) return;
                    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
                    if (error) { console.error('Delete lead error:', error.message); return; }
                    navigate('/portal/leads');
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  Delete Lead
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Action Feedback */}
      {actionFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-bold flex items-center space-x-2 animate-in fade-in duration-300">
          <CheckIcon className="w-4 h-4" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* ── Pipeline Stepper ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pipeline Progress</h3>
          {lead.status === 'Lost' && (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Lost</span>
            </span>
          )}
        </div>
        <div className="flex items-center">
          {PIPELINE_STAGES.map((stage, i) => {
            const currentIdx = PIPELINE_STAGES.indexOf(displayStatus);
            const isLost = displayStatus === 'Lost';
            const isCompleted = !isLost && currentIdx >= 0 && i < currentIdx;
            const isCurrent = !isLost && i === currentIdx;
            const isFuture = isLost || i > currentIdx;
            const colors = STAGE_COLORS[stage];
            return (
              <React.Fragment key={stage}>
                {i > 0 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded-full transition-all ${
                    isCompleted || isCurrent ? colors.bg : 'bg-slate-200'
                  }`} />
                )}
                <div className="flex flex-col items-center">
                  <div className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isCompleted ? `${colors.bg} text-white` :
                    isCurrent ? `${colors.bg} text-white ring-4 ${colors.ring}/30 animate-pulse` :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-[10px] font-black">{i + 1}</span>
                    )}
                  </div>
                  <span className={`mt-1.5 text-[10px] font-bold ${
                    isCompleted || isCurrent ? colors.text : 'text-slate-400'
                  }`}>{stage}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        {/* Advance / Mark Lost Buttons */}
        <div className="flex items-center space-x-3 mt-5 pt-4 border-t border-slate-100">
          {(() => {
            const nextStage = getNextStage(lead.status);
            if (nextStage) {
              return (
                <button
                  onClick={() => handleStatusChange(nextStage)}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <span>Advance to {nextStage}</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              );
            }
            return null;
          })()}
          {lead.status !== 'Lost' && (
            <button
              onClick={() => handleStatusChange('Lost')}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Mark Lost</span>
            </button>
          )}
          {lead.status === 'Lost' && (
            <button
              onClick={() => handleStatusChange('New')}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
            >
              <span>Re-open as New</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Contact Method Badges ── */}
      {(hasEmailSent || hasRecentOpen || hasRecentClick || isPotentialLead) && (
        <div className="flex flex-wrap items-center gap-2">
          {hasEmailSent && (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[11px] font-bold">
              <SendIcon className="w-3.5 h-3.5" />
              <span>Email</span>
            </span>
          )}
          {hasRecentOpen && (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[11px] font-bold">
              <EyeIcon className="w-3.5 h-3.5" />
              <span>Opened</span>
            </span>
          )}
          {hasRecentClick && (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-xl text-[11px] font-bold">
              <CursorClickIcon className="w-3.5 h-3.5" />
              <span>Clicked CTA</span>
            </span>
          )}
          {isPotentialLead && (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-violet-50 text-violet-600 rounded-xl text-[11px] font-bold">
              <FlameIcon className="w-3.5 h-3.5" />
              <span>Potential Lead</span>
            </span>
          )}
        </div>
      )}

      {/* ── Main Layout: Content (left) + Quick Actions (right) ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: Lead Overview + Tabs ── */}
        <div className="flex-grow space-y-6">

          {/* Lead Overview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Avatar + Score */}
              <div className="flex flex-col items-center space-y-4">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-indigo-100">
                  {leadInitials(lead)}
                </div>
                <div className="text-center">
                  <div className="flex items-center space-x-1 mb-1">
                    <TargetIcon className="w-4 h-4 text-indigo-600" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lead Score</span>
                  </div>
                  <StarRating score={lead.score} />
                  <p className="text-2xl font-black text-slate-900 mt-1">{lead.score}</p>
                </div>
                <span className={`px-3 py-1 rounded-lg text-xs font-bold ${TAG_BADGE[tag] || 'bg-slate-100 text-slate-600'}`}>
                  {tag}
                </span>
                {lead.import_batch_id && (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600">
                    File Import
                  </span>
                )}
                {lead.custom_fields?.needs_enrichment && (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-600">
                    Needs Enrichment
                  </span>
                )}
              </div>

              {/* Details Grid */}
              <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lead Info */}
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                    <TargetIcon className="w-3.5 h-3.5" />
                    <span>Lead Details</span>
                  </h3>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Status</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        displayStatus === 'New' ? 'bg-slate-50 text-slate-600' :
                        displayStatus === 'Contacted' ? 'bg-blue-50 text-blue-600' :
                        displayStatus === 'Qualified' ? 'bg-amber-50 text-amber-600' :
                        displayStatus === 'Converted' ? 'bg-emerald-50 text-emerald-600' :
                        'bg-red-50 text-red-600'
                      }`}>{displayStatus}{isAutoContacted && ' (auto)'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Owner</span>
                      <span className="text-xs font-bold text-slate-800">You</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Source</span>
                      <span className="text-xs font-medium text-slate-700">{lead.source || 'Manual'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Added</span>
                      <span className="text-xs font-medium text-slate-700">
                        {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                    <PhoneIcon className="w-3.5 h-3.5" />
                    <span>Contact Info</span>
                  </h3>
                  <div className="space-y-2.5">
                    <div className="flex items-center space-x-2">
                      <MailIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-indigo-600 font-medium truncate">{lead.primary_email}</span>
                    </div>
                    {valEnabled && (
                      <div className="pl-5">
                        <EmailValidationControl businessId={currentBusinessId} email={lead.primary_email} enabled={valEnabled} onValidated={loadTimeline} />
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <PhoneIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-700 font-medium">{contact.phone}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-indigo-600 font-medium truncate">{contact.linkedin}</span>
                    </div>
                  </div>
                </div>

                {intelEnabled && (
                  <div className="md:col-span-3">
                    <LeadScorePanel lead={lead} businessId={currentBusinessId} workspaceId={currentBusiness?.workspace_id ?? null} enabled={intelEnabled} />
                  </div>
                )}
                {intelEnabled && (
                  <div className="md:col-span-3">
                    <LeadResearchPanel lead={lead} businessId={currentBusinessId} workspaceId={currentBusiness?.workspace_id ?? null} userId={user.id} enabled={intelEnabled} />
                  </div>
                )}
                {intelEnabled && (
                  <div className="md:col-span-3">
                    <NextActionPanel lead={lead} businessId={currentBusinessId} enabled={intelEnabled} />
                  </div>
                )}

                {/* Company Details */}
                <div className="md:col-span-2">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                    <GlobeIcon className="w-3.5 h-3.5" />
                    <span>Company Details</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      { label: 'Company', value: lead.company },
                      { label: 'Industry', value: company.industry },
                      { label: 'Size', value: company.size },
                      { label: 'Location', value: company.location },
                      { label: 'Website', value: company.website },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-[10px] text-slate-400 font-bold">{item.label}</p>
                        <p className={`text-xs font-medium mt-0.5 truncate ${item.value ? 'text-slate-800' : 'text-slate-300'}`}>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom Fields */}
                {lead.custom_fields && Object.keys(lead.custom_fields).filter(k => k !== 'needs_enrichment').length > 0 && (
                  <div className="md:col-span-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-1.5">
                      <TagIcon className="w-3.5 h-3.5" />
                      <span>Custom Fields</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(lead.custom_fields)
                        .filter(([k]) => k !== 'needs_enrichment')
                        .map(([key, value]) => (
                          <div key={key}>
                            <p className="text-[10px] text-slate-400 font-bold">{key.replace(/_/g, ' ')}</p>
                            <p className="text-xs font-medium text-slate-800 mt-0.5 truncate">{String(value)}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Tabbed Interface ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Tab Bar */}
            <div className="flex border-b border-slate-100 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-6 py-4 text-sm font-bold whitespace-nowrap transition-all relative ${
                    activeTab === tab.key
                      ? 'text-indigo-600'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600"></div>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6">

              {/* ── AI INSIGHTS TAB ── */}
              {activeTab === 'ai-insights' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Predictive Analysis */}
                  <div>
                    <h3 className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-4">
                      <TargetIcon className="w-4 h-4 text-indigo-600" />
                      <span>Predictive Analysis</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Conversion Probability', value: `${prediction.conversionProb}%`, color: 'bg-emerald-50 text-emerald-700' },
                        { label: 'Expected Timeline', value: prediction.timeline, color: 'bg-blue-50 text-blue-700' },
                        { label: 'Key Decision Maker', value: prediction.decisionMaker, color: 'bg-purple-50 text-purple-700' },
                        { label: 'Est. Deal Size', value: prediction.dealSize, color: 'bg-amber-50 text-amber-700' },
                      ].map(item => (
                        <div key={item.label} className={`p-4 rounded-xl ${item.color}`}>
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">{item.label}</p>
                          <p className="text-sm font-bold">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Behavioral Patterns */}
                  <div>
                    <h3 className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-4">
                      <ChartIcon className="w-4 h-4 text-indigo-600" />
                      <span>Behavioral Patterns</span>
                    </h3>
                    <div className="space-y-2">
                      {patterns.map((p, i) => (
                        <div key={i} className="flex items-start space-x-3 p-3 bg-slate-50 rounded-xl">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0"></div>
                          <p className="text-sm text-slate-700">{p}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Actions */}
                  <div>
                    <h3 className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-4">
                      <BoltIcon className="w-4 h-4 text-indigo-600" />
                      <span>Recommended Actions</span>
                    </h3>
                    <div className="space-y-2">
                      {actions.map((a, i) => (
                        <div key={i} className="flex items-center justify-between p-3.5 bg-white border border-slate-100 rounded-xl hover:border-indigo-100 hover:bg-indigo-50/30 transition-all">
                          <div className="flex items-center space-x-3">
                            <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                            <p className="text-sm text-slate-700 font-medium">{a.text}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest ${
                            a.priority === 'high' ? 'bg-red-50 text-red-600' :
                            a.priority === 'medium' ? 'bg-amber-50 text-amber-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>{a.priority}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Engagement Timeline */}
                  <div>
                    <h3 className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-4">
                      <ClockIcon className="w-4 h-4 text-indigo-600" />
                      <span>Engagement Timeline</span>
                    </h3>
                    <div className="relative">
                      <div className="absolute top-0 bottom-0 left-[15px] w-px bg-slate-200"></div>
                      <div className="space-y-4">
                        {timeline.map((event, i) => (
                          <div key={i} className="flex items-start space-x-4 relative">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 z-10 ${eventTypeIcon(event.type)}`}>
                              <ClockIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-grow bg-white border border-slate-100 rounded-xl p-3.5">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-800">{event.label}</p>
                                <span className="text-[10px] font-bold text-slate-400 ml-2">{formatEventDate(event.date)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACTIVITY TAB ── */}
              {activeTab === 'activity' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <p className="text-xs text-slate-400 mb-4">Recent activity and interactions with this lead.</p>
                  {timeline.length === 0 && (
                    <p className="text-sm text-slate-400 italic py-8 text-center">No activity recorded yet.</p>
                  )}
                  {timeline.map((event, i) => (
                    <div key={i} className="flex items-start space-x-4 p-4 bg-slate-50 rounded-xl">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${eventTypeIcon(event.type)}`}>
                        <ClockIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-grow">
                        <p className="text-sm font-medium text-slate-800">{event.label}</p>
                        {event.detail && <p className="text-xs text-slate-500 mt-0.5">{event.detail}</p>}
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatEventDate(event.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── NOTES TAB ── */}
              {activeTab === 'notes' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                      placeholder="Add a note..."
                      className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors"
                    />
                    <button onClick={handleAddNote} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
                      Add
                    </button>
                  </div>
                  {notes.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm italic py-8">No notes yet. Add your first note above.</p>
                  ) : (
                    <div className="space-y-3">
                      {notes.map(note => (
                        <div key={note.id} className="group p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{note.text}</p>
                            <p className="text-[10px] text-slate-400 mt-2">
                              {new Date(note.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            title="Delete note"
                            className="shrink-0 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── CAMPAIGNS TAB ── */}
              {activeTab === 'campaigns' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <SparklesIcon className="w-8 h-8 text-indigo-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-700 mb-1">No active campaigns</p>
                    <p className="text-xs text-slate-400 mb-4">Add this lead to a campaign to start automated outreach.</p>
                    <button
                      onClick={() => showFeedback('Lead added to nurture campaign')}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Add to Campaign
                    </button>
                  </div>
                </div>
              )}

              {/* ── TASKS TAB ── */}
              {activeTab === 'tasks' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={newTask}
                      onChange={e => setNewTask(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                      placeholder="Add a task..."
                      className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors"
                    />
                    <button onClick={handleAddTask} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-center space-x-3 p-3.5 bg-white border border-slate-100 rounded-xl hover:border-indigo-100 transition-colors">
                        <button onClick={() => toggleTask(task.id)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${task.done ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                          {task.done && <CheckIcon className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-grow">
                          <p className={`text-sm font-medium ${task.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</p>
                        </div>
                        <span className={`text-[10px] font-bold ${!task.done && dueLabel(task.dueAt) === 'Overdue' ? 'text-rose-500' : 'text-slate-400'}`}>{dueLabel(task.dueAt)}</span>
                        <button onClick={() => handleDeleteTask(task.id)} title="Delete task" className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {tasks.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-6">No tasks yet. Add a follow-up above.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── FILES TAB ── */}
              {activeTab === 'files' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 border-dashed text-center">
                    <svg className="w-8 h-8 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-sm font-bold text-slate-600 mb-1">Drop files here or click to upload</p>
                    <p className="text-xs text-slate-400">Proposals, contracts, and documents related to this lead.</p>
                  </div>
                </div>
              )}

              {/* ── INVOICES TAB ── */}
              {activeTab === 'invoices' && (
                <LeadInvoicesTab
                  leadId={lead.id}
                  leadName={lead.name}
                  user={user}
                  onCreateInvoice={() => setShowCreateInvoice(true)}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Quick Actions Panel ── */}
        <div className="w-full lg:w-72 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 font-heading text-sm mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {fastEnabled && (
                <button
                  onClick={() => setFastSendOpen(true)}
                  className="w-full flex items-center space-x-3 p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-semibold text-sm"
                >
                  <SendIcon className="w-4 h-4" />
                  <span>Fast Send</span>
                </button>
              )}
              <button
                onClick={() => setFastSendOpen(true)}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-semibold text-sm"
              >
                <MailIcon className="w-4 h-4" />
                <span>Send Email</span>
              </button>
              {valEnabled && (
                <button
                  onClick={async () => {
                    if (!currentBusinessId || !lead?.primary_email) { showFeedback('No email to validate'); return; }
                    setValidatingEmail(true);
                    try {
                      const r = await validateEmail(currentBusinessId, lead.primary_email, true);
                      showFeedback(r ? `Email is ${r.status}${r.reason ? ` — ${r.reason}` : ''}` : 'Validation returned no result');
                      void loadTimeline();
                    } catch (e) { showFeedback((e as Error).message || 'Validation failed'); }
                    finally { setValidatingEmail(false); }
                  }}
                  disabled={validatingEmail}
                  className="w-full flex items-center space-x-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors font-semibold text-sm disabled:opacity-50"
                >
                  <CheckIcon className="w-4 h-4" />
                  <span>{validatingEmail ? 'Validating…' : 'Validate Email'}</span>
                </button>
              )}
              {(lead.primary_phone || (lead.phones && lead.phones.length > 0)) && (
                <LeadCallPanel
                  leadId={lead.id}
                  clientId={user.id}
                  businessId={currentBusinessId}
                  phones={[lead.primary_phone, ...(lead.phones ?? [])].filter((p): p is string => Boolean(p && p.trim()))}
                  leadName={`${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()}
                  onLogged={() => void loadTimeline()}
                  triggerClassName="w-full flex items-center space-x-3 p-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors font-semibold text-sm"
                />
              )}
              <button
                onClick={() => setLogCallOpen(true)}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors font-semibold text-sm"
              >
                <PhoneIcon className="w-4 h-4" />
                <span>Log Call</span>
              </button>
              <button
                onClick={() => setMeetingOpen(true)}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-semibold text-sm"
              >
                <CalendarIcon className="w-4 h-4" />
                <span>Schedule Meeting</span>
              </button>
              <button
                onClick={() => showFeedback('Lead added to nurture campaign')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors font-semibold text-sm"
              >
                <TargetIcon className="w-4 h-4" />
                <span>Add to Campaign</span>
              </button>
              <button
                onClick={() => showFeedback('Tag "Priority" added')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-semibold text-sm"
              >
                <TagIcon className="w-4 h-4" />
                <span>Add Tag</span>
              </button>
              <button
                onClick={handleScoreUpdate}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors font-semibold text-sm"
              >
                <ChartIcon className="w-4 h-4" />
                <span>Recalculate Score</span>
              </button>
              <button
                onClick={() => showFeedback('Assignment dialog opened')}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors font-semibold text-sm"
              >
                <UsersIcon className="w-4 h-4" />
                <span>Assign to Team</span>
              </button>
              <button
                onClick={async () => {
                  const { data } = await supabase
                    .from('blog_posts')
                    .select('id, title, slug, excerpt, content')
                    .eq('author_id', user.id)
                    .eq('status', 'published')
                    .order('published_at', { ascending: false });
                  setPublishedPosts(data || []);
                  setShowBlogShareModal(true);
                }}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-semibold text-sm"
              >
                <EditIcon className="w-4 h-4" />
                <span>Share Blog Post</span>
              </button>
              <button
                onClick={async () => {
                  const wfs = await loadWorkflows(user.id);
                  setAvailableWorkflows(wfs.filter(w => w.status === 'active'));
                  setSelectedWorkflowId(null);
                  setWorkflowResult(null);
                  setShowWorkflowModal(true);
                }}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-semibold text-sm"
              >
                <BoltIcon className="w-4 h-4" />
                <span>Run Workflow</span>
              </button>
            </div>

            {/* Shortcuts */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setShowShortcuts(true)} className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all">
                <span>Keyboard Shortcuts</span>
                <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold">?</kbd>
              </button>
            </div>
          </div>

          {/* ── Email Engagement Card ── */}
          <EmailEngagementCard
            leadId={lead.id}
            onSendEmailClick={() => showFeedback('Email composer opened')}
          />

          {/* ── Warm Lead Callout ── */}
          {warmLeadCallout && (
            <div className={`rounded-2xl border shadow-sm p-4 ${
              warmLeadCallout.level === 'click'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-start space-x-3">
                {warmLeadCallout.level === 'click'
                  ? <CursorClickIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  : <EyeIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                }
                <div>
                  <p className={`text-sm font-bold ${
                    warmLeadCallout.level === 'click' ? 'text-amber-800' : 'text-blue-800'
                  }`}>{warmLeadCallout.message}</p>
                  {isPotentialLead && (
                    <span className="inline-flex items-center space-x-1 mt-2 px-2.5 py-1 bg-violet-100 text-violet-700 rounded-lg text-[10px] font-bold">
                      <FlameIcon className="w-3 h-3" />
                      <span>Potential Lead</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Knowledge Base Card ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 font-heading text-sm">Knowledge Base</h3>
              {lead.knowledgeBase && Object.values(lead.knowledgeBase).some(v => v) && (
                <button onClick={openKbDrawer} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Edit">
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {kbResearching && (
              <div className="flex items-center space-x-2 mb-3 px-3 py-2 bg-indigo-50 rounded-xl">
                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium text-indigo-600">AI is researching this lead...</span>
              </div>
            )}
            {!lead.knowledgeBase || !Object.values(lead.knowledgeBase).some(v => v) ? (
              <div className="text-center py-4">
                <p className="text-xs text-slate-400 italic mb-3">No knowledge added yet</p>
                <button
                  onClick={openKbDrawer}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Add info</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Structured Intelligence Badges */}
                {(lead.knowledgeBase?.title || lead.knowledgeBase?.industry || lead.knowledgeBase?.location || lead.knowledgeBase?.employeeCount) && (
                  <div className="flex flex-wrap gap-1.5">
                    {lead.knowledgeBase.title && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-violet-50 text-violet-700">
                        {lead.knowledgeBase.title}
                      </span>
                    )}
                    {lead.knowledgeBase.industry && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700">
                        {lead.knowledgeBase.industry}
                      </span>
                    )}
                    {lead.knowledgeBase.location && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600">
                        {lead.knowledgeBase.location}
                      </span>
                    )}
                    {lead.knowledgeBase.employeeCount && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600">
                        {lead.knowledgeBase.employeeCount} employees
                      </span>
                    )}
                  </div>
                )}
                {/* Social Link Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {KB_SOCIAL_LINKS.map(({ key, label, icon, color }) => {
                    const value = lead.knowledgeBase?.[key] as string | undefined;
                    if (!value) return null;
                    return (
                      <a
                        key={key}
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${color}`}
                      >
                        {icon}
                        <span>{label}</span>
                      </a>
                    );
                  })}
                </div>
                {/* Company Overview */}
                {lead.knowledgeBase?.companyOverview && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company Overview</span>
                    <p className="text-xs text-slate-600 leading-relaxed mt-1">{lead.knowledgeBase.companyOverview}</p>
                  </div>
                )}
                {/* Mentioned on Website — high-value signal */}
                {lead.knowledgeBase?.mentionedOnWebsite && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                      <div className="flex items-center space-x-1.5 mb-1">
                        <FlameIcon className="w-3 h-3 text-amber-600" />
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Mentioned on Website</span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">{lead.knowledgeBase.mentionedOnWebsite}</p>
                    </div>
                  </div>
                )}
                {/* Outreach Angle */}
                {lead.knowledgeBase?.outreachAngle && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="flex items-center space-x-1.5 mb-1">
                        <TargetIcon className="w-3 h-3 text-emerald-600" />
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Outreach Angle</span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed">{lead.knowledgeBase.outreachAngle}</p>
                    </div>
                  </div>
                )}
                {/* Talking Points */}
                {lead.knowledgeBase?.talkingPoints && lead.knowledgeBase.talkingPoints.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Talking Points</span>
                    <ul className="mt-1.5 space-y-1">
                      {lead.knowledgeBase.talkingPoints.map((point, i) => (
                        <li key={i} className="flex items-start space-x-1.5 text-xs text-slate-600">
                          <span className="text-indigo-400 mt-0.5">&#8226;</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Risk Factors */}
                {lead.knowledgeBase?.riskFactors && lead.knowledgeBase.riskFactors.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <details>
                      <summary className="cursor-pointer">
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Risk Factors ({lead.knowledgeBase.riskFactors.length})</span>
                      </summary>
                      <ul className="mt-1.5 space-y-1">
                        {lead.knowledgeBase.riskFactors.map((risk, i) => (
                          <li key={i} className="flex items-start space-x-1.5 text-xs text-amber-700">
                            <AlertTriangleIcon className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}
                {/* AI Researched timestamp */}
                {lead.knowledgeBase?.aiResearchedAt && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400">
                      Last researched: {(() => {
                        const diff = Date.now() - new Date(lead.knowledgeBase.aiResearchedAt).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 60) return `${mins}m ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ago`;
                        const days = Math.floor(hrs / 24);
                        return `${days}d ago`;
                      })()}
                    </p>
                  </div>
                )}
                {/* Notes Preview */}
                {lead.knowledgeBase?.extraNotes && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center space-x-1.5 mb-1.5">
                      <StickyNoteIcon className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</span>
                    </div>
                    <p className={`text-xs text-slate-600 leading-relaxed ${!kbNotesExpanded ? 'line-clamp-3' : ''}`}>
                      {lead.knowledgeBase.extraNotes}
                    </p>
                    {lead.knowledgeBase.extraNotes.length > 120 && (
                      <button
                        onClick={() => setKbNotesExpanded(!kbNotesExpanded)}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 mt-1 transition-colors"
                      >
                        {kbNotesExpanded ? 'Show less' : 'View more'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ANALYTICS PANELS                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AdvancedOnly>

      {/* Lead Health Panel */}
      {showLeadHealth && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowLeadHealth(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-5 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Lead Health</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Comprehensive health assessment for {lead.name}</p>
                </div>
                <button onClick={() => setShowLeadHealth(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Gauge */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <svg viewBox="0 0 96 96" className="w-28 h-28">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#06b6d4" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(leadHealth.healthScore / 100) * 251.3} 251.3`}
                      transform="rotate(-90 48 48)" className="transition-all duration-1000" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900">{leadHealth.healthScore}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Health</span>
                  </div>
                </div>
                <span className={`mt-2 px-3 py-1 rounded-lg text-xs font-bold ${TAG_BADGE[leadHealth.tier] || 'bg-slate-100 text-slate-600'}`}>
                  {leadHealth.tier}
                </span>
              </div>

              {/* Factor Breakdown */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Health Factors</p>
                <div className="space-y-3">
                  {leadHealth.factors.map((f, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-600">{f.name}</span>
                        <span className="text-xs font-black text-slate-700">{f.value}/{f.max}</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          f.value >= 75 ? 'bg-emerald-500' : f.value >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                        }`} style={{ width: `${(f.value / f.max) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strengths */}
              {leadHealth.strengths.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Strengths</p>
                  <div className="space-y-1.5">
                    {leadHealth.strengths.map((s, i) => (
                      <div key={i} className="flex items-start space-x-2.5 p-2.5 bg-emerald-50 rounded-xl">
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-emerald-800 font-medium">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risks */}
              {leadHealth.risks.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Risk Factors</p>
                  <div className="space-y-1.5">
                    {leadHealth.risks.map((r, i) => (
                      <div key={i} className="flex items-start space-x-2.5 p-2.5 bg-red-50 rounded-xl">
                        <AlertTriangleIcon className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-800 font-medium">{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dark Chart */}
              <div className="bg-slate-900 rounded-xl p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Factor Comparison</p>
                <div className="flex items-end justify-between h-24 space-x-3">
                  {leadHealth.factors.map((f, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center space-y-1.5">
                      <div className="w-full rounded-t-lg bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all duration-700"
                        style={{ height: `${Math.max(f.value, 4)}%` }} />
                      <span className="text-[7px] font-bold text-slate-500 text-center leading-tight">{f.name.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Days since added</span>
                  <span className="text-sm font-black text-cyan-400">{leadHealth.daysSinceCreated}d</span>
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-cyan-600 to-teal-600 rounded-2xl p-5 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">AI Health Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  {leadHealth.healthScore >= 70
                    ? `${lead.name} shows strong health at ${leadHealth.healthScore}%. ${leadHealth.strengths.length} positive signals detected. Recommend accelerating to conversion.`
                    : leadHealth.risks.length > 0
                      ? `${leadHealth.risks.length} risk factor${leadHealth.risks.length > 1 ? 's' : ''} detected. ${leadHealth.risks[0]}. Address risks to improve conversion likelihood.`
                      : `Health score at ${leadHealth.healthScore}%. Focus on increasing engagement through targeted outreach and content sharing.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conversion Intel Panel */}
      {showConversionIntel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowConversionIntel(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-5 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Conversion Intel</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Deal probability & buying signals</p>
                </div>
                <button onClick={() => setShowConversionIntel(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Gauge */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <svg viewBox="0 0 96 96" className="w-28 h-28">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e11d48" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(conversionIntel.readiness / 100) * 251.3} 251.3`}
                      transform="rotate(-90 48 48)" className="transition-all duration-1000" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900">{conversionIntel.readiness}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ready</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Probability', value: `${conversionIntel.probability}%` },
                  { label: 'Timeline', value: conversionIntel.timeline },
                  { label: 'Deal Size', value: conversionIntel.dealSize },
                  { label: 'Stage', value: conversionIntel.stage },
                ].map((card, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-slate-900">{card.value}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>

              {/* Buying Signals */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Buying Signals</p>
                <div className="space-y-2">
                  {conversionIntel.signals.map((sig, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-2 h-2 rounded-full ${
                          sig.strength === 'strong' ? 'bg-emerald-500' :
                          sig.strength === 'medium' ? 'bg-amber-500' : 'bg-slate-300'
                        }`} />
                        <span className="text-xs font-medium text-slate-700">{sig.label}</span>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${
                        sig.strength === 'strong' ? 'text-emerald-600' :
                        sig.strength === 'medium' ? 'text-amber-600' : 'text-slate-400'
                      }`}>{sig.strength}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue Forecast */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Revenue Forecast</p>
                <div className="space-y-2">
                  {conversionIntel.forecast.map((f, i) => (
                    <div key={i} className={`p-3 rounded-xl border ${i === 1 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-600">{f.scenario}</span>
                        <span className="text-sm font-black text-slate-900">{f.value}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500 rounded-full transition-all duration-700" style={{ width: `${f.prob}%` }} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500">{f.prob}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dark Chart */}
              <div className="bg-slate-900 rounded-xl p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Conversion Factors</p>
                <div className="space-y-2.5">
                  {[
                    { label: 'Lead Score', value: lead.score },
                    { label: 'Readiness', value: conversionIntel.readiness },
                    { label: 'Probability', value: conversionIntel.probability },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <span className="text-[10px] font-bold text-slate-500 w-20">{item.label}</span>
                      <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-full transition-all duration-700"
                          style={{ width: `${item.value}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-rose-400 w-8 text-right">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-rose-600 to-pink-600 rounded-2xl p-5 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">AI Conversion Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  {conversionIntel.probability >= 75
                    ? `${conversionIntel.probability}% conversion probability with ${conversionIntel.signals.filter(s => s.strength === 'strong').length} strong buying signals. This lead is primed for closing \u2014 schedule a proposal review.`
                    : conversionIntel.stage === 'Discovery'
                      ? `Lead is in Discovery stage. ${conversionIntel.signals.filter(s => s.strength === 'strong').length} strong signals detected. Focus on qualifying needs and demonstrating ROI.`
                      : `Conversion readiness at ${conversionIntel.readiness}%. Strengthen engagement through personalized content and timely follow-ups to improve probability.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Engagement Map Panel */}
      {showEngagementMap && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowEngagementMap(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-5 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Engagement Map</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Channel analysis & interaction patterns</p>
                </div>
                <button onClick={() => setShowEngagementMap(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Gauge */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <svg viewBox="0 0 96 96" className="w-28 h-28">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#d97706" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(engagementMap.interactionScore / 100) * 251.3} 251.3`}
                      transform="rotate(-90 48 48)" className="transition-all duration-1000" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900">{engagementMap.interactionScore}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Score</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Depth', value: `${engagementMap.depth}%` },
                  { label: 'Touchpoints', value: engagementMap.touchpoints.toString() },
                  { label: 'Response', value: engagementMap.responsiveness },
                  { label: 'Best Window', value: engagementMap.bestWindow },
                ].map((card, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-slate-900">{card.value}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>

              {/* Channel Effectiveness */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Channel Effectiveness</p>
                <div className="space-y-2.5">
                  {engagementMap.channels.map((ch, i) => (
                    <div key={i} className={`p-3 rounded-xl border ${ch.name === engagementMap.preferredChannel.name ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-700">{ch.name}</span>
                          {ch.preferred && (
                            <span className="text-[8px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">PREFERRED</span>
                          )}
                        </div>
                        <span className="text-xs font-black text-slate-600">{ch.effectiveness}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          ch.effectiveness >= 70 ? 'bg-amber-500' : ch.effectiveness >= 50 ? 'bg-amber-400' : 'bg-slate-300'
                        }`} style={{ width: `${ch.effectiveness}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{ch.interactions} interaction{ch.interactions !== 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dark Chart */}
              <div className="bg-slate-900 rounded-xl p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Channel Comparison</p>
                <div className="flex items-end justify-between h-24 space-x-2">
                  {engagementMap.channels.map((ch, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center space-y-1.5">
                      <div className="w-full rounded-t-lg bg-gradient-to-t from-amber-600 to-amber-400 transition-all duration-700"
                        style={{ height: `${Math.max(ch.effectiveness, 4)}%` }} />
                      <span className="text-[7px] font-bold text-slate-500 text-center leading-tight">{ch.name.slice(0, 5)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Best channel</span>
                  <span className="text-sm font-black text-amber-400">{engagementMap.preferredChannel.name}</span>
                </div>
              </div>

              {/* AI Insight */}
              <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl p-5 text-white">
                <div className="flex items-center space-x-2 mb-2">
                  <SparklesIcon className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">AI Engagement Insight</p>
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  {engagementMap.interactionScore >= 65
                    ? `Strong engagement at ${engagementMap.interactionScore}% with ${engagementMap.touchpoints} touchpoints. ${engagementMap.preferredChannel.name} is the most effective channel at ${engagementMap.preferredChannel.effectiveness}%.`
                    : engagementMap.responsiveness === 'Low'
                      ? `Low responsiveness detected. Try switching to ${engagementMap.channels.find(c => !c.preferred && c.effectiveness > 30)?.name || 'LinkedIn'} outreach during ${engagementMap.bestWindow}.`
                      : `Engagement depth at ${engagementMap.depth}%. Increase ${engagementMap.preferredChannel.name} touchpoints and reach out during ${engagementMap.bestWindow} for best results.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      </AdvancedOnly>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 font-heading">Keyboard Shortcuts</h2>
                <p className="text-xs text-slate-400 mt-0.5">Lead Profile navigation & panels</p>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3">Panels</p>
                <div className="space-y-2">
                  {[
                    ['H', 'Lead Health'],
                    ['C', 'Conversion Intel'],
                    ['G', 'Engagement Map'],
                    ['?', 'This dialog'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{key}</kbd>
                      <span className="text-xs text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-3">Actions</p>
                <div className="space-y-2">
                  {[
                    ['Click tab', 'Switch sections'],
                    ['Add note', 'In Notes tab'],
                    ['Add task', 'In Tasks tab'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{key}</kbd>
                      <span className="text-xs text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3">System</p>
                <div className="space-y-2">
                  {[
                    ['Esc', 'Close panels'],
                    ['Back \u2190', 'Return to leads'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between">
                      <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{key}</kbd>
                      <span className="text-xs text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Knowledge Base Drawer ── */}
      {kbDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setKbDrawerOpen(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-5 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Knowledge Base</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Website, socials & notes for {lead.name}</p>
                </div>
                <button onClick={() => setKbDrawerOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <GlobeIcon className="w-3.5 h-3.5" /><span>Website</span>
                </label>
                <input type="url" value={kbForm.website || ''} onChange={e => setKbForm({ ...kbForm, website: e.target.value })} placeholder="https://example.com" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <LinkedInIcon className="w-3.5 h-3.5" /><span>LinkedIn</span>
                </label>
                <input type="url" value={kbForm.linkedin || ''} onChange={e => setKbForm({ ...kbForm, linkedin: e.target.value })} placeholder="linkedin.com/in/..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <InstagramIcon className="w-3.5 h-3.5" /><span>Instagram</span>
                </label>
                <input type="url" value={kbForm.instagram || ''} onChange={e => setKbForm({ ...kbForm, instagram: e.target.value })} placeholder="instagram.com/..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <FacebookIcon className="w-3.5 h-3.5" /><span>Facebook</span>
                </label>
                <input type="url" value={kbForm.facebook || ''} onChange={e => setKbForm({ ...kbForm, facebook: e.target.value })} placeholder="facebook.com/..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <TwitterIcon className="w-3.5 h-3.5" /><span>X / Twitter</span>
                </label>
                <input type="url" value={kbForm.twitter || ''} onChange={e => setKbForm({ ...kbForm, twitter: e.target.value })} placeholder="x.com/..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <YoutubeIcon className="w-3.5 h-3.5" /><span>YouTube</span>
                </label>
                <input type="url" value={kbForm.youtube || ''} onChange={e => setKbForm({ ...kbForm, youtube: e.target.value })} placeholder="youtube.com/@..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <StickyNoteIcon className="w-3.5 h-3.5" /><span>Extra Notes</span>
                </label>
                <textarea rows={4} value={kbForm.extraNotes || ''} onChange={e => setKbForm({ ...kbForm, extraNotes: e.target.value })} placeholder="Additional context, research notes..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none resize-none focus:border-indigo-300 transition-colors" />
              </div>
              {kbError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs font-bold text-red-600">{kbError}</p>
                </div>
              )}
              <button
                onClick={handleKbSave}
                disabled={kbSaving}
                className={`w-full py-3.5 rounded-xl text-sm font-bold transition-colors shadow-sm ${kbSaving ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                {kbSaving ? 'Saving...' : 'Save Knowledge Base'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lead Drawer */}
      {isEditOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setIsEditOpen(false)}></div>
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 p-10 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 font-heading">Edit Lead</h2>
                <p className="text-sm text-slate-500 mt-1">Update lead details and enrichment data.</p>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <form className="space-y-6 flex-grow" onSubmit={handleEditSave}>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                <input required type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="e.g. Robert Fox" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Email</label>
                <input required type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} placeholder="robert@stripe.com" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input required type="text" value={editForm.company} onChange={e => setEditForm({...editForm, company: e.target.value})} placeholder="e.g. Stripe" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Phone Number</label>
                <input type="tel" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} placeholder="+1 (555) 123-4567" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-300 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Insights</label>
                <textarea rows={3} value={editForm.insights} onChange={e => setEditForm({...editForm, insights: e.target.value})} placeholder="What do we know?" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none resize-none focus:border-indigo-300 transition-colors"></textarea>
              </div>
              {/* Website & Social Links */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Websites & Social Profiles</label>
                <div className="flex items-center gap-2 mb-3">
                  {([
                    { key: 'website', icon: <GlobeIcon className="w-4 h-4" />, tip: 'Website' },
                    { key: 'linkedin', icon: <LinkedInIcon className="w-4 h-4" />, tip: 'LinkedIn' },
                    { key: 'twitter', icon: <TwitterIcon className="w-4 h-4" />, tip: 'X / Twitter' },
                    { key: 'instagram', icon: <InstagramIcon className="w-4 h-4" />, tip: 'Instagram' },
                    { key: 'facebook', icon: <FacebookIcon className="w-4 h-4" />, tip: 'Facebook' },
                  ] as const).map(s => {
                    const isActive = editKbVisible.has(s.key) || editKb[s.key].trim() !== '';
                    return (
                      <button
                        key={s.key}
                        type="button"
                        title={s.tip}
                        onClick={() => setEditKbVisible(prev => {
                          const next = new Set(prev);
                          if (next.has(s.key)) { next.delete(s.key); } else { next.add(s.key); }
                          return next;
                        })}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isActive
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {s.icon}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2.5">
                  {(editKbVisible.has('website') || editKb.website.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><GlobeIcon className="w-4 h-4" /></div>
                      <input type="text" value={editKb.website} onChange={e => setEditKb({...editKb, website: e.target.value})} placeholder="https://company.com" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(editKbVisible.has('linkedin') || editKb.linkedin.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><LinkedInIcon className="w-4 h-4" /></div>
                      <input type="text" value={editKb.linkedin} onChange={e => setEditKb({...editKb, linkedin: e.target.value})} placeholder="linkedin.com/in/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(editKbVisible.has('twitter') || editKb.twitter.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><TwitterIcon className="w-4 h-4" /></div>
                      <input type="text" value={editKb.twitter} onChange={e => setEditKb({...editKb, twitter: e.target.value})} placeholder="x.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(editKbVisible.has('instagram') || editKb.instagram.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><InstagramIcon className="w-4 h-4" /></div>
                      <input type="text" value={editKb.instagram} onChange={e => setEditKb({...editKb, instagram: e.target.value})} placeholder="instagram.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                  {(editKbVisible.has('facebook') || editKb.facebook.trim() !== '') && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><FacebookIcon className="w-4 h-4" /></div>
                      <input type="text" value={editKb.facebook} onChange={e => setEditKb({...editKb, facebook: e.target.value})} placeholder="facebook.com/username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 transition-colors" />
                    </div>
                  )}
                </div>
              </div>
              {editError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs font-bold text-red-600">{editError}</p>
                </div>
              )}
              <div className="pt-6">
                <button type="submit" disabled={isEditSaving} className={`w-full py-4 rounded-2xl font-bold shadow-xl transition-colors ${isEditSaving ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {isEditSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Share Blog Post Modal ── */}
      {lead && (
        <FastSendModal
          open={fastSendOpen}
          onClose={() => setFastSendOpen(false)}
          lead={lead}
          businessId={currentBusinessId}
          workspaceId={currentBusiness?.workspace_id ?? null}
          userId={user.id}
          businessProfile={user.businessProfile}
        />
      )}

      {logCallOpen && lead && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !savingCall && setLogCallOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><PhoneIcon className="w-4 h-4" /></div>
                <h3 className="font-bold text-slate-900 font-heading text-sm">Log a call with {lead.name}</h3>
              </div>
              <button onClick={() => !savingCall && setLogCallOpen(false)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Outcome</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(CALL_OUTCOME_LABELS).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setCallOutcome(val)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${callOutcome === val ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-200'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notes (optional)</label>
                <textarea
                  value={callNotes}
                  onChange={e => setCallNotes(e.target.value)}
                  rows={3}
                  placeholder="What was discussed, next steps…"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setLogCallOpen(false)} disabled={savingCall} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 disabled:opacity-50">Cancel</button>
                <button onClick={handleLogCall} disabled={savingCall} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">{savingCall ? 'Saving…' : 'Log call'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {meetingOpen && lead && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !savingMeeting && setMeetingOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><CalendarIcon className="w-4 h-4" /></div>
                <h3 className="font-bold text-slate-900 font-heading text-sm">Schedule a meeting with {lead.name}</h3>
              </div>
              <button onClick={() => !savingMeeting && setMeetingOpen(false)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Title</label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={e => setMeetingTitle(e.target.value)}
                  placeholder="e.g. Discovery call, Product demo"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Date &amp; time</label>
                <input
                  type="datetime-local"
                  value={meetingWhen}
                  onChange={e => setMeetingWhen(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notes (optional)</label>
                <textarea
                  value={meetingNotes}
                  onChange={e => setMeetingNotes(e.target.value)}
                  rows={2}
                  placeholder="Agenda, link, context…"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-300 resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setMeetingOpen(false)} disabled={savingMeeting} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 disabled:opacity-50">Cancel</button>
                <button onClick={handleScheduleMeeting} disabled={savingMeeting} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50">{savingMeeting ? 'Saving…' : 'Schedule'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBlogShareModal && lead && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowBlogShareModal(false)} />
          <div className="relative bg-white w-full max-w-md max-h-[70vh] rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 font-heading text-sm">Share Blog Post</h3>
                <p className="text-xs text-slate-400 mt-0.5">Send a published post to {lead.name}</p>
              </div>
              <button onClick={() => setShowBlogShareModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {publishedPosts.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No published blog posts yet.</p>
              ) : publishedPosts.map(post => (
                <button
                  key={post.id}
                  disabled={blogShareSending}
                  onClick={async () => {
                    setBlogShareSending(true);
                    const postUrl = `${window.location.origin}/#/blog/${post.slug}`;
                    const result = await sendTrackedEmail({
                      leadId: lead.id,
                      toEmail: lead.primary_email,
                      subject: `Check out: ${post.title}`,
                      htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px">
                        <p>Hi ${lead.first_name || 'there'},</p>
                        <h2 style="color:#1e293b">${post.title}</h2>
                        <p style="color:#64748b;line-height:1.6">${post.excerpt || post.content.substring(0, 200)}...</p>
                        <a href="${postUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Read Full Post</a>
                      </div>`,
                    });
                    setBlogShareSending(false);
                    setShowBlogShareModal(false);
                    showFeedback(result.success ? `"${post.title}" shared with ${lead.name}` : 'Failed to send email');
                  }}
                  className="w-full text-left p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all"
                >
                  <p className="text-sm font-bold text-slate-800 truncate">{post.title}</p>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{post.excerpt || post.content.substring(0, 100)}</p>
                </button>
              ))}
            </div>
            {blogShareSending && (
              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-center">
                <span className="text-xs font-bold text-indigo-600">Sending tracked email...</span>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Run Workflow Modal ── */}
      {showWorkflowModal && lead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowWorkflowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <BoltIcon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 font-heading text-sm">Run Workflow</h3>
              </div>
              <button onClick={() => setShowWorkflowModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <XIcon className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {availableWorkflows.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No active workflows found. Create one in the Automation Engine.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-500">Select a workflow to run on <span className="font-bold text-slate-700">{lead.name}</span>:</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {availableWorkflows.map(wf => (
                      <button
                        key={wf.id}
                        onClick={() => setSelectedWorkflowId(wf.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          selectedWorkflowId === wf.id
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-sm font-bold">{wf.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{wf.nodes.length} steps</p>
                      </button>
                    ))}
                  </div>
                  {workflowResult && (
                    <div className={`p-3 rounded-xl text-sm ${
                      workflowResult.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      <p className="font-bold mb-1">{workflowResult.status === 'success' ? 'Workflow completed successfully' : 'Workflow failed'}</p>
                      {workflowResult.steps.map((s, i) => (
                        <p key={i} className="text-xs">
                          {s.status === 'pass' ? '\u2713' : s.status === 'fail' ? '\u2717' : '\u2015'} {s.nodeTitle}: {s.message}
                        </p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      if (!selectedWorkflowId) return;
                      const wf = availableWorkflows.find(w => w.id === selectedWorkflowId);
                      if (!wf) return;
                      setWorkflowRunning(true);
                      setWorkflowResult(null);
                      try {
                        const results = await executeWorkflowEngine(wf, [lead]);
                        if (results[0]) setWorkflowResult(results[0]);
                      } catch (err) {
                        setWorkflowResult({
                          leadId: lead.id,
                          leadName: lead.name,
                          status: 'failed',
                          steps: [],
                          startedAt: new Date().toISOString(),
                          completedAt: new Date().toISOString(),
                          errorMessage: err instanceof Error ? err.message : 'Unknown error',
                        });
                      }
                      setWorkflowRunning(false);
                    }}
                    disabled={!selectedWorkflowId || workflowRunning}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                      !selectedWorkflowId || workflowRunning
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg'
                    }`}
                  >
                    {workflowRunning ? 'Running...' : 'Run Workflow'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Drawer */}
      {lead && (
        <CreateInvoiceDrawer
          open={showCreateInvoice}
          onClose={() => setShowCreateInvoice(false)}
          onSuccess={() => setShowCreateInvoice(false)}
          preselectedLeadId={lead.id}
          user={user}
        />
      )}
    </div>
  );
};

export default LeadProfile;
