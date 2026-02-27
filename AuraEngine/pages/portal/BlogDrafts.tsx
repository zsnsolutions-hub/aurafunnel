import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { consumeCredits, CREDIT_COSTS } from '../../lib/credits';
import { useOutletContext, Link } from 'react-router-dom';
import { User } from '../../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateBlogContent, BlogContentMode, generateSocialCaption, SocialPlatform } from '../../lib/gemini';
import { sendTrackedEmail } from '../../lib/emailTracking';
import {
  EditIcon, PlusIcon, SparklesIcon, ShieldIcon, CheckIcon, RefreshIcon,
  KeyboardIcon, TrendUpIcon, TrendDownIcon, ClockIcon, EyeIcon, TargetIcon,
  XIcon, BrainIcon, TagIcon, FilterIcon, CalendarIcon, BoltIcon,
  UsersIcon, ActivityIcon, StarIcon, LayersIcon, SendIcon, MailIcon,
  LinkedInIcon, TwitterIcon, FacebookIcon, LinkIcon, CopyIcon, GlobeIcon
} from '../../components/Icons';
import OutreachPanel from '../../components/blog/OutreachPanel';
import ContributorsPanel from '../../components/blog/ContributorsPanel';
import { PageHeader } from '../../components/layout/PageHeader';
import { AdvancedOnly, useUIMode } from '../../components/ui-mode';

// ─── Types ───
interface ContentTemplate {
  id: string;
  title: string;
  description: string;
  structure: string;
  category: string;
  icon: React.ReactNode;
}

interface SeoScore {
  overall: number;
  titleLength: boolean;
  hasKeywords: boolean;
  contentLength: boolean;
  hasImage: boolean;
  readability: string;
}

// ─── Constants ───
const CONTENT_TEMPLATES: ContentTemplate[] = [
  { id: 'ct1', title: 'How-To Guide', description: 'Step-by-step tutorial format', structure: '## Introduction\n\nBriefly explain what the reader will learn.\n\n## Prerequisites\n\n- List what readers need to know\n\n## Step 1: Getting Started\n\nExplain the first step...\n\n## Step 2: Implementation\n\nDetail the main process...\n\n## Step 3: Verification\n\nHow to confirm success...\n\n## Conclusion\n\nSummarize key takeaways.', category: 'Tutorial', icon: <BoltIcon className="w-4 h-4" /> },
  { id: 'ct2', title: 'Case Study', description: 'Client success story format', structure: '## The Challenge\n\nDescribe the problem the client faced.\n\n## The Solution\n\nExplain the approach and strategy used.\n\n## Implementation\n\nDetail the steps taken.\n\n## Results\n\n- Key metric improvement #1\n- Key metric improvement #2\n- Key metric improvement #3\n\n## Key Takeaways\n\nWhat others can learn from this.', category: 'Story', icon: <StarIcon className="w-4 h-4" /> },
  { id: 'ct3', title: 'Industry Insight', description: 'Thought leadership analysis', structure: '## The Current Landscape\n\nSet the scene with industry context.\n\n## Key Trends\n\n### Trend 1\nExplain the first trend...\n\n### Trend 2\nExplain the second trend...\n\n## What This Means for Teams\n\nPractical implications.\n\n## Looking Ahead\n\nFuture predictions and recommendations.', category: 'Analysis', icon: <BrainIcon className="w-4 h-4" /> },
  { id: 'ct4', title: 'Listicle', description: 'Numbered tips or strategies', structure: '## Introduction\n\nWhy this topic matters.\n\n## 1. First Item\n\nExplain with examples...\n\n## 2. Second Item\n\nExplain with examples...\n\n## 3. Third Item\n\nExplain with examples...\n\n## 4. Fourth Item\n\nExplain with examples...\n\n## 5. Fifth Item\n\nExplain with examples...\n\n## Final Thoughts\n\nWrap up with a call to action.', category: 'Tips', icon: <LayersIcon className="w-4 h-4" /> },
  { id: 'ct5', title: 'Product Comparison', description: 'Compare tools or approaches', structure: '## Overview\n\nWhat are we comparing and why.\n\n## Option A\n\n**Pros:**\n- Pro 1\n- Pro 2\n\n**Cons:**\n- Con 1\n\n## Option B\n\n**Pros:**\n- Pro 1\n- Pro 2\n\n**Cons:**\n- Con 1\n\n## Side-by-Side Comparison\n\n| Feature | Option A | Option B |\n|---------|----------|----------|\n| Feature 1 | ✓ | ✓ |\n\n## Our Recommendation\n\nFinal verdict.', category: 'Review', icon: <ActivityIcon className="w-4 h-4" /> },
];

const AI_TONES = ['Professional', 'Conversational', 'Technical', 'Storytelling', 'Persuasive'];
const AI_MODES: { id: BlogContentMode; label: string; desc: string }[] = [
  { id: 'full_draft', label: 'Full Draft', desc: 'Generate a complete post' },
  { id: 'outline_only', label: 'Outline', desc: 'Structured headings & bullets' },
  { id: 'improve', label: 'Improve', desc: 'Rewrite existing content' },
  { id: 'expand', label: 'Expand', desc: 'Add detail to thin sections' },
];

