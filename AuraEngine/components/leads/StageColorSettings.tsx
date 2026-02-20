import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import {
  ColorToken,
  StageColorMap,
  COLOR_TOKENS,
  DEFAULT_STAGE_COLORS,
  getColorClasses,
  fetchStageColors,
  saveStageColors,
} from '../../lib/leadColors';

const STAGES = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];

interface StageColorSettingsProps {
  user: User;
}

const StageColorSettings: React.FC<StageColorSettingsProps> = ({ user }) => {
  const [stageColors, setStageColors] = useState<StageColorMap>({ ...DEFAULT_STAGE_COLORS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchStageColors().then(map => {
      setStageColors(map);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveStageColors(stageColors);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setStageColors({ ...DEFAULT_STAGE_COLORS });
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {STAGES.map(s => (
          <div key={s} className="h-14 bg-slate-50 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 font-heading">Pipeline Stage Colors</h3>
          <p className="text-sm text-slate-500 mt-1">Choose a color for each pipeline stage. These colors appear as dots and borders on your leads.</p>
        </div>

        <div className="space-y-4">
          {STAGES.map(stage => {
            const current = (stageColors[stage] || 'slate') as ColorToken;
            const currentClasses = getColorClasses(current);
            return (
              <div key={stage} className="flex items-center space-x-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <div className={`w-3 h-3 rounded-full ${currentClasses.dot} flex-shrink-0`} />
                <span className="text-sm font-bold text-slate-800 w-28">{stage}</span>
                <div className="flex items-center space-x-1.5">
                  {COLOR_TOKENS.map(({ token, label }) => {
                    const tc = getColorClasses(token);
                    const isActive = token === current;
                    return (
                      <button
                        key={token}
                        onClick={() => setStageColors(prev => ({ ...prev, [stage]: token }))}
                        className={`w-7 h-7 rounded-full ${tc.dot} transition-all hover:scale-110 ${
                          isActive ? `ring-2 ${tc.ring} ring-offset-2` : ''
                        }`}
                        title={label}
                        aria-label={`${stage}: ${label}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Colors'}
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
          >
            Reset to Defaults
          </button>
          {saved && <span className="text-xs font-bold text-emerald-600">Colors saved!</span>}
        </div>
      </div>
    </div>
  );
};

export default StageColorSettings;
