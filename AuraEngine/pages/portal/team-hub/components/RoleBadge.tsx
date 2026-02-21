import React from 'react';
import { Crown, Shield, User, Eye } from 'lucide-react';
import type { FlowRole } from '../teamHubApi';

const ROLE_CONFIG: Record<FlowRole, { icon: React.ReactNode; label: string; bg: string; text: string }> = {
  owner:  { icon: <Crown size={10} />,  label: 'Owner',  bg: 'bg-amber-100',  text: 'text-amber-700' },
  admin:  { icon: <Shield size={10} />, label: 'Admin',  bg: 'bg-indigo-100', text: 'text-indigo-700' },
  member: { icon: <User size={10} />,   label: 'Member', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  viewer: { icon: <Eye size={10} />,    label: 'Viewer', bg: 'bg-slate-100',  text: 'text-slate-600' },
};

interface RoleBadgeProps {
  role: FlowRole;
}

const RoleBadge: React.FC<RoleBadgeProps> = ({ role }) => {
  const config = ROLE_CONFIG[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${config.bg} ${config.text}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

export default RoleBadge;