const BlogDrafts: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const { isAdvanced: isAdvancedMode } = useUIMode();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newPost, setNewPost] = useState({
    title: '', content: '', slug: '', category_id: '', featured_image: null as string | null,
    excerpt: '',
    seo_settings: { title: '', description: '', og_image: '' },
  });

  // ─── Editing state ───
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  // ─── Enhanced UI state ───
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSeoPanel, setShowSeoPanel] = useState(false);
  const [showSeoForm, setShowSeoForm] = useState(false);
  const [activeView, setActiveView] = useState<'compose' | 'posts' | 'outreach' | 'contributors'>('compose');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'pending_review' | 'published'>('all');
  const [showWritingMetrics, setShowWritingMetrics] = useState(true);

  // ─── Markdown preview state ───
  const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write');

  // ─── AI Assist state ───
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState('Professional');
  const [aiMode, setAiMode] = useState<BlogContentMode>('full_draft');
  const [aiKeywords, setAiKeywords] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState('');

  // ─── Share modal state ───
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePost, setSharePost] = useState<any>(null);
  const [shareLeads, setShareLeads] = useState<any[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [sharingInProgress, setSharingInProgress] = useState(false);

  // ─── Social / Caption state ───
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [captionPost, setCaptionPost] = useState<any>(null);
  const [captionPlatform, setCaptionPlatform] = useState<SocialPlatform>('linkedin');
  const [captionText, setCaptionText] = useState('');
  const [captionGenerating, setCaptionGenerating] = useState(false);
  const [captionCopied, setCaptionCopied] = useState(false);

  // ─── Writing Metrics (computed) ───
  const writingMetrics = useMemo(() => {
    const text = newPost.content;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length;
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim()).length;
    const readingTime = Math.max(1, Math.ceil(words / 200));
    const avgWordsPerSentence = sentences > 0 ? Math.round(words / sentences) : 0;
    const readability = avgWordsPerSentence < 15 ? 'Easy' : avgWordsPerSentence < 25 ? 'Moderate' : 'Complex';
    return { words, sentences, paragraphs, readingTime, avgWordsPerSentence, readability };
  }, [newPost.content]);

  // ─── SEO Score ───
  const seoScore = useMemo((): SeoScore => {
    const titleLen = newPost.title.length >= 20 && newPost.title.length <= 70;
    const hasKeywords = newPost.title.toLowerCase().split(' ').some(w => newPost.content.toLowerCase().includes(w)) && newPost.title.length > 0;
    const contentLen = writingMetrics.words >= 300;
    const hasImage = !!newPost.featured_image;
    const readabilityGood = writingMetrics.avgWordsPerSentence < 25;
    let score = 0;
    if (titleLen) score += 25;
    if (hasKeywords) score += 25;
    if (contentLen) score += 20;
    if (hasImage) score += 15;
    if (readabilityGood) score += 15;
    return { overall: score, titleLength: titleLen, hasKeywords, contentLength: contentLen, hasImage, readability: writingMetrics.readability };
  }, [newPost.title, newPost.content, newPost.featured_image, writingMetrics]);

  // ─── KPI Stats ───
  const kpiStats = useMemo(() => {
    const published = drafts.filter(d => d.status === 'published').length;
    const pending = drafts.filter(d => d.status === 'pending_review').length;
    const draftCount = drafts.filter(d => d.status === 'draft').length;
    const avgWords = drafts.length > 0 ? Math.round(drafts.reduce((sum, d) => sum + (d.content?.trim().split(/\s+/).length || 0), 0) / drafts.length) : 0;
    return [
      { label: 'Total Posts', value: drafts.length, icon: <EditIcon className="w-4 h-4" />, color: 'indigo', trend: `${drafts.length > 0 ? '+' : ''}${drafts.length} lifetime`, up: true },
      { label: 'Published', value: published, icon: <CheckIcon className="w-4 h-4" />, color: 'emerald', trend: published > 0 ? 'Active on blog' : 'None yet', up: published > 0 },
      { label: 'In Review', value: pending, icon: <ClockIcon className="w-4 h-4" />, color: 'amber', trend: pending > 0 ? 'Awaiting approval' : 'Queue clear', up: pending === 0 },
      { label: 'Drafts', value: draftCount, icon: <EditIcon className="w-4 h-4" />, color: 'violet', trend: draftCount > 0 ? 'In progress' : 'Start writing', up: true },
      { label: 'Avg Words', value: avgWords, icon: <ActivityIcon className="w-4 h-4" />, color: 'cyan', trend: avgWords >= 300 ? 'Good length' : 'Try 300+', up: avgWords >= 300 },
      { label: 'SEO Score', value: `${seoScore.overall}%`, icon: <TargetIcon className="w-4 h-4" />, color: seoScore.overall >= 70 ? 'emerald' : seoScore.overall >= 40 ? 'amber' : 'rose', trend: seoScore.overall >= 70 ? 'Optimized' : 'Needs work', up: seoScore.overall >= 70 },
    ];
  }, [drafts, seoScore]);

  // ─── Filtered Drafts ───
  const filteredDrafts = useMemo(() => {
    let filtered = [...drafts];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(d => d.title?.toLowerCase().includes(q) || d.content?.toLowerCase().includes(q));
    }
    return filtered;
  }, [drafts, statusFilter, searchQuery]);

  // ─── Apply Template ───
  const applyTemplate = useCallback((template: ContentTemplate) => {
    setNewPost(prev => ({ ...prev, content: template.structure }));
    setShowTemplates(false);
    setActiveView('compose');
  }, []);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showTemplates) { setShowTemplates(false); return; }
        if (showSeoPanel) { setShowSeoPanel(false); return; }
        if (showAiPanel) { setShowAiPanel(false); return; }
        if (showShareModal) { setShowShareModal(false); return; }
        return;
      }

      if (isInput) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && target.tagName === 'TEXTAREA') {
          e.preventDefault();
          handleSubmit('pending_review');
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          handleSubmit('draft');
          return;
        }
        return;
      }

      const shortcuts: Record<string, () => void> = {
        '1': () => setActiveView('compose'),
        '2': () => setActiveView('posts'),
        '3': () => setActiveView('outreach'),
        '4': () => setActiveView('contributors'),
        't': () => setShowTemplates(prev => !prev),
        's': () => setShowSeoPanel(prev => !prev),
        'm': () => setShowWritingMetrics(prev => !prev),
        'a': () => setShowAiPanel(prev => !prev),
        '?': () => setShowShortcuts(prev => !prev),
      };

      if (shortcuts[e.key]) {
        e.preventDefault();
        shortcuts[e.key]();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts, showTemplates, showSeoPanel, showAiPanel, showShareModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: d } = await supabase
        .from('blog_posts')
        .select('*, blog_categories(name)')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      const { data: c } = await supabase.from('blog_categories').select('*');

      if (d) setDrafts(d);
      if (c) setCategories(c);
    } catch (err: unknown) {
      console.error("Sync error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user.id]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `blog-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('blog-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('blog-assets')
        .getPublicUrl(filePath);

      setNewPost(prev => ({ ...prev, featured_image: publicUrl }));
    } catch (err: unknown) {
      setError("Asset upload failure: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setUploadingImage(false);
    }
  };

  const resetForm = () => {
    setNewPost({ title: '', content: '', slug: '', category_id: '', featured_image: null, excerpt: '', seo_settings: { title: '', description: '', og_image: '' } });
    setEditingPostId(null);
    setEditorTab('write');
    setShowSeoForm(false);
  };

  const handleSubmit = async (status: 'draft' | 'pending_review') => {
    if (!newPost.title || !newPost.content) {
      setError("Please provide a title and narrative content.");
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        title: newPost.title,
        content: newPost.content,
        slug: newPost.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        category_id: newPost.category_id || null,
        featured_image: newPost.featured_image,
        excerpt: newPost.excerpt || null,
        seo_settings: (newPost.seo_settings.title || newPost.seo_settings.description) ? newPost.seo_settings : null,
        status,
      };

      if (editingPostId) {
        const { error: updateErr } = await supabase
          .from('blog_posts')
          .update(payload)
          .eq('id', editingPostId)
          .eq('author_id', user.id);
        if (updateErr) throw updateErr;
        setSuccess(status === 'draft' ? "Draft updated." : "Updated and submitted for review.");
      } else {
        const { error: insertErr } = await supabase
          .from('blog_posts')
          .insert([{ ...payload, author_id: user.id }]);
        if (insertErr) throw insertErr;
        setSuccess(status === 'draft' ? "Draft archived." : "Insight transmitted for review.");
      }

      resetForm();
      await fetchData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transmission error.");
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Edit existing draft ───
  const startEditing = (post: any) => {
    setEditingPostId(post.id);
    setNewPost({
      title: post.title || '',
      content: post.content || '',
      slug: post.slug || '',
      category_id: post.category_id || '',
      featured_image: post.featured_image || null,
      excerpt: post.excerpt || '',
      seo_settings: post.seo_settings || { title: '', description: '', og_image: '' },
    });
    setActiveView('compose');
    setEditorTab('write');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── AI Generation ───
  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setAiResult('');
    try {
      const creditResult = await consumeCredits(supabase, CREDIT_COSTS['blog_content']);
      if (!creditResult.success) {
        setAiResult(creditResult.message || 'Insufficient credits.');
        setAiGenerating(false);
        return;
      }
      const result = await generateBlogContent({
        mode: aiMode,
        topic: aiTopic,
        tone: aiTone,
        category: categories.find(c => c.id === newPost.category_id)?.name,
        keywords: aiKeywords ? aiKeywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
        existingContent: (aiMode === 'improve' || aiMode === 'expand') ? newPost.content : undefined,
      });
      setAiResult(result.text);
      if (refreshProfile) await refreshProfile();
    } catch {
      setAiResult('Generation failed. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  // ─── Share with leads ───
  const openShareModal = async (post: any) => {
    setSharePost(post);
    setSelectedLeadIds([]);
    setShowShareModal(true);
    const { data } = await supabase
      .from('leads')
      .select('id, name, email, company')
      .eq('user_id', user.id)
      .order('name');
    if (data) setShareLeads(data);
  };

  const handleShareWithLeads = async () => {
    if (!sharePost || selectedLeadIds.length === 0) return;
    setSharingInProgress(true);
    const postUrl = `${window.location.origin}/#/blog/${sharePost.slug}`;
    let sent = 0;
    for (const leadId of selectedLeadIds) {
      const lead = shareLeads.find(l => l.id === leadId);
      if (!lead?.email) continue;
      const result = await sendTrackedEmail({
        leadId: lead.id,
        toEmail: lead.email,
        subject: `Check out: ${sharePost.title}`,
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#1e293b">${sharePost.title}</h2>
          <p style="color:#64748b;line-height:1.6">${sharePost.excerpt || sharePost.content.substring(0, 200)}...</p>
          <a href="${postUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Read Full Post</a>
        </div>`,
      });
      if (result.success) sent++;
    }
    setSharingInProgress(false);
    setShowShareModal(false);
    setSuccess(`Blog post shared with ${sent} lead${sent !== 1 ? 's' : ''}.`);
    setTimeout(() => setSuccess(null), 5000);
  };

  // ─── Social share helpers ───
  const getPostUrl = (post: any) => `${window.location.origin}/#/blog/${post.slug}`;

  const copyPostLink = (post: any) => {
    navigator.clipboard.writeText(getPostUrl(post));
    setCopiedPostId(post.id);
    setTimeout(() => setCopiedPostId(null), 2000);
  };

  const shareToSocial = (post: any, platform: 'linkedin' | 'twitter' | 'facebook') => {
    const url = getPostUrl(post);
    const urls: Record<string, string> = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(url)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    };
    window.open(urls[platform], '_blank', 'width=600,height=600');
  };

  const openCaptionModal = (post: any) => {
    setCaptionPost(post);
    setCaptionText('');
    setCaptionCopied(false);
    setCaptionPlatform('linkedin');
    setShowCaptionModal(true);
  };

  const handleGenerateCaption = async () => {
    if (!captionPost) return;
    setCaptionGenerating(true);
    setCaptionText('');
    setCaptionCopied(false);
    const creditResult = await consumeCredits(supabase, CREDIT_COSTS['social_caption']);
    if (!creditResult.success) {
      setCaptionText(creditResult.message || 'Insufficient credits.');
      setCaptionGenerating(false);
      return;
    }
    const result = await generateSocialCaption({
      platform: captionPlatform,
      postTitle: captionPost.title,
      postExcerpt: captionPost.excerpt || captionPost.content?.substring(0, 200),
      postUrl: getPostUrl(captionPost),
    });
    setCaptionText(result.text);
    setCaptionGenerating(false);
    if (refreshProfile) await refreshProfile();
  };

  const copyCaptionText = () => {
    navigator.clipboard.writeText(captionText);
    setCaptionCopied(true);
    setTimeout(() => setCaptionCopied(false), 2000);
  };

  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER                                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <PageHeader
        title="Blog Posts"
        description="Draft insights for the community. Posts are reviewed before publishing."
        actions={
          <div className="bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-100 flex items-center space-x-2 shadow-sm">
            <SparklesIcon className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest hidden sm:inline">Contributor Verified</span>
          </div>
        }
        advancedActions={
          <>
            <button
              onClick={() => setShowAiPanel(prev => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showAiPanel ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              <BrainIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Assist</span>
            </button>
            <button
              onClick={() => setShowTemplates(prev => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showTemplates ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              <LayersIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Templates</span>
            </button>
            <button
              onClick={() => setShowSeoPanel(prev => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showSeoPanel ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              <TargetIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">SEO</span>
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-white text-slate-500 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
            >
              <KeyboardIcon className="w-3.5 h-3.5" />
              <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px]">?</kbd>
            </button>
          </>
        }
      />

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KPI STATS                                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AdvancedOnly>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiStats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg bg-${s.color}-100 flex items-center justify-center text-${s.color}-600`}>
                {s.icon}
              </div>
              {s.up ? (
                <TrendUpIcon className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <TrendDownIcon className="w-3.5 h-3.5 text-rose-500" />
              )}
            </div>
            <p className="text-xl font-black text-slate-800">{s.value}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
            <p className={`text-[10px] mt-1 font-semibold ${s.up ? 'text-emerald-500' : 'text-rose-500'}`}>{s.trend}</p>
          </div>
        ))}
      </div>

      </AdvancedOnly>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* AI ASSIST PANEL                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <AdvancedOnly>
      {showAiPanel && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl border border-purple-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-purple-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BrainIcon className="w-4 h-4 text-purple-600" />
              <h3 className="font-bold text-purple-800 font-heading text-sm">AI Content Assistant</h3>
            </div>
            <button onClick={() => setShowAiPanel(false)} className="p-1 text-purple-400 hover:text-purple-600">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Topic / Prompt</label>
                <input
                  value={aiTopic}
                  onChange={e => setAiTopic(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-purple-100 font-bold text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  placeholder="e.g. How AI is transforming B2B sales funnels"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Tone</label>
                <select value={aiTone} onChange={e => setAiTone(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-white border border-purple-100 font-bold text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                  {AI_TONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Mode</label>
                <select value={aiMode} onChange={e => setAiMode(e.target.value as BlogContentMode)} className="w-full px-4 py-3 rounded-xl bg-white border border-purple-100 font-bold text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                  {AI_MODES.map(m => <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Keywords (comma-separated)</label>
                <input
                  value={aiKeywords}
                  onChange={e => setAiKeywords(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-purple-100 font-bold text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  placeholder="e.g. AI, sales automation, lead scoring"
                />
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={aiGenerating || !aiTopic.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-all disabled:opacity-40 flex items-center space-x-2 shadow-lg shadow-purple-200"
              >
                {aiGenerating ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                <span>{aiGenerating ? 'Generating...' : 'Generate'}</span>
                {!aiGenerating && <span className="px-1.5 py-0.5 text-[9px] font-black bg-white/20 rounded-md">{CREDIT_COSTS['blog_content']} cr</span>}
              </button>
            </div>

            {/* AI Result */}
            {aiResult && (
              <div className="mt-4 bg-white rounded-xl border border-purple-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-purple-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-600">Generated Content</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => { setNewPost(prev => ({ ...prev, content: prev.content + '\n\n' + aiResult })); setAiResult(''); setShowAiPanel(false); }}
                      className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-200 transition-all"
                    >
                      Insert
                    </button>
                    <button
                      onClick={() => { setNewPost(prev => ({ ...prev, content: aiResult })); setAiResult(''); setShowAiPanel(false); }}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition-all"
                    >
                      Replace
                    </button>
                  </div>
                </div>
                <div className="p-5 max-h-72 overflow-y-auto prose prose-sm prose-slate max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResult}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </AdvancedOnly>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* VIEW TABS                                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center space-x-1 bg-white rounded-xl border border-slate-100 shadow-sm p-1">
        {([
          { id: 'compose' as const, label: editingPostId ? 'Edit Draft' : 'Compose', icon: <EditIcon className="w-4 h-4" /> },
          { id: 'posts' as const, label: 'My Posts', icon: <LayersIcon className="w-4 h-4" />, badge: drafts.length },
          ...(isAdvancedMode ? [
            { id: 'outreach' as const, label: 'Outreach', icon: <GlobeIcon className="w-4 h-4" /> },
            { id: 'contributors' as const, label: 'Contributors', icon: <UsersIcon className="w-4 h-4" /> },
          ] : []),
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeView === tab.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeView === tab.id ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-600'
              }`}>{tab.badge}</span>
            )}
          </button>
        ))}
        {editingPostId && (
          <button
            onClick={resetForm}
            className="ml-auto flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
          >
            <XIcon className="w-3.5 h-3.5" />
            <span>Cancel Edit</span>
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* VIEW: COMPOSE                                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeView === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className={`${showWritingMetrics ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 font-heading text-sm">
                  {editingPostId ? 'Edit Post' : 'Author New Insight'}
                </h3>
                <button
                  onClick={() => setShowWritingMetrics(prev => !prev)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${showWritingMetrics ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {showWritingMetrics ? 'Hide' : 'Show'} Metrics
                </button>
              </div>
              <div className="p-6">
                {error && <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl font-bold flex items-center space-x-2"><ShieldIcon className="w-4 h-4" /><span>{error}</span></div>}
                {success && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm rounded-xl font-bold flex items-center space-x-2"><CheckIcon className="w-4 h-4" /><span>{success}</span></div>}

                <form className="space-y-5" onSubmit={e => e.preventDefault()}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Post Title</label>
                        <input required value={newPost.title} onChange={e => setNewPost({...newPost, title: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="Future of AI Funnels" />
                        <p className={`text-[10px] font-semibold ${newPost.title.length >= 20 && newPost.title.length <= 70 ? 'text-emerald-500' : newPost.title.length > 0 ? 'text-amber-500' : 'text-slate-300'}`}>
                          {newPost.title.length}/70 characters {newPost.title.length >= 20 && newPost.title.length <= 70 ? '(optimal)' : newPost.title.length > 70 ? '(too long)' : newPost.title.length > 0 ? '(aim for 20-70)' : ''}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                        <select value={newPost.category_id} onChange={e => setNewPost({...newPost, category_id: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                          <option value="">Select Category...</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Featured Image</label>
                      <div className="relative h-[120px] bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group hover:border-indigo-300 transition-all">
                        {newPost.featured_image ? (
                          <div className="relative w-full h-full">
                            <img src={newPost.featured_image} className="w-full h-full object-cover" />
                            <button onClick={() => setNewPost(prev => ({ ...prev, featured_image: null }))} className="absolute top-2 right-2 p-1 bg-white/90 rounded-lg text-slate-500 hover:text-red-500 transition-colors">
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-center">
                            {uploadingImage ? <RefreshIcon className="w-5 h-5 animate-spin mx-auto text-indigo-400" /> : (
                              <>
                                <PlusIcon className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                                <p className="text-[9px] font-black text-slate-400 uppercase">Upload Cover</p>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Excerpt Field */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Excerpt</label>
                    <textarea
                      value={newPost.excerpt}
                      onChange={e => { if (e.target.value.length <= 200) setNewPost({...newPost, excerpt: e.target.value}); }}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm text-slate-700 resize-none"
                      placeholder="A short summary of your post (shown in previews)..."
                    />
                    <p className="text-[10px] font-semibold text-slate-400">{newPost.excerpt.length}/200</p>
                  </div>

                  {/* Body Content with Write/Preview tabs */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-3">Body Content</label>
                        <button
                          type="button"
                          onClick={() => setEditorTab('write')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${editorTab === 'write' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                          Write
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorTab('preview')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${editorTab === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                          Preview
                        </button>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-[10px] font-bold text-slate-400">{writingMetrics.words} words</span>
                        <span className="text-[10px] font-bold text-slate-400">{writingMetrics.readingTime} min read</span>
                      </div>
                    </div>

                    {editorTab === 'write' ? (
                      <textarea required value={newPost.content} onChange={e => setNewPost({...newPost, content: e.target.value})} rows={12} className="w-full p-5 rounded-xl bg-slate-50 border border-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none leading-relaxed text-sm text-slate-700 resize-none font-mono" placeholder="Write in markdown... Use ## for headings, **bold**, *italic*, - for lists..." />
                    ) : (
                      <div className="w-full min-h-[288px] p-5 rounded-xl bg-white border border-slate-100 overflow-y-auto prose prose-sm prose-slate max-w-none">
                        {newPost.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{newPost.content}</ReactMarkdown>
                        ) : (
                          <p className="text-slate-400 italic">Nothing to preview yet. Start writing in the Write tab.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SEO Settings (collapsible) */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowSeoForm(prev => !prev)}
                      className="flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                    >
                      <TargetIcon className="w-3.5 h-3.5" />
                      <span>{showSeoForm ? 'Hide' : 'Show'} SEO Settings</span>
                    </button>
                    {showSeoForm && (
                      <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SEO Title</label>
                          <input
                            value={newPost.seo_settings.title}
                            onChange={e => setNewPost({ ...newPost, seo_settings: { ...newPost.seo_settings, title: e.target.value } })}
                            className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Custom title for search engines (defaults to post title)"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meta Description</label>
                          <textarea
                            value={newPost.seo_settings.description}
                            onChange={e => setNewPost({ ...newPost, seo_settings: { ...newPost.seo_settings, description: e.target.value } })}
                            rows={2}
                            className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="Brief description for search results (max 160 chars)"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">OG Image URL</label>
                          <input
                            value={newPost.seo_settings.og_image}
                            onChange={e => setNewPost({ ...newPost, seo_settings: { ...newPost.seo_settings, og_image: e.target.value } })}
                            className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Image URL for social sharing (defaults to featured image)"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button type="button" disabled={isCreating || !newPost.title || !newPost.content} onClick={() => handleSubmit('pending_review')} className="flex-grow py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98] flex items-center justify-center space-x-2 disabled:opacity-40 text-sm">
                      <span>{editingPostId ? 'Update & Submit for Review' : 'Submit for Review'}</span>
                      <PlusIcon className="w-4 h-4" />
                    </button>
                    <button type="button" disabled={isCreating || !newPost.title} onClick={() => handleSubmit('draft')} className="px-6 py-3.5 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all active:scale-[0.98] text-sm">
                      {editingPostId ? 'Update Draft' : 'Save Draft'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">
                    <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold">Ctrl+Enter</kbd> submit &middot; <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold">Ctrl+S</kbd> save draft
                  </p>
                </form>
              </div>
            </div>
          </div>

          {/* ─── Writing Metrics Sidebar ─── */}
          {showWritingMetrics && (
            <div className="space-y-4">
              {/* Writing Stats */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 font-heading text-sm">Writing Metrics</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Words', value: writingMetrics.words, target: 300, color: writingMetrics.words >= 300 ? 'emerald' : 'amber' },
                      { label: 'Sentences', value: writingMetrics.sentences, target: null, color: 'indigo' },
                      { label: 'Paragraphs', value: writingMetrics.paragraphs, target: null, color: 'violet' },
                      { label: 'Read Time', value: `${writingMetrics.readingTime}m`, target: null, color: 'cyan' },
                    ].map(m => (
                      <div key={m.label} className="text-center p-3 rounded-xl bg-slate-50">
                        <p className={`text-lg font-black text-${m.color}-600`}>{m.value}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{m.label}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Word Count Progress</span>
                      <span className="text-[10px] font-bold text-slate-500">{writingMetrics.words}/300 min</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${writingMetrics.words >= 300 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min((writingMetrics.words / 300) * 100, 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                    <span className="text-xs font-bold text-slate-600">Readability</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      writingMetrics.readability === 'Easy' ? 'bg-emerald-100 text-emerald-600' :
                      writingMetrics.readability === 'Moderate' ? 'bg-amber-100 text-amber-600' :
                      'bg-rose-100 text-rose-600'
                    }`}>{writingMetrics.readability}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                    <span className="text-xs font-bold text-slate-600">Avg Words/Sentence</span>
                    <span className="text-xs font-black text-slate-700">{writingMetrics.avgWordsPerSentence}</span>
                  </div>
                </div>
              </div>

              {/* SEO Score */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 font-heading text-sm">SEO Score</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-center">
                    <div className="relative w-20 h-20">
                      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={seoScore.overall >= 70 ? '#10b981' : seoScore.overall >= 40 ? '#f59e0b' : '#ef4444'} strokeWidth="3" strokeDasharray={`${seoScore.overall}, 100`} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-lg font-black ${seoScore.overall >= 70 ? 'text-emerald-600' : seoScore.overall >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>{seoScore.overall}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Title Length (20-70)', pass: seoScore.titleLength },
                      { label: 'Keywords in Content', pass: seoScore.hasKeywords },
                      { label: 'Content Length (300+)', pass: seoScore.contentLength },
                      { label: 'Featured Image', pass: seoScore.hasImage },
                      { label: 'Readability', pass: writingMetrics.avgWordsPerSentence < 25 },
                    ].map(check => (
                      <div key={check.label} className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${check.pass ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {check.pass ? <CheckIcon className="w-2.5 h-2.5" /> : <XIcon className="w-2.5 h-2.5" />}
                        </div>
                        <span className={`text-xs ${check.pass ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>{check.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* VIEW: MY POSTS                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeView === 'posts' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 relative">
              <FilterIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search posts..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex items-center space-x-1 bg-white rounded-xl border border-slate-100 shadow-sm p-1">
              {([
                { id: 'all' as const, label: 'All' },
                { id: 'draft' as const, label: 'Drafts' },
                { id: 'pending_review' as const, label: 'In Review' },
                { id: 'published' as const, label: 'Published' },
              ]).map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === f.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-bold text-slate-400">{filteredDrafts.length} posts</span>
          </div>

          {/* Posts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? [1, 2].map(i => <div key={i} className="h-48 bg-white border border-slate-100 rounded-2xl animate-pulse" />) : filteredDrafts.length === 0 ? (
              <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
                <EditIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">No posts found</p>
                <p className="text-xs text-slate-400 mt-1">{searchQuery ? 'Try a different search term' : 'Start writing your first post'}</p>
                <button onClick={() => setActiveView('compose')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                  Start Writing
                </button>
              </div>
            ) : filteredDrafts.map(d => (
              <div key={d.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 overflow-hidden">
                {d.featured_image && (
                  <div className="h-32 overflow-hidden">
                    <img src={d.featured_image} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      d.status === 'published' ? 'bg-emerald-50 text-emerald-600' :
                      d.status === 'pending_review' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>{d.status.replace('_', ' ')}</span>
                    <p className="text-[10px] font-bold text-slate-400">{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 font-heading leading-tight mb-2">{d.title}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">{d.excerpt || d.content}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider">{d.blog_categories?.name || 'Uncategorized'}</span>
                    <div className="flex items-center space-x-2">
                      {/* Edit button for drafts and pending_review */}
                      {(d.status === 'draft' || d.status === 'pending_review') && (
                        <button
                          onClick={() => startEditing(d)}
                          className="px-2.5 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all"
                        >
                          Edit
                        </button>
                      )}
                      {/* Actions for published posts */}
                      {d.status === 'published' && (
                        <div className="flex items-center space-x-1">
                          <button onClick={() => shareToSocial(d, 'linkedin')} title="LinkedIn" className="p-1 text-slate-400 hover:text-[#0A66C2] hover:bg-blue-50 rounded transition-all">
                            <LinkedInIcon className="w-3 h-3" />
                          </button>
                          <button onClick={() => shareToSocial(d, 'twitter')} title="X / Twitter" className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-all">
                            <TwitterIcon className="w-3 h-3" />
                          </button>
                          <button onClick={() => shareToSocial(d, 'facebook')} title="Facebook" className="p-1 text-slate-400 hover:text-[#1877F2] hover:bg-blue-50 rounded transition-all">
                            <FacebookIcon className="w-3 h-3" />
                          </button>
                          <button onClick={() => copyPostLink(d)} title="Copy link" className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all">
                            {copiedPostId === d.id ? <CheckIcon className="w-3 h-3 text-emerald-500" /> : <LinkIcon className="w-3 h-3" />}
                          </button>
                          <button onClick={() => openCaptionModal(d)} title="AI Caption" className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-all">
                            <SparklesIcon className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => openShareModal(d)}
                            className="px-2 py-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-all flex items-center space-x-1"
                          >
                            <SendIcon className="w-3 h-3" />
                            <span>Email</span>
                          </button>
                        </div>
                      )}
                      <span className="text-[10px] text-slate-400">{d.content?.trim().split(/\s+/).length || 0} words</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* VIEW: OUTREACH                                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeView === 'outreach' && (
        <OutreachPanel user={user} refreshProfile={refreshProfile} />
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* VIEW: CONTRIBUTORS                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeView === 'contributors' && (
        <ContributorsPanel user={user} refreshProfile={refreshProfile} />
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SHARE WITH LEADS MODAL                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShareModal && sharePost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowShareModal(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Share Post with Leads</h3>
                <p className="text-xs text-slate-400 mt-0.5">Send "{sharePost.title}" via tracked email</p>
              </div>
              <button onClick={() => setShowShareModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              {shareLeads.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No leads found. Add leads first.</p>
              ) : shareLeads.map(lead => (
                <label key={lead.id} className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedLeadIds.includes(lead.id) ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 hover:bg-slate-50'
                }`}>
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.includes(lead.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedLeadIds(prev => [...prev, lead.id]);
                      else setSelectedLeadIds(prev => prev.filter(id => id !== lead.id));
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{lead.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{lead.email} {lead.company ? `- ${lead.company}` : ''}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">{selectedLeadIds.length} selected</span>
              <button
                onClick={handleShareWithLeads}
                disabled={selectedLeadIds.length === 0 || sharingInProgress}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-40 flex items-center space-x-2"
              >
                {sharingInProgress ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
                <span>{sharingInProgress ? 'Sending...' : 'Send Emails'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* AI CAPTION MODAL                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showCaptionModal && captionPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowCaptionModal(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <SparklesIcon className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="font-black text-slate-900 font-heading">Generate Social Caption</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[300px]">{captionPost.title}</p>
                </div>
              </div>
              <button onClick={() => setShowCaptionModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Platform</label>
                <div className="flex items-center space-x-2">
                  {([
                    { id: 'linkedin' as SocialPlatform, label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" /> },
                    { id: 'twitter' as SocialPlatform, label: 'X / Twitter', icon: <TwitterIcon className="w-4 h-4" /> },
                    { id: 'facebook' as SocialPlatform, label: 'Facebook', icon: <FacebookIcon className="w-4 h-4" /> },
                  ]).map(p => (
                    <button
                      key={p.id}
                      onClick={() => setCaptionPlatform(p.id)}
                      className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                        captionPlatform === p.id
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {p.icon}
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerateCaption}
                disabled={captionGenerating}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-all disabled:opacity-40 flex items-center justify-center space-x-2 shadow-lg shadow-purple-200"
              >
                {captionGenerating ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                <span>{captionGenerating ? 'Generating...' : 'Generate Caption'}</span>
                {!captionGenerating && <span className="px-1.5 py-0.5 text-[9px] font-black bg-white/20 rounded-md">{CREDIT_COSTS['social_caption']} cr</span>}
              </button>

              {captionText && (
                <div className="space-y-3">
                  <textarea
                    value={captionText}
                    onChange={e => setCaptionText(e.target.value)}
                    rows={8}
                    className="w-full p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm leading-relaxed resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyCaptionText}
                      className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all"
                    >
                      {captionCopied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                      <span>{captionCopied ? 'Copied!' : 'Copy Caption'}</span>
                    </button>
                    <button
                      onClick={() => {
                        const url = getPostUrl(captionPost);
                        const urls: Record<string, string> = {
                          linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
                          twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(captionText)}`,
                          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
                        };
                        window.open(urls[captionPlatform], '_blank', 'width=600,height=600');
                      }}
                      className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
                    >
                      {captionPlatform === 'linkedin' ? <LinkedInIcon className="w-4 h-4" /> : captionPlatform === 'twitter' ? <TwitterIcon className="w-4 h-4" /> : <FacebookIcon className="w-4 h-4" />}
                      <span>Open {captionPlatform === 'linkedin' ? 'LinkedIn' : captionPlatform === 'twitter' ? 'X' : 'Facebook'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">Edit the caption above, then copy or share directly.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CONTENT TEMPLATES PANEL                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowTemplates(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-slate-900 font-heading">Content Templates</h3>
                <p className="text-xs text-slate-400 mt-0.5">Choose a template to kickstart your post</p>
              </div>
              <button onClick={() => setShowTemplates(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {CONTENT_TEMPLATES.map(template => (
                <div key={template.id} className="p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer group" onClick={() => applyTemplate(template)}>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-200 transition-all">
                      {template.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-bold text-slate-800">{template.title}</p>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase">{template.category}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{template.description}</p>
                    </div>
                    <BoltIcon className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
              <p className="text-[10px] text-slate-400 text-center">Click a template to apply it. Your current content will be replaced.</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* KEYBOARD SHORTCUTS MODAL                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-900 font-heading">Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1 text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-3">
              {[
                { category: 'Navigation', shortcuts: [
                  { keys: '1', desc: 'Compose View' },
                  { keys: '2', desc: 'My Posts View' },
                  { keys: '3', desc: 'Outreach View' },
                  { keys: '4', desc: 'Contributors View' },
                ]},
                { category: 'Actions', shortcuts: [
                  { keys: 'T', desc: 'Toggle Templates' },
                  { keys: 'S', desc: 'Toggle SEO Panel' },
                  { keys: 'M', desc: 'Toggle Metrics' },
                  { keys: 'A', desc: 'Toggle AI Assist' },
                  { keys: '?', desc: 'Toggle Shortcuts' },
                  { keys: 'Esc', desc: 'Close Panels' },
                ]},
                { category: 'In Editor', shortcuts: [
                  { keys: 'Ctrl+Enter', desc: 'Submit for Review' },
                  { keys: 'Ctrl+S', desc: 'Save Draft' },
                ]},
              ].map(group => (
                <div key={group.category}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">{group.category}</p>
                  <div className="space-y-2">
                    {group.shortcuts.map(s => (
                      <div key={s.keys} className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">{s.desc}</span>
                        <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 min-w-[28px] text-center">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-[10px] text-slate-400 text-center">Press <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold">Esc</kbd> to close</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlogDrafts;
