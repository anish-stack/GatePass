import React, { useEffect, useState } from 'react';
import { useShifts } from '../../hooks/useShifts';
import {
  WORKING_TIME_OPTIONS,
  buildWorkingTimeLabel,
  splitWorkingTime,
  validateWorkingTime,
  getWorkingTimeDetails,
  formatMinutesToReadable,
} from '../../utils/timeCalculations';

interface WorkingTimePickerProps {
  value: string;
  onChange: (label: string) => void;
  className?: string;
}

const CUSTOM = '__custom__';

/** Preset shifts + fully custom start / end time. Value is always a "hh:mm AM – hh:mm PM" label. */
export const WorkingTimePicker: React.FC<WorkingTimePickerProps> = ({ value, onChange, className = '' }) => {
  const { shifts } = useShifts();
  const options = shifts.filter(s => s.isActive).length ? shifts.filter(s => s.isActive) : WORKING_TIME_OPTIONS;
  const isPreset = options.some(o => o.label === value);
  const [custom, setCustom] = useState(!isPreset);
  const initial = splitWorkingTime(value) || { start24: '09:00', end24: '19:00' };
  const [start, setStart] = useState(initial.start24);
  const [end, setEnd] = useState(initial.end24);

  // Sync when the parent loads another worker into the form
  useEffect(() => {
    const preset = options.some(o => o.label === value);
    setCustom(!preset);
    const parts = splitWorkingTime(value);
    if (parts) {
      setStart(parts.start24);
      setEnd(parts.end24);
    }
  }, [value, shifts]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = buildWorkingTimeLabel(start, end);
  const error = custom ? validateWorkingTime(label || '') : null;
  const details = custom && !error ? getWorkingTimeDetails(label || '') : null;

  const pushCustom = (s: string, e: string) => {
    setStart(s);
    setEnd(e);
    const l = buildWorkingTimeLabel(s, e);
    if (l) onChange(l);
  };

  const inputCls =
    'w-full bg-slate-950 border-2 border-emerald-600/50 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 font-mono';

  return (
    <div className={className}>
      <select
        value={custom ? CUSTOM : value}
        onChange={e => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            pushCustom(start, end);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        className={inputCls}
      >
        {options.map(o => (
          <option key={o.label} value={o.label}>
            {o.label} ({o.normalWorkingHours} Hours)
          </option>
        ))}
        <option value={CUSTOM}>Custom time…</option>
      </select>

      {custom && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">Start time</label>
            <input type="time" value={start} onChange={e => pushCustom(e.target.value, end)} className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">End time</label>
            <input type="time" value={end} onChange={e => pushCustom(start, e.target.value)} className={inputCls} />
          </div>
          <p className={`col-span-2 text-[11px] ${error ? 'text-rose-400' : 'text-slate-400'}`}>
            {error ||
              `${label} • ${formatMinutesToReadable(details!.normalWorkingMinutes)} duty${
                details!.overnight ? ' • ends next day (night shift)' : ''
              }`}
          </p>
        </div>
      )}
    </div>
  );
};