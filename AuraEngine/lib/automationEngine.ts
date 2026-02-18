import { supabase } from './supabase';
import { sendTrackedEmail } from './emailTracking';
import type { Lead } from '../types';

// ─── Types ───

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'wait';
  title: string;
  description: string;
  config: Record<string, string | number | boolean>;
}

export interface WorkflowStats {
  leadsProcessed: number;
  conversionRate: number;
  timeSavedHrs: number;
  roi: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'draft';
  nodes: WorkflowNode[];
  createdAt: string;
  stats: WorkflowStats;
  userId?: string;
  teamId?: string | null;
}

export interface ExecutionStepResult {
  nodeId: string;
  nodeTitle: string;
  nodeType: 'trigger' | 'action' | 'condition' | 'wait';
  status: 'pass' | 'fail' | 'skip';
  message: string;
  durationMs: number;
}

export interface ExecutionResult {
  leadId: string;
  leadName: string;
  status: 'success' | 'failed' | 'skipped';
  steps: ExecutionStepResult[];
  startedAt: string;
  completedAt: string;
  errorMessage?: string;
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
  nodeType: 'trigger' | 'action' | 'condition' | 'wait';
  executions: number;
  successRate: number;
  avgDuration: number;
  lastRun: string;
}

// ─── Workflow CRUD ───

export async function saveWorkflow(workflow: Workflow): Promise<Workflow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const row = {
    id: workflow.id,
    user_id: user.id,
    team_id: workflow.teamId || null,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    nodes: workflow.nodes,
    stats: workflow.stats,
  };

  const { data, error } = await supabase
    .from('workflows')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('Failed to save workflow:', error.message);
    return null;
  }

  return dbRowToWorkflow(data);
}

export async function loadWorkflows(userId: string): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to load workflows:', error.message);
    return [];
  }

  return (data || []).map(dbRowToWorkflow);
}

export async function deleteWorkflow(workflowId: string): Promise<boolean> {
  const { error } = await supabase
    .from('workflows')
    .delete()
    .eq('id', workflowId);

  if (error) {
    console.error('Failed to delete workflow:', error.message);
    return false;
  }
  return true;
}

function dbRowToWorkflow(row: any): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    status: row.status,
    nodes: row.nodes || [],
    createdAt: row.created_at,
    stats: row.stats || { leadsProcessed: 0, conversionRate: 0, timeSavedHrs: 0, roi: 0 },
    userId: row.user_id,
    teamId: row.team_id,
  };
}

// ─── Execution Engine ───

