import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User } from '../../types';
import {
  SparklesIcon, TargetIcon, BoltIcon, ChartIcon, ShieldIcon, CheckIcon,
  TrendUpIcon, ClockIcon, MailIcon, RefreshIcon, FlameIcon, CogIcon,
  BookOpenIcon, LightBulbIcon, AcademicCapIcon, MessageIcon, EyeIcon,
  DocumentIcon, GitBranchIcon, ZapIcon, XIcon, LockIcon, BellIcon,
  KeyboardIcon, PieChartIcon, UsersIcon, EditIcon, HelpCircleIcon, GlobeIcon
} from '../../components/Icons';

interface LayoutContext {
  user: User;
  refreshProfile: () => Promise<void>;
}

type SectionKey = 'welcome' | 'getting-started' | 'lead-management' | 'content-creation' | 'analytics-reporting' | 'automation-workflows' | 'team-collaboration' | 'integrations' | 'troubleshooting' | 'advanced-features' | 'training' | 'outreach-templates' | 'whats-next' | 'advantages' | 'features' | 'impact' | 'future' | 'comparison';

// === Lead Scoring Table ===
const LEAD_SCORE_TIERS = [
  { range: '0-25', level: 'Cold', color: 'blue', colorClass: 'sky', action: 'Nurture campaign' },
  { range: '26-50', level: 'Warm', color: 'green', colorClass: 'emerald', action: 'Educational content' },
  { range: '51-75', level: 'Hot', color: 'yellow', colorClass: 'amber', action: 'Sales follow-up' },
  { range: '76-90', level: 'Very Hot', color: 'orange', colorClass: 'orange', action: 'Immediate contact' },
  { range: '91-100', level: 'Critical', color: 'red', colorClass: 'red', action: 'Contact NOW (CEO alert)' },
];

const LEAD_ADD_METHODS = [
  {
    id: 'single',
    title: 'Single Lead Entry',
    icon: <UsersIcon className="w-5 h-5" />,
    steps: ['Navigate: Leads \u2192 Add Lead \u2192 Quick Add', 'Fill required fields: Email, First Name, Company', 'AI Enhancement: Enter company website \u2192 AI auto-fills industry, size, location, technologies, and recent news'],
  },
  {
    id: 'csv',
    title: 'Bulk CSV Import',
    icon: <DocumentIcon className="w-5 h-5" />,
    steps: ['Download template: Leads \u2192 Import \u2192 Download Template', 'Format your data (minimum: email, first_name, company)', 'Upload: Drag & drop or browse', 'Enable "AI Research" to enrich data automatically'],
  },
  {
    id: 'api',
    title: 'API Integration',
    icon: <GlobeIcon className="w-5 h-5" />,
    steps: ['Generate API key in Settings \u2192 API Keys', 'POST to /v1/leads with lead data', 'Set X-AI-Research: true for AI enrichment', 'Returns full enriched lead profile'],
  },
  {
    id: 'extension',
    title: 'Chrome Extension',
    icon: <BoltIcon className="w-5 h-5" />,
    steps: ['Install from Chrome Web Store: "AuraFunnel Lead Capture"', 'Capture leads from LinkedIn profiles', 'One-click import from company websites', 'Auto-enrich with AI research'],
  },
];

const DYNAMIC_SEGMENTS = [
  { name: 'Hot & Ready', rule: 'Score > 75 AND last_activity < 7 days', color: 'red' },
  { name: 'Stagnant', rule: 'No activity > 30 days BUT score > 50', color: 'amber' },
  { name: 'High-Intent', rule: 'Viewed pricing > 3x OR requested demo', color: 'emerald' },
  { name: 'Competitor Researching', rule: 'Visited competitor pages', color: 'violet' },
  { name: 'Content Engagers', rule: 'Downloaded > 2 resources', color: 'indigo' },
];

const LEAD_ACTIONS = [
  { category: 'Contact Actions', items: ['Email (AI-generated or template)', 'Call (Log notes automatically)', 'Meeting (Syncs with calendar)', 'Task (Assign follow-ups)'] },
  { category: 'Status Management', items: ['Change Score (Override AI if needed)', 'Update Stage (Awareness \u2192 Consideration \u2192 Decision)', 'Add Tags (Custom or AI-suggested)', 'Assign Owner (Team collaboration)'] },
  { category: 'Automation Triggers', items: ['Add to Campaign (Start automated sequence)', 'Create Task (For you or team member)', 'Send Notification (Alert specific people)'] },
];

// === Getting Started: Onboarding Steps ===
const ONBOARDING_STEPS = [
  { step: 1, title: 'Access', desc: 'Navigate to your company portal URL', icon: <GlobeIcon className="w-5 h-5" />, detail: 'https://yourcompany.aura-funnel.com' },
  { step: 2, title: 'Login', desc: 'Use credentials emailed to you', icon: <MailIcon className="w-5 h-5" />, detail: 'Check your inbox for the welcome email with login details' },
  { step: 3, title: 'Security', desc: 'Setup two-factor authentication', icon: <LockIcon className="w-5 h-5" />, detail: 'Required for all accounts \u2014 use authenticator app or SMS' },
  { step: 4, title: 'Profile', desc: 'Complete your user profile', icon: <UsersIcon className="w-5 h-5" />, detail: 'Add name, avatar, team role, and notification preferences' },
  { step: 5, title: 'Tour', desc: 'Take the 5-minute interactive tour', icon: <EyeIcon className="w-5 h-5" />, detail: 'Guided walkthrough of all platform features' },
];

const DASHBOARD_NAV_ITEMS = [
  { icon: <ChartIcon className="w-4 h-4" />, label: 'Dashboard', desc: 'Your command center' },
  { icon: <UsersIcon className="w-4 h-4" />, label: 'Leads', desc: 'Manage prospects' },
  { icon: <EditIcon className="w-4 h-4" />, label: 'Content', desc: 'Create marketing materials' },
  { icon: <PieChartIcon className="w-4 h-4" />, label: 'Analytics', desc: 'View performance data' },
  { icon: <CogIcon className="w-4 h-4" />, label: 'Settings', desc: 'Configure your account' },
];

const QUICK_ACTION_ITEMS = [
  { icon: <HelpCircleIcon className="w-4 h-4" />, label: 'Search Anything', key: 'Ctrl+K' },
  { icon: <ZapIcon className="w-4 h-4" />, label: 'Quick Tasks', key: 'Ctrl+N' },
  { icon: <BellIcon className="w-4 h-4" />, label: 'Notifications', key: 'Click bell' },
  { icon: <UsersIcon className="w-4 h-4" />, label: 'User Menu', key: 'Click avatar' },
];

const SMART_SEARCH_EXAMPLES = [
  { command: '/lead acme', desc: 'Find leads from Acme' },
  { command: '/report weekly', desc: 'Generate weekly report' },
  { command: '/content email', desc: 'Create email content' },
  { command: '/help import', desc: 'Get import assistance' },
];

// === Competitive Advantages ===
const ADVANTAGES = [
  {
    id: 1,
    title: 'Predictive Intelligence vs. Reactive Automation',
    icon: <SparklesIcon className="w-6 h-6" />,
    color: 'indigo',
    otherSystems: [
      'Reacts to lead actions (form fills, clicks)',
      'Scores leads based on past rules',
      'Waits for lead to engage',
      'One-size-fits-all campaigns',
    ],
    auraFunnel: [
      'Predicts lead intent before action',
      'Scores leads using real-time AI analysis',
      'Proactively engages when AI predicts readiness',
      'Individualized strategies per lead',
    ],
    example: 'While others wait for a lead to download an ebook, AuraFunnel\'s AI identifies browsing patterns that indicate purchase intent 3 days earlier and initiates personalized engagement.',
  },
  {
    id: 2,
    title: 'Generative Content Engine',
    icon: <DocumentIcon className="w-6 h-6" />,
    color: 'violet',
    otherSystems: [
      'Pre-written templates',
      'Basic personalization ({{first_name}})',
      'Manual A/B testing',
      'Static content blocks',
    ],
    auraFunnel: [
      'AI creates unique content for EACH lead',
      'Dynamic personalization (industry, news, history)',
      'Content evolves based on performance',
      'Multi-format adaptation (email \u2192 social \u2192 web)',
    ],
    example: 'A tech company saw 400% higher engagement when AuraFunnel generated content mentioning a prospect\'s specific technology stack vs. generic industry content.',
  },
  {
    id: 3,
    title: 'Continuous Self-Optimization',
    icon: <RefreshIcon className="w-6 h-6" />,
    color: 'emerald',
    otherSystems: [
      'Campaign \u2192 Results \u2192 Manual Analysis',
      'Human Tweaks \u2192 Repeat',
      'Static rules that don\'t learn',
      'Requires constant manual tuning',
    ],
    auraFunnel: [
      'Campaign \u2192 AI Analysis \u2192 Auto-Optimization',
      'Improved Campaign \u2192 AI Learns \u2192 Repeat',
      'Every interaction makes AuraFunnel smarter',
      'Knows optimal subject lines, send times, themes',
    ],
    example: 'After 3 months, AuraFunnel knows which subject lines work for your specific audience, optimal send times per industry/role, and lead scoring patterns unique to your business.',
  },
  {
    id: 4,
    title: 'Unified Intelligence Layer',
    icon: <EyeIcon className="w-6 h-6" />,
    color: 'amber',
    otherSystems: [
      'Separate CRM, Email, Analytics, Content tools',
      'Manual sync between platforms',
      'Data silos across tools',
      'Fragmented view of customer journey',
    ],
    auraFunnel: [
      'Central AI Brain sees everything',
      'Email responses + website visits + social + calls',
      'Connects dots humans miss',
      'Unified actions and insights from one intelligence',
    ],
    example: 'No more data silos. The AI sees email responses, website visits, social engagement, call outcomes\u2014and connects dots humans miss to drive better decisions.',
  },
  {
    id: 5,
    title: 'Adaptive Conversion Funnel',
    icon: <GitBranchIcon className="w-6 h-6" />,
    color: 'rose',
    otherSystems: [
      'Linear funnel: Awareness \u2192 Consideration \u2192 Decision \u2192 Action',
      'Same path for every lead',
      'Static stage definitions',
      'Manual progression tracking',
    ],
    auraFunnel: [
      'Dynamic path per lead based on behavior',
      'AI-Predicted Interest \u2192 Personalized Nurturing',
      'Intent Detection \u2192 Hyper-Targeted Offer',
      'Custom conversion journeys per lead',
    ],
    example: 'Leads don\'t follow linear paths. AuraFunnel creates custom conversion journeys based on each lead\'s behavior, industry, role, and timing.',
  },
];

// === Exclusive Features ===
const EXCLUSIVE_FEATURES = [
  {
    id: 'feat-1',
    title: 'Behavioral Pattern Recognition',
    description: 'Detects subtle signals humans miss by analyzing browsing patterns, company funding rounds, hiring activity, and competitor mentions to predict market moves.',
    example: 'AI detects lead browsing tech stack + company funding round + hiring for AI roles + competitor mentions \u2192 Predicts "Entering new market" with 92% confidence \u2192 Recommends sending case study on market expansion.',
    icon: <EyeIcon className="w-5 h-5" />,
    color: 'indigo',
  },
  {
    id: 'feat-2',
    title: 'Cross-Channel Intent Synthesis',
    description: 'While other tools see email opens, website visits, and social follows as separate events, AuraFunnel synthesizes them into a unified intent signal.',
    example: 'A lead who opened your pricing page 3x, follows your CEO on Twitter, and just attended your webinar is 85% likely to convert in 7 days.',
    icon: <GitBranchIcon className="w-5 h-5" />,
    color: 'violet',
  },
  {
    id: 'feat-3',
    title: 'Predictive Content Performance',
    description: 'Before you send anything, AuraFunnel\'s AI predicts performance metrics so you can optimize before launch.',
    example: 'Open rate probability: "42% opens with your audience" \u2022 Conversion likelihood: "3.2% conversion with enterprise leads" \u2022 Optimal timing: "Healthcare leads Tuesday 10 AM, tech leads Thursday 2 PM"',
    icon: <ChartIcon className="w-5 h-5" />,
    color: 'emerald',
  },
  {
    id: 'feat-4',
    title: 'AI-Driven A/B Testing',
    description: 'Instead of testing 2 variations and waiting, AuraFunnel generates 5 AI-optimized variations, tests simultaneously, analyzes why winners work, then creates even better versions.',
    example: 'Traditional: Test 2 \u2192 Wait \u2192 Pick winner. AuraFunnel: Generate 5 \u2192 Test \u2192 AI analyzes why \u2192 Creates 3 better versions \u2192 Continuously improves.',
    icon: <SparklesIcon className="w-5 h-5" />,
    color: 'amber',
  },
];

// === Case Study Metrics ===
const CASE_STUDY_METRICS = [
  { metric: 'Lead-to-MQL Time', traditional: '14 days', aura: '3 days', improvement: '79% faster' },
  { metric: 'Content Creation Time', traditional: '8 hours/article', aura: '22 minutes/article', improvement: '95% faster' },
  { metric: 'Personalization Depth', traditional: 'Basic (name/company)', aura: 'Advanced (role, tech stack, timing)', improvement: '300% deeper' },
  { metric: 'Sales Team Productivity', traditional: '50 leads/week', aura: '120 leads/week', improvement: '140% increase' },
  { metric: 'Conversion Rate', traditional: '2.3% industry avg', aura: '7.8%', improvement: '239% higher' },
];

const ROI_STATS = [
  { label: 'Monthly Investment', value: '$5,000/month' },
  { label: 'Qualified Leads Generated', value: '1,200+' },
  { label: 'New Pipeline Value', value: '$340,000' },
  { label: 'New Customers', value: '45' },
  { label: 'Hours Saved', value: '1,100' },
  { label: 'ROI Return', value: '1,580%' },
];

// === Quick Start Timeline ===
const QUICK_START = [
  { period: 'Day 1', tasks: ['Set up account', 'Explore dashboard'], color: 'indigo' },
  { period: 'Week 1', tasks: ['Import leads', 'Generate first content', 'Run reports'], color: 'violet' },
  { period: 'Month 1', tasks: ['Master automation', 'Optimize AI', 'See ROI'], color: 'emerald' },
  { period: 'Quarter 1', tasks: ['Become power user', 'Train team', 'Scale results'], color: 'amber' },
];

// === Self Assessment ===
const ASSESSMENT_QUESTIONS = [
  'How many hours does your team spend analyzing data vs. acting on insights?',
  'What percentage of leads receive truly personalized engagement (beyond name/company)?',
  'How quickly can you adapt when a campaign underperforms?',
  'Does your system learn and improve automatically, or does it wait for manual updates?',
  'Can your current tools predict which leads will convert next week?',
];

// === Platform Comparison ===
const COMPARISON = [
  { need: 'Reactive automation', tools: 'Marketo, HubSpot', category: 'basic' },
  { need: 'Manual optimization', tools: 'Mailchimp, ActiveCampaign', category: 'basic' },
  { need: 'Basic personalization', tools: 'Pardot, Eloqua', category: 'basic' },
  { need: 'Predictive intelligence', tools: 'AuraFunnel', category: 'aura' },
  { need: 'Generative creativity', tools: 'AuraFunnel', category: 'aura' },
  { need: 'Continuous optimization', tools: 'AuraFunnel', category: 'aura' },
  { need: 'Unified intelligence', tools: 'AuraFunnel', category: 'aura' },
  { need: 'Scalable personalization', tools: 'AuraFunnel', category: 'aura' },
];

// === Content Creation ===
const CONTENT_TYPES = [
  { icon: '📧', title: 'Email Sequences', desc: 'Multi-step campaigns' },
  { icon: '📄', title: 'Landing Pages', desc: 'Convert visitors' },
  { icon: '📱', title: 'Social Posts', desc: 'LinkedIn, Twitter, Facebook' },
  { icon: '📰', title: 'Blog Articles', desc: 'Thought leadership' },
  { icon: '📊', title: 'Reports', desc: 'Data-driven insights' },
  { icon: '💼', title: 'Proposals', desc: 'Customized for each client' },
  { icon: '🎯', title: 'Ad Copy', desc: 'Platform-specific' },
  { icon: '📋', title: 'Case Studies', desc: 'Success stories' },
];

const EMAIL_SEQUENCE_STEPS = [
  {
    step: 1,
    title: 'Define Your Audience',
    details: ['Select segment: "Hot Technology Leads"', 'Target: Companies 50-500 employees', 'Goal: Schedule product demo'],
    color: 'indigo',
  },
  {
    step: 2,
    title: 'AI Content Generation',
    details: ['Click: "Generate with AI"', 'Input: "Create 5-email sequence for SaaS demo requests"', 'Tone: Professional but friendly', 'Length: Medium', 'Focus: Problem → Solution → CTA'],
    color: 'violet',
  },
  {
    step: 3,
    title: 'Review & Customize',
    details: ['Email 1: Problem awareness (AI-generated)', 'Email 2: Solution introduction (Edit as needed)', 'Email 3: Social proof (Add customer quotes)', 'Email 4: Direct CTA (Customize timing)', 'Email 5: Final follow-up (Set conditions)'],
    color: 'emerald',
  },
  {
    step: 4,
    title: 'Personalization',
    details: ['{{first_name}} — Lead\'s first name', '{{company}} — Company name', '{{ai_insight}} — AI-generated insight about lead', '{{industry_challenge}} — Industry-specific pain point', '{{custom_field}} — Any custom lead data'],
    color: 'amber',
  },
  {
    step: 5,
    title: 'Schedule & Send',
    details: ['Send immediately to segment', 'Schedule for specific date/time', 'Trigger based on lead actions', 'A/B test variations'],
    color: 'rose',
  },
];

const MULTI_CHANNEL_OUTPUTS = [
  'Social media posts (LinkedIn, Twitter)',
  'Email newsletter version',
  'LinkedIn article format',
  'Key takeaways for sales team',
  'Slide deck summary',
];

const PERFORMANCE_PREDICTIONS = [
  { metric: 'Open Rate', prediction: 'Expected 42% based on similar campaigns', icon: <MailIcon className="w-4 h-4" /> },
  { metric: 'Click Rate', prediction: 'Predicted 8% with this CTA', icon: <TargetIcon className="w-4 h-4" /> },
  { metric: 'Conversion', prediction: 'Likely 3.2% will book demo', icon: <TrendUpIcon className="w-4 h-4" /> },
  { metric: 'Best Time', prediction: 'Send Tuesday 10:30 AM for max opens', icon: <ClockIcon className="w-4 h-4" /> },
];

const TEMPLATE_CATEGORIES = [
  { label: 'Industry-specific', items: ['Healthcare', 'Tech', 'Finance'] },
  { label: 'Role-specific', items: ['CEO', 'Marketing', 'IT'] },
  { label: 'Goal-specific', items: ['Demo request', 'Nurturing', 'Re-engagement'] },
];

const CALENDAR_FEATURES = [
  'Drag-and-drop scheduling',
  'Conflict detection',
  'Optimal timing suggestions',
  'Team collaboration',
  'Performance preview',
];

// === Mobile Content Creation ===
const MOBILE_FEATURES = [
  { icon: '🎤', title: 'Voice Dictation', desc: 'Dictate content ideas hands-free' },
  { icon: '📸', title: 'Photo Upload', desc: 'Quick upload for visual content' },
  { icon: '🔔', title: 'Push Notifications', desc: 'Alerts when content performs well' },
  { icon: '👆', title: 'One-Tap Responses', desc: 'Respond to comments/engagement' },
  { icon: '📶', title: 'Offline Editing', desc: 'Syncs when back online' },
];

