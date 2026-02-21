// File: AuraEngine/components/social/SchedulePicker.tsx
import React from 'react';
import { CalendarIcon, ClockIcon, BoltIcon } from '../Icons';

interface Props {
  mode: 'now' | 'scheduled';
  setMode: (m: 'now' | 'scheduled') => void;
  scheduledDate: string;
  setScheduledDate: (d: string) => void;
  scheduledTime: string;
  setScheduledTime: (t: string) => void;
  timezone: string;
  setTimezone: (tz: string) => void;
}

const TIMEZONES = [
  { value: 'Asia/Karachi', label: 'Pakistan (PKT, UTC+5)' },
  { value: 'Asia/Dubai', label: 'Gulf (GST, UTC+4)' },
  { value: 'Asia/Kolkata', label: 'India (IST, UTC+5:30)' },
  { value: 'Asia/Shanghai', label: 'China (CST, UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST, UTC+9)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET/CEST)' },
  { value: 'America/New_York', label: 'US Eastern (ET)' },
  { value: 'America/Chicago', label: 'US Central (CT)' },
  { value: 'America/Denver', label: 'US Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)' },
  { value: 'Australia/Sydney', label: 'Australia Eastern (AEST)' },
  { value: 'UTC', label: 'UTC' },
];

const SchedulePicker: React.FC<Props> = ({
  mode, setMode, scheduledDate, setScheduledDate,
  scheduledTime, setScheduledTime, timezone, setTimezone,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center space-x-2">
        <CalendarIcon className="w-4 h-4 text-indigo-600" />
        <h3 className="font-bold text-slate-800 text-sm">When to Publish</h3>
      </div>
      <div className="p-6 space-y-4">
        {/* Mode toggle */}
        <div className="flex items-center space-x-2 p-1 bg-slate-50 rounded-xl">
          <button
            onClick={() => setMode('now')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'now' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <BoltIcon className="w-3.5 h-3.5" />
            <span>Post Now</span>
          </button>
          <button
            onClick={() => setMode('scheduled')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'scheduled' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <ClockIcon className="w-3.5 h-3.5" />
            <span>Schedule</span>
          </button>
        </div>

        {mode === 'scheduled' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Timezone</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchedulePicker;