export async function executeWorkflow(
  workflow: Workflow,
  leads: Lead[]
): Promise<ExecutionResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const results: ExecutionResult[] = [];

  for (const lead of leads) {
    const startedAt = new Date().toISOString();
    const steps: ExecutionStepResult[] = [];
    let overallStatus: 'success' | 'failed' | 'skipped' = 'success';
    let errorMessage: string | undefined;
    let skipRemaining = false;

    for (const node of workflow.nodes) {
      if (skipRemaining) {
        steps.push({
          nodeId: node.id,
          nodeTitle: node.title,
          nodeType: node.type,
          status: 'skip',
          message: 'Skipped — upstream condition not met',
          durationMs: 0,
        });
        continue;
      }

      const stepStart = Date.now();

      try {
        const result = await executeNode(node, lead, user.id);
        steps.push({
          nodeId: node.id,
          nodeTitle: node.title,
          nodeType: node.type,
          status: result.status,
          message: result.message,
          durationMs: Date.now() - stepStart,
        });

        if (result.status === 'fail') {
          overallStatus = 'failed';
          errorMessage = result.message;
        }
        if (result.status === 'skip' && node.type === 'condition') {
          skipRemaining = true;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        steps.push({
          nodeId: node.id,
          nodeTitle: node.title,
          nodeType: node.type,
          status: 'fail',
          message: msg,
          durationMs: Date.now() - stepStart,
        });
        overallStatus = 'failed';
        errorMessage = msg;
      }
    }

    const completedAt = new Date().toISOString();

    // Write execution to DB
    await supabase.from('workflow_executions').insert({
      workflow_id: workflow.id,
      user_id: user.id,
      lead_id: lead.id,
      status: overallStatus,
      steps,
      started_at: startedAt,
      completed_at: completedAt,
      error_message: errorMessage || null,
    });

    results.push({
      leadId: lead.id,
      leadName: lead.name,
      status: overallStatus,
      steps,
      startedAt,
      completedAt,
      errorMessage,
    });
  }

  // Update workflow stats
  const prevProcessed = workflow.stats.leadsProcessed || 0;
  const successCount = results.filter(r => r.status === 'success').length;
  const newProcessed = prevProcessed + leads.length;
  const newConversion = newProcessed > 0
    ? ((prevProcessed * (workflow.stats.conversionRate / 100) + successCount) / newProcessed) * 100
    : 0;
  const timeSavedPerLead = 2.2; // estimated hrs saved per automated lead vs manual

  await supabase
    .from('workflows')
    .update({
      stats: {
        leadsProcessed: newProcessed,
        conversionRate: parseFloat(newConversion.toFixed(1)),
        timeSavedHrs: Math.round((workflow.stats.timeSavedHrs || 0) + leads.length * timeSavedPerLead),
        roi: workflow.stats.roi || 0,
      },
    })
    .eq('id', workflow.id);

  // Insert audit log
  await supabase.from('audit_logs').insert({
    user_id: user.id,
    action: 'AUTOMATION_EXECUTED',
    details: `Workflow "${workflow.name}" executed on ${leads.length} lead(s) — ${successCount} succeeded, ${leads.length - successCount} failed`,
  });

  return results;
}

async function executeNode(
  node: WorkflowNode,
  lead: Lead,
  userId: string
): Promise<{ status: 'pass' | 'fail' | 'skip'; message: string }> {
  switch (node.type) {
    case 'trigger':
      return executeTrigger(node, lead);

    case 'action':
      return executeAction(node, lead, userId);

    case 'condition':
      return evaluateCondition(node, lead);

    case 'wait':
      return {
        status: 'pass',
        message: `Wait ${node.config.days || 1} day(s) — noted for execution (continuing immediately in manual run)`,
      };

    default:
      return { status: 'skip', message: `Unknown node type: ${node.type}` };
  }
}

function executeTrigger(
  node: WorkflowNode,
  lead: Lead
): { status: 'pass' | 'fail' | 'skip'; message: string } {
  const triggerType = node.config.triggerType as string;

  switch (triggerType) {
    case 'lead_created':
      return { status: 'pass', message: `Trigger matched — lead "${lead.name}" exists in pipeline` };

    case 'score_change': {
      const threshold = Number(node.config.threshold) || 50;
      if (lead.score >= threshold) {
        return { status: 'pass', message: `Lead score ${lead.score} meets threshold ${threshold}` };
      }
      return { status: 'skip', message: `Lead score ${lead.score} below threshold ${threshold}` };
    }

    case 'status_change':
      return { status: 'pass', message: `Trigger matched — lead status is "${lead.status}"` };

    case 'time_elapsed':
      return { status: 'pass', message: 'Scheduled trigger — proceeding' };

    case 'tag_added':
      return { status: 'pass', message: 'Custom trigger — proceeding' };

    default:
      return { status: 'pass', message: `Trigger "${triggerType}" matched` };
  }
}

