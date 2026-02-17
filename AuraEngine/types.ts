
export enum UserRole {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  GUEST = 'GUEST'
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_name: string;
  status: 'active' | 'past_due' | 'canceled';
  current_period_end: string;
  created_at?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: 'active' | 'disabled';
  plan: string;
  credits_total: number;
  credits_used: number;
  createdAt: string;
  subscription?: Subscription;
  businessProfile?: BusinessProfile;
}

export interface BusinessProfile {
  companyName?: string;
  industry?: string;
  companyWebsite?: string;
  productsServices?: string;
  targetAudience?: string;
  valueProp?: string;
  pricingModel?: string;
  salesApproach?: string;
}

export interface BusinessAnalysisField {
  value: string;
  confidence: number; // 0-100
}

export interface BusinessAnalysisResult {
  companyName: BusinessAnalysisField;
  industry: BusinessAnalysisField;
  productsServices: BusinessAnalysisField;
  targetAudience: BusinessAnalysisField;
  valueProp: BusinessAnalysisField;
  pricingModel: BusinessAnalysisField;
  salesApproach: BusinessAnalysisField;
  followUpQuestions: string[];
}

export interface KnowledgeBase {
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  youtube?: string;
  extraNotes?: string;
}

export interface Lead {
  id: string;
  client_id: string;
  name: string;
  company: string;
  email: string;
  score: number;
  status: 'New' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost';
  lastActivity: string;
  insights: string;
  source?: string;
  created_at?: string;
  knowledgeBase?: KnowledgeBase;
}

export interface Plan {
  id: string;
  name: string;
  price: string;
  credits: number;
  description: string;
  features: string[];
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export enum ContentType {
  EMAIL = 'Cold Email',
  LINKEDIN = 'LinkedIn Message',
  SMS = 'SMS Text',
  PROPOSAL = 'Follow-up Proposal'
}

export interface DashboardQuickStats {
  leadsToday: number;
  hotLeads: number;
  contentCreated: number;
  avgAiScore: number;
  predictedConversions: number;
  recommendations: number;
  leadsYesterday?: number;
  hotLeadsYesterday?: number;
}

export interface AIInsight {
  id: string;
  category: 'score' | 'timing' | 'company' | 'conversion' | 'engagement';
  title: string;
  description: string;
  confidence: number;
  action?: string;
}

export interface ActivityFeedItem {
  id: string;
  action: string;
  user_email?: string;
  user_name?: string;
  details?: string;
  created_at: string;
}

export interface FunnelStage {
  label: string;
  count: number;
  color: string;
  percentage: number;
}

export interface LeadSegment {
  id: string;
  name: string;
  type: 'smart' | 'manual';
  count: number;
  icon: string;
  color: string;
  filter?: (lead: Lead) => boolean;
  leadIds?: string[];
}

export interface ManualList {
  id: string;
  name: string;
  leadIds: string[];
  createdAt: string;
}

// Content Generation Module v2
export enum ContentCategory {
  EMAIL_SEQUENCE = 'Email Sequences',
  LANDING_PAGE = 'Landing Pages',
  SOCIAL_MEDIA = 'Social Media Posts',
  BLOG_ARTICLE = 'Blog Articles',
  REPORT = 'Reports & Whitepapers',
  PROPOSAL = 'Proposals & Pitches',
  AD_COPY = 'Ad Copy'
}

export enum ToneType {
  PROFESSIONAL = 'Professional',
  CONVERSATIONAL = 'Conversational',
  TECHNICAL = 'Technical',
  CASUAL = 'Casual',
  PERSUASIVE = 'Persuasive',
  EMPATHETIC = 'Empathetic'
}

export interface PersonalizationTag {
  key: string;
  label: string;
  placeholder: string;
}

export interface EmailStep {
  id: string;
  stepNumber: number;
  subject: string;
  body: string;
  delay: string; // e.g. "Day 1", "Day 3"
  tone: ToneType;
}

export interface EmailSequenceConfig {
  audienceLeadIds: string[];
  segmentFilter?: string;
  goal: 'book_meeting' | 'product_demo' | 'nurture' | 're_engage' | 'upsell';
  sequenceLength: number;
  cadence: 'daily' | 'every_2_days' | 'every_3_days' | 'weekly';
  tone: ToneType;
}

export interface GeneratedContent {
  id: string;
  category: ContentCategory;
  title: string;
  content: string;
  tone: ToneType;
  leadId?: string;
  createdAt: string;
  emailSteps?: EmailStep[];
}

// Module 4: System Settings
export interface NotificationPreferences {
  emailAlerts: boolean;
  leadScoreAlerts: boolean;
  weeklyDigest: boolean;
  contentReady: boolean;
  teamMentions: boolean;
  systemUpdates: boolean;
}

export interface DashboardPreferences {
  defaultView: 'grid' | 'list';
  itemsPerPage: number;
  showQuickStats: boolean;
  showAiInsights: boolean;
  showActivityFeed: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
  status: 'active' | 'revoked';
}

export type TeamRole = 'Administrator' | 'Manager' | 'User';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: 'active' | 'disabled';
  joinedAt: string;
  lastActive?: string;
}

