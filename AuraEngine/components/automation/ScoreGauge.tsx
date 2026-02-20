import React from 'react';

interface ScoreGaugeProps {
  value: number;
  max: number;
  size?: number;
  label?: string;
  thresholds?: { good: number; warn: number };
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({ value, max, size = 96, label, thresholds = { good: 80, warn: 50 } }) => {
  const pct = max > 0 ? value / max : 0;
  const r = (size / 2) - 8;
  const circumference = 2 * Math.PI * r;
  const color = (value / max * 100) >= thresholds.good ? '#10b981' : (value / max * 100) >= thresholds.warn ? '#f59e0b' : '#ef4444';

  return (
    <svg className="mx-auto" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${pct * circumference} ${circumference}`}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 - 4} textAnchor="middle" className="text-xl font-black" fill="#1e293b">{value}</text>
      {label && <text x={size/2} y={size/2 + 12} textAnchor="middle" className="text-[8px] font-bold" fill="#94a3b8">{label}</text>}
    </svg>
  );
};
