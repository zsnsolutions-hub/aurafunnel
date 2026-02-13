import { Lead, AIInsight } from '../types';

export const generateProgrammaticInsights = (leads: Lead[]): AIInsight[] => {
  const insights: AIInsight[] = [];
  if (leads.length === 0) return insights;

  // 1. Score Distribution Analysis
  const hotLeads = leads.filter(l => l.score > 80);
  const coldLeads = leads.filter(l => l.score < 40);
  const avgScore = leads.reduce((a, b) => a + b.score, 0) / leads.length;

  if (hotLeads.length > 0) {
    const hotPct = Math.round((hotLeads.length / leads.length) * 100);
    insights.push({
      id: 'score-hot',
      category: 'score',
      title: `${hotPct}% of leads are high-intent`,
      description: `${hotLeads.length} lead${hotLeads.length > 1 ? 's' : ''} scored above 80. Prioritize outreach to ${hotLeads.slice(0, 3).map(l => l.name).join(', ')} for fastest conversion.`,
      confidence: Math.min(95, 70 + hotPct),
      action: 'Focus outreach on hot leads'
    });
  }

  if (coldLeads.length > leads.length * 0.3) {
    insights.push({
      id: 'score-cold',
      category: 'score',
      title: 'High ratio of low-scoring leads detected',
      description: `${coldLeads.length} leads score below 40. Consider enriching their profiles with more data or removing stale entries to improve pipeline quality.`,
      confidence: 75,
      action: 'Enrich or prune low-score leads'
    });
  }

  // 2. Company Pattern Analysis
  const companyMap: Record<string, Lead[]> = {};
  leads.forEach(l => {
    const key = l.company.toLowerCase().trim();
    if (!companyMap[key]) companyMap[key] = [];
    companyMap[key].push(l);
  });

  const multiContactCompanies = Object.entries(companyMap).filter(([, v]) => v.length > 1);
  if (multiContactCompanies.length > 0) {
    const top = multiContactCompanies.sort((a, b) => b[1].length - a[1].length)[0];
    insights.push({
      id: 'company-cluster',
      category: 'company',
      title: `${top[0]} has ${top[1].length} contacts in pipeline`,
      description: `Multiple touchpoints at the same company increase conversion probability. Coordinate outreach across contacts for a multi-threaded sales approach.`,
      confidence: 85,
      action: 'Coordinate multi-threaded outreach'
    });
  }

  // 3. Status Distribution / Conversion Analysis
  const statusCounts: Record<string, number> = {};
  leads.forEach(l => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });

  const newLeads = statusCounts['New'] || 0;
  const qualified = statusCounts['Qualified'] || 0;
  const contacted = statusCounts['Contacted'] || 0;
  const lost = statusCounts['Lost'] || 0;

  if (newLeads > leads.length * 0.5) {
    insights.push({
      id: 'conversion-new',
      category: 'conversion',
      title: `${Math.round((newLeads / leads.length) * 100)}% of leads haven't been contacted`,
      description: `${newLeads} leads are still in "New" status. Batch-generate outreach content to accelerate pipeline velocity.`,
      confidence: 90,
      action: 'Generate content for new leads'
    });
  }

  if (qualified > 0 && leads.length > 0) {
    const convRate = Math.round((qualified / leads.length) * 100);
    insights.push({
      id: 'conversion-rate',
      category: 'conversion',
      title: `Current qualification rate: ${convRate}%`,
      description: `${qualified} out of ${leads.length} leads are qualified. ${convRate > 30 ? 'Strong pipeline health.' : 'Consider refining lead sourcing criteria to improve quality.'}`,
      confidence: 88
    });
  }

  if (lost > 0) {
    const lostAvgScore = leads.filter(l => l.status === 'Lost').reduce((a, b) => a + b.score, 0) / lost;
    insights.push({
      id: 'conversion-lost',
      category: 'engagement',
      title: `Lost leads had avg score of ${Math.round(lostAvgScore)}`,
      description: `Analyze why ${lost} lead${lost > 1 ? 's' : ''} were lost. ${lostAvgScore > 60 ? 'High scores suggest timing or messaging issues rather than fit.' : 'Low scores indicate poor initial targeting.'}`,
      confidence: 72,
      action: 'Review lost lead patterns'
    });
  }

  // 4. Engagement / Activity Timing
  const leadsWithDates = leads.filter(l => l.created_at);
  if (leadsWithDates.length > 2) {
    const recent = leadsWithDates.filter(l => {
      const d = new Date(l.created_at!);
      const now = new Date();
      return (now.getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
    });
    if (recent.length > 0) {
      insights.push({
        id: 'timing-recent',
        category: 'timing',
        title: `${recent.length} new lead${recent.length > 1 ? 's' : ''} added this week`,
        description: `Pipeline is actively growing. Average score of new additions: ${Math.round(recent.reduce((a, b) => a + b.score, 0) / recent.length)}.`,
        confidence: 92
      });
    }
  }

  // 5. AI Score Benchmark
  if (avgScore > 0) {
    insights.push({
      id: 'score-avg',
      category: 'score',
      title: `Portfolio AI score: ${Math.round(avgScore)}/100`,
      description: `${avgScore > 70 ? 'Excellent lead quality - your sourcing strategy is working well.' : avgScore > 50 ? 'Moderate lead quality. Focus on enriching profiles to boost scores.' : 'Low average scores suggest a need to refine your ideal customer profile.'}`,
      confidence: 95
    });
  }

  return insights.slice(0, 5);
};

