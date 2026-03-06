import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Sparkles, PenSquare, GitBranch, Mail, ChevronRight } from 'lucide-react';
import type { User } from '../../../types';

interface LayoutContext {
  user: User;
}

const CAMPAIGN_LINKS = [
  {
    label: 'Content Generator',
    description: 'Create AI-powered emails, proposals, and more',
    icon: Sparkles,
    path: '/portal/content',
    color: 'indigo',
  },
  {
    label: 'Content Studio',
    description: 'Design and manage your content library',
    icon: PenSquare,
    path: '/portal/content-studio',
    color: 'violet',
  },
  {
    label: 'Automations',
    description: 'Set up automated workflows and sequences',
    icon: GitBranch,
    path: '/portal/automation',
    color: 'emerald',
  },
  {
    label: 'Email Sequences',
    description: 'Build multi-step email campaigns',
    icon: Mail,
    path: '/portal/content',
    color: 'amber',
  },
];

const MobileCampaigns: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="px-4 py-5 space-y-4">
      <div>
        <h1 className="text-lg font-black text-gray-900 tracking-tight">Campaigns</h1>
        <p className="text-xs text-gray-400 font-medium mt-0.5">Create and manage your outreach</p>
      </div>

      <div className="space-y-2.5">
        {CAMPAIGN_LINKS.map(item => (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className="w-full flex items-center gap-4 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-left active:scale-[0.98] transition-transform"
          >
            <div className={`w-11 h-11 rounded-xl bg-${item.color}-50 flex items-center justify-center shrink-0`}>
              <item.icon size={20} className={`text-${item.color}-600`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{item.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{item.description}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileCampaigns;