const MOBILE_WORKFLOW_STEPS = [
  { step: 1, text: 'Receive notification: "Content performing well!"', color: 'indigo' },
  { step: 2, text: 'Tap notification → See analytics', color: 'violet' },
  { step: 3, text: 'Click [Create Similar Content]', color: 'emerald' },
  { step: 4, text: 'Use voice: "Create a LinkedIn post about this success"', color: 'amber' },
  { step: 5, text: 'AI generates draft in 10 seconds', color: 'rose' },
  { step: 6, text: 'Edit with mobile-optimized editor', color: 'indigo' },
  { step: 7, text: 'Schedule for optimal time', color: 'emerald' },
];

// === Measuring Success ===
const EMAIL_METRICS = [
  { metric: 'Open Rate', good: '> 40%', excellent: '> 50%' },
  { metric: 'Click Rate', good: '> 10%', excellent: '> 15%' },
  { metric: 'Reply Rate', good: '> 3%', excellent: '> 5%' },
  { metric: 'Conversion Rate', good: '> 1.5%', excellent: '> 3%' },
];

const SOCIAL_METRICS = [
  { metric: 'Engagement Rate', good: '> 2%', excellent: '> 5%' },
  { metric: 'Shares/Retweets', good: 'Consistent', excellent: 'Viral' },
  { metric: 'Profile Visits', good: 'Growing', excellent: '3x baseline' },
  { metric: 'Lead Generation', good: '1-2/post', excellent: '5+/post' },
];

const OPTIMIZATION_TIMELINE = [
  { time: 'First 24 hours', task: 'Monitor initial engagement', color: 'indigo' },
  { time: 'Day 3', task: 'Check conversion metrics', color: 'violet' },
  { time: 'Day 7', task: 'Full performance review', color: 'emerald' },
  { time: 'Week 2', task: 'Compare with similar content', color: 'amber' },
  { time: 'Week 4', task: 'Long-term impact assessment', color: 'rose' },
  { time: 'Monthly', task: 'Update content based on learnings', color: 'indigo' },
];

// === Getting Started / Create New Walkthrough ===
const FIRST_30_MINUTES = [
  { range: '0-5 min', task: 'Create your first email sequence', icon: <MailIcon className="w-4 h-4" /> },
  { range: '5-10 min', task: 'Generate a LinkedIn post', icon: <MessageIcon className="w-4 h-4" /> },
  { range: '10-15 min', task: 'Set up A/B test on subject line', icon: <GitBranchIcon className="w-4 h-4" /> },
  { range: '15-20 min', task: 'Review performance predictions', icon: <ChartIcon className="w-4 h-4" /> },
  { range: '20-25 min', task: 'Schedule content for the week', icon: <ClockIcon className="w-4 h-4" /> },
  { range: '25-30 min', task: 'Set up performance alerts', icon: <BellIcon className="w-4 h-4" /> },
];

const BEGINNER_WEEK = [
  { day: 'Monday', tasks: ['Create 3 email variations', 'Test subject lines'] },
  { day: 'Tuesday', tasks: ['Generate social media content', 'Schedule for week'] },
  { day: 'Wednesday', tasks: ['Build a landing page', 'Connect to campaign'] },
  { day: 'Thursday', tasks: ['Create a case study template', 'Add customer quotes'] },
  { day: 'Friday', tasks: ['Review performance', 'Optimize for next week'] },
];

const CREATE_NEW_STEPS = [
  {
    step: 1,
    title: 'Click "Create New"',
    desc: 'From the Content Studio dashboard, click the big blue [Create New] button',
    details: ['View recent content performance', 'See Quick Actions: Create Email, Social Post, Blog, Generate Multiple', 'Click [Create New] to open the creation wizard'],
    color: 'indigo',
  },
  {
    step: 2,
    title: 'Select Content Type',
    desc: 'Choose what you want to create from the content type picker',
    details: ['AI recommends content type based on your leads', 'Email Sequence, Landing Page, Social Post, Blog Article', 'Reports, Sales Proposals, Ad Copy, Case Studies', 'Click your choice to continue'],
    color: 'violet',
  },
  {
    step: 3,
    title: 'Basic Setup',
    desc: 'Fill in campaign name, description, and target audience',
    details: ['Campaign Name: Make it descriptive for easy finding', 'Description: Include goals and target outcomes', 'Target Audience: All Leads, Specific Segment, Custom List, or Test Group', 'Select your segment from the dropdown — preview shows lead count & avg score'],
    color: 'emerald',
  },
  {
    step: 4,
    title: 'AI Configuration',
    desc: 'Set AI parameters for optimal content generation',
    details: ['Primary Goal: Schedule Demo, Download Content, Newsletter, Event, Onboarding, Re-engagement', 'Tone & Style: Professional, Technical, Casual, Urgent, Educational', 'Content Length: Short (3 emails), Medium (5 emails), Long (7+ emails)', 'Personalization: Basic, Standard, Advanced, Maximum', 'Include: Case studies, Metrics, Industry examples, CTAs, Social proof'],
    color: 'amber',
  },
  {
    step: 5,
    title: 'AI Generation',
    desc: 'Watch as AI creates your content in 10-20 seconds',
    details: ['AI analyzes lead profiles', 'Researches industry trends', 'Personalizes for each company', 'Optimizes for maximum engagement', 'Predicts performance metrics'],
    color: 'rose',
  },
  {
    step: 6,
    title: 'Review Generated Content',
    desc: 'Preview your complete sequence with performance predictions',
    details: ['See all emails in the sequence with subjects', 'Each email shows status (Ready to send)', 'Expected performance metrics displayed', 'Options: Review All Emails, Edit Individual, Send Now'],
    color: 'indigo',
  },
  {
    step: 7,
    title: 'Edit & Refine',
    desc: 'Fine-tune each email with AI suggestions in the sidebar',
    details: ['Edit subject lines, preview text, and body content', 'AI Suggestions appear in right sidebar with impact predictions', 'Apply suggestions with one click — see expected improvement', 'Each suggestion shows: "Try X instead of Y → +8% expected opens"'],
    color: 'violet',
  },
  {
    step: 8,
    title: 'Schedule & Optimize',
    desc: 'Set timing with AI-optimized send windows',
    details: ['Start immediately or schedule for specific time', 'Enable AI-optimized send times per lead', 'Space emails for maximum engagement', 'Avoid sending on weekends', 'See timeline: Email 1 today, Email 2 +2 days, etc.'],
    color: 'emerald',
  },
  {
    step: 9,
    title: 'Activate & Monitor',
    desc: 'Your sequence is live — monitor in real-time',
    details: ['Confirmation shows expected results', 'AI tracks opens, clicks, and replies in real-time', 'Performance alerts notify you of milestones', 'View live metrics: Sent, Opened, Clicked, Replied', 'AI suggests optimizations after 24 hours'],
    color: 'amber',
  },
];

const POST_CREATION_TIMELINE = [
  { period: 'Day 1', title: 'Monitor Launch', tasks: ['Check opens after 2 hours', 'Review click-through rates', 'Note immediate replies', 'Adjust if needed (pause/edit)'], color: 'indigo' },
  { period: 'Day 3', title: 'Mid-Sequence Check', tasks: ['Review engagement across all emails', 'Check conversion metrics', 'Make optimizations if needed', 'Share insights with team'], color: 'violet' },
  { period: 'Day 10', title: 'Complete Analysis', tasks: ['Full performance review', 'Calculate ROI', 'Save as template if successful', 'Apply learnings to next campaign'], color: 'emerald' },
];

const CONTENT_PRO_TIPS = [
  { title: 'Save Time with Templates', desc: 'After creating a successful sequence, click [Save as Template]. Next time, just update the details — saves hours of work.' },
  { title: 'Batch Create Weekly', desc: 'Every Monday: Click [Batch Create] → 3 LinkedIn posts + 2 emails + 1 blog. AI generates all in 2 minutes. Schedule for the week.' },
  { title: 'Use Voice Commands', desc: 'Click the microphone icon and say: "Create a LinkedIn post about our new API features." AI generates a draft instantly — saves 10+ minutes per piece.' },
];

const CONTENT_FAQ = [
  { q: 'I need to change the sequence after sending?', a: 'Click sequence → Click [Pause] → Make edits → [Resume]' },
  { q: 'How do I add more leads to the sequence?', a: 'Sequence → Settings → Audience → [Add More Leads]' },
  { q: 'Can I see what each lead received?', a: 'Yes! Click any lead → Activity → See all emails sent' },
  { q: 'How do I stop the sequence for some leads?', a: 'Lead profile → Click [Unsubscribe from Campaign]' },
];

// === Analytics & Reporting (Chapter 4) ===
const EXEC_DASHBOARD_METRICS = [
  {
    category: 'Lead Metrics',
    icon: <TargetIcon className="w-4 h-4" />,
    color: 'indigo',
    items: [
      { label: 'New Leads', value: '142', trend: '↑ 12% from yesterday' },
      { label: 'Hot Leads', value: '38', trend: '↑ 8% weekly' },
      { label: 'Conversions', value: '12', trend: '↑ 15% monthly' },
    ],
  },
  {
    category: 'AI Performance',
    icon: <SparklesIcon className="w-4 h-4" />,
    color: 'violet',
    items: [
      { label: 'Accuracy', value: '94%', trend: '' },
      { label: 'Speed', value: '1.2s avg', trend: '' },
      { label: 'Suggestions', value: '47', trend: '' },
    ],
  },
  {
    category: 'ROI',
    icon: <TrendUpIcon className="w-4 h-4" />,
    color: 'emerald',
    items: [
      { label: 'Cost/Lead', value: '$4.20', trend: '' },
      { label: 'Revenue/Lead', value: '$420', trend: '' },
      { label: 'ROI', value: '9,900%', trend: '' },
    ],
  },
  {
    category: 'Campaign Health',
    icon: <BoltIcon className="w-4 h-4" />,
    color: 'rose',
    items: [
      { label: 'Active', value: '8 campaigns', trend: '' },
      { label: 'Best', value: 'Q4 Launch (+42%)', trend: '' },
    ],
  },
  {
    category: 'Team',
    icon: <UsersIcon className="w-4 h-4" />,
    color: 'amber',
    items: [
      { label: 'Tasks Completed', value: '89', trend: '' },
      { label: 'Response Time', value: '1.2h', trend: '' },
    ],
  },
];

const STANDARD_REPORTS = [
  { name: 'Daily Snapshot', schedule: 'Automated email', icon: <ClockIcon className="w-4 h-4" /> },
  { name: 'Weekly Performance', schedule: 'Every Monday AM', icon: <ChartIcon className="w-4 h-4" /> },
  { name: 'Monthly Deep Dive', schedule: 'Comprehensive analysis', icon: <PieChartIcon className="w-4 h-4" /> },
  { name: 'Quarterly Business Review', schedule: 'Executive summary', icon: <DocumentIcon className="w-4 h-4" /> },
];

const CUSTOM_REPORT_TYPES = [
  'Lead Source Analysis', 'Campaign ROI', 'Team Productivity',
  'AI Effectiveness', 'Content Performance', 'Conversion Funnel',
];

const REPORT_WIDGETS = [
  'Metric Cards (Single numbers)', 'Trend Charts (Over time)',
  'Comparison Graphs (A vs B)', 'Funnel Visualizations',
  'Heat Maps', 'Leaderboards',
];

const AI_INSIGHT_SAMPLES = [
  {
    type: 'Opportunity Detected',
    icon: <TargetIcon className="w-5 h-5" />,
    color: 'indigo',
    message: 'Leads from LinkedIn are converting 3x higher than other sources. Recommendation: Increase LinkedIn content by 40% this month.',
  },
  {
    type: 'Performance Alert',
    icon: <BellIcon className="w-5 h-5" />,
    color: 'amber',
    message: 'Email open rates dropped 22% last week. AI detected subject line fatigue. Suggested: Test 3 new subject line formulas.',
  },
  {
    type: 'Predictive Forecast',
    icon: <TrendUpIcon className="w-5 h-5" />,
    color: 'emerald',
    message: 'Based on current trends, expected results next month:\n• 1,240 new leads (+18%)\n• 94 hot leads (+12%)\n• $142K pipeline (+22%)',
  },
  {
    type: 'Optimization Suggestion',
    icon: <CogIcon className="w-5 h-5" />,
    color: 'violet',
    message: 'Your "Enterprise" segment responds best to case studies. Suggestion: Create 3 new enterprise case studies this quarter.',
  },
];

const ALERT_TYPES = [
  { name: 'Performance Thresholds', desc: 'Conversion rate drops below X%' },
  { name: 'Lead Activity', desc: 'New hot lead, Score increase > 20 points' },
  { name: 'System Health', desc: 'AI accuracy below 90%, High error rate' },
  { name: 'Business Metrics', desc: 'ROI below target, Cost per lead too high' },
];

const ALERT_DELIVERY = [
  { method: 'In-app notification', note: 'always on', enabled: true },
  { method: 'Email', note: 'Configure frequency', enabled: true },
  { method: 'Slack/Teams integration', note: '', enabled: true },
  { method: 'SMS', note: 'For critical alerts only', enabled: true },
  { method: 'Phone call', note: 'Emergency outages', enabled: false },
];

// === Automation & Workflows (Chapter 5) ===
const WORKFLOW_STEPS = [
  { action: 'TRIGGER', desc: 'New lead added', type: 'trigger' },
  { action: 'ACTION 1', desc: 'AI scores lead', type: 'action' },
  { action: 'ACTION 2', desc: 'If score > 50 → Send welcome email', type: 'condition' },
  { action: 'ACTION 3', desc: 'Wait 2 days', type: 'wait' },
  { action: 'ACTION 4', desc: 'Check if opened email', type: 'branch', branches: ['Yes: Send case study', 'No: Send different content'] },
  { action: 'ACTION 5', desc: 'Score > 75 → Notify sales team', type: 'action' },
];

const CONDITIONAL_PATHS = [
  {
    condition: 'lead.score > 75 && lead.company_size > 200',
    label: 'Enterprise Hot Lead',
    color: 'indigo',
    actions: ['assign_to_enterprise_team', 'send_enterprise_case_study', 'schedule_executive_briefing'],
  },
  {
    condition: 'lead.score > 60 && lead.industry == "tech"',
    label: 'Tech Warm Lead',
    color: 'violet',
    actions: ['send_tech_whitepaper', 'invite_to_webinar', 'nurture_for_14_days'],
  },
  {
    condition: 'else (General)',
    label: 'General Nurture',
    color: 'slate',
    actions: ['add_to_newsletter', 'educate_with_content', 'score_based_followup'],
  },
];

const AI_AUTOMATION_SUGGESTIONS = [
  {
    id: 1,
    message: 'Based on your data, leads who download the pricing sheet but don\'t request a demo within 3 days have 80% drop-off. Suggestion: Add automated follow-up 2 days after download.',
    color: 'indigo',
  },
  {
    id: 2,
    message: 'You have 247 leads stuck at "Warm" stage for 30+ days. Suggestion: Create re-engagement campaign targeting specific reasons they\'re stuck.',
    color: 'amber',
  },
  {
    id: 3,
    message: 'Your team spends 12 hours/week manually scoring leads. Suggestion: Implement AI auto-scoring workflow to save 48 hours/month of manual work.',
    color: 'emerald',
  },
];

const PREDICTIVE_TIMING_FEATURES = [
  'Best time to send emails',
  'Optimal call times based on timezone',
  'When leads are most engaged',
  'Avoiding communication fatigue',
];

const DYNAMIC_CONTENT_TRIGGERS = [
  'Their engagement level',
  'Industry preferences',
  'Content consumption habits',
  'Stage in buying journey',
];

const SELF_OPTIMIZING_STEPS = [
  'Test multiple paths simultaneously',
  'Measure results in real-time',
  'AI identifies winning paths',
  'Automatically shifts traffic to best performers',
  'Continuously tests new variations',
];

// === Team Collaboration (Chapter 6) ===
const USER_ROLES = [
  {
    role: 'Administrator',
    tag: 'Full Access',
    color: 'indigo',
    permissions: ['User management', 'Billing and settings', 'API management', 'System configuration', 'All data access'],
  },
  {
    role: 'Manager',
    tag: 'Team Lead',
    color: 'violet',
    permissions: ['View team performance', 'Assign leads and tasks', 'Approve campaigns', 'Generate team reports', 'Limited user management'],
  },
  {
    role: 'Sales Representative',
    tag: 'Sales',
    color: 'emerald',
    permissions: ['Manage assigned leads', 'Log calls and emails', 'View personal analytics', 'Create tasks and reminders', 'Limited data export'],
  },
  {
    role: 'Marketing Specialist',
    tag: 'Marketing',
    color: 'amber',
    permissions: ['Create and manage campaigns', 'Generate content', 'View marketing analytics', 'A/B test campaigns', 'No sales data access'],
  },
  {
    role: 'Viewer',
    tag: 'Read Only',
    color: 'slate',
    permissions: ['View dashboards and reports', 'No editing capabilities', 'Limited data visibility', 'Export own views'],
  },
];

const TEAM_DASHBOARD_FEATURES = [
  'Real-time team activity feed',
  'Lead assignment visualization',
  'Performance leaderboards',
  'Collaborative notes on leads',
  'Shared templates and content',
  'Team chat integration',
];

const LEAD_ASSIGNMENT_METHODS = [
  { method: 'Round Robin', desc: 'Auto-distribute evenly' },
  { method: 'Score-based', desc: 'Highest scores to top reps' },
  { method: 'Territory-based', desc: 'Geography/industry' },
  { method: 'Manual assignment', desc: 'Direct pick' },
  { method: 'AI-suggested', desc: 'Smart matching' },
];

const ASSIGNMENT_FEATURES = [
  'Conflict prevention (No duplicate assignments)',
  'Load balancing (Equal distribution)',
  'Skill matching (Right rep for lead type)',
];

const SHARED_NOTES_ACTIONS = [
  'Add notes (Rich text, @mentions, attachments)',
  'Log activities (Calls, emails, meetings)',
  'Set follow-ups (Private or team visible)',
  'Tag team members (@john please review)',
  'Create tasks (Assign to yourself or others)',
];

const TEAM_NOTIFICATION_TYPES = [
  'New lead assignment',
  'Lead score change > 20 points',
  'Important lead activity',
  'Team member mentions',
  'Campaign performance alerts',
  'System announcements',
];

// === Integrations (Chapter 7) ===
const INTEGRATION_CATEGORIES = [
  {
    category: 'CRM Systems',
    color: 'indigo',
    items: ['Salesforce', 'HubSpot', 'Microsoft Dynamics', 'Pipedrive', 'Zoho CRM'],
  },
  {
    category: 'Email & Marketing',
    color: 'violet',
    items: ['SendGrid', 'Mailgun', 'Amazon SES', 'Marketo', 'Mailchimp'],
  },
  {
    category: 'Communication',
    color: 'emerald',
    items: ['Slack', 'Microsoft Teams', 'Zoom', 'Calendly', 'Google Meet'],
  },
  {
    category: 'Analytics & Tools',
    color: 'amber',
    items: ['Google Analytics', 'Google Sheets', 'Zapier', 'Make (Integromat)', 'Webhooks'],
  },
];

const SALESFORCE_SETUP_STEPS = [
  'Navigate: Settings → Integrations → Salesforce',
  'Click: "Connect to Salesforce"',
  'Authenticate: Enter Salesforce credentials',
  'Configure Sync: Direction, Objects, Field Mapping, Frequency',
  'Test: Sync a sample record',
  'Activate: Turn on integration',
];

const SYNC_OPTIONS = [
  { label: 'Direction', options: 'Two-way or One-way' },
  { label: 'Objects', options: 'Leads, Contacts, Accounts, Opportunities' },
  { label: 'Field Mapping', options: 'Auto-map or custom' },
  { label: 'Sync Frequency', options: 'Real-time or scheduled' },
];

