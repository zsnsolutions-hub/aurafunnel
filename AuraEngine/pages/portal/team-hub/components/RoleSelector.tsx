import React from 'react';
import type { FlowRole } from '../teamHubApi';

interface RoleSelectorProps {
  value: FlowRole;
  onChange: (role: FlowRole) => void;
  disabled?: boolean;
  hideOwner?: boolean;
}

const ROLES: { value: FlowRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

const RoleSelector: React.FC<RoleSelectorProps> = ({ value, onChange, disabled = false, hideOwner = true }) => {
  const options = hideOwner ? ROLES.filter(r => r.value !== 'owner') : ROLES;

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as FlowRole)}
      disabled={disabled}
      className="px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
    >
      {options.map(r => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </select>
  );
};

export default RoleSelector;
