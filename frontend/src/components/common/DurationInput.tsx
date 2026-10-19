import React from 'react';

/** Hours + minutes editor that stores total minutes (e.g. 1 hr 20 min = 80) */
export const DurationInput: React.FC<{
  value: number;
  onChange: (minutes: number) => void;
  maxHours?: number;
  className?: string;
  accent?: 'amber' | 'emerald' | 'rose' | 'sky';
}> = ({ value, onChange, maxHours = 16, className = '', accent = 'emerald' }) => {
  const total = Math.max(0, Math.round(value || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const ring = {
    amber: 'focus:border-amber-500',
    emerald: 'focus:border-emerald-500',
    rose: 'focus:border-rose-500',
    sky: 'focus:border-sky-500',
  }[accent];
  const field = `w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2 text-sm font-mono text-white outline-none ${ring}`;

  const set = (hh: number, mm: number) => {
    const H = Math.min(maxHours, Math.max(0, Math.floor(hh || 0)));
    const M = Math.min(59, Math.max(0, Math.floor(mm || 0)));
    onChange(H * 60 + M);
  };

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={maxHours}
          step={1}
          value={h}
          onChange={e => set(Number(e.target.value), m)}
          className={field}
          aria-label="Hours"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">hr</span>
      </div>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={1}
          value={m}
          onChange={e => set(h, Number(e.target.value))}
          className={field}
          aria-label="Minutes"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">min</span>
      </div>
    </div>
  );
};
