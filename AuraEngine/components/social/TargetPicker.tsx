// File: AuraEngine/components/social/TargetPicker.tsx
import React from 'react';
import { PublishTarget } from '../../hooks/useSocialAccounts';
import {
  FacebookIcon, InstagramIcon, LinkedInIcon, CheckIcon, TargetIcon,
} from '../Icons';

interface Props {
  availableTargets: PublishTarget[];
  selectedTargets: PublishTarget[];
  setSelectedTargets: (targets: PublishTarget[]) => void;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  facebook_page: <FacebookIcon className="w-4 h-4 text-blue-600" />,
  instagram: <InstagramIcon className="w-4 h-4 text-pink-600" />,
  linkedin_member: <LinkedInIcon className="w-4 h-4 text-sky-700" />,
  linkedin_org: <LinkedInIcon className="w-4 h-4 text-sky-700" />,
};

const CHANNEL_LABELS: Record<string, string> = {
  facebook_page: 'Facebook Page',
  instagram: 'Instagram',
  linkedin_member: 'LinkedIn Profile',
  linkedin_org: 'LinkedIn Organization',
};

const CHANNEL_COLORS: Record<string, string> = {
  facebook_page: 'border-blue-200 bg-blue-50',
  instagram: 'border-pink-200 bg-pink-50',
  linkedin_member: 'border-sky-200 bg-sky-50',
  linkedin_org: 'border-sky-200 bg-sky-50',
};

const TargetPicker: React.FC<Props> = ({ availableTargets, selectedTargets, setSelectedTargets }) => {
  const isSelected = (t: PublishTarget) =>
    selectedTargets.some(s => s.channel === t.channel && s.target_id === t.target_id);

  const toggle = (t: PublishTarget) => {
    if (isSelected(t)) {
      setSelectedTargets(selectedTargets.filter(
        s => !(s.channel === t.channel && s.target_id === t.target_id)
      ));
    } else {
      setSelectedTargets([...selectedTargets, t]);
    }
  };

  const selectAll = () => setSelectedTargets([...availableTargets]);
  const clearAll = () => setSelectedTargets([]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <TargetIcon className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Publish Targets</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={selectAll} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">Select All</button>
          <span className="text-slate-300">|</span>
          <button onClick={clearAll} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors">Clear</button>
        </div>
      </div>
      <div className="p-6">
        {availableTargets.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No accounts connected. Connect Meta or LinkedIn above.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableTargets.map(t => {
              const selected = isSelected(t);
              return (
                <button
                  key={`${t.channel}-${t.target_id}`}
                  onClick={() => toggle(t)}
                  className={`flex items-center space-x-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                    selected
                      ? `${CHANNEL_COLORS[t.channel]} ring-2 ring-indigo-300`
                      : 'border-slate-100 hover:border-slate-200 bg-white'
                  }`}
                >
                  <div className="shrink-0">
                    {CHANNEL_ICONS[t.channel]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{t.target_label}</p>
                    <p className="text-[10px] text-slate-400">{CHANNEL_LABELS[t.channel]}</p>
                  </div>
                  {selected && (
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                      <CheckIcon className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-3 text-center">
          {selectedTargets.length} of {availableTargets.length} target{availableTargets.length !== 1 ? 's' : ''} selected
        </p>
      </div>
    </div>
  );
};

export default TargetPicker;