export const generateLeadInsights = (lead: Lead, allLeads: Lead[]): AIInsight[] => {
  const insights: AIInsight[] = [];

  // 1. Score assessment
  if (lead.score > 80) {
    insights.push({
      id: `${lead.id}-hot`,
      category: 'score',
      title: 'High-intent prospect',
      description: `Score of ${lead.score}/100 places this lead in the top tier. Prioritize immediate outreach with a personalized approach.`,
      confidence: 90,
      action: 'Schedule outreach within 24 hours'
    });
  } else if (lead.score > 50) {
    insights.push({
      id: `${lead.id}-warm`,
      category: 'score',
      title: 'Warm prospect - nurture recommended',
      description: `Score of ${lead.score}/100 indicates moderate interest. Consider a softer touch with educational content before a direct pitch.`,
      confidence: 78,
      action: 'Send educational content first'
    });
  } else {
    insights.push({
      id: `${lead.id}-cold`,
      category: 'score',
      title: 'Low engagement - enrich profile',
      description: `Score of ${lead.score}/100 is below average. Gather more data points or re-qualify before investing outreach effort.`,
      confidence: 70,
      action: 'Enrich lead data before outreach'
    });
  }

  // 2. Company analysis
  const sameCompany = allLeads.filter(l => l.company.toLowerCase() === lead.company.toLowerCase() && l.id !== lead.id);
  if (sameCompany.length > 0) {
    insights.push({
      id: `${lead.id}-company`,
      category: 'company',
      title: `${sameCompany.length} other contact${sameCompany.length > 1 ? 's' : ''} at ${lead.company}`,
      description: `Multi-threading opportunity: ${sameCompany.map(l => l.name).join(', ')} are also in your pipeline. Coordinate outreach for maximum impact.`,
      confidence: 88,
      action: 'Coordinate multi-threaded approach'
    });
  }

  // 3. Status-based recommendation
  if (lead.status === 'New') {
    insights.push({
      id: `${lead.id}-new`,
      category: 'timing',
      title: 'First contact opportunity',
      description: 'This lead hasn\'t been contacted yet. Initial outreach within the first 48 hours of creation has 3x higher response rates.',
      confidence: 85,
      action: 'Make first contact now'
    });
  } else if (lead.status === 'Contacted') {
    insights.push({
      id: `${lead.id}-followup`,
      category: 'engagement',
      title: 'Follow-up recommended',
      description: 'Lead has been contacted but not yet qualified. A follow-up with new value proposition or case study may move them forward.',
      confidence: 75,
      action: 'Send follow-up content'
    });
  } else if (lead.status === 'Qualified') {
    insights.push({
      id: `${lead.id}-close`,
      category: 'conversion',
      title: 'Ready to close',
      description: 'This lead is qualified. Focus on removing objections and scheduling a demo or proposal to move toward conversion.',
      confidence: 92,
      action: 'Schedule demo or send proposal'
    });
  }

  // 4. Timing insight
  if (lead.created_at) {
    const daysSinceCreated = Math.floor((new Date().getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceCreated > 30 && lead.status !== 'Qualified') {
      insights.push({
        id: `${lead.id}-stale`,
        category: 'timing',
        title: `${daysSinceCreated} days in pipeline`,
        description: 'This lead has been in the pipeline for over a month without qualifying. Consider a re-engagement campaign or deprioritize.',
        confidence: 80,
        action: 'Re-engage or archive'
      });
    }
  }

  return insights;
};