const WEBHOOK_SETUP_STEPS = [
  'Navigate: Settings → Webhooks → Create New',
  'Name: "New Lead to Slack"',
  'Trigger: "When lead is created"',
  'URL: Your Slack webhook URL',
  'Payload: Customize JSON data sent',
  'Test: Send test payload',
  'Activate: Turn on webhook',
];

// === Troubleshooting (Chapter 8) ===
const TROUBLESHOOT_ISSUES = [
  {
    title: 'AI content not generating',
    quickFix: [
      'Check AI credits balance (Settings → Billing)',
      'Verify internet connection',
      'Clear browser cache (Ctrl+Shift+Del)',
      'Try different content type',
      'Check for browser extensions blocking requests',
    ],
    escalation: [
      'Contact support with error message',
      'Include browser console errors (F12 → Console)',
      'Screenshot of the issue',
    ],
    color: 'indigo',
  },
  {
    title: 'Lead import failing',
    quickFix: [
      'File must be CSV or XLSX, max 10MB, UTF-8 encoding',
      'Use template for correct headers',
      'Required columns: email, first_name, company',
      'Remove special characters from headers',
      'Valid email formats only, no duplicates',
      'Remove empty rows',
    ],
    escalation: [
      'Pro Tip: Use "AI Column Detection" — upload any format, AI will identify and map columns automatically.',
    ],
    color: 'violet',
  },
  {
    title: 'Slow performance',
    quickFix: [
      'Use Chrome or Firefox (latest versions)',
      'Disable unnecessary extensions & clear cache',
      'Use filters instead of loading all leads',
      'Archive old leads (> 6 months inactive)',
      'Use list view instead of card view for large datasets',
      'Schedule heavy reports for off-hours',
    ],
    escalation: [
      'Check internet speed, avoid VPN if possible',
      'Use wired connection if available',
      'Limit open tabs in AuraFunnel',
    ],
    color: 'amber',
  },
];

const KEYBOARD_SHORTCUTS = [
  { key: '/', action: 'Search anything' },
  { key: 'Ctrl+K', action: 'Command palette' },
  { key: 'Ctrl+N', action: 'New lead' },
  { key: 'Ctrl+G', action: 'Generate content' },
  { key: 'Ctrl+S', action: 'Save' },
  { key: 'Ctrl+P', action: 'Print/Export' },
];

const POWER_USER_TIPS = [
  'Save frequent searches as views',
  'Create custom dashboard widgets',
  'Set up quick action buttons',
  'Use workspaces for different projects',
  'Set up auto-archiving rules',
  'Use bulk actions for common tasks',
  'Create templates for repetitive work',
  'Schedule data cleanup monthly',
];

const SUPPORT_CHANNELS = [
  {
    channel: 'In-app Help Center',
    hours: '24/7',
    response: 'Instant',
    color: 'indigo',
    details: ['Search knowledge base', 'View video tutorials', 'Access user guides', 'Community forums'],
  },
  {
    channel: 'Live Chat',
    hours: '9 AM - 6 PM EST, Mon-Fri',
    response: '< 5 minutes',
    color: 'emerald',
    details: ['Click help icon → Live Chat', 'Real-time support agent'],
  },
  {
    channel: 'Email Support',
    hours: 'Business hours',
    response: '< 2 hours',
    color: 'violet',
    details: ['General: support@aura-funnel.com', 'Technical: tech@aura-funnel.com', 'Billing: billing@aura-funnel.com'],
  },
  {
    channel: 'Emergency Phone',
    hours: '24/7 for critical issues',
    response: '15-minute SLA for P1',
    color: 'rose',
    details: ['Phone: 1-800-AURA-AI (1-800-287-2244)'],
  },
  {
    channel: 'Account Management',
    hours: 'Scheduled',
    response: 'Dedicated manager',
    color: 'amber',
    details: ['Quarterly business reviews', 'Strategic planning sessions', 'Custom training available'],
  },
];

const TICKET_CHECKLIST = [
  'Issue description (what were you trying to do?)',
  'Error message (copy exactly)',
  'Steps to reproduce',
  'Screenshots/video',
  'Browser/OS info',
  'Account email',
];

// === Advanced Features (Chapter 9) ===
const AI_TRAINING_STEPS = [
  { step: 1, title: 'Navigate', desc: 'Settings → AI Models → Train Custom Model' },
  { step: 2, title: 'Upload Training Data', desc: 'Successful campaigns, high-converting content, ideal customer profiles, industry terminology' },
  { step: 3, title: 'Set Parameters', desc: 'Industry focus, tone preferences, content style, target audience' },
  { step: 4, title: 'Train', desc: 'AI processes data (2-48 hours)' },
  { step: 5, title: 'Test', desc: 'Use test leads to validate accuracy' },
  { step: 6, title: 'Deploy', desc: 'Activate for team use' },
];

const CUSTOM_TRAINING_BENEFITS = [
  'Understands your industry jargon',
  'Learns your successful patterns',
  'Adapts to your brand voice',
  'Predicts based on your historical data',
  'Continuously improves with feedback',
];

const FORECAST_TYPES = [
  { name: 'Lead Volume', scope: 'Next week/month/quarter', icon: <UsersIcon className="w-4 h-4" /> },
  { name: 'Conversion Rates', scope: 'By segment/campaign', icon: <TrendUpIcon className="w-4 h-4" /> },
  { name: 'Pipeline Value', scope: 'Revenue predictions', icon: <ChartIcon className="w-4 h-4" /> },
  { name: 'Team Performance', scope: 'Based on trends', icon: <UsersIcon className="w-4 h-4" /> },
  { name: 'Campaign ROI', scope: 'Before launching', icon: <PieChartIcon className="w-4 h-4" /> },
];

const FORECAST_PROCESS = [
  'AI analyzes historical patterns',
  'Identifies seasonal trends',
  'Accounts for market factors',
  'Provides confidence intervals',
  'Updates forecasts in real-time',
];

// === Training & Certification (Chapter 10) ===
const BEGINNER_PATH = [
  {
    week: 'Week 1',
    title: 'Platform Fundamentals',
    daily: '30-minute interactive tutorials',
    topics: 'Navigation, lead management, basic content',
    goal: 'Complete 10 basic tasks independently',
    color: 'indigo',
  },
  {
    week: 'Week 2',
    title: 'Core Features Mastery',
    daily: '45-minute practice sessions',
    topics: 'Campaigns, automation, reporting',
    goal: 'Run first complete campaign',
    color: 'violet',
  },
  {
    week: 'Week 3-4',
    title: 'Real Project',
    daily: 'Implement actual business use case',
    topics: 'Weekly check-ins with mentor',
    goal: 'Final assessment and certification',
    color: 'emerald',
  },
];

const ADVANCED_MODULES = [
  { module: 1, title: 'AI Optimization', duration: '2 weeks', topics: ['Custom model training', 'Predictive analytics', 'Advanced segmentation'], color: 'indigo' },
  { module: 2, title: 'Automation Mastery', duration: '2 weeks', topics: ['Complex workflow design', 'API integration', 'System optimization'], color: 'violet' },
  { module: 3, title: 'Team Leadership', duration: '2 weeks', topics: ['Team management', 'Performance analysis', 'Strategic planning'], color: 'amber' },
  { module: 4, title: 'Certification Project', duration: '2 weeks', topics: ['Real business implementation', 'ROI analysis', 'Presentation to stakeholders'], color: 'emerald' },
];

const CERTIFICATIONS = [
  {
    abbr: 'AFCU',
    title: 'AuraFunnel Certified User',
    level: 'Basic',
    color: 'indigo',
    requirements: ['Basic platform proficiency', 'Can perform day-to-day tasks', 'Understands core features'],
    exam: '80%+ on basic exam',
  },
  {
    abbr: 'AFCP',
    title: 'AuraFunnel Certified Professional',
    level: 'Intermediate',
    color: 'violet',
    requirements: ['Advanced feature mastery', 'Can design complex campaigns', 'Implements automation'],
    exam: '85%+ on advanced exam + project',
  },
  {
    abbr: 'AFCE',
    title: 'AuraFunnel Certified Expert',
    level: 'Advanced',
    color: 'emerald',
    requirements: ['AI optimization skills', 'Team training capability', 'Strategic implementation'],
    exam: '90%+ on expert exam + case study',
  },
  {
    abbr: 'AFCA',
    title: 'AuraFunnel Certified Architect',
    level: 'Expert',
    color: 'amber',
    requirements: ['Enterprise implementation', 'Custom integration design', 'Multi-team management'],
    exam: 'Real business results + panel review',
  },
];

const LEARNING_RESOURCES = [
  {
    category: 'Weekly Live Training',
    color: 'indigo',
    items: ['Every Tuesday 2 PM EST: New Features', 'Every Thursday 11 AM EST: Best Practices', 'Monthly: Industry-specific deep dives'],
  },
  {
    category: 'Video Library',
    color: 'violet',
    items: ['200+ tutorial videos (5-15 minutes each)', 'Searchable by topic/feature', 'Progress tracking available'],
  },
  {
    category: 'Community',
    color: 'emerald',
    items: ['User forums (community.aura-funnel.com)', 'Monthly user group meetings', 'Regional meetups and events'],
  },
  {
    category: 'Documentation',
    color: 'amber',
    items: ['Always up-to-date user manual', 'API documentation with examples', 'Integration guides', 'Troubleshooting knowledge base'],
  },
];

// === What's Next (Chapter 11) + Appendix ===
const ROADMAP_QUARTERS = [
  {
    month: 'January',
    color: 'indigo',
    items: ['Mobile app enhancements', 'Advanced AI content editing', 'Real-time collaboration features'],
  },
  {
    month: 'February',
    color: 'violet',
    items: ['Predictive lead routing', 'Enhanced team analytics', 'New integration partners'],
  },
  {
    month: 'March',
    color: 'emerald',
    items: ['Voice command interface', 'Advanced reporting APIs', 'Custom dashboard builder'],
  },
];

const FEATURE_REQUEST_STEPS = [
  'In-app: Click ? → Feature Request',
  'Describe: What problem are you solving?',
  'Priority: How important is this for you?',
  'Vote: Community votes on popular requests',
  'Status Tracking: View roadmap and updates',
];

const TOP_REQUESTED_FEATURES = [
  { feature: 'WhatsApp integration', eta: 'Coming Q2 2024' },
  { feature: 'Advanced LinkedIn automation', eta: 'Q3 2024' },
  { feature: 'Multi-language support', eta: 'Q4 2024' },
  { feature: 'Custom AI model marketplace', eta: '2025' },
];

const STAY_UPDATED_CHANNELS = [
  {
    channel: 'In-app Notifications',
    color: 'indigo',
    items: ['New feature announcements', 'Training opportunities', 'System updates'],
  },
  {
    channel: 'Monthly Newsletter',
    color: 'violet',
    items: ['Feature updates', 'Best practices', 'Customer success stories', 'Industry insights'],
  },
  {
    channel: 'Release Notes',
    color: 'emerald',
    items: ['Detailed technical updates', 'Migration guides if needed', 'Deprecation notices'],
  },
  {
    channel: 'Webinars',
    color: 'amber',
    items: ['Monthly new feature demos', 'Quarterly roadmap reviews', 'Annual user conference'],
  },
];

const SHORTCUT_GROUPS = [
  {
    group: 'Global',
    shortcuts: [
      { key: '/', action: 'Search anything' },
      { key: 'Ctrl+K', action: 'Command palette' },
      { key: 'Ctrl+?', action: 'Help menu' },
      { key: 'Ctrl+L', action: 'Go to leads' },
      { key: 'Ctrl+C', action: 'Go to content' },
      { key: 'Ctrl+A', action: 'Go to analytics' },
      { key: 'Ctrl+S', action: 'Save current item' },
      { key: 'Ctrl+P', action: 'Print/Export' },
      { key: 'Esc', action: 'Close modal/cancel' },
    ],
  },
  {
    group: 'Lead Management',
    shortcuts: [
      { key: 'N', action: 'New lead' },
      { key: 'E', action: 'Edit current lead' },
      { key: 'F', action: 'Filter leads' },
      { key: 'S', action: 'Search leads' },
      { key: 'R', action: 'Refresh list' },
    ],
  },
  {
    group: 'Content Creation',
    shortcuts: [
      { key: 'G', action: 'Generate content' },
      { key: 'T', action: 'New template' },
      { key: 'B', action: 'Batch create' },
      { key: 'P', action: 'Preview' },
      { key: 'D', action: 'Duplicate' },
    ],
  },
  {
    group: 'Navigation',
    shortcuts: [
      { key: '← →', action: 'Move between panels' },
      { key: '↑ ↓', action: 'Navigate lists' },
      { key: 'Tab', action: 'Next field' },
      { key: 'Shift+Tab', action: 'Previous field' },
      { key: 'Enter', action: 'Save/Confirm' },
    ],
  },
];

const EMERGENCY_CONTACTS = [
  { dept: 'Technical Emergency (24/7)', phone: '1-800-AURA-AI (1-800-287-2244)', email: 'emergency@aura-funnel.com', sla: '15-minute response for critical issues', color: 'rose' },
  { dept: 'Account Support', phone: 'Provided during onboarding', email: 'am@aura-funnel.com', sla: 'Your dedicated account manager', color: 'indigo' },
  { dept: 'Billing Support', phone: '1-800-AURA-BILL', email: 'billing@aura-funnel.com', sla: '9 AM - 5 PM EST, Mon-Fri', color: 'violet' },
  { dept: 'Security Issues', phone: '', email: 'security@aura-funnel.com', sla: 'For suspected security breaches only', color: 'amber' },
];

const MAINTENANCE_SCHEDULE = [
  { date: 'Jan 21, 2024', time: '2-4 AM EST' },
  { date: 'Feb 18, 2024', time: '2-4 AM EST' },
  { date: 'Mar 17, 2024', time: '2-4 AM EST' },
];

// === Outreach Templates ===
const OUTREACH_TEMPLATES = [
  {
    id: 1,
    type: 'Cold Email / Sequence Opener',
    icon: <MailIcon className="w-5 h-5" />,
    color: 'indigo',
    subject: 'Found a match between {{company}} and what we do',
    body: [
      'Hi {{lead_name}},',
      '',
      'I was looking at {{company}}\'s work in {{insights.industry_or_detail}}, and it struck me how much your focus on {{insights.pain_point_or_goal}} aligns with what we help companies like yours accomplish.',
      '',
      'We\'ve worked with similar teams to {{insights.hook_achievement_or_solution}}\u2014often seeing results like {{insights.results_or_metric}}.',
      '',
      'Would you be open to a brief 15-minute chat next week to explore whether there\'s a fit here?',
      '',
      'Best,',
      '[Your Name]',
      '[Your Role] | [Your Company]',
      '[Calendly link]',
    ],
  },
  {
    id: 2,
    type: 'Follow-Up / Value-Add Touch',
    icon: <RefreshIcon className="w-5 h-5" />,
    color: 'violet',
    subject: 'Re: Connecting {{insights.relevant_detail}}',
    body: [
      'Hi {{lead_name}},',
      '',
      'Following up on my last note\u2014I was revisiting {{company}}\'s recent {{insights.news_or_development}} and it reminded me of a case study where we helped [Similar Company] achieve {{insights.relevant_outcome}}.',
      '',
      'I\'ve attached a short overview below. If useful, I\'d be happy to walk through it together.',
      '',
      'When might you have 10 minutes free?',
      '',
      'Best,',
      '[Your Name]',
      '',
      'P.S. Here\'s the one-pager \u2192 [Link to relevant resource]',
    ],
  },
  {
    id: 3,
    type: 'Social / InMail Message',
    icon: <MessageIcon className="w-5 h-5" />,
    color: 'emerald',
    subject: '',
    body: [
      'Hi {{lead_name}},',
      '',
      'Came across your recent post about {{insights.topic_or_challenge}}\u2014great insights. At [Your Company], we specialize in helping {{insights.company_type}} tackle similar challenges, particularly around {{insights.specific_pain_point}}.',
      '',
      'I noticed {{company}} has been focusing on {{insights.company_initiative}}\u2014we\'ve seen interesting results when combining that with [Your Solution].',
      '',
      'If you\'re open to it, I\'d love to share a quick case study. No pressure at all.',
      '',
      'Cheers,',
      '[Your Name]',
      '[Your Company]',
    ],
  },
  {
    id: 4,
    type: 'Voicemail / Call Script',
    icon: <HelpCircleIcon className="w-5 h-5" />,
    color: 'amber',
    subject: '',
    body: [
      '"Hi {{lead_name}}, this is [Your Name] from [Your Company].',
      '',
      'I\'m reaching out because I saw that {{company}} recently {{insights.news_or_achievement}}\u2014congrats on that\u2014and it reminded me of how we helped [Client] achieve {{insights.relevant_result}}.',
      '',
      'I\'d love to share a quick insight with you. You can reach me at [Phone] or just reply to this email.',
      '',
      'Have a great day."',
    ],
  },
  {
    id: 5,
    type: 'Post-Meeting / Next-Step Follow-Up',
    icon: <CheckIcon className="w-5 h-5" />,
    color: 'rose',
    subject: 'As discussed: {{insights.next_step_topic}}',
    body: [
      'Hi {{lead_name}},',
      '',
      'Great speaking with you earlier. As promised, here\'s the [resource/material] we discussed regarding {{insights.discussion_point}}.',
      '',
      'Next steps, as I understand them:',
      '1. {{insights.action_item_1}}',
      '2. {{insights.action_item_2}}',
      '',
      'I\'ve also taken the liberty of scheduling {{next_step}} as discussed. Please let me know if you\'d prefer a different time.',
      '',
      'Looking forward,',
      '[Your Name]',
    ],
  },
];

const OUTREACH_TIPS = [
  { tip: 'Personalize beyond basics', desc: 'Mention a recent post, company milestone, or shared connection.' },
  { tip: 'Lead with value', desc: 'Frame your message around their challenge or goal.' },
  { tip: 'Be concise and clear', desc: 'Busy professionals appreciate brevity.' },
  { tip: 'Include a clear, low-effort CTA', desc: 'A short meeting, a relevant resource, or a specific question.' },
  { tip: 'Use AI insights authentically', desc: 'Don\'t overstate; simply connect dots between their situation and your solution.' },
];

const UserManualPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();
  const [activeSection, setActiveSection] = useState<SectionKey>('welcome');
  const [expandedAdvantage, setExpandedAdvantage] = useState<number | null>(1);

  const sections: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
    { key: 'welcome', label: 'Welcome', icon: <BookOpenIcon className="w-4 h-4" /> },
    { key: 'getting-started', label: 'Getting Started', icon: <ZapIcon className="w-4 h-4" /> },
    { key: 'lead-management', label: 'Lead Management', icon: <TargetIcon className="w-4 h-4" /> },
    { key: 'content-creation', label: 'Content Creation', icon: <EditIcon className="w-4 h-4" /> },
    { key: 'analytics-reporting', label: 'Analytics', icon: <PieChartIcon className="w-4 h-4" /> },
    { key: 'automation-workflows', label: 'Automation', icon: <GitBranchIcon className="w-4 h-4" /> },
    { key: 'team-collaboration', label: 'Team', icon: <UsersIcon className="w-4 h-4" /> },
    { key: 'integrations', label: 'Integrations', icon: <GlobeIcon className="w-4 h-4" /> },
    { key: 'troubleshooting', label: 'Troubleshooting', icon: <HelpCircleIcon className="w-4 h-4" /> },
    { key: 'advanced-features', label: 'Advanced', icon: <CogIcon className="w-4 h-4" /> },
    { key: 'training', label: 'Training', icon: <AcademicCapIcon className="w-4 h-4" /> },
    { key: 'outreach-templates', label: 'Outreach', icon: <MailIcon className="w-4 h-4" /> },
    { key: 'whats-next', label: 'What\'s Next', icon: <FlameIcon className="w-4 h-4" /> },
    { key: 'advantages', label: 'Competitive Edge', icon: <ShieldIcon className="w-4 h-4" /> },
    { key: 'features', label: 'Exclusive Features', icon: <SparklesIcon className="w-4 h-4" /> },
    { key: 'impact', label: 'Business Impact', icon: <TrendUpIcon className="w-4 h-4" /> },
    { key: 'future', label: 'Future-Ready', icon: <BoltIcon className="w-4 h-4" /> },
    { key: 'comparison', label: 'Why AuraFunnel', icon: <TargetIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <BookOpenIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">User Manual</h1>
            <p className="text-slate-500 text-sm">AuraFunnel AI Platform \u2014 Complete Reference Guide</p>
          </div>
        </div>
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap gap-1 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100">
        {sections.map(sec => (
          <button
            key={sec.key}
            onClick={() => setActiveSection(sec.key)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeSection === sec.key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {sec.icon}
            <span className="hidden sm:inline">{sec.label}</span>
          </button>
        ))}
      </div>

      {/* === SECTION: Welcome === */}
      {activeSection === 'welcome' && (
        <div className="space-y-6">
          {/* Hero */}
          <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-[2rem] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4"></div>
            <div className="relative">
              <p className="text-xs font-black text-indigo-200 uppercase tracking-[0.3em] mb-4">Welcome to AuraFunnel</p>
              <h2 className="text-3xl md:text-4xl font-black mb-4 leading-tight">
                The world's first AI-native<br />marketing platform
              </h2>
              <p className="text-indigo-100 text-lg max-w-2xl leading-relaxed">
                AuraFunnel thinks, learns, and grows with your business. It's not just a tool\u2014it's an AI co-pilot
                that predicts opportunities, creates personalized content, and continuously optimizes your marketing.
              </p>
            </div>
          </div>

          {/* Quick Start Timeline */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-6">Quick Start Timeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {QUICK_START.map((stage, idx) => (
                <div key={idx} className={`rounded-2xl border-2 border-${stage.color}-100 overflow-hidden`}>
                  <div className={`bg-${stage.color}-50 px-4 py-2.5 border-b border-${stage.color}-100`}>
                    <span className={`text-xs font-black text-${stage.color}-600 uppercase tracking-wider`}>{stage.period}</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {stage.tasks.map((task, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        <CheckIcon className={`w-3.5 h-3.5 text-${stage.color}-500 shrink-0`} />
                        <span className="text-xs text-slate-600 font-medium">{task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What makes this different */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">The Core Difference: AI-Native Architecture</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-50 rounded-xl p-5">
                <p className="text-xs font-black text-red-500 uppercase tracking-wider mb-3">Traditional Systems</p>
                <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 leading-relaxed">
                  <p className="text-slate-500">// Automation-focused: IF-THEN rules</p>
                  <p><span className="text-violet-400">if</span> (lead.submits_form) {'{'}</p>
                  <p className="pl-4">add_to_email_sequence();</p>
                  <p className="pl-4">update_crm();</p>
                  <p>{'}'}</p>
                </div>
              </div>
              <div className="bg-indigo-50 rounded-xl p-5 border-2 border-indigo-200">
                <p className="text-xs font-black text-indigo-600 uppercase tracking-wider mb-3">AuraFunnel</p>
                <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 leading-relaxed">
                  <p className="text-slate-500">// Intelligence-focused: understands context</p>
                  <p><span className="text-violet-400">const</span> aiPrediction = {'{'}</p>
                  <p className="pl-4"><span className="text-emerald-400">analyzes</span>: <span className="text-amber-300">"entire digital footprint"</span>,</p>
                  <p className="pl-4"><span className="text-emerald-400">predicts</span>: <span className="text-amber-300">"conversion probability"</span>,</p>
                  <p className="pl-4"><span className="text-emerald-400">creates</span>: <span className="text-amber-300">"personalized strategy"</span>,</p>
                  <p className="pl-4"><span className="text-emerald-400">learns</span>: <span className="text-amber-300">"from every interaction"</span></p>
                  <p>{'}'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* User Info */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Welcome, {user?.name || 'User'}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Plan: {user?.plan || 'Starter'} \u2022 Role: {user?.role || 'CLIENT'}</p>
                </div>
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Manual v3.1 \u2022 Jan 2024</span>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Getting Started === */}
      {activeSection === 'getting-started' && (
        <div className="space-y-6">
          {/* Chapter Header */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-1">
              <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">Chapter 1</span>
            </div>
            <h2 className="text-lg font-black text-slate-900">Getting Started</h2>
            <p className="text-sm text-slate-500 mt-0.5">First login, setup, and platform tour</p>
          </div>

          {/* 1.1 First Login & Setup */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-6">1.1 First Login & Setup</h3>
            <div className="space-y-4">
              {ONBOARDING_STEPS.map((step, idx) => (
                <div key={idx} className="flex items-start space-x-4">
                  {/* Step number + connector */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-indigo-200">
                      {step.step}
                    </div>
                    {idx < ONBOARDING_STEPS.length - 1 && (
                      <div className="w-0.5 h-6 bg-indigo-100 mt-1"></div>
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 pb-2">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <div className="flex items-center space-x-3 mb-1.5">
                        <span className="text-indigo-600">{step.icon}</span>
                        <p className="font-bold text-slate-900 text-sm uppercase">{step.title}</p>
                      </div>
                      <p className="text-sm text-slate-600">{step.desc}</p>
                      <p className="text-xs text-slate-400 mt-1.5 font-mono">{step.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dashboard Overview */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">Dashboard Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Main Navigation */}
              <div>
                <p className="text-xs font-black text-indigo-600 uppercase tracking-wider mb-3">Main Navigation Bar</p>
                <div className="bg-slate-900 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-800">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Top Bar</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {DASHBOARD_NAV_ITEMS.map((item, i) => (
                      <div key={i} className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
                        <span className="text-indigo-400">{item.icon}</span>
                        <div>
                          <span className="text-xs font-bold text-white">{item.label}</span>
                          <span className="text-[10px] text-slate-500 ml-2">{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick Action Panel */}
              <div>
                <p className="text-xs font-black text-emerald-600 uppercase tracking-wider mb-3">Quick Action Panel</p>
                <div className="bg-slate-900 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-800">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Right Panel</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {QUICK_ACTION_ITEMS.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
                        <div className="flex items-center space-x-3">
                          <span className="text-emerald-400">{item.icon}</span>
                          <span className="text-xs font-bold text-white">{item.label}</span>
                        </div>
                        <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-400">
                          {item.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 1.2 Platform Tour */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">1.2 Platform Tour \u2014 Key Areas</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* A. Control Center */}
              <div className="rounded-2xl border-2 border-indigo-100 overflow-hidden">
                <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100">
                  <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">A. Control Center</span>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    'Real-time AI insights',
                    'Priority notifications',
                    'Quick stats overview',
                    'System health monitor',
                  ].map((item, i) => (
                    <div key={i} className="flex items-center space-x-2.5">
                      <CheckIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="text-xs text-slate-600 font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* B. AI Assistant */}
              <div className="rounded-2xl border-2 border-violet-100 overflow-hidden">
                <div className="bg-violet-50 px-4 py-3 border-b border-violet-100">
                  <span className="text-xs font-black text-violet-600 uppercase tracking-wider">B. AI Assistant</span>
                </div>
                <div className="p-4">
                  <p className="text-xs text-slate-500 mb-3">
                    Click the <span className="font-bold text-violet-600">brain icon</span> anywhere to access
                  </p>
                  <div className="space-y-2.5">
                    {[
                      { prefix: 'Ask:', example: '"Show me hot leads from tech"' },
                      { prefix: 'Help:', example: '"How do I create an email sequence?"' },
                      { prefix: 'Ideas:', example: '"Give me content ideas for Q4"' },
                    ].map((item, i) => (
                      <div key={i} className="bg-violet-50/50 rounded-lg p-2.5">
                        <span className="text-[10px] font-black text-violet-500 uppercase">{item.prefix}</span>
                        <p className="text-xs text-slate-600 font-mono mt-0.5">{item.example}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* C. Smart Search */}
              <div className="rounded-2xl border-2 border-emerald-100 overflow-hidden">
                <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100">
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">C. Smart Search</span>
                </div>
                <div className="p-4">
                  <p className="text-xs text-slate-500 mb-3">
                    Type <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold">/</kbd> anywhere to open
                  </p>
                  <div className="space-y-2">
                    {SMART_SEARCH_EXAMPLES.map((item, i) => (
                      <div key={i} className="flex items-center justify-between bg-emerald-50/50 rounded-lg px-3 py-2">
                        <code className="text-xs font-mono font-bold text-emerald-700">{item.command}</code>
                        <span className="text-[10px] text-slate-500">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Layout Diagram */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-wider mb-5">Platform Layout Overview</h3>
            <div className="border border-slate-700 rounded-xl overflow-hidden">
              {/* Top Bar */}
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center space-x-4">
                  <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-xs font-black">A</div>
                  <div className="flex space-x-3">
                    {['Dashboard', 'Leads', 'Content', 'Analytics', 'Settings'].map((item, i) => (
                      <span key={i} className={`text-[10px] font-bold px-2 py-1 rounded ${i === 0 ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 rounded bg-slate-700 flex items-center justify-center">
                    <HelpCircleIcon className="w-3 h-3 text-slate-400" />
                  </div>
                  <div className="w-6 h-6 rounded bg-slate-700 flex items-center justify-center">
                    <BellIcon className="w-3 h-3 text-slate-400" />
                  </div>
                  <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[8px] font-black">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                </div>
              </div>
              {/* Main Area */}
              <div className="flex">
                {/* Sidebar hint */}
                <div className="w-16 bg-slate-800/50 border-r border-slate-700 p-2 space-y-2">
                  {[ChartIcon, TargetIcon, SparklesIcon, PieChartIcon, CogIcon].map((Icon, i) => (
                    <div key={i} className={`w-full aspect-square rounded-lg flex items-center justify-center ${i === 0 ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                      <Icon className="w-3 h-3 text-slate-300" />
                    </div>
                  ))}
                </div>
                {/* Content area */}
                <div className="flex-1 p-4">
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {['Quick Stats', 'AI Insights', 'Activity'].map((label, i) => (
                      <div key={i} className="bg-slate-800 rounded-lg p-3 text-center">
                        <div className="w-6 h-1.5 bg-slate-700 rounded-full mx-auto mb-1.5"></div>
                        <span className="text-[8px] text-slate-500 font-bold uppercase">{label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-800 rounded-lg p-3 h-16 flex items-center justify-center">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Main Content Area</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Lead Management === */}
      {activeSection === 'lead-management' && (
        <div className="space-y-6">
          {/* Chapter Header */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-1">
              <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">Chapter 2</span>
            </div>
            <h2 className="text-lg font-black text-slate-900">Lead Management</h2>
            <p className="text-sm text-slate-500 mt-0.5">AI scoring, importing leads, profiles, segmentation, and workflows</p>
          </div>

          {/* 2.1 AI Lead Scoring */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">2.1 Understanding AI Lead Scoring</h3>

            {/* Score Table */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Score</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Level</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Indicator</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Action Required</th>
                  </tr>
                </thead>
                <tbody>
                  {LEAD_SCORE_TIERS.map((tier, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-4 py-3 text-sm font-mono font-bold text-slate-900">{tier.range}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 bg-${tier.colorClass}-50 text-${tier.colorClass}-700 rounded-lg text-xs font-black`}>
                          {tier.level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`w-4 h-4 rounded-full bg-${tier.colorClass}-500`}></div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{tier.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* What AI Analyzes */}
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">What the AI Analyzes</h4>
            <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs text-slate-300 leading-loose overflow-x-auto">
              <p><span className="text-violet-400">const</span> leadAnalysis = {'{'}</p>
              <p className="pl-4"><span className="text-emerald-400">digitalFootprint</span>: {'{'}</p>
              <p className="pl-8">websiteVisits: <span className="text-amber-300">"Pages viewed, time spent"</span>,</p>
              <p className="pl-8">emailEngagement: <span className="text-amber-300">"Opens, clicks, replies"</span>,</p>
              <p className="pl-8">socialActivity: <span className="text-amber-300">"Company follows, shares"</span>,</p>
              <p className="pl-8">technologyStack: <span className="text-amber-300">"Tools they use (from website)"</span></p>
              <p className="pl-4">{'}'},</p>
              <p className="pl-4"><span className="text-emerald-400">companyData</span>: {'{'}</p>
              <p className="pl-8">fundingRounds: <span className="text-amber-300">"Recent investments"</span>,</p>
              <p className="pl-8">hiringPatterns: <span className="text-amber-300">"New roles being filled"</span>,</p>
              <p className="pl-8">newsMentions: <span className="text-amber-300">"Press releases, articles"</span>,</p>
              <p className="pl-8">growthSignals: <span className="text-amber-300">"LinkedIn follower growth"</span></p>
              <p className="pl-4">{'}'},</p>
              <p className="pl-4"><span className="text-emerald-400">behavioralPatterns</span>: {'{'}</p>
              <p className="pl-8">researchHabits: <span className="text-amber-300">"What content they consume"</span>,</p>
              <p className="pl-8">engagementTimes: <span className="text-amber-300">"When they're most active"</span>,</p>
              <p className="pl-8">buyingSignals: <span className="text-amber-300">"Competitor research, pricing visits"</span></p>
              <p className="pl-4">{'}'}</p>
              <p>{'}'};</p>
            </div>
          </div>

          {/* 2.2 Adding Leads */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">2.2 Adding Leads \u2014 4 Methods</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {LEAD_ADD_METHODS.map((method, idx) => (
                <div key={method.id} className="rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                      {method.icon}
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-indigo-500 uppercase">Method {idx + 1}</span>
                      <p className="text-sm font-bold text-slate-900">{method.title}</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-2.5">
                    {method.steps.map((step, i) => (
                      <div key={i} className="flex items-start space-x-2.5">
                        <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* API Code Example */}
            <div className="mt-5">
              <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">API Integration Example</p>
              <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs text-slate-300 leading-loose overflow-x-auto">
                <p className="text-slate-500">// Add lead via API with AI enrichment</p>
                <p><span className="text-violet-400">const</span> addLead = <span className="text-violet-400">async</span> (leadData) =&gt; {'{'}</p>
                <p className="pl-4"><span className="text-violet-400">const</span> response = <span className="text-violet-400">await</span> fetch(</p>
                <p className="pl-8"><span className="text-amber-300">'https://api.aura-funnel.com/v1/leads'</span>,</p>
                <p className="pl-8">{'{'}</p>
                <p className="pl-12">method: <span className="text-amber-300">'POST'</span>,</p>
                <p className="pl-12">headers: {'{'}</p>
                <p className="pl-16"><span className="text-amber-300">'Authorization'</span>: <span className="text-amber-300">'Bearer YOUR_API_KEY'</span>,</p>
                <p className="pl-16"><span className="text-amber-300">'Content-Type'</span>: <span className="text-amber-300">'application/json'</span>,</p>
                <p className="pl-16"><span className="text-amber-300">'X-AI-Research'</span>: <span className="text-amber-300">'true'</span> <span className="text-slate-500">// Enable AI enrichment</span></p>
                <p className="pl-12">{'}'},</p>
                <p className="pl-12">body: JSON.stringify({'{'}</p>
                <p className="pl-16">email: leadData.email,</p>
                <p className="pl-16">firstName: leadData.firstName,</p>
                <p className="pl-16">company: leadData.company</p>
                <p className="pl-12">{'}'})</p>
                <p className="pl-8">{'}'}</p>
                <p className="pl-4">);</p>
                <p className="pl-4"><span className="text-violet-400">return</span> response.json();</p>
                <p>{'}'};</p>
              </div>
            </div>

            {/* Pro Tip */}
            <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <div className="flex items-center space-x-2 mb-1">
                <LightBulbIcon className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-black text-amber-700 uppercase">Pro Tip</span>
              </div>
              <p className="text-xs text-amber-800">Use "AI Column Mapping" when importing CSV files \u2014 upload any CSV format, and the AI identifies and maps columns automatically. No manual header matching needed.</p>
            </div>
          </div>

          {/* 2.3 Lead Profile Deep Dive */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">2.3 Lead Profile Deep Dive</h3>

            <div className="bg-slate-900 rounded-2xl overflow-hidden text-white">
              {/* Profile Header */}
              <div className="p-5 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-lg font-black">
                      SJ
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-black text-lg">Sarah Johnson</p>
                        <div className="flex space-x-0.5">
                          {[1, 2, 3, 4].map(i => (
                            <svg key={i} className="w-3.5 h-3.5 text-amber-400 fill-current" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-slate-400">Director of Product \u2022 TechSolutions Inc.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-orange-400">84</p>
                    <p className="text-[10px] text-slate-500 font-black uppercase">AI Score</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="px-5 py-3 border-b border-slate-800 bg-slate-800/50">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Quick Actions</p>
                <div className="flex space-x-2">
                  {[
                    { label: 'Schedule Call', icon: <MessageIcon className="w-3 h-3" /> },
                    { label: 'Send Email', icon: <MailIcon className="w-3 h-3" /> },
                    { label: 'Chat Now', icon: <MessageIcon className="w-3 h-3" /> },
                    { label: 'Book Meeting', icon: <ClockIcon className="w-3 h-3" /> },
                  ].map((action, i) => (
                    <div key={i} className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-700 rounded-lg">
                      <span className="text-indigo-400">{action.icon}</span>
                      <span className="text-[10px] font-bold text-slate-300">{action.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Insights */}
              <div className="px-5 py-4 border-b border-slate-800">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-2.5">AI Insights (Generated 2 hours ago)</p>
                <div className="space-y-2">
                  {[
                    '"Sarah\'s team is hiring 3 AI engineers"',
                    '"Her company just raised $20M Series B"',
                    '"Engaged with our AI content 3x this week"',
                  ].map((insight, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <SparklesIcon className="w-3 h-3 text-indigo-400 shrink-0" />
                      <p className="text-xs text-slate-300">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Engagement Timeline */}
              <div className="px-5 py-4 border-b border-slate-800">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-wider mb-2.5">Engagement Timeline</p>
                <div className="space-y-2">
                  {[
                    { time: 'Today', event: 'Viewed pricing page (3x)' },
                    { time: 'Yesterday', event: 'Downloaded AI whitepaper' },
                    { time: '3 days ago', event: 'Attended webinar' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <span className="text-[10px] font-bold text-slate-500 w-20 shrink-0">{item.time}</span>
                      <span className="text-xs text-slate-300">{item.event}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="px-5 py-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {['#HotLead', '#Tech', '#SeriesB', '#Hiring'].map((tag, i) => (
                    <span key={i} className="px-2.5 py-1 bg-slate-800 text-indigo-400 rounded-lg text-[10px] font-bold">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 2.4 Smart Segmentation */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">2.4 Smart Segmentation</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Dynamic Segments */}
              <div>
                <p className="text-xs font-black text-indigo-600 uppercase tracking-wider mb-3">AI-Powered Dynamic Segments (Auto-updating)</p>
                <div className="space-y-2.5">
                  {DYNAMIC_SEGMENTS.map((seg, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 bg-${seg.color}-50 rounded-xl border border-${seg.color}-100`}>
                      <div>
                        <p className={`text-xs font-bold text-${seg.color}-700`}>{seg.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{seg.rule}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full bg-${seg.color}-500 animate-pulse`}></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manual Segments + Create */}
              <div>
                <p className="text-xs font-black text-violet-600 uppercase tracking-wider mb-3">Manual Segments</p>
                <div className="space-y-2.5 mb-5">
                  {[
                    { name: 'Q4 Campaign', desc: 'Manually added leads' },
                    { name: 'Conference 2024', desc: 'Imported attendee list' },
                    { name: 'Partner Referrals', desc: 'Specific source tracking' },
                  ].map((seg, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-violet-50 rounded-xl border border-violet-100">
                      <div>
                        <p className="text-xs font-bold text-violet-700">{seg.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{seg.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Create Segment Steps */}
                <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Creating a Segment</p>
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  {[
                    'Navigate: Leads \u2192 Segments \u2192 Create New',
                    'Name: "Enterprise Hot Leads"',
                    'Set conditions: Size > 200, Score > 70, Industry: Tech',
                    'AI Suggestion: "Add Funding > $10M condition"',
                    'Save \u2192 Segment auto-updates in real-time',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start space-x-2.5">
                      <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-black shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-xs text-slate-600">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 2.5 Lead Actions & Workflows */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">2.5 Lead Actions & Workflows</h3>

            {/* Action Categories */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {LEAD_ACTIONS.map((cat, i) => {
                const colors = ['indigo', 'violet', 'emerald'];
                const color = colors[i % colors.length];
                return (
                  <div key={i} className={`rounded-2xl border-2 border-${color}-100 overflow-hidden`}>
                    <div className={`bg-${color}-50 px-4 py-2.5 border-b border-${color}-100`}>
                      <span className={`text-xs font-black text-${color}-600 uppercase tracking-wider`}>{cat.category}</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {cat.items.map((item, j) => (
                        <div key={j} className="flex items-start space-x-2">
                          <CheckIcon className={`w-3.5 h-3.5 text-${color}-500 shrink-0 mt-0.5`} />
                          <span className="text-xs text-slate-600">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Workflow Example */}
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-4">Workflow Example: Hot Lead Follow-up</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Automated */}
              <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
                <div className="flex items-center space-x-2 mb-3">
                  <ZapIcon className="w-4 h-4 text-indigo-600" />
                  <p className="text-xs font-black text-indigo-600 uppercase tracking-wider">Automated Actions</p>
                </div>
                <p className="text-[10px] text-slate-500 mb-3 font-bold">When: Lead score reaches &gt; 75</p>
                <div className="space-y-2">
                  {[
                    'Add to "Priority Follow-up" list',
                    'Send AI-generated personalized email',
                    'Create task for sales rep',
                    'Schedule 24-hour follow-up reminder',
                    'Notify sales manager via Slack',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start space-x-2.5">
                      <div className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[10px] font-black shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-xs text-slate-700">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manual */}
              <div className="bg-violet-50 rounded-2xl p-5 border border-violet-100">
                <div className="flex items-center space-x-2 mb-3">
                  <UsersIcon className="w-4 h-4 text-violet-600" />
                  <p className="text-xs font-black text-violet-600 uppercase tracking-wider">Manual Actions (Rep does)</p>
                </div>
                <p className="text-[10px] text-slate-500 mb-3 font-bold">After automated actions complete</p>
                <div className="space-y-2">
                  {[
                    'Review AI insights on lead profile',
                    'Customize follow-up based on AI suggestions',
                    'Log call/meeting notes',
                    'Update lead status based on outcome',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start space-x-2.5">
                      <div className="w-5 h-5 rounded-full bg-violet-200 text-violet-700 flex items-center justify-center text-[10px] font-black shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-xs text-slate-700">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Content Creation (Chapter 3) === */}
      {activeSection === 'content-creation' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 3: Content Creation</h2>
            <p className="text-xs text-slate-500 mt-0.5">AI Content Studio — create, personalize, and optimize content at scale</p>
          </div>

          {/* 3.1 AI Content Studio */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50">
              <h3 className="text-sm font-black text-slate-900">3.1 AI Content Studio</h3>
              <p className="text-xs text-slate-500 mt-0.5">Access: Content → Create New → Select Type</p>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {CONTENT_TYPES.map(ct => (
                <div key={ct.title} className="bg-slate-50 rounded-xl p-4 text-center hover:bg-indigo-50 transition-colors group">
                  <span className="text-2xl block mb-2">{ct.icon}</span>
                  <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-700">{ct.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{ct.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 3.2 Creating Your First Email Sequence */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">3.2 Creating Your First Email Sequence</h3>
              <p className="text-xs text-slate-500 mt-0.5">Step-by-step guide from audience to send</p>
            </div>
            <div className="p-6 space-y-4">
              {EMAIL_SEQUENCE_STEPS.map(s => (
                <div key={s.step} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full bg-${s.color}-100 text-${s.color}-600 flex items-center justify-center text-sm font-black flex-shrink-0`}>
                      {s.step}
                    </div>
                    {s.step < EMAIL_SEQUENCE_STEPS.length && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 mb-2">{s.title}</p>
                    <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                      {s.details.map((d, i) => (
                        <div key={i} className="flex items-start space-x-2">
                          <span className="text-indigo-400 mt-0.5 flex-shrink-0">›</span>
                          <span className="text-xs text-slate-600">{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3.3 Advanced Content Features */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">3.3 Advanced Content Features</h3>
            </div>
            <div className="p-6 space-y-6">

              {/* A. Personalization Engine */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-black">A</div>
                  <h4 className="text-sm font-bold text-slate-900">Personalization Engine</h4>
                </div>
                <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed overflow-x-auto">
                  <p className="text-slate-500">{'// Beyond basic tags'}</p>
                  <p className="text-violet-400">{'const'} <span className="text-emerald-400">personalization</span> = {'{'}</p>
                  <p className="text-slate-500 pl-4">{'// Changes based on lead data'}</p>
                  <p className="text-amber-400 pl-4">dynamicContent: {'{'}</p>
                  <p className="text-sky-300 pl-8">"if": <span className="text-emerald-300">"company_size {'>'} 200"</span>,</p>
                  <p className="text-sky-300 pl-8">"show": <span className="text-emerald-300">"Enterprise pricing section"</span>,</p>
                  <p className="text-sky-300 pl-8">"else": <span className="text-emerald-300">"Show startup pricing"</span></p>
                  <p className="text-amber-400 pl-4">{'}'},</p>
                  <p className="text-slate-500 pl-4">{'// Content changes based on actions'}</p>
                  <p className="text-amber-400 pl-4">behavioralTriggers: {'{'}</p>
                  <p className="text-sky-300 pl-8">"if": <span className="text-emerald-300">"lead.downloaded_whitepaper"</span>,</p>
                  <p className="text-sky-300 pl-8">"include": <span className="text-emerald-300">"Related case study"</span></p>
                  <p className="text-amber-400 pl-4">{'}'},</p>
                  <p className="text-slate-500 pl-4">{'// AI tests and improves automatically'}</p>
                  <p className="text-amber-400 pl-4">aiOptimization: {'{'}</p>
                  <p className="text-sky-300 pl-8">"testVariations": <span className="text-orange-300">3</span>,</p>
                  <p className="text-sky-300 pl-8">"optimizeFor": <span className="text-emerald-300">"Click-through rate"</span>,</p>
                  <p className="text-sky-300 pl-8">"autoSelectWinner": <span className="text-orange-300">true</span></p>
                  <p className="text-amber-400 pl-4">{'}'}</p>
                  <p className="text-violet-400">{'}'};</p>
                </div>
              </div>

              {/* B. Multi-Channel Adaptation */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-black">B</div>
                  <h4 className="text-sm font-bold text-slate-900">Multi-Channel Adaptation</h4>
                </div>
                <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl p-5">
                  <p className="text-xs font-bold text-slate-700 mb-3">Create once, publish everywhere:</p>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="px-3 py-2 bg-white rounded-lg text-xs font-bold text-indigo-600 shadow-sm">1. Write blog article</div>
                    <span className="text-indigo-400 font-bold">→</span>
                    <div className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm">2. AI auto-creates:</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {MULTI_CHANNEL_OUTPUTS.map(output => (
                      <div key={output} className="flex items-center space-x-2 bg-white rounded-lg px-3 py-2 shadow-sm">
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-xs text-slate-700">{output}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* C. Content Performance Predictor */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-black">C</div>
                  <h4 className="text-sm font-bold text-slate-900">Content Performance Predictor</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3">Before sending, AI predicts:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PERFORMANCE_PREDICTIONS.map(pp => (
                    <div key={pp.metric} className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-indigo-200 transition-colors">
                      <div className="flex items-center space-x-2 mb-1.5">
                        <span className="text-indigo-500">{pp.icon}</span>
                        <p className="text-xs font-black text-slate-900">{pp.metric}</p>
                      </div>
                      <p className="text-xs text-slate-500 italic">"{pp.prediction}"</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3.4 Content Library & Templates */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">3.4 Content Library & Templates</h3>
            </div>
            <div className="p-6 space-y-6">

              {/* Smart Template System */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">AI-Generated Templates</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <div key={cat.label} className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs font-bold text-indigo-600 mb-2">{cat.label}</p>
                      <div className="space-y-1.5">
                        {cat.items.map(item => (
                          <div key={item} className="flex items-center space-x-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            <span className="text-xs text-slate-600">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Templates */}
              <div className="bg-gradient-to-r from-slate-50 to-indigo-50 rounded-xl p-5">
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Your Custom Templates</h4>
                <div className="space-y-2">
                  {['Save successful content as templates', 'AI suggests improvements to old templates', 'Version control and performance tracking'].map(item => (
                    <div key={item} className="flex items-center space-x-2">
                      <CheckIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span className="text-xs text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Content Calendar */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Content Calendar</h4>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">Content → Calendar</span>
                </div>
                <div className="bg-slate-900 rounded-xl p-5">
                  <div className="grid grid-cols-7 gap-1 mb-3">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                      <div key={day} className="text-center text-[9px] font-bold text-slate-500 uppercase">{day}</div>
                    ))}
                    {Array.from({ length: 28 }, (_, i) => (
                      <div key={i} className={`text-center py-1.5 rounded-lg text-[10px] font-bold ${
                        [2, 8, 14, 21].includes(i) ? 'bg-indigo-600 text-white' :
                        [5, 11, 18, 25].includes(i) ? 'bg-violet-600/30 text-violet-300' :
                        'text-slate-600 hover:bg-slate-800'
                      }`}>
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-800">
                    <div className="flex items-center space-x-1.5"><div className="w-2.5 h-2.5 rounded bg-indigo-600" /><span className="text-[10px] text-slate-400">Email</span></div>
                    <div className="flex items-center space-x-1.5"><div className="w-2.5 h-2.5 rounded bg-violet-600" /><span className="text-[10px] text-slate-400">Social</span></div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CALENDAR_FEATURES.map(feat => (
                    <div key={feat} className="flex items-center space-x-2 bg-slate-50 rounded-lg px-3 py-2">
                      <CheckIcon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                      <span className="text-xs text-slate-600">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3.5 Mobile Content Creation */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center space-x-2">
                <span className="text-lg">📱</span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">3.5 Mobile Content Creation</h3>
                  <p className="text-xs text-slate-500 mt-0.5">On-the-go editing — create anywhere, anytime</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Mobile Features */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Mobile-Specific Features</h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {MOBILE_FEATURES.map(feat => (
                    <div key={feat.title} className="bg-slate-50 rounded-xl p-4 text-center hover:bg-amber-50 transition-colors group">
                      <span className="text-2xl block mb-2">{feat.icon}</span>
                      <p className="text-xs font-bold text-slate-800 group-hover:text-amber-700">{feat.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{feat.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile Workflow Example */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Mobile Workflow Example</h4>
                <div className="bg-slate-900 rounded-xl p-5">
                  <div className="space-y-3">
                    {MOBILE_WORKFLOW_STEPS.map(s => (
                      <div key={s.step} className="flex items-center space-x-3">
                        <div className={`w-7 h-7 rounded-full bg-${s.color}-500/20 text-${s.color}-400 flex items-center justify-center text-xs font-black flex-shrink-0`}>
                          {s.step}
                        </div>
                        <span className="text-xs text-slate-300">{s.text}</span>
                        {s.step < MOBILE_WORKFLOW_STEPS.length && <span className="text-slate-600 flex-shrink-0">→</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <p className="text-[10px] text-indigo-400 font-bold">Total time from notification to scheduled post: ~2 minutes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3.6 Measuring Success */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center space-x-2">
                <TrendUpIcon className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900">3.6 Measuring Success</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Key metrics to watch and optimization timeline</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Email & Social Metrics Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Email Metrics */}
                <div>
                  <h4 className="text-xs font-black text-indigo-600 uppercase tracking-wider mb-3">Email Content Benchmarks</h4>
                  <div className="bg-slate-50 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="px-4 py-2.5 text-left font-black text-slate-700">Metric</th>
                          <th className="px-4 py-2.5 text-center font-black text-emerald-600">Good</th>
                          <th className="px-4 py-2.5 text-center font-black text-indigo-600">Excellent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {EMAIL_METRICS.map(m => (
                          <tr key={m.metric} className="border-b border-slate-100 last:border-0">
                            <td className="px-4 py-2.5 font-bold text-slate-800">{m.metric}</td>
                            <td className="px-4 py-2.5 text-center text-emerald-600 font-bold">{m.good}</td>
                            <td className="px-4 py-2.5 text-center text-indigo-600 font-bold">{m.excellent}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Social Metrics */}
                <div>
                  <h4 className="text-xs font-black text-violet-600 uppercase tracking-wider mb-3">Social Content Benchmarks</h4>
                  <div className="bg-slate-50 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="px-4 py-2.5 text-left font-black text-slate-700">Metric</th>
                          <th className="px-4 py-2.5 text-center font-black text-emerald-600">Good</th>
                          <th className="px-4 py-2.5 text-center font-black text-violet-600">Excellent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SOCIAL_METRICS.map(m => (
                          <tr key={m.metric} className="border-b border-slate-100 last:border-0">
                            <td className="px-4 py-2.5 font-bold text-slate-800">{m.metric}</td>
                            <td className="px-4 py-2.5 text-center text-emerald-600 font-bold">{m.good}</td>
                            <td className="px-4 py-2.5 text-center text-violet-600 font-bold">{m.excellent}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Optimization Timeline */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Optimization Timeline</h4>
                <div className="relative">
                  <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-200" />
                  <div className="space-y-3">
                    {OPTIMIZATION_TIMELINE.map((item, idx) => (
                      <div key={idx} className="relative pl-10 flex items-center">
                        <div className={`absolute left-1.5 w-4 h-4 rounded-full border-2 border-white bg-${item.color}-500 shadow`} />
                        <div className="flex-1 flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                          <span className={`text-xs font-black text-${item.color}-600 w-28 flex-shrink-0`}>{item.time}</span>
                          <span className="text-xs text-slate-600 flex-1">{item.task}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3.7 "Create New" — Complete Step-by-Step Walkthrough */}
          <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                    <SparklesIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">3.7 "Create New" — Complete Click-by-Click Walkthrough</h3>
                    <p className="text-xs text-slate-500 mt-0.5">9-step guide from first click to live campaign</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-wider">Interactive Guide</span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {CREATE_NEW_STEPS.map(s => (
                <div key={s.step} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-xl bg-${s.color}-100 text-${s.color}-600 flex items-center justify-center text-sm font-black flex-shrink-0 shadow-sm`}>
                      {s.step}
                    </div>
                    {s.step < CREATE_NEW_STEPS.length && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                  </div>
                  <div className="pb-5 flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{s.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 mb-3">{s.desc}</p>
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                      {s.details.map((d, i) => (
                        <div key={i} className="flex items-start space-x-2">
                          <span className={`text-${s.color}-400 mt-0.5 flex-shrink-0 font-bold`}>›</span>
                          <span className="text-xs text-slate-600">{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3.8 After Creation — What Happens Next */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">3.8 After Creation — What Happens Next</h3>
              <p className="text-xs text-slate-500 mt-0.5">Post-creation monitoring, optimization, and analysis</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Post-Creation Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {POST_CREATION_TIMELINE.map(period => (
                  <div key={period.period} className={`rounded-2xl border-2 border-${period.color}-100 overflow-hidden`}>
                    <div className={`bg-${period.color}-50 px-5 py-3 border-b border-${period.color}-100`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black text-${period.color}-600 uppercase tracking-wider`}>{period.period}</span>
                        <span className={`px-2 py-0.5 bg-${period.color}-100 text-${period.color}-700 rounded-full text-[10px] font-black`}>{period.title}</span>
                      </div>
                    </div>
                    <div className="p-5 space-y-2.5">
                      {period.tasks.map((task, idx) => (
                        <div key={idx} className="flex items-start space-x-2">
                          <CheckIcon className={`w-3.5 h-3.5 text-${period.color}-500 flex-shrink-0 mt-0.5`} />
                          <span className="text-xs text-slate-600">{task}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Optimization After 24 Hours */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center space-x-2 mb-4">
                  <BoltIcon className="w-5 h-5 text-indigo-200" />
                  <h4 className="text-xs font-black text-indigo-200 uppercase tracking-wider">AI Optimization (After 24 Hours)</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-xs font-bold text-indigo-200 mb-1">Analysis</p>
                    <p className="text-[11px] text-indigo-100">AI identifies lowest-performing email and suggests improvements</p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-xs font-bold text-indigo-200 mb-1">Recommendation</p>
                    <p className="text-[11px] text-indigo-100">Update subject lines, add ROI metrics, test with 50% audience</p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-xs font-bold text-indigo-200 mb-1">Expected Impact</p>
                    <p className="text-[11px] text-indigo-100">+15% open rate, +8% click rate, +2 more demos booked</p>
                  </div>
                </div>
              </div>

              {/* Pro Tips */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Pro Tips for Your Next Creation</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {CONTENT_PRO_TIPS.map((tip, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-4 hover:bg-indigo-50 transition-colors group">
                      <div className="flex items-center space-x-2 mb-2">
                        <LightBulbIcon className="w-4 h-4 text-amber-500" />
                        <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-700">{tip.title}</p>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{tip.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3.9 Getting Started Today */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-rose-50 to-pink-50">
              <div className="flex items-center space-x-2">
                <BoltIcon className="w-5 h-5 text-rose-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900">3.9 Getting Started Today</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Your first 30 minutes and beginner project plan</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* First 30 Minutes */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Your First 30 Minutes in Content Studio</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {FIRST_30_MINUTES.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-4 text-center hover:bg-rose-50 transition-colors group">
                      <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-2 group-hover:bg-rose-200 transition-colors">
                        {item.icon}
                      </div>
                      <p className="text-[10px] font-black text-rose-600 mb-1">{item.range}</p>
                      <p className="text-xs text-slate-600 font-medium leading-tight">{item.task}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Beginner Week */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Beginner Project: First Week</h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {BEGINNER_WEEK.map((day, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs font-black text-indigo-600 mb-2">{day.day}</p>
                      <div className="space-y-1.5">
                        {day.tasks.map((task, i) => (
                          <div key={i} className="flex items-start space-x-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                            <span className="text-[11px] text-slate-600">{task}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Help FAQ */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Quick Help</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {CONTENT_FAQ.map((faq, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-xs font-bold text-slate-900 mb-1.5">Q: {faq.q}</p>
                      <p className="text-xs text-indigo-600 font-medium">A: {faq.a}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA Banner */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl">
                <div className="text-center">
                  <h4 className="text-sm font-black mb-2">Ready to create your first piece?</h4>
                  <p className="text-xs text-slate-400 mb-4 max-w-lg mx-auto">
                    The more you use Content Studio, the better it learns your style and preferences. Your first few pieces might need more editing, but within a week, you'll see dramatically better results with less effort.
                  </p>
                  <div className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-900/30">
                    <SparklesIcon className="w-4 h-4" />
                    <span className="text-sm font-bold">Content → Create New → Follow the steps above</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Analytics & Reporting (Chapter 4) === */}
      {activeSection === 'analytics-reporting' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 4: Analytics & Reporting</h2>
            <p className="text-xs text-slate-500 mt-0.5">Real-time dashboards, custom reports, AI insights, and smart alerts</p>
          </div>

          {/* 4.1 Executive Dashboard */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <h3 className="text-sm font-black text-slate-900">4.1 Real-Time Executive Dashboard</h3>
              <p className="text-xs text-slate-500 mt-0.5">Live metrics at a glance — updated in real time</p>
            </div>
            <div className="p-6">
              <div className="bg-slate-900 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Executive Dashboard — Today</p>
                  <span className="text-[9px] text-emerald-400 font-bold flex items-center space-x-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span>LIVE</span></span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {EXEC_DASHBOARD_METRICS.map(group => (
                    <div key={group.category} className="bg-slate-800/60 rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <span className={`text-${group.color}-400`}>{group.icon}</span>
                        <p className={`text-[10px] font-black text-${group.color}-400 uppercase tracking-wider`}>{group.category}</p>
                      </div>
                      <div className="space-y-2">
                        {group.items.map(item => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">{item.label}</span>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-white">{item.value}</span>
                              {item.trend && <span className="text-[9px] text-emerald-400">{item.trend}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 4.2 Custom Reports */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">4.2 Custom Reports</h3>
              <p className="text-xs text-slate-500 mt-0.5">Standard and custom report builder</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Standard Reports */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Standard Reports</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {STANDARD_REPORTS.map(r => (
                    <div key={r.name} className="bg-slate-50 rounded-xl p-4 text-center hover:bg-indigo-50 transition-colors group">
                      <div className="w-8 h-8 mx-auto rounded-lg bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center text-indigo-600 mb-2">{r.icon}</div>
                      <p className="text-xs font-bold text-slate-800">{r.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{r.schedule}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Report Types */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Custom Report Types</h4>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_REPORT_TYPES.map(t => (
                    <span key={t} className="px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-bold rounded-lg">{t}</span>
                  ))}
                </div>
              </div>

              {/* Building a Report - Step by Step */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Creating a Custom Report</h4>
                <div className="bg-slate-50 rounded-xl p-5 space-y-3">
                  {[
                    { step: 1, text: 'Navigate: Analytics → Reports → Create New' },
                    { step: 2, text: 'Choose Template: Start with AI-suggested or blank' },
                    { step: 3, text: 'Add Widgets to your report' },
                    { step: 4, text: 'Set Filters: Date Range, User/Team, Segments, Campaigns' },
                    { step: 5, text: 'Schedule: Auto-generate and email daily/weekly/monthly' },
                  ].map(s => (
                    <div key={s.step} className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">{s.step}</div>
                      <span className="text-xs text-slate-700 pt-0.5">{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Available Widgets */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Available Widgets</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {REPORT_WIDGETS.map(w => (
                    <div key={w} className="flex items-center space-x-2 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                      <CheckIcon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                      <span className="text-xs text-slate-600">{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 4.3 AI Insights Panel */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-yellow-50">
              <div className="flex items-center space-x-2">
                <LightBulbIcon className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black text-slate-900">4.3 AI Insights Panel</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Access: Click lightbulb icon in any dashboard</p>
            </div>
            <div className="p-6 space-y-3">
              {AI_INSIGHT_SAMPLES.map(insight => (
                <div key={insight.type} className={`bg-${insight.color}-50 border border-${insight.color}-100 rounded-xl p-4`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`text-${insight.color}-600`}>{insight.icon}</span>
                    <p className={`text-xs font-black text-${insight.color}-700 uppercase tracking-wider`}>{insight.type}</p>
                  </div>
                  <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">"{insight.message}"</div>
                </div>
              ))}
            </div>
          </div>

          {/* 4.4 Alert System Configuration */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">4.4 Alert System Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Navigation: Analytics → Alerts → Create New</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Alert Types */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Alert Types</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ALERT_TYPES.map(a => (
                    <div key={a.name} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-xs font-bold text-slate-900">{a.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{a.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Methods */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Delivery Methods</h4>
                <div className="space-y-2">
                  {ALERT_DELIVERY.map(d => (
                    <div key={d.method} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5">
                      <div className="flex items-center space-x-2">
                        <CheckIcon className={`w-3.5 h-3.5 ${d.enabled ? 'text-emerald-500' : 'text-slate-300'} flex-shrink-0`} />
                        <span className="text-xs font-medium text-slate-700">{d.method}</span>
                      </div>
                      {d.note && <span className="text-[10px] text-slate-400">{d.note}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Smart Alert Example */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Smart Alert Example</h4>
                <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed">
                  <p className="text-indigo-400 font-bold mb-2">Alert: "Critical Lead Engagement"</p>
                  <p className="text-slate-500 mb-1">Conditions:</p>
                  <p className="text-emerald-300 pl-4">- Lead Score: Increases from {'<'} 50 to {'>'} 80</p>
                  <p className="text-emerald-300 pl-4">- Activity: Viewed pricing page 3+ times</p>
                  <p className="text-emerald-300 pl-4">- Timeframe: Within 24 hours</p>
                  <p className="text-slate-500 mt-2 mb-1">Actions:</p>
                  <p className="text-amber-300 pl-4">- Notify: Primary sales rep + sales manager</p>
                  <p className="text-amber-300 pl-4">- Create: Urgent follow-up task</p>
                  <p className="text-amber-300 pl-4">- Add: To "Immediate Action" list</p>
                  <p className="text-red-400 pl-4 font-bold mt-1">- Priority: HIGH (Red alert)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Automation & Workflows (Chapter 5) === */}
      {activeSection === 'automation-workflows' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 5: Automation & Workflows</h2>
            <p className="text-xs text-slate-500 mt-0.5">Visual workflow builder, conditional logic, AI suggestions, and self-optimizing paths</p>
          </div>

          {/* 5.1 Visual Workflow Builder */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <h3 className="text-sm font-black text-slate-900">5.1 Visual Workflow Builder</h3>
              <p className="text-xs text-slate-500 mt-0.5">Access: Automation → Workflows → Create New</p>
            </div>
            <div className="p-6">
              <p className="text-xs font-bold text-slate-700 mb-4">Sample Workflow: New Lead Nurturing</p>
              <div className="bg-slate-900 rounded-xl p-5 space-y-0">
                {WORKFLOW_STEPS.map((step, i) => (
                  <div key={step.action}>
                    <div className={`flex items-start space-x-3 ${
                      step.type === 'trigger' ? '' : ''
                    }`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-black ${
                        step.type === 'trigger' ? 'bg-emerald-500/20 text-emerald-400' :
                        step.type === 'condition' ? 'bg-amber-500/20 text-amber-400' :
                        step.type === 'wait' ? 'bg-slate-700 text-slate-400' :
                        step.type === 'branch' ? 'bg-violet-500/20 text-violet-400' :
                        'bg-indigo-500/20 text-indigo-400'
                      }`}>
                        {step.type === 'trigger' ? '⚡' : step.type === 'wait' ? '⏳' : step.type === 'branch' ? '🔀' : '▶'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{step.action}</p>
                        <p className="text-xs text-white font-medium">{step.desc}</p>
                        {step.branches && (
                          <div className="mt-2 space-y-1 pl-3 border-l-2 border-slate-700">
                            {step.branches.map(b => (
                              <p key={b} className="text-[11px] text-slate-400">
                                <span className={b.startsWith('Yes') ? 'text-emerald-400' : 'text-rose-400'}>├─</span> {b}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {i < WORKFLOW_STEPS.length - 1 && (
                      <div className="ml-4 h-5 border-l-2 border-dashed border-slate-700" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 5.2 Conditional Logic Builder */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">5.2 Conditional Logic Builder</h3>
              <p className="text-xs text-slate-500 mt-0.5">Multi-path workflows with smart conditions</p>
            </div>
            <div className="p-6 space-y-4">
              {/* Code Block */}
              <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed overflow-x-auto">
                <p className="text-slate-500">{'// Example: Multi-path workflow'}</p>
                <p className="text-violet-400">if <span className="text-white">(</span><span className="text-sky-300">lead.score {'>'} 75</span> <span className="text-white">&&</span> <span className="text-sky-300">lead.company_size {'>'} 200</span><span className="text-white">)</span> {'{'}</p>
                <p className="text-slate-500 pl-4">{'// Enterprise hot lead path'}</p>
                <p className="text-amber-400 pl-4">actions = [</p>
                <p className="text-emerald-300 pl-8">"assign_to_enterprise_team",</p>
                <p className="text-emerald-300 pl-8">"send_enterprise_case_study",</p>
                <p className="text-emerald-300 pl-8">"schedule_executive_briefing"</p>
                <p className="text-amber-400 pl-4">];</p>
                <p className="text-violet-400">{'}'} else if <span className="text-white">(</span><span className="text-sky-300">lead.score {'>'} 60</span> <span className="text-white">&&</span> <span className="text-sky-300">lead.industry == "tech"</span><span className="text-white">)</span> {'{'}</p>
                <p className="text-slate-500 pl-4">{'// Tech warm lead path'}</p>
                <p className="text-amber-400 pl-4">actions = [</p>
                <p className="text-emerald-300 pl-8">"send_tech_whitepaper",</p>
                <p className="text-emerald-300 pl-8">"invite_to_webinar",</p>
                <p className="text-emerald-300 pl-8">"nurture_for_14_days"</p>
                <p className="text-amber-400 pl-4">];</p>
                <p className="text-violet-400">{'}'} else {'{'}</p>
                <p className="text-slate-500 pl-4">{'// General nurture path'}</p>
                <p className="text-amber-400 pl-4">actions = [</p>
                <p className="text-emerald-300 pl-8">"add_to_newsletter",</p>
                <p className="text-emerald-300 pl-8">"educate_with_content",</p>
                <p className="text-emerald-300 pl-8">"score_based_followup"</p>
                <p className="text-amber-400 pl-4">];</p>
                <p className="text-violet-400">{'}'}</p>
              </div>

              {/* Visual Path Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CONDITIONAL_PATHS.map(path => (
                  <div key={path.label} className={`bg-${path.color}-50 rounded-xl p-4 border border-${path.color}-100`}>
                    <p className={`text-[10px] font-black text-${path.color}-600 uppercase tracking-wider mb-1`}>{path.label}</p>
                    <p className="text-[10px] text-slate-500 font-mono mb-3">{path.condition}</p>
                    <div className="space-y-1.5">
                      {path.actions.map(a => (
                        <div key={a} className="flex items-center space-x-2">
                          <span className={`text-${path.color}-400`}>›</span>
                          <span className="text-xs text-slate-700">{a.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 5.3 AI-Powered Automation Suggestions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-yellow-50">
              <div className="flex items-center space-x-2">
                <SparklesIcon className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black text-slate-900">5.3 AI-Powered Automation Suggestions</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Access: Automation → AI Suggestions</p>
            </div>
            <div className="p-6 space-y-3">
              {AI_AUTOMATION_SUGGESTIONS.map(s => (
                <div key={s.id} className={`bg-${s.color}-50 border border-${s.color}-100 rounded-xl p-4`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <SparklesIcon className={`w-4 h-4 text-${s.color}-600`} />
                    <p className={`text-xs font-black text-${s.color}-700 uppercase tracking-wider`}>AI Recommendation #{s.id}</p>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">"{s.message}"</p>
                </div>
              ))}
            </div>
          </div>

          {/* 5.4 Advanced Automation Features */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">5.4 Advanced Automation Features</h3>
            </div>
            <div className="p-6 space-y-6">

              {/* A. Predictive Timing */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-black">A</div>
                  <h4 className="text-sm font-bold text-slate-900">Predictive Timing</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3">AI determines optimal timing for each lead:</p>
                <div className="grid grid-cols-2 gap-2">
                  {PREDICTIVE_TIMING_FEATURES.map(f => (
                    <div key={f} className="flex items-center space-x-2 bg-indigo-50 rounded-lg px-3 py-2.5">
                      <ClockIcon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                      <span className="text-xs text-slate-700">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* B. Dynamic Content Paths */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-black">B</div>
                  <h4 className="text-sm font-bold text-slate-900">Dynamic Content Paths</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3">Leads automatically receive different content based on:</p>
                <div className="grid grid-cols-2 gap-2">
                  {DYNAMIC_CONTENT_TRIGGERS.map(t => (
                    <div key={t} className="flex items-center space-x-2 bg-violet-50 rounded-lg px-3 py-2.5">
                      <GitBranchIcon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                      <span className="text-xs text-slate-700">{t}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* C. Self-Optimizing Workflows */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-black">C</div>
                  <h4 className="text-sm font-bold text-slate-900">Self-Optimizing Workflows</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3">Workflows that improve themselves:</p>
                <div className="bg-slate-900 rounded-xl p-5 space-y-2">
                  {SELF_OPTIMIZING_STEPS.map((s, i) => (
                    <div key={s} className="flex items-center space-x-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black flex-shrink-0">{i + 1}</div>
                      <span className="text-xs text-slate-300">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Team Collaboration (Chapter 6) === */}
      {activeSection === 'team-collaboration' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 6: Team Collaboration</h2>
            <p className="text-xs text-slate-500 mt-0.5">User roles, team dashboards, lead assignment, and collaboration tools</p>
          </div>

          {/* 6.1 User Roles & Permissions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <h3 className="text-sm font-black text-slate-900">6.1 User Roles & Permissions</h3>
              <p className="text-xs text-slate-500 mt-0.5">5 configurable roles with granular access control</p>
            </div>
            <div className="p-6 space-y-3">
              {USER_ROLES.map(r => (
                <div key={r.role} className={`bg-${r.color}-50 border border-${r.color}-100 rounded-xl p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <UsersIcon className={`w-4 h-4 text-${r.color}-600`} />
                      <p className={`text-sm font-bold text-${r.color}-900`}>{r.role}</p>
                    </div>
                    <span className={`text-[10px] font-black text-${r.color}-600 bg-${r.color}-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider`}>{r.tag}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {r.permissions.map(p => (
                      <div key={p} className="flex items-center space-x-2">
                        <CheckIcon className={`w-3 h-3 ${p.startsWith('No') || p.startsWith('Limited') ? 'text-slate-300' : `text-${r.color}-500`} flex-shrink-0`} />
                        <span className="text-xs text-slate-700">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6.2 Team Dashboard */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">6.2 Team Dashboard</h3>
              <p className="text-xs text-slate-500 mt-0.5">Centralized team performance and collaboration hub</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TEAM_DASHBOARD_FEATURES.map(f => (
                  <div key={f} className="bg-slate-50 rounded-xl p-4 text-center hover:bg-indigo-50 transition-colors group">
                    <CheckIcon className="w-5 h-5 text-indigo-500 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-medium text-slate-700">{f}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6.3 Collaboration Tools */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">6.3 Collaboration Tools</h3>
            </div>
            <div className="p-6 space-y-6">

              {/* A. Lead Assignment */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-black">A</div>
                  <h4 className="text-sm font-bold text-slate-900">Lead Assignment</h4>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-slate-700 mb-2">Assignment Methods</p>
                    <div className="space-y-2">
                      {LEAD_ASSIGNMENT_METHODS.map((m, i) => (
                        <div key={m.method} className="flex items-center space-x-3 bg-slate-50 rounded-lg px-4 py-2.5">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-black flex-shrink-0">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-slate-900">{m.method}</span>
                            <span className="text-xs text-slate-400 ml-2">— {m.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700 mb-2">Smart Features</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {ASSIGNMENT_FEATURES.map(f => (
                        <div key={f} className="flex items-center space-x-2 bg-indigo-50 rounded-lg px-3 py-2.5">
                          <ShieldIcon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                          <span className="text-xs text-slate-700">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* B. Shared Notes & Activities */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-black">B</div>
                  <h4 className="text-sm font-bold text-slate-900">Shared Notes & Activities</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3">On any lead profile:</p>
                <div className="bg-slate-900 rounded-xl p-5 space-y-2">
                  {SHARED_NOTES_ACTIONS.map(a => (
                    <div key={a} className="flex items-center space-x-3">
                      <span className="text-violet-400 text-xs">›</span>
                      <span className="text-xs text-slate-300">{a}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* C. Team Notifications */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-black">C</div>
                  <h4 className="text-sm font-bold text-slate-900">Team Notifications</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3">Configurable alerts:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TEAM_NOTIFICATION_TYPES.map(n => (
                    <div key={n} className="flex items-center space-x-2 bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-100">
                      <BellIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <span className="text-xs text-slate-700">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Integrations (Chapter 7) === */}
      {activeSection === 'integrations' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 7: Integrations</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pre-built connectors, API access, and webhook configuration</p>
          </div>

          {/* 7.1 Available Integrations */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <h3 className="text-sm font-black text-slate-900">7.1 Available Integrations</h3>
              <p className="text-xs text-slate-500 mt-0.5">20+ pre-built connectors across 4 categories</p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {INTEGRATION_CATEGORIES.map(cat => (
                <div key={cat.category} className={`bg-${cat.color}-50 border border-${cat.color}-100 rounded-xl p-4`}>
                  <p className={`text-xs font-black text-${cat.color}-700 uppercase tracking-wider mb-3`}>{cat.category}</p>
                  <div className="space-y-2">
                    {cat.items.map(item => (
                      <div key={item} className="flex items-center space-x-2">
                        <CheckIcon className={`w-3.5 h-3.5 text-${cat.color}-500 flex-shrink-0`} />
                        <span className="text-xs text-slate-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 7.2 Setting Up Integrations */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">7.2 Setting Up Integrations</h3>
              <p className="text-xs text-slate-500 mt-0.5">Example: Salesforce Integration</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Setup Steps */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Step-by-Step Setup</p>
                <div className="space-y-2">
                  {SALESFORCE_SETUP_STEPS.map((s, i) => (
                    <div key={s} className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">{i + 1}</div>
                      <span className="text-xs text-slate-700 pt-0.5">{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sync Config */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Sync Configuration Options</p>
                <div className="grid grid-cols-2 gap-2">
                  {SYNC_OPTIONS.map(o => (
                    <div key={o.label} className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{o.label}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{o.options}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* API Access Code Block */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">API Access</p>
                <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed overflow-x-auto">
                  <p className="text-slate-500">{'// Getting your API key'}</p>
                  <p className="text-slate-400">1. Settings → API → Generate New Key</p>
                  <p className="text-slate-400">2. Set permissions (Read, Write, Admin)</p>
                  <p className="text-slate-400 mb-3">3. Copy key (Only shown once!)</p>
                  <p className="text-slate-500">{'// Using the API'}</p>
                  <p className="text-violet-400">const <span className="text-emerald-400">headers</span> = {'{'}</p>
                  <p className="text-sky-300 pl-4">'Authorization': <span className="text-emerald-300">'Bearer YOUR_API_KEY'</span>,</p>
                  <p className="text-sky-300 pl-4">'Content-Type': <span className="text-emerald-300">'application/json'</span>,</p>
                  <p className="text-sky-300 pl-4">'X-AI-Enabled': <span className="text-emerald-300">'true'</span></p>
                  <p className="text-violet-400">{'}'};</p>
                  <p className="text-white mt-3" />
                  <p className="text-slate-500">{'// Example: Create lead via API'}</p>
                  <p className="text-amber-400">fetch<span className="text-white">(</span><span className="text-emerald-300">'https://api.aura-funnel.com/v1/leads'</span>, {'{'}</p>
                  <p className="text-sky-300 pl-4">method: <span className="text-emerald-300">'POST'</span>,</p>
                  <p className="text-sky-300 pl-4">headers: <span className="text-emerald-400">headers</span>,</p>
                  <p className="text-sky-300 pl-4">body: <span className="text-amber-400">JSON.stringify</span>({'{'} <span className="text-sky-300">email</span>: <span className="text-emerald-300">'lead@company.com'</span> {'}'})</p>
                  <p className="text-amber-400">{'}'});</p>
                </div>
              </div>
            </div>
          </div>

          {/* 7.3 Webhook Configuration */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">7.3 Webhook Configuration</h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Setup Steps */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Setting Up Webhooks</p>
                <div className="space-y-2">
                  {WEBHOOK_SETUP_STEPS.map((s, i) => (
                    <div key={s} className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">{i + 1}</div>
                      <span className="text-xs text-slate-700 pt-0.5">{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample Webhook Payload */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Sample Webhook Payload</p>
                <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed overflow-x-auto">
                  <p className="text-white">{'{'}</p>
                  <p className="text-sky-300 pl-4">"event": <span className="text-emerald-300">"lead.created"</span>,</p>
                  <p className="text-sky-300 pl-4">"timestamp": <span className="text-emerald-300">"2024-01-15T10:30:00Z"</span>,</p>
                  <p className="text-sky-300 pl-4">"data": {'{'}</p>
                  <p className="text-sky-300 pl-8">"lead_id": <span className="text-emerald-300">"lead_12345"</span>,</p>
                  <p className="text-sky-300 pl-8">"email": <span className="text-emerald-300">"john@acme.com"</span>,</p>
                  <p className="text-sky-300 pl-8">"first_name": <span className="text-emerald-300">"John"</span>,</p>
                  <p className="text-sky-300 pl-8">"company": <span className="text-emerald-300">"Acme Inc"</span>,</p>
                  <p className="text-sky-300 pl-8">"lead_score": <span className="text-orange-300">78</span>,</p>
                  <p className="text-sky-300 pl-8">"ai_insights": [</p>
                  <p className="text-emerald-300 pl-12">"Recently raised funding",</p>
                  <p className="text-emerald-300 pl-12">"Hiring engineers"</p>
                  <p className="text-sky-300 pl-8">],</p>
                  <p className="text-sky-300 pl-8">"profile_url": <span className="text-emerald-300">"https://app.aura-funnel.com/leads/12345"</span></p>
                  <p className="text-sky-300 pl-4">{'}'}</p>
                  <p className="text-white">{'}'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Troubleshooting (Chapter 8) === */}
      {activeSection === 'troubleshooting' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 8: Troubleshooting</h2>
            <p className="text-xs text-slate-500 mt-0.5">Common issues, performance tips, and support channels</p>
          </div>

          {/* 8.1 Common Issues & Solutions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <h3 className="text-sm font-black text-slate-900">8.1 Common Issues & Solutions</h3>
            </div>
            <div className="p-6 space-y-4">
              {TROUBLESHOOT_ISSUES.map(issue => (
                <div key={issue.title} className={`bg-${issue.color}-50 border border-${issue.color}-100 rounded-xl overflow-hidden`}>
                  <div className={`px-4 py-3 bg-${issue.color}-100/50 border-b border-${issue.color}-100`}>
                    <p className={`text-sm font-bold text-${issue.color}-900`}>Issue: "{issue.title}"</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Quick Fix Checklist</p>
                      <div className="space-y-1.5">
                        {issue.quickFix.map(fix => (
                          <div key={fix} className="flex items-start space-x-2">
                            <CheckIcon className={`w-3.5 h-3.5 text-${issue.color}-500 flex-shrink-0 mt-0.5`} />
                            <span className="text-xs text-slate-700">{fix}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-dashed border-slate-200">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">If issue persists</p>
                      <div className="space-y-1.5">
                        {issue.escalation.map(esc => (
                          <div key={esc} className="flex items-start space-x-2">
                            <span className={`text-${issue.color}-400 mt-0.5 flex-shrink-0`}>›</span>
                            <span className="text-xs text-slate-600">{esc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 8.2 Performance Optimization Tips */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">8.2 Performance Optimization Tips</h3>
              <p className="text-xs text-slate-500 mt-0.5">For power users</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Keyboard Shortcuts */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Keyboard Shortcuts</h4>
                <div className="bg-slate-900 rounded-xl p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {KEYBOARD_SHORTCUTS.map(s => (
                      <div key={s.key} className="flex items-center space-x-3">
                        <kbd className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[11px] font-mono font-bold text-indigo-400 min-w-[70px] text-center">{s.key}</kbd>
                        <span className="text-xs text-slate-400">{s.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Workspace & Data Tips */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Workspace & Data Management</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {POWER_USER_TIPS.map(tip => (
                    <div key={tip} className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 hover:bg-indigo-50 hover:border-indigo-100 transition-colors">
                      <div className="flex items-start space-x-2">
                        <CheckIcon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-700">{tip}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 8.3 Getting Help */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <h3 className="text-sm font-black text-slate-900">8.3 Getting Help</h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Support Channels */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Support Channels</h4>
                <div className="space-y-3">
                  {SUPPORT_CHANNELS.map(ch => (
                    <div key={ch.channel} className={`bg-${ch.color}-50 border border-${ch.color}-100 rounded-xl p-4`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className={`text-sm font-bold text-${ch.color}-900`}>{ch.channel}</p>
                        <div className="flex items-center space-x-3">
                          <span className="text-[10px] text-slate-500">{ch.hours}</span>
                          <span className={`text-[10px] font-bold text-${ch.color}-600 bg-${ch.color}-100 px-2 py-0.5 rounded-full`}>{ch.response}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {ch.details.map(d => (
                          <div key={d} className="flex items-center space-x-2">
                            <span className={`text-${ch.color}-400`}>›</span>
                            <span className="text-xs text-slate-700">{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* When Contacting Support */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">When Contacting Support — Include These Details</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {TICKET_CHECKLIST.map((item, i) => (
                    <div key={item} className="flex items-start space-x-2 bg-slate-50 rounded-lg px-3 py-2.5">
                      <div className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-black flex-shrink-0 mt-0.5">{i + 1}</div>
                      <span className="text-xs text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>

                {/* Example Ticket */}
                <p className="text-xs font-bold text-slate-700 mb-2">Example Good Ticket</p>
                <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed">
                  <p className="text-indigo-400 font-bold">Subject: Cannot import CSV file</p>
                  <p className="text-slate-400 mt-2">Issue: When I try to import leads.csv, I get error</p>
                  <p className="text-rose-400">'Invalid email format on row 5'</p>
                  <p className="text-slate-500 mt-2">Steps:</p>
                  <p className="text-emerald-300 pl-2">1. Navigate to Leads → Import</p>
                  <p className="text-emerald-300 pl-2">2. Select leads.csv (attached)</p>
                  <p className="text-emerald-300 pl-2">3. Click Import</p>
                  <p className="text-emerald-300 pl-2">4. Receive error</p>
                  <p className="text-slate-500 mt-2">Environment:</p>
                  <p className="text-amber-300 pl-2">Browser: Chrome 120.0.6099.110</p>
                  <p className="text-amber-300 pl-2">OS: Windows 11</p>
                  <p className="text-amber-300 pl-2">Account: john@company.com</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Advanced Features (Chapter 9) === */}
      {activeSection === 'advanced-features' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 9: Advanced Features</h2>
            <p className="text-xs text-slate-500 mt-0.5">AI model training, predictive analytics, and developer APIs</p>
          </div>

          {/* 9.1 AI Model Training */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50">
              <h3 className="text-sm font-black text-slate-900">9.1 AI Model Training</h3>
              <p className="text-xs text-slate-500 mt-0.5">Customize AI for your business</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Training Steps */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Training Process</p>
                <div className="space-y-3">
                  {AI_TRAINING_STEPS.map(s => (
                    <div key={s.step} className="flex items-start space-x-3">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">{s.step}</div>
                      <div className="pt-0.5">
                        <p className="text-xs font-bold text-slate-900">{s.title}</p>
                        <p className="text-xs text-slate-500">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Benefits */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Benefits of Custom Training</p>
                <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CUSTOM_TRAINING_BENEFITS.map(b => (
                      <div key={b} className="flex items-center space-x-2">
                        <CheckIcon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                        <span className="text-xs text-slate-700">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 9.2 Predictive Analytics */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">9.2 Predictive Analytics</h3>
              <p className="text-xs text-slate-500 mt-0.5">AI forecasting features</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Available Forecasts */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Available Forecasts</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {FORECAST_TYPES.map(f => (
                    <div key={f.name} className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-indigo-200 transition-colors">
                      <div className="flex items-center space-x-2 mb-1.5">
                        <span className="text-indigo-500">{f.icon}</span>
                        <p className="text-xs font-bold text-slate-900">{f.name}</p>
                      </div>
                      <p className="text-[10px] text-slate-500">{f.scope}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* How It Works */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">How It Works</p>
                <div className="bg-slate-900 rounded-xl p-5 space-y-2">
                  {FORECAST_PROCESS.map((s, i) => (
                    <div key={s} className="flex items-center space-x-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-black flex-shrink-0">{i + 1}</div>
                      <span className="text-xs text-slate-300">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 9.3 API Developer Features */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">9.3 API Developer Features</h3>
              <p className="text-xs text-slate-500 mt-0.5">For technical users — JavaScript API client</p>
            </div>
            <div className="p-6">
              <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed overflow-x-auto">
                <p className="text-slate-500">{'// Advanced API Example: Custom Integration'}</p>
                <p className="text-violet-400">const <span className="text-emerald-400">aurafunnelAPI</span> = {'{'}</p>
                <p className="text-sky-300 pl-4">baseURL: <span className="text-emerald-300">'https://api.aura-funnel.com/v2'</span>,</p>
                <p className="text-white pl-4" />
                <p className="text-slate-500 pl-4">{'// Custom webhook handler'}</p>
                <p className="text-amber-400 pl-4">async <span className="text-sky-300">handleWebhook</span>(payload) {'{'}</p>
                <p className="text-white pl-8">const insights = await this.<span className="text-sky-300">getAIInsights</span>(payload.lead_id);</p>
                <p className="text-white pl-8">const actions = this.<span className="text-sky-300">determineActions</span>(insights);</p>
                <p className="text-violet-400 pl-8">return this.<span className="text-sky-300">executeWorkflow</span>(actions);</p>
                <p className="text-amber-400 pl-4">{'}'},</p>
                <p className="text-white pl-4" />
                <p className="text-slate-500 pl-4">{'// Batch operations'}</p>
                <p className="text-amber-400 pl-4">async <span className="text-sky-300">batchProcessLeads</span>(leads, options) {'{'}</p>
                <p className="text-violet-400 pl-8">return this.<span className="text-sky-300">callAPI</span>(<span className="text-emerald-300">'/leads/batch'</span>, {'{'}</p>
                <p className="text-sky-300 pl-12">method: <span className="text-emerald-300">'POST'</span>,</p>
                <p className="text-sky-300 pl-12">data: {'{'} leads, options {'}'},</p>
                <p className="text-sky-300 pl-12">ai_enhancement: <span className="text-orange-300">true</span></p>
                <p className="text-violet-400 pl-8">{'}'});</p>
                <p className="text-amber-400 pl-4">{'}'},</p>
                <p className="text-white pl-4" />
                <p className="text-slate-500 pl-4">{'// Real-time AI suggestions'}</p>
                <p className="text-amber-400 pl-4">async <span className="text-sky-300">getRealTimeSuggestions</span>(context) {'{'}</p>
                <p className="text-violet-400 pl-8">return this.<span className="text-sky-300">callAPI</span>(<span className="text-emerald-300">'/ai/suggestions'</span>, {'{'}</p>
                <p className="text-sky-300 pl-12">method: <span className="text-emerald-300">'POST'</span>,</p>
                <p className="text-sky-300 pl-12">data: {'{'} context {'}'}</p>
                <p className="text-violet-400 pl-8">{'}'});</p>
                <p className="text-amber-400 pl-4">{'}'}</p>
                <p className="text-violet-400">{'}'};</p>
              </div>
            </div>
          </div>

          {/* 9.4 Data Export & Reporting API */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">9.4 Data Export & Reporting API</h3>
              <p className="text-xs text-slate-500 mt-0.5">Advanced data access — Python example</p>
            </div>
            <div className="p-6">
              <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed overflow-x-auto">
                <p className="text-slate-500"># Python example: Custom reporting</p>
                <p className="text-violet-400">import <span className="text-white">requests</span></p>
                <p className="text-violet-400">import <span className="text-white">pandas</span> as <span className="text-white">pd</span></p>
                <p className="text-white mt-2" />
                <p className="text-violet-400">class <span className="text-emerald-400">AuraFunnelAnalytics</span>:</p>
                <p className="text-amber-400 pl-4">def <span className="text-sky-300">__init__</span>(self, api_key):</p>
                <p className="text-white pl-8">self.api_key = api_key</p>
                <p className="text-white pl-8">self.base_url = <span className="text-emerald-300">"https://api.aura-funnel.com/v2"</span></p>
                <p className="text-white mt-2" />
                <p className="text-amber-400 pl-4">def <span className="text-sky-300">get_custom_report</span>(self, metrics, dimensions, filters):</p>
                <p className="text-slate-500 pl-8">"""Generate custom report via API"""</p>
                <p className="text-white pl-8">response = requests.<span className="text-sky-300">post</span>(</p>
                <p className="text-emerald-300 pl-12">f"{'{'}<span className="text-white">self.base_url</span>{'}'}/analytics/reports/custom",</p>
                <p className="text-sky-300 pl-12">headers={'{'}<span className="text-emerald-300">"Authorization"</span>: f<span className="text-emerald-300">"Bearer {'{'}<span className="text-white">self.api_key</span>{'}'}"</span>{'}'},</p>
                <p className="text-sky-300 pl-12">json={'{'}</p>
                <p className="text-emerald-300 pl-16">"metrics": <span className="text-white">metrics</span>,</p>
                <p className="text-emerald-300 pl-16">"dimensions": <span className="text-white">dimensions</span>,</p>
                <p className="text-emerald-300 pl-16">"filters": <span className="text-white">filters</span>,</p>
                <p className="text-emerald-300 pl-16">"format": <span className="text-emerald-300">"csv"</span></p>
                <p className="text-white pl-12">{'}'}</p>
                <p className="text-white pl-8">)</p>
                <p className="text-violet-400 pl-8">return pd.<span className="text-sky-300">read_csv</span>(StringIO(response.text))</p>
                <p className="text-white mt-2" />
                <p className="text-amber-400 pl-4">def <span className="text-sky-300">stream_real_time_data</span>(self):</p>
                <p className="text-slate-500 pl-8">"""Stream real-time lead activity"""</p>
                <p className="text-violet-400 pl-8">with requests.<span className="text-sky-300">get</span>(</p>
                <p className="text-emerald-300 pl-12">f"{'{'}<span className="text-white">self.base_url</span>{'}'}/events/stream",</p>
                <p className="text-sky-300 pl-12">headers={'{'}<span className="text-emerald-300">"Authorization"</span>: f<span className="text-emerald-300">"Bearer {'{'}<span className="text-white">self.api_key</span>{'}'}"</span>{'}'},</p>
                <p className="text-sky-300 pl-12">stream=<span className="text-orange-300">True</span></p>
                <p className="text-violet-400 pl-8">) as r:</p>
                <p className="text-violet-400 pl-12">for line in r.<span className="text-sky-300">iter_lines</span>():</p>
                <p className="text-violet-400 pl-16">if line:</p>
                <p className="text-violet-400 pl-20">yield json.<span className="text-sky-300">loads</span>(line)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Training & Certification (Chapter 10) === */}
      {activeSection === 'training' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 10: Training & Certification</h2>
            <p className="text-xs text-slate-500 mt-0.5">Learning paths, certification levels, and ongoing resources</p>
          </div>

          {/* 10.1 Learning Paths */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <h3 className="text-sm font-black text-slate-900">10.1 Learning Paths</h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Beginner Path */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Beginner Path (2-4 weeks)</h4>
                <div className="space-y-3">
                  {BEGINNER_PATH.map((w, i) => (
                    <div key={w.week} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-xl bg-${w.color}-100 text-${w.color}-600 flex items-center justify-center text-[10px] font-black flex-shrink-0`}>{w.week.replace('Week ', 'W')}</div>
                        {i < BEGINNER_PATH.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">{w.title}</p>
                        <div className="mt-2 bg-slate-50 rounded-xl p-3 space-y-1.5">
                          <div className="flex items-center space-x-2"><ClockIcon className="w-3 h-3 text-slate-400 flex-shrink-0" /><span className="text-xs text-slate-600">{w.daily}</span></div>
                          <div className="flex items-center space-x-2"><BookOpenIcon className="w-3 h-3 text-slate-400 flex-shrink-0" /><span className="text-xs text-slate-600">{w.topics}</span></div>
                          <div className="flex items-center space-x-2"><TargetIcon className="w-3 h-3 text-emerald-500 flex-shrink-0" /><span className="text-xs font-bold text-emerald-700">{w.goal}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Advanced Path */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Advanced Path (4-8 weeks)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ADVANCED_MODULES.map(m => (
                    <div key={m.module} className={`bg-${m.color}-50 border border-${m.color}-100 rounded-xl p-4`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div className={`w-6 h-6 rounded-lg bg-${m.color}-200 text-${m.color}-700 flex items-center justify-center text-[10px] font-black`}>{m.module}</div>
                          <p className={`text-xs font-bold text-${m.color}-900`}>{m.title}</p>
                        </div>
                        <span className="text-[10px] text-slate-400">{m.duration}</span>
                      </div>
                      <div className="space-y-1">
                        {m.topics.map(t => (
                          <div key={t} className="flex items-center space-x-2">
                            <span className={`text-${m.color}-400`}>›</span>
                            <span className="text-xs text-slate-700">{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 10.2 Certification Levels */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">10.2 Certification Levels</h3>
            </div>
            <div className="p-6 space-y-3">
              {CERTIFICATIONS.map(cert => (
                <div key={cert.abbr} className={`bg-${cert.color}-50 border border-${cert.color}-100 rounded-xl overflow-hidden`}>
                  <div className={`px-4 py-3 bg-${cert.color}-100/50 border-b border-${cert.color}-100 flex items-center justify-between`}>
                    <div className="flex items-center space-x-3">
                      <span className={`text-sm font-black text-${cert.color}-700`}>{cert.abbr}</span>
                      <p className={`text-xs font-bold text-${cert.color}-900`}>{cert.title}</p>
                    </div>
                    <span className={`text-[10px] font-black text-${cert.color}-600 bg-${cert.color}-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider`}>{cert.level}</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
                      {cert.requirements.map(r => (
                        <div key={r} className="flex items-center space-x-2">
                          <CheckIcon className={`w-3 h-3 text-${cert.color}-500 flex-shrink-0`} />
                          <span className="text-xs text-slate-700">{r}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-dashed border-slate-200">
                      <div className="flex items-center space-x-2">
                        <AcademicCapIcon className={`w-3.5 h-3.5 text-${cert.color}-500`} />
                        <span className="text-xs font-bold text-slate-600">Exam: {cert.exam}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 10.3 Ongoing Learning Resources */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">10.3 Ongoing Learning Resources</h3>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LEARNING_RESOURCES.map(res => (
                <div key={res.category} className={`bg-${res.color}-50 border border-${res.color}-100 rounded-xl p-4`}>
                  <p className={`text-xs font-black text-${res.color}-700 uppercase tracking-wider mb-3`}>{res.category}</p>
                  <div className="space-y-2">
                    {res.items.map(item => (
                      <div key={item} className="flex items-center space-x-2">
                        <CheckIcon className={`w-3.5 h-3.5 text-${res.color}-500 flex-shrink-0`} />
                        <span className="text-xs text-slate-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: SDR Outreach Templates === */}
      {activeSection === 'outreach-templates' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">SDR Outreach Templates</h2>
            <p className="text-xs text-slate-500 mt-0.5">AI-powered, insight-driven templates for every stage of the sales conversation</p>
            <p className="text-[10px] text-indigo-500 font-mono mt-1">Prompt: "You are a world-class SDR. Generate a {'{{type}}'} for {'{{lead_name}}'} at {'{{company}}'}. Context: {'{{insights}}'}"</p>
          </div>

          {/* Templates */}
          {OUTREACH_TEMPLATES.map(tpl => (
            <div key={tpl.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className={`px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-${tpl.color}-50 to-${tpl.color}-50/30`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-lg bg-${tpl.color}-100 flex items-center justify-center text-${tpl.color}-600`}>{tpl.icon}</div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] font-black text-${tpl.color}-600 bg-${tpl.color}-100 px-2 py-0.5 rounded-full`}>#{tpl.id}</span>
                      <h3 className="text-sm font-black text-slate-900">{tpl.type}</h3>
                    </div>
                    {tpl.subject && <p className="text-xs text-slate-500 mt-0.5">Subject: <span className="font-mono text-indigo-600">{tpl.subject}</span></p>}
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                  {tpl.body.map((line, i) => (
                    <p key={i} className={`text-xs leading-relaxed ${
                      line === '' ? 'h-3' :
                      line.startsWith('"') || line.endsWith('"') ? 'text-slate-700 italic' :
                      line.startsWith('Hi {{') || line.startsWith('Best,') || line.startsWith('Cheers,') || line.startsWith('Looking forward') ? 'text-slate-700' :
                      line.startsWith('[') ? 'text-slate-400 text-[10px]' :
                      line.startsWith('P.S.') ? 'text-indigo-600 font-medium' :
                      line.startsWith('1.') || line.startsWith('2.') ? 'text-slate-600 pl-4' :
                      line.includes('{{') ? 'text-slate-700' : 'text-slate-600'
                    }`}>
                      {line.split(/(\{\{[^}]+\}\})/).map((part, j) =>
                        part.startsWith('{{') ? (
                          <span key={j} className="text-indigo-600 font-mono text-[11px] bg-indigo-50 px-1 rounded">{part}</span>
                        ) : (
                          <span key={j}>{part}</span>
                        )
                      )}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Tips for Maximum Impact */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-yellow-50">
              <div className="flex items-center space-x-2">
                <LightBulbIcon className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black text-slate-900">Tips for Maximum Impact</h3>
              </div>
            </div>
            <div className="p-6 space-y-3">
              {OUTREACH_TIPS.map((t, i) => (
                <div key={t.tip} className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-[10px] font-black flex-shrink-0">{i + 1}</div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{t.tip}</p>
                    <p className="text-xs text-slate-500">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available Personalization Tags */}
          <div className="bg-slate-900 rounded-2xl p-6">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Available Personalization Tags</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                '{{lead_name}}', '{{company}}', '{{insights.industry_or_detail}}',
                '{{insights.pain_point_or_goal}}', '{{insights.news_or_development}}', '{{insights.relevant_outcome}}',
                '{{insights.topic_or_challenge}}', '{{insights.company_initiative}}', '{{insights.specific_pain_point}}',
                '{{insights.next_step_topic}}', '{{insights.action_item_1}}', '{{next_step}}',
              ].map(tag => (
                <div key={tag} className="bg-slate-800 rounded-lg px-3 py-2 font-mono text-[10px] text-indigo-300 border border-slate-700">{tag}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: What's Next (Chapter 11) + Appendix === */}
      {activeSection === 'whats-next' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Chapter 11: What's Next</h2>
            <p className="text-xs text-slate-500 mt-0.5">Upcoming features, feature requests, staying updated, and quick reference</p>
          </div>

          {/* 11.1 Upcoming Features */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <h3 className="text-sm font-black text-slate-900">11.1 Upcoming Features (Next 90 Days)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Q1 2024 Roadmap</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {ROADMAP_QUARTERS.map(q => (
                  <div key={q.month} className={`bg-${q.color}-50 border border-${q.color}-100 rounded-xl p-4`}>
                    <p className={`text-xs font-black text-${q.color}-700 uppercase tracking-wider mb-3`}>{q.month}</p>
                    <div className="space-y-2">
                      {q.items.map(item => (
                        <div key={item} className="flex items-center space-x-2">
                          <CheckIcon className={`w-3.5 h-3.5 text-${q.color}-500 flex-shrink-0`} />
                          <span className="text-xs text-slate-700">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 11.2 Feature Request Process */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">11.2 Feature Request Process</h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">How to Request Features</p>
                <div className="space-y-2">
                  {FEATURE_REQUEST_STEPS.map((s, i) => (
                    <div key={s} className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">{i + 1}</div>
                      <span className="text-xs text-slate-700 pt-0.5">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Top Requested Features Being Developed</p>
                <div className="space-y-2">
                  {TOP_REQUESTED_FEATURES.map((f, i) => (
                    <div key={f.feature} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-black text-indigo-600">{i + 1}.</span>
                        <span className="text-xs text-slate-700">{f.feature}</span>
                      </div>
                      <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{f.eta}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 11.3 Staying Updated */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">11.3 Staying Updated</h3>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {STAY_UPDATED_CHANNELS.map(ch => (
                <div key={ch.channel} className={`bg-${ch.color}-50 border border-${ch.color}-100 rounded-xl p-4`}>
                  <p className={`text-xs font-black text-${ch.color}-700 uppercase tracking-wider mb-3`}>{ch.channel}</p>
                  <div className="space-y-2">
                    {ch.items.map(item => (
                      <div key={item} className="flex items-center space-x-2">
                        <CheckIcon className={`w-3.5 h-3.5 text-${ch.color}-500 flex-shrink-0`} />
                        <span className="text-xs text-slate-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* APPENDIX: Keyboard Shortcuts */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-800 to-slate-900">
              <h3 className="text-sm font-black text-white">Appendix: Keyboard Shortcuts Master List</h3>
            </div>
            <div className="p-6">
              <div className="bg-slate-900 rounded-xl p-5 space-y-5">
                {SHORTCUT_GROUPS.map(g => (
                  <div key={g.group}>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">{g.group}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {g.shortcuts.map(s => (
                        <div key={s.key} className="flex items-center space-x-2">
                          <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono font-bold text-indigo-300 min-w-[60px] text-center">{s.key}</kbd>
                          <span className="text-[11px] text-slate-400">{s.action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* APPENDIX: Emergency Contacts */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Appendix: Emergency Contact Information</h3>
            </div>
            <div className="p-6 space-y-3">
              {EMERGENCY_CONTACTS.map(c => (
                <div key={c.dept} className={`bg-${c.color}-50 border border-${c.color}-100 rounded-xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-xs font-bold text-${c.color}-900`}>{c.dept}</p>
                    <span className={`text-[10px] text-${c.color}-600 font-bold`}>{c.sla}</span>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {c.email && (
                      <div className="flex items-center space-x-2">
                        <MailIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-600">{c.email}</span>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center space-x-2">
                        <HelpCircleIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-600">{c.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* APPENDIX: System Status & Maintenance */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Appendix: System Status & Maintenance</h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Check System Status</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {['Website: status.aura-funnel.com', 'In-app: Click ? → System Status', 'Email: Subscribe to status updates'].map(item => (
                    <div key={item} className="flex items-center space-x-2 bg-slate-50 rounded-lg px-3 py-2.5">
                      <CheckIcon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                      <span className="text-xs text-slate-600">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Maintenance Schedule</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {['Regular: Every Sunday 2-4 AM EST', 'Emergency: As needed with 1-hour notice', 'Updates: Typically Thursday evenings'].map(item => (
                    <div key={item} className="flex items-center space-x-2 bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-100">
                      <ClockIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <span className="text-xs text-slate-600">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Scheduled Maintenance</p>
                <div className="flex flex-wrap gap-2">
                  {MAINTENANCE_SCHEDULE.map(m => (
                    <div key={m.date} className="bg-slate-900 rounded-lg px-4 py-2.5">
                      <p className="text-[10px] font-bold text-indigo-400">{m.date}</p>
                      <p className="text-[10px] text-slate-400">{m.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Manual Footer */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-center">
            <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-2">Last Updated: January 15, 2024 | Version: 4.2 | Manual ID: AF-UM-2024-Q1</p>
            <p className="text-xs text-white/80">This manual is continuously updated. Always check the in-app "What's New" section for the latest features and changes.</p>
            <p className="text-sm font-bold text-white mt-3">The more you use AuraFunnel and provide feedback, the smarter it becomes for your specific needs. Your success is our priority.</p>
          </div>
        </div>
      )}

      {/* === SECTION: Competitive Advantages === */}
      {activeSection === 'advantages' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">5 Unbreakable Competitive Advantages</h2>
            <p className="text-xs text-slate-500 mt-0.5">What makes AuraFunnel fundamentally different from every other platform</p>
          </div>

          {ADVANTAGES.map(adv => {
            const isExpanded = expandedAdvantage === adv.id;
            return (
              <div key={adv.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedAdvantage(isExpanded ? null : adv.id)}
                  className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-2xl bg-${adv.color}-50 text-${adv.color}-600 flex items-center justify-center shrink-0`}>
                      {adv.icon}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs font-black text-${adv.color}-500 uppercase`}>#{adv.id}</span>
                        <p className="font-bold text-slate-900">{adv.title}</p>
                      </div>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-6 border-t border-slate-50">
                    <div className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Other Systems */}
                      <div className="bg-red-50/50 rounded-xl p-4 border border-red-100">
                        <p className="text-xs font-black text-red-500 uppercase tracking-wider mb-3">Other Systems</p>
                        <div className="space-y-2.5">
                          {adv.otherSystems.map((item, i) => (
                            <div key={i} className="flex items-start space-x-2">
                              <XIcon className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                              <span className="text-xs text-slate-600">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AuraFunnel */}
                      <div className={`bg-${adv.color}-50/50 rounded-xl p-4 border-2 border-${adv.color}-200`}>
                        <p className={`text-xs font-black text-${adv.color}-600 uppercase tracking-wider mb-3`}>AuraFunnel</p>
                        <div className="space-y-2.5">
                          {adv.auraFunnel.map((item, i) => (
                            <div key={i} className="flex items-start space-x-2">
                              <CheckIcon className={`w-3.5 h-3.5 text-${adv.color}-500 shrink-0 mt-0.5`} />
                              <span className="text-xs text-slate-700 font-medium">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Example */}
                    <div className="mt-4 bg-slate-900 rounded-xl p-4 text-sm text-slate-300 leading-relaxed">
                      <div className="flex items-center space-x-2 mb-2">
                        <LightBulbIcon className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Real-World Example</span>
                      </div>
                      <p className="text-xs">{adv.example}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* === SECTION: Exclusive Features === */}
      {activeSection === 'features' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Exclusive Features No Other Platform Has</h2>
            <p className="text-xs text-slate-500 mt-0.5">Capabilities that are unique to AuraFunnel's AI-native architecture</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {EXCLUSIVE_FEATURES.map(feat => (
              <div key={feat.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-${feat.color}-50 text-${feat.color}-600 flex items-center justify-center`}>
                    {feat.icon}
                  </div>
                  <h3 className="font-bold text-slate-900">{feat.title}</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">{feat.description}</p>
                <div className={`bg-${feat.color}-50 rounded-xl p-4 border border-${feat.color}-100`}>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">{feat.example}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Behavioral Pattern Recognition Code Block */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Behavioral Pattern Recognition in Action</h3>
            <div className="bg-slate-900 rounded-xl p-5 font-mono text-xs text-slate-300 leading-loose overflow-x-auto">
              <p className="text-slate-500"># Detects subtle signals humans miss</p>
              <p><span className="text-violet-400">if</span> (lead.browsing_tech_stack +</p>
              <p className="pl-4">lead.company_funding_round +</p>
              <p className="pl-4">lead.hiring_for_ai_roles +</p>
              <p className="pl-4">lead.competitor_mentions):</p>
              <p></p>
              <p className="pl-4">ai.predict(<span className="text-amber-300">"Entering new market"</span>,</p>
              <p className="pl-12">confidence=<span className="text-emerald-400">92%</span>,</p>
              <p className="pl-12">recommended_action=<span className="text-amber-300">"Send case study on market expansion"</span>)</p>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Business Impact === */}
      {activeSection === 'impact' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">Tangible Business Impact</h2>
            <p className="text-xs text-slate-500 mt-0.5">Real metrics from enterprise SaaS companies using AuraFunnel</p>
          </div>

          {/* Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Enterprise SaaS Case Study</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Metric</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-red-400 uppercase tracking-wider">Traditional Tools</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-indigo-500 uppercase tracking-wider">With AuraFunnel</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-emerald-500 uppercase tracking-wider">Improvement</th>
                  </tr>
                </thead>
                <tbody>
                  {CASE_STUDY_METRICS.map((row, i) => (
                    <tr key={i} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="px-5 py-3.5 text-sm font-bold text-slate-900">{row.metric}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-500">{row.traditional}</td>
                      <td className="px-5 py-3.5 text-sm font-bold text-indigo-600">{row.aura}</td>
                      <td className="px-5 py-3.5">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-black">
                          {row.improvement}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ROI Case Study */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center space-x-2 mb-5">
              <TrendUpIcon className="w-5 h-5 text-emerald-400" />
              <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider">Real ROI Example: B2B Manufacturing Tech</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {ROI_STATS.map((stat, i) => (
                <div key={i} className="text-center">
                  <p className="text-xl font-black text-white">{stat.value}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <p className="text-sm text-emerald-300 font-semibold text-center">
                Results achieved in just 90 days with $5,000/month investment
              </p>
            </div>
          </div>

          {/* Visual Impact Bars */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">Improvement Visualization</h3>
            <div className="space-y-4">
              {CASE_STUDY_METRICS.map((row, i) => {
                const pct = parseInt(row.improvement) || 100;
                const barWidth = Math.min(pct / 3, 100);
                const colors = ['indigo', 'violet', 'emerald', 'amber', 'rose'];
                const color = colors[i % colors.length];
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-700">{row.metric}</span>
                      <span className={`text-xs font-black text-${color}-600`}>{row.improvement}</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-${color}-500 rounded-full transition-all duration-1000`}
                        style={{ width: `${barWidth}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Future-Ready === */}
      {activeSection === 'future' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">The Future-Ready Difference</h2>
            <p className="text-xs text-slate-500 mt-0.5">AuraFunnel was built AI-native from day one, not retrofitted</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Others */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <p className="text-xs font-black text-red-500 uppercase tracking-wider mb-4">While Others Are Adding AI Features...</p>
              <div className="space-y-3">
                {[
                  'Chatbots for support',
                  'Basic content suggestions',
                  'Simple automation',
                  'Bolt-on AI as afterthought',
                ].map((item, i) => (
                  <div key={i} className="flex items-center space-x-3 p-3 bg-red-50/50 rounded-xl">
                    <XIcon className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm text-slate-600">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AuraFunnel */}
            <div className="bg-indigo-50 rounded-2xl border-2 border-indigo-200 shadow-sm p-6">
              <p className="text-xs font-black text-indigo-600 uppercase tracking-wider mb-4">AuraFunnel Was Born AI-Native...</p>
              <div className="space-y-3">
                {[
                  'AI-First architecture from day one',
                  'Self-learning models that improve without updates',
                  'Predictive analytics as core, not add-on',
                  'Adaptive interfaces that learn your workflow',
                ].map((item, i) => (
                  <div key={i} className="flex items-center space-x-3 p-3 bg-white rounded-xl shadow-sm">
                    <CheckIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-sm text-slate-700 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Architecture Diagram */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-5">Architecture Comparison</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Other Solutions */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-4 text-center">Other Solutions</p>
                <div className="space-y-2">
                  {['CRM', 'Email Tool', 'Analytics', 'Content'].map((tool, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                      <span className="text-xs font-bold text-red-600">{tool}</span>
                    </div>
                  ))}
                  <div className="text-center py-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Manual Sync Required</span>
                  </div>
                </div>
              </div>

              {/* AuraFunnel */}
              <div>
                <p className="text-xs font-black text-indigo-500 uppercase tracking-wider mb-4 text-center">AuraFunnel</p>
                <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl p-5 text-center text-white mb-3 shadow-lg">
                  <SparklesIcon className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm font-black">AI BRAIN</p>
                  <p className="text-[10px] text-indigo-200 font-semibold">Central Intelligence</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                    <span className="text-xs font-bold text-indigo-600">Actions</span>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                    <span className="text-xs font-bold text-indigo-600">Insights</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Self Assessment */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <LightBulbIcon className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-black text-amber-800 uppercase tracking-wider">Still Unconvinced? Ask Yourself:</h3>
            </div>
            <div className="space-y-3">
              {ASSESSMENT_QUESTIONS.map((q, i) => (
                <div key={i} className="flex items-start space-x-3">
                  <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-amber-900">{q}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: Why AuraFunnel === */}
      {activeSection === 'comparison' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900">The Bottom Line</h2>
            <p className="text-xs text-slate-500 mt-0.5">Other marketing platforms help you execute tasks. AuraFunnel does the marketing thinking for you.</p>
          </div>

          {/* Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">If You Need...</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Platform</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr key={i} className={`border-b border-slate-50 ${row.category === 'aura' ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-5 py-3.5 text-sm text-slate-700">{row.need}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-sm font-bold ${row.category === 'aura' ? 'text-indigo-600' : 'text-slate-500'}`}>
                          {row.tools}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {row.category === 'aura' ? (
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase">AI-Native</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase">Traditional</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AuraFunnel Capabilities */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { label: 'Predictive Intelligence', desc: 'Finds opportunities before they\'re visible', icon: <SparklesIcon className="w-5 h-5" />, color: 'indigo' },
              { label: 'Generative Creativity', desc: 'Produces better content than humans', icon: <DocumentIcon className="w-5 h-5" />, color: 'violet' },
              { label: 'Continuous Optimization', desc: 'Never stops improving', icon: <RefreshIcon className="w-5 h-5" />, color: 'emerald' },
              { label: 'Unified Intelligence', desc: 'Sees patterns across all channels', icon: <EyeIcon className="w-5 h-5" />, color: 'amber' },
              { label: 'Scalable Personalization', desc: 'Treats each lead as individual', icon: <TargetIcon className="w-5 h-5" />, color: 'rose' },
            ].map((cap, i) => (
              <div key={i} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-center hover:shadow-md hover:border-${cap.color}-200 transition-all`}>
                <div className={`w-12 h-12 rounded-xl bg-${cap.color}-50 text-${cap.color}-600 flex items-center justify-center mx-auto mb-3`}>
                  {cap.icon}
                </div>
                <p className="text-sm font-bold text-slate-900 mb-1">{cap.label}</p>
                <p className="text-[11px] text-slate-500">{cap.desc}</p>
              </div>
            ))}
          </div>

          {/* Final CTA */}
          <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-[2rem] p-8 text-center text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="relative">
              <p className="text-xs font-black text-indigo-200 uppercase tracking-[0.3em] mb-3">The Bottom Line</p>
              <h2 className="text-2xl md:text-3xl font-black mb-4 leading-tight">
                AuraFunnel doesn't just change how you do marketing\u2014<br />
                <span className="text-indigo-200">it changes what's possible.</span>
              </h2>
              <p className="text-indigo-100 text-sm max-w-xl mx-auto">
                You don't need another marketing tool. You need an AI co-pilot that thinks, learns, and grows with your business.
                The system is ready. Your competitive advantage is waiting.
              </p>
            </div>
          </div>

          {/* Version Footer */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-semibold">
              AuraFunnel User Manual v3.1 \u2022 Last Updated January 2024 \u2022 Document ID: AURA-USER-MANUAL-2024
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManualPage;
