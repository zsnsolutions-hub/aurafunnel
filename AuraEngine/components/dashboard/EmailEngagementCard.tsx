import React, { useState, useEffect } from 'react';
import { MailIcon, EyeIcon, ClockIcon, SendIcon } from '../Icons';
import { fetchLeadEmailEngagement } from '../../lib/emailTracking';
import type { EmailEngagement, EmailEventType } from '../../types';

interface EmailEngagementCardProps {
  leadId: string;
  onSendEmailClick?: () => void;
}

const EVENT_LABELS: Record<EmailEventType, { label: string; color: string }> = {
  open: { label: 'Opened', color: 'bg-blue-400' },
  click: { label: 'Clicked', color: 'bg-emerald-400' },
  delivered: { label: 'Delivered', color: 'bg-slate-400' },
  bounced: { label: 'Bounced', color: 'bg-red-400' },
  unsubscribe: { label: 'Unsubscribed', color: 'bg-amber-400' },
  spam_report: { label: 'Spam Report', color: 'bg-red-500' },
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// Click icon as inline SVG (not in Icons.tsx)
const ClickIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
  </svg>
);

const EmailEngagementCard: React.FC<EmailEngagementCardProps> = ({ leadId, onSendEmailClick }) => {
  const [engagement, setEngagement] = useState<EmailEngagement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeadEmailEngagement(leadId).then((data) => {
      if (!cancelled) {
        setEngagement(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [leadId]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-28 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="text-center p-3">
              <div className="h-8 w-12 mx-auto bg-slate-100 rounded animate-pulse mb-2" />
              <div className="h-3 w-16 mx-auto bg-slate-50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (!engagement || engagement.totalSent === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-4">
        <h3 className="font-bold text-slate-800 font-heading text-sm mb-4">Email Activity</h3>
        <div className="text-center py-6">
          <div className="w-12 h-12 mx-auto bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
            <MailIcon className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm text-slate-400 mb-4">No email activity yet</p>
          {onSendEmailClick && (
            <button
              onClick={onSendEmailClick}
              className="px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
            >
              Send First Email
            </button>
          )}
        </div>
      </div>
    );
  }

  // Populated state
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-4">
      <h3 className="font-bold text-slate-800 font-heading text-sm mb-4">Email Activity</h3>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-3 bg-blue-50/50 rounded-xl">
          <div className="flex items-center justify-center mb-1">
            <EyeIcon className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <p className="text-lg font-black text-slate-900">{engagement.totalOpens}</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Opens</p>
        </div>
        <div className="text-center p-3 bg-emerald-50/50 rounded-xl">
          <div className="flex items-center justify-center mb-1">
            <ClickIcon className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-lg font-black text-slate-900">{engagement.totalClicks}</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Clicks</p>
        </div>
        <div className="text-center p-3 bg-slate-50/50 rounded-xl">
          <div className="flex items-center justify-center mb-1">
            <SendIcon className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-lg font-black text-slate-900">{engagement.totalSent}</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sent</p>
        </div>
      </div>

      {/* Last opened */}
      {engagement.lastOpenedAt && (
        <div className="flex items-center space-x-2 text-xs text-slate-500 mb-2">
          <ClockIcon className="w-3 h-3" />
          <span>Last opened {relativeTime(engagement.lastOpenedAt)}</span>
        </div>
      )}

      {/* Top CTA link */}
      {engagement.topClickedLink && (
        <div className="flex items-center space-x-2 text-xs text-slate-500 mb-4">
          <ClickIcon className="w-3 h-3" />
          <span className="truncate">
            Top CTA: <span className="font-bold text-slate-700">{engagement.topClickedLink.label}</span>
            <span className="text-slate-300 ml-1">({engagement.topClickedLink.clicks} clicks)</span>
          </span>
        </div>
      )}

      {/* Recent activity timeline */}
      {engagement.recentEvents.length > 0 && (
        <div className="border-t border-slate-100 pt-3 mt-3">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Recent Activity</p>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {engagement.recentEvents.map((event) => {
              const config = EVENT_LABELS[event.event_type] ?? { label: event.event_type, color: 'bg-slate-300' };
              return (
                <div key={event.id} className="flex items-center space-x-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.color}`} />
                  <span className="text-[11px] text-slate-600 font-medium">{config.label}</span>
                  <span className="text-[10px] text-slate-300 ml-auto flex-shrink-0">{relativeTime(event.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailEngagementCard;