async function executeAction(
  node: WorkflowNode,
  lead: Lead,
  userId: string
): Promise<{ status: 'pass' | 'fail' | 'skip'; message: string }> {
  const actionType = (node.config.actionType as string) || inferActionType(node);

  switch (actionType) {
    case 'send_email': {
      if (!lead.email) {
        return { status: 'fail', message: 'No email address for this lead' };
      }
      const templateId = (node.config.template as string) || 'welcome';
      const subject = `${node.title} — ${lead.company}`;
      const htmlBody = `<p>Hi ${lead.name},</p><p>This is an automated email from workflow step "${node.title}".</p><p>Template: ${templateId}</p>`;

      const result = await sendTrackedEmail({
        leadId: lead.id,
        toEmail: lead.email,
        subject,
        htmlBody,
        trackOpens: true,
        trackClicks: true,
      });

      if (result.success) {
        return { status: 'pass', message: `Email sent to ${lead.email} (template: ${templateId})` };
      }
      return { status: 'fail', message: `Email failed: ${result.error}` };
    }

    case 'update_status': {
      const newStatus = (node.config.newStatus as string) || 'Contacted';
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', lead.id);
      if (error) {
        return { status: 'fail', message: `Status update failed: ${error.message}` };
      }
      return { status: 'pass', message: `Lead status updated to "${newStatus}"` };
    }

    case 'add_tag': {
      const tag = (node.config.tag as string) || 'Automated';
      const kb: Record<string, any> = lead.knowledgeBase ? { ...lead.knowledgeBase } : {};
      const existingNotes = kb.extraNotes || '';
      const tagMarker = `[tag:${tag}]`;
      if (!existingNotes.includes(tagMarker)) {
        kb.extraNotes = existingNotes ? `${existingNotes} ${tagMarker}` : tagMarker;
      }

      const { error } = await supabase
        .from('leads')
        .update({ knowledgeBase: kb })
        .eq('id', lead.id);
      if (error) {
        return { status: 'fail', message: `Tag add failed: ${error.message}` };
      }
      return { status: 'pass', message: `Tag "${tag}" added to lead` };
    }

    case 'create_alert': {
      const { error } = await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'AUTOMATION_ALERT',
        details: `Alert from workflow node "${node.title}" for lead ${lead.name} (${lead.company})`,
      });
      if (error) {
        return { status: 'fail', message: `Alert creation failed: ${error.message}` };
      }
      return { status: 'pass', message: `Alert created for "${lead.name}"` };
    }

    case 'assign_user': {
      const assignee = (node.config.assignee as string) || '';
      const kb = lead.knowledgeBase || {};
      const updatedKb = { ...kb, assignedTo: assignee };

      const { error } = await supabase
        .from('leads')
        .update({ knowledgeBase: updatedKb })
        .eq('id', lead.id);
      if (error) {
        return { status: 'fail', message: `Assignment failed: ${error.message}` };
      }
      return { status: 'pass', message: `Lead assigned to "${assignee}"` };
    }

    default:
      return { status: 'pass', message: `Action "${node.title}" executed (type: ${actionType})` };
  }
}

function inferActionType(node: WorkflowNode): string {
  const title = node.title.toLowerCase();
  if (title.includes('email') || title.includes('send')) return 'send_email';
  if (title.includes('status') || title.includes('update')) return 'update_status';
  if (title.includes('tag')) return 'add_tag';
  if (title.includes('alert') || title.includes('notify')) return 'create_alert';
  if (title.includes('assign')) return 'assign_user';
  return 'generic';
}

function evaluateCondition(
  node: WorkflowNode,
  lead: Lead
): { status: 'pass' | 'skip'; message: string } {
  const field = node.config.field as string;
  const operator = node.config.operator as string;
  const value = node.config.value;

  let leadValue: any;
  switch (field) {
    case 'score':
      leadValue = lead.score;
      break;
    case 'status':
      leadValue = lead.status;
      break;
    case 'company':
      leadValue = lead.company;
      break;
    default:
      leadValue = (lead as any)[field];
  }

  let passed = false;
  const numValue = Number(value);
  const numLeadValue = Number(leadValue);

  switch (operator) {
    case 'gt':
      passed = numLeadValue > numValue;
      break;
    case 'lt':
      passed = numLeadValue < numValue;
      break;
    case 'eq':
      passed = String(leadValue) === String(value);
      break;
    default:
      passed = true;
  }

  if (passed) {
    return { status: 'pass', message: `Condition met: ${field} (${leadValue}) ${operator} ${value}` };
  }
  return { status: 'skip', message: `Condition not met: ${field} (${leadValue}) ${operator} ${value} — skipping downstream nodes` };
}

