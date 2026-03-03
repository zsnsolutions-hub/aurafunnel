import React from 'react';
import { ToneConfig, buildToneInstruction } from '../../../lib/dna';

interface Props {
  toneConfig: ToneConfig;
  onChange: (config: ToneConfig) => void;
  disabled?: boolean;
}

const SLIDERS: { key: keyof Pick<ToneConfig, 'formality' | 'creativity' | 'verbosity'>; label: string; low: string; high: string }[] = [
  { key: 'formality', label: 'Formality', low: 'Casual', high: 'Formal' },
  { key: 'creativity', label: 'Creativity', low: 'Factual', high: 'Creative' },
  { key: 'verbosity', label: 'Verbosity', low: 'Concise', high: 'Detailed' },
];

const DnaToneBuilder: React.FC<Props> = ({ toneConfig, onChange, disabled }) => {
  const update = (key: string, value: number | string) => {
    onChange({ ...toneConfig, [key]: value });
  };

  const preview = buildToneInstruction(toneConfig);

  return (
    <div className="space-y-6">
      {SLIDERS.map(({ key, label, low, high }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
              {toneConfig[key]}/10
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={toneConfig[key]}
            onChange={e => update(key, parseInt(e.target.value, 10))}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">{low}</span>
            <span className="text-[10px] text-gray-400">{high}</span>
          </div>
        </div>
      ))}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Custom Instructions</label>
        <textarea
          value={toneConfig.custom_instructions}
          onChange={e => update('custom_instructions', e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="Additional tone or style instructions..."
          className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none disabled:opacity-50"
        />
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Live Preview</p>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 leading-relaxed">{preview}</p>
        </div>
      </div>
    </div>
  );
};

export default DnaToneBuilder;
