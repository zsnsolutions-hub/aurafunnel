import type { TriggerType, ActionType } from '../../types';
import type {
  Workflow as DbWorkflow,
  WorkflowNode as DbWorkflowNode,
  WorkflowStats as DbWorkflowStats,
  ExecutionResult,
  ExecutionStepResult,
  ExecutionLogEntry as DbExecutionLogEntry,
  NodePerformanceMetric as DbNodePerformanceMetric,
} from '../../lib/automationEngine';

// Re-export engine types for convenience
export type { DbWorkflow, DbWorkflowNode, DbWorkflowStats, ExecutionResult, ExecutionStepResult };
export type { TriggerType, ActionType };

// ─── Wizard ───
export type WizardStep = 1 | 2 | 3 | 4;
export type ActivationMode = 'immediate' | 'scheduled' | 'segment';

// ─── Node Types ───
export type NodeType = 'trigger' | 'action' | 'condition' | 'wait';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  title: string;
  description: string;
  config: Record<string, string | number | boolean>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'draft';
  nodes: WorkflowNode[];
  createdAt: string;
  stats: {
    leadsProcessed: number;
    conversionRate: number;
    timeSavedHrs: number;
    roi: number;
  };
}

export interface TestResult {
  passed: boolean;
  stepsRun: number;
  stepsTotal: number;
  leadName: string;
  leadScore: number;
  details: { step: string; status: 'pass' | 'fail' | 'skip'; message: string }[];
}

export interface ValidationItem {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  workflowName: string;
  leadName: string;
  step: string;
  status: 'success' | 'failed' | 'skipped' | 'running';
  duration: number;
}

export interface NodePerformanceMetric {
  nodeTitle: string;
  nodeType: NodeType;
  executions: number;
  successRate: number;
  avgDuration: number;
  lastRun: string;
}

// ─── KPI ───
export interface KpiStat {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  trend: string;
  up: boolean | null;
}

// ─── Health ───
export interface WorkflowHealthMetric {
  label: string;
  score: number;
  max: number;
  status: 'pass' | 'fail' | 'warn';
}

export interface WorkflowHealth {
  score: number;
  metrics: WorkflowHealthMetric[];
}

// ─── ROI ───
export interface RoiCalculation {
  manualCost: number;
  automatedCost: number;
  savings: number;
  savingsPct: number;
  totalTimeSaved: number;
  timeSavedPerLead: number;
  conversionLift: number;
  revenueImpact: number;
  monthlyBreakdown: { month: string; manual: number; automated: number; savings: number }[];
  costPerLead: number;
  totalLeads: number;
}

// ─── Trigger Analytics ───
export interface TriggerTypeAnalytics {
  type: TriggerType;
  label: string;
  count: number;
  fired: number;
  converted: number;
  conversionRate: number;
  avgResponseTime: number;
}

export interface TriggerAnalyticsData {
  triggerTypes: TriggerTypeAnalytics[];
  hourlyDistribution: { hour: number; label: string; triggers: number }[];
  peakHour: { hour: number; label: string; triggers: number };
  totalFired: number;
  totalConverted: number;
  overallConversion: number;
  weeklyTrend: { day: string; count: number }[];
}

// ─── Template Effectiveness ───
export interface TemplateMetric {
  id: string;
  label: string;
  desc: string;
  nodesUsing: number;
  sent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  aiEnhanced: boolean;
  conversionScore: number;
}

export interface TimingMetric {
  timing: string;
  openRate: number;
  clickRate: number;
  label: string;
}

export interface TemplateEffectivenessData {
  templates: TemplateMetric[];
  aiLift: number;
  avgAiOpenRate: number;
  avgNonAiOpenRate: number;
  timingPerformance: TimingMetric[];
  bestTemplate: TemplateMetric;
  totalSent: number;
}

// ─── Panel Visibility ───
export type PanelName =
  | 'shortcuts'
  | 'executionLog'
  | 'nodeAnalytics'
  | 'healthPanel'
  | 'roiCalculator'
  | 'triggerAnalytics'
  | 'templateEffectiveness'
  | 'campaignsPanel';

// ─── Node Type Metadata (data only, no JSX) ───
export interface NodeTypeMeta {
  label: string;
  color: string;
  bgClass: string;
}

// ─── Wizard Step Descriptor ───
export interface WizardStepDescriptor {
  step: WizardStep;
  label: string;
  description: string;
}

// ─── Header Panel Button Config ───
export interface HeaderPanelButton {
  panel: PanelName;
  label: string;
  iconName: string;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
}