// ─── Execution Log Queries ───

export async function getExecutionLog(
  userId: string,
  limit = 50
): Promise<ExecutionLogEntry[]> {
  const { data, error } = await supabase
    .from('workflow_executions')
    .select(`
      id, status, steps, started_at, completed_at, lead_id,
      workflows!inner(name)
    `)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch execution log:', error.message);
    return [];
  }

  // Collect lead IDs
  const leadIds = [...new Set((data || []).map((d: any) => d.lead_id).filter(Boolean))];
  let leadMap = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name')
      .in('id', leadIds);
    if (leads) {
      leadMap = new Map(leads.map((l: any) => [l.id, l.name]));
    }
  }

  const entries: ExecutionLogEntry[] = [];
  for (const row of data || []) {
    const wfName = (row as any).workflows?.name || 'Unknown Workflow';
    const leadName = leadMap.get(row.lead_id) || 'Unknown Lead';
    const stepsArr: ExecutionStepResult[] = (row.steps as ExecutionStepResult[]) || [];

    // Create one entry per step
    for (const step of stepsArr) {
      entries.push({
        id: `${row.id}-${step.nodeId}`,
        timestamp: row.started_at,
        workflowName: wfName,
        leadName,
        step: step.nodeTitle,
        status: step.status === 'pass' ? 'success' : step.status === 'fail' ? 'failed' : 'skipped',
        duration: step.durationMs / 1000,
      });
    }
  }

  return entries.slice(0, limit);
}

export async function getNodeAnalytics(
  workflowId: string
): Promise<NodePerformanceMetric[]> {
  const { data, error } = await supabase
    .from('workflow_executions')
    .select('steps, started_at')
    .eq('workflow_id', workflowId)
    .order('started_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];

  const nodeMap = new Map<string, {
    nodeTitle: string;
    nodeType: 'trigger' | 'action' | 'condition' | 'wait';
    executions: number;
    successes: number;
    totalDuration: number;
    lastRun: string;
  }>();

  for (const row of data) {
    const steps: ExecutionStepResult[] = (row.steps as ExecutionStepResult[]) || [];
    for (const step of steps) {
      const existing = nodeMap.get(step.nodeId) || {
        nodeTitle: step.nodeTitle,
        nodeType: step.nodeType,
        executions: 0,
        successes: 0,
        totalDuration: 0,
        lastRun: row.started_at,
      };
      existing.executions++;
      if (step.status === 'pass') existing.successes++;
      existing.totalDuration += step.durationMs;
      if (row.started_at > existing.lastRun) existing.lastRun = row.started_at;
      nodeMap.set(step.nodeId, existing);
    }
  }

  return Array.from(nodeMap.values()).map(n => ({
    nodeTitle: n.nodeTitle,
    nodeType: n.nodeType,
    executions: n.executions,
    successRate: n.executions > 0 ? Math.round((n.successes / n.executions) * 100) : 0,
    avgDuration: n.executions > 0 ? parseFloat((n.totalDuration / n.executions / 1000).toFixed(1)) : 0,
    lastRun: n.lastRun,
  }));
}

export async function getWorkflowStats(userId: string): Promise<{
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  totalLeadsProcessed: number;
  successRate: number;
}> {
  const { data: workflows } = await supabase
    .from('workflows')
    .select('id, status, stats')
    .eq('user_id', userId);

  const { data: executions } = await supabase
    .from('workflow_executions')
    .select('status')
    .eq('user_id', userId);

  const wfs = workflows || [];
  const execs = executions || [];
  const successExecs = execs.filter((e: any) => e.status === 'success').length;

  return {
    totalWorkflows: wfs.length,
    activeWorkflows: wfs.filter((w: any) => w.status === 'active').length,
    totalExecutions: execs.length,
    totalLeadsProcessed: wfs.reduce((sum: number, w: any) => sum + ((w.stats as any)?.leadsProcessed || 0), 0),
    successRate: execs.length > 0 ? Math.round((successExecs / execs.length) * 100) : 0,
  };
}