export interface RolePermission {
  role: TeamRole;
  permissions: string[];
  description: string;
  color: string;
}

export interface IntegrationConfig {
  id: string;
  name: string;
  category: 'crm' | 'email' | 'analytics' | 'calendar' | 'communication' | 'payment';
  icon: string;
  status: 'connected' | 'disconnected' | 'error';
  apiKey?: string;
  webhookUrl?: string;
  lastSync?: string;
  config?: Record<string, string>;
}

export interface UsageMetrics {
  aiTokensUsed: number;
  aiTokensLimit: number;
  leadsProcessed: number;
  leadsLimit: number;
  storageUsedMb: number;
  storageLimitMb: number;
  emailCreditsUsed: number;
  emailCreditsLimit: number;
}

// Module 3: Analytics & Reporting
export type ReportType = 'performance' | 'lead_source' | 'roi_cost' | 'ai_effectiveness' | 'email_campaign' | 'team_productivity';
export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'pptx';
export type AlertType = 'hot_lead' | 'stagnation' | 'campaign_drop' | 'high_value' | 'ai_accuracy_drop' | 'system_health';
export type AlertNotifyMethod = 'in_app' | 'email' | 'slack' | 'sms';

export interface AnalyticsMetric {
  id: string;
  label: string;
  value: number;
  previousValue?: number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  trendPercent?: number;
  color: string;
  icon: string;
}

export interface ReportConfig {
  id: string;
  name: string;
  type: ReportType;
  description: string;
  dateRange: { start: string; end: string };
  format: ExportFormat;
  generatedAt?: string;
  status: 'draft' | 'generating' | 'ready';
}

export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  enabled: boolean;
  condition: string;
  threshold?: number;
  notifyMethods: AlertNotifyMethod[];
  lastTriggered?: string;
  triggerCount: number;
}

// Module 5: Workflow Automation
export type TriggerType = 'score_change' | 'status_change' | 'lead_created' | 'time_elapsed' | 'tag_added' | 'content_generated';
export type ActionType = 'send_email' | 'update_status' | 'add_tag' | 'assign_user' | 'generate_content' | 'create_alert' | 'move_to_segment';

export interface AutomationTrigger {
  type: TriggerType;
  label: string;
  config: Record<string, string | number>;
}

export interface AutomationAction {
  type: ActionType;
  label: string;
  config: Record<string, string | number>;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
  runCount: number;
}

export interface CampaignStep {
  id: string;
  day: number;
  type: 'email' | 'wait' | 'condition' | 'action';
  title: string;
  description: string;
  config?: Record<string, string | number>;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  steps: CampaignStep[];
  enrolledLeads: number;
  completedLeads: number;
  createdAt: string;
  startedAt?: string;
}

// Module: Apollo Integration
export interface ApolloContact {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string;
  linkedin_url: string;
  city: string;
  state: string;
  country: string;
  headline: string;
  phone_numbers: { number: string }[];
  organization: {
    name?: string;
    website_url?: string;
    industry?: string;
    estimated_num_employees?: number;
  };
}

export interface ApolloSearchParams {
  person_titles?: string[];
  q_keywords?: string;
  person_locations?: string[];
  organization_locations?: string[];
  employee_ranges?: string[];
  q_organization_domains?: string[];
  person_seniorities?: string[];
  person_departments?: string[];
  contact_email_status?: string[];
  prospected_by_current_team?: string[];
  organization_latest_funding_stage_cd?: string[];
  organization_revenue_min?: number;
  organization_revenue_max?: number;
  page?: number;
  per_page?: number;
}

// Module: Email Tracking
export type EmailProvider = 'sendgrid' | 'mailchimp' | 'gmail' | 'smtp' | 'manual';
export type EmailMessageStatus = 'sent' | 'delivered' | 'bounced' | 'failed';
export type EmailEventType = 'open' | 'click' | 'delivered' | 'bounced' | 'unsubscribe' | 'spam_report';

export interface EmailMessage {
  id: string;
  lead_id: string;
  owner_id: string;
  provider: EmailProvider;
  provider_message_id?: string;
  subject?: string;
  to_email: string;
  from_email?: string;
  status: EmailMessageStatus;
  track_opens: boolean;
  track_clicks: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailLink {
  id: string;
  message_id: string;
  destination_url: string;
  link_label?: string;
  link_index: number;
  click_count: number;
  created_at: string;
}

export interface EmailEvent {
  id: string;
  message_id: string;
  link_id?: string;
  event_type: EmailEventType;
  ip_address?: string;
  user_agent?: string;
  is_bot: boolean;
  is_apple_privacy: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface EmailEngagement {
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  uniqueOpens: number;
  uniqueClicks: number;
  totalBounced: number;
  lastOpenedAt?: string;
  lastClickedAt?: string;
  topClickedLink?: { label: string; url: string; clicks: number };
  recentEvents: EmailEvent[];
}
