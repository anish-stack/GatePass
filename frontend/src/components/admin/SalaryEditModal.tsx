import React, { useState } from 'react';
import { X, Save, AlertTriangle, Pencil } from 'lucide-react';
import { PayrollRecord } from '../../types';
import { ApiService } from '../../services/api';
import { formatCurrency } from '../../utils/timeCalculations';

/** Manual salary edit for one payroll row: Bonus / Allowance (+), Other Deduction (-), Reason */
export const SalaryEditModal: React.FC<{
  record: PayrollRecord;
  onClose: () => void;
  onSaved: (r: PayrollRecord) => void;
}> = ({ record, onClose, onSaved }) => {
  const base =
    record.netBeforeAdjustment ??
    Math.round(((record.netSalary || 0) - (record.bonusAmount || 0) + (record.otherDeduction || 0)) * 100) / 100;

  const [bonus, setBonus] = useState<number | ''>(record.bonusAmount || '');
  const [deduction, setDeduction] = useState<number | ''>(record.otherDeduction || '');
  const [remarks, setRemarks] = useState(record.adjustmentRemarks || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const b = Number(bonus) || 0;
  const d = Number(deduction) || 0;
  const newNet = Math.max(0, Math.round((base + b - d) * 100) / 100);
  const changed = b !== (record.bonusAmount || 0) || d !== (record.otherDeduction || 0) || remarks.trim() !== (record.adjustmentRemarks || '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (b < 0 || d < 0) return setError('Amounts cannot be negative.');
    if ((b > 0 || d > 0) && !remarks.trim()) return setError('Please enter a reason for this salary change.');
    if (record.paymentStatus === 'PAID' && !confirm('This salary is already marked PAID. Edit anyway?')) return;
    setSaving(true);
    try {
      const saved = await ApiService.adjustPayroll(record.id, {
        bonusAmount: b,
        otherDeduction: d,
        adjustmentRemarks: remarks.trim(),
      });
      onSaved(saved);
    } catch (err: any) {
      setError(err.message || 'Failed to save salary.');
    } finally {
      setSaving(false);
    }
  };

  const field =
    'w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm font-mono text-white outline-none focus:border-emerald-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <form
        onSubmit={handleSave}
        className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-4 sm:p-6 text-white my-auto shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit Salary
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              {record.workerName} ({record.employeeId})
            </h3>
            <p className="text-xs text-slate-400">Salary Month: {record.month}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1 font-mono">
          <div className="flex justify-between">
            <span className="text-slate-400 font-sans">Calculated Net (attendance + OT − advance):</span>
            <span className="text-white">{formatCurrency(base, true)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Bonus / Allowance (+)</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-emerald-400 font-mono text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={bonus}
                onChange={e => setBonus(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className={field}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Other Deduction (−)</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-rose-400 font-mono text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={deduction}
                onChange={e => setDeduction(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className={field}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Reason / Remarks {(b > 0 || d > 0) && <span className="text-rose-400">*</span>}
          </label>
          <input
            type="text"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="e.g. Diwali bonus, canteen dues, damage recovery"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>

        <div className="bg-emerald-950/60 border border-emerald-700/60 p-3 rounded-xl flex items-center justify-between">
          <span className="text-xs text-emerald-300 font-semibold uppercase">New Net Salary</span>
          <span className="text-xl font-black text-emerald-400 font-mono">{formatCurrency(newNet, true)}</span>
        </div>

        <p className="text-[11px] text-slate-500">
          Bonus / deduction stays saved even when you click “Recalculate Monthly Salary”. Change is logged in Audit Logs.
        </p>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !changed}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Salary
          </button>
        </div>
      </form>
    </div>
  );
};
