import React from 'react';
import {
  CheckIcon, ArrowRightIcon, PlusIcon, TrendUpIcon, ActivityIcon,
  CalendarIcon, BoltIcon,
} from '../Icons';
import { TRIGGER_OPTIONS } from './constants';
import type { TriggerType } from './types';

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  plus: <PlusIcon className="w-5 h-5" />,
  trendUp: <TrendUpIcon className="w-5 h-5" />,
  activity: <ActivityIcon className="w-5 h-5" />,
  calendar: <CalendarIcon className="w-5 h-5" />,
  bolt: <BoltIcon className="w-5 h-5" />,
};

interface WizardStep1Props {
  wizardName: string;
  wizardDescription: string;
  wizardTrigger: TriggerType | null;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onTriggerSelect: (type: TriggerType) => void;
  onCancel: () => void;
  onNext: () => void;
}

export const WizardStep1: React.FC<WizardStep1Props> = ({
  wizardName,
  wizardDescription,
  wizardTrigger,
  onNameChange,
  onDescriptionChange,
  onTriggerSelect,
  onCancel,
  onNext,
}) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
    <div className="px-8 py-6 border-b border-slate-100">
      <h2 className="text-lg font-black text-slate-900 font-heading">Start New Workflow</h2>
      <p className="text-sm text-slate-400 mt-1">Define the basics and choose when this automation should trigger.</p>
    </div>

    <div className="px-8 py-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Workflow Name</label>
          <input
            type="text"
            value={wizardName}
            onChange={e => onNameChange(e.target.value)}
            placeholder="e.g. Hot Lead Follow-up"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
          />
        </div>
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Description</label>
          <input
            type="text"
            value={wizardDescription}
            onChange={e => onDescriptionChange(e.target.value)}
            placeholder="e.g. Automatically follow up with hot leads"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none placeholder-slate-300"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-3">When should this run?</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TRIGGER_OPTIONS.map(trigger => (
            <button
              key={trigger.type}
              onClick={() => onTriggerSelect(trigger.type)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                wizardTrigger === trigger.type
                  ? 'border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-100'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                wizardTrigger === trigger.type ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {TRIGGER_ICONS[trigger.iconName]}
              </div>
              <p className={`text-sm font-bold ${wizardTrigger === trigger.type ? 'text-indigo-700' : 'text-slate-700'}`}>
                {trigger.label}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{trigger.desc}</p>
              {wizardTrigger === trigger.type && (
                <div className="mt-2 flex items-center space-x-1 text-indigo-600">
                  <CheckIcon className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase">Selected</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
      <button
        onClick={onCancel}
        className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onNext}
        disabled={!wizardName.trim() || !wizardTrigger}
        className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span>Next: Build Workflow</span>
        <ArrowRightIcon className="w-4 h-4" />
      </button>
    </div>
  </div>
);
