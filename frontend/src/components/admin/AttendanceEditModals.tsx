import React, { useMemo, useState } from 'react';
import { X, RotateCcw, Trash2 } from 'lucide-react';
import { AttendanceRecord, AttendanceRulesConfig, Worker } from '../../types';
import { ApiService } from '../../services/api';
import { DurationInput } from '../common/DurationInput';
import { WorkingTimePicker } from '../common/WorkingTimePicker';
import {
  applyOtThreshold,
  calculateCheckOutMetrics,
  calculateLateMinutes,
  formatMinutesToReadable,
  validateWorkingTime,
} from '../../utils/timeCalculations';

// ---------- helpers ----------
const pad = (n: number) => String(n).padStart(2, '0');
/** ISO instant -> value for <input type="datetime-local"> in the browser's local time */
export const toLocalInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** datetime-local value -> absolute ISO instant (so browser/server timezone differences cannot shift it) */
const toIso = (local: string): string => new Date(local).toISOString();

interface Preview {
  late: number;
  total: number;
  early: number;
  ot: number;
  status: string;
  error?: string;
}
function previewMetrics(inLocal: string, outLocal: string, workingTime: string, rules: AttendanceRulesConfig | null): Preview | null {
  if (!inLocal) return null;
  const ci = new Date(inLocal);
  if (isNaN(ci.getTime())) return null;
  const late = calculateLateMinutes(ci, workingTime, rules?.gracePeriodMinutes ?? 0);
  const base: Preview = { late, total: 0, early: 0, ot: 0, status: late > 0 ? 'PRESENT - LATE' : 'PRESENT' };
  if (!outLocal) return base;
  const co = new Date(outLocal);
  if (isNaN(co.getTime())) return null;
  if (co.getTime() <= ci.getTime()) return { ...base, error: 'Check-out must be after check-in.' };
  if (co.getTime() - ci.getTime() > 24 * 3600 * 1000) return { ...base, error: 'Check-in to check-out cannot exceed 24 hours.' };
  const m = calculateCheckOutMetrics(ci, co, workingTime);
  return {
    late,
    total: m.totalWorkingMinutes,
    early: m.earlyExitMinutes,
    ot: applyOtThreshold(m.overtimeMinutes, rules?.otMinimumMinutes ?? 30),
    status: 'COMPLETED',
  };
}

const Shell: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  subtitle,
  onClose,
  children,
}) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 text-white space-y-4 shadow-2xl my-auto">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="font-bold text-base text-white">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const inputCls =
  'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none focus:border-emerald-500';
const labelCls = 'text-xs font-semibold text-slate-300 block mb-1';

const ReasonBox: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="bg-amber-950/40 border border-amber-800/80 p-3 rounded-xl space-y-1">
    <label className="text-xs font-bold text-amber-300 block">Mandatory reason (saved in Audit Log) *</label>
    <textarea
      required
      rows={2}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="e.g. Guard forgot to punch out, confirmed by supervisor."
      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-amber-500"
    />
  </div>
);

const PreviewBox: React.FC<{ p: Preview | null }> = ({ p }) => {
  if (!p) return null;
  if (p.error) return <p className="text-xs text-rose-400">{p.error}</p>;
  return (
    <div className="grid grid-cols-4 gap-2 text-center bg-slate-950 border border-slate-800 rounded-xl p-2">
      {[
        ['Late', p.late, 'text-rose-400'],
        ['Worked', p.total, 'text-sky-400'],
        ['Early exit', p.early, 'text-orange-400'],
        ['OT', p.ot, 'text-amber-400'],
      ].map(([k, v, c]) => (
        <div key={k as string}>
          <div className="text-[10px] text-slate-500">{k}</div>
          <div className={`text-xs font-bold font-mono ${c}`}>{formatMinutesToReadable(v as number)}</div>
        </div>
      ))}
    </div>
  );
};

// ================= EDIT =================
interface EditProps {
  record: AttendanceRecord;
  rules: AttendanceRulesConfig | null;
  onClose: () => void;
  onSaved: (note: string) => void;
}

export const EditAttendanceModal: React.FC<EditProps> = ({ record, rules, onClose, onSaved }) => {
  const initIn = toLocalInput(record.checkInDateTime);
  const initOut = toLocalInput(record.checkOutDateTime);
  const hasPunch = Boolean(record.checkInDateTime);

  const [checkIn, setCheckIn] = useState(initIn);
  const [checkOut, setCheckOut] = useState(initOut);
  const [workingTime, setWorkingTime] = useState(record.workingTime);
  const [absentStatus, setAbsentStatus] = useState<'ABSENT' | 'NOT_ARRIVED'>(record.status === 'NOT_ARRIVED' ? 'NOT_ARRIVED' : 'ABSENT');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Values that differ from the calculation are manual: keep them ticked so an unrelated edit does not wipe them
  const auto0 = useMemo(() => previewMetrics(initIn, initOut, record.workingTime, rules), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [ovLate, setOvLate] = useState(Boolean(auto0 && !auto0.error && hasPunch && (record.lateMinutes || 0) !== auto0.late));
  const [ovOt, setOvOt] = useState(Boolean(auto0 && hasPunch && initOut && (record.overtimeMinutes || 0) !== auto0.ot));
  const [ovEarly, setOvEarly] = useState(Boolean(auto0 && hasPunch && initOut && (record.earlyExitMinutes || 0) !== auto0.early));
  const [lateVal, setLateVal] = useState(record.lateMinutes || 0);
  const [otVal, setOtVal] = useState(record.overtimeMinutes || 0);
  const [earlyVal, setEarlyVal] = useState(record.earlyExitMinutes || 0);

  const preview = useMemo(() => previewMetrics(checkIn, checkOut, workingTime, rules), [checkIn, checkOut, workingTime, rules]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    const wtErr = validateWorkingTime(workingTime);
    if (wtErr) return alert(wtErr);
    if (preview?.error) return alert(preview.error);

    const changes: Parameters<typeof ApiService.editAttendance>[1] = { reason: reason.trim() };
    if (hasPunch || checkIn) {
      if (checkIn !== initIn) changes.checkInDateTime = toIso(checkIn);
      if (checkOut !== initOut) changes.checkOutDateTime = checkOut ? toIso(checkOut) : null;
    } else {
      changes.status = absentStatus;
    }
    if (workingTime !== record.workingTime) changes.workingTime = workingTime;
    if (ovLate) changes.lateMinutes = lateVal;
    if (ovOt && checkOut) changes.overtimeMinutes = otVal;
    if (ovEarly && checkOut) changes.earlyExitMinutes = earlyVal;
    if (!hasPunch && checkIn) changes.checkInDateTime = toIso(checkIn);

    setSaving(true);
    try {
      await ApiService.editAttendance(record.id, changes);
      onSaved(`Attendance updated. If payroll for ${record.date.slice(0, 7)} is already generated, press Recalculate there.`);
    } catch (err: any) {
      alert(err.message || 'Failed to save attendance correction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Edit Attendance" subtitle={`${record.workerName} (${record.workerEmployeeId}) • ${record.date}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Check-In (date & time)</label>
            <input type="datetime-local" value={checkIn} onChange={e => setCheckIn(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Check-Out (date & time)</label>
            <input
              type="datetime-local"
              value={checkOut}
              disabled={!checkIn}
              onChange={e => setCheckOut(e.target.value)}
              className={inputCls}
            />
            {checkOut && (
              <button
                type="button"
                onClick={() => setCheckOut('')}
                className="mt-1 text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Remove check-out (re-open punch)
              </button>
            )}
          </div>
        </div>

        {!hasPunch && !checkIn && (
          <div>
            <label className={labelCls}>No punch on this record. Status</label>
            <select value={absentStatus} onChange={e => setAbsentStatus(e.target.value as any)} className={inputCls}>
              <option value="ABSENT">ABSENT</option>
              <option value="NOT_ARRIVED">NOT_ARRIVED</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">Enter a check-in time above to turn this into a present record.</p>
          </div>
        )}

        <div>
          <label className={labelCls}>Shift used for calculation</label>
          <WorkingTimePicker value={workingTime} onChange={setWorkingTime} />
        </div>

        {checkIn && (
          <>
            <p className="text-[11px] text-slate-400">Auto calculation from these times (grace and OT minimum from Rules):</p>
            <PreviewBox p={preview} />

            <div className="space-y-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">Tick only to set a value by hand instead of the calculation.</p>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" checked={ovLate} onChange={e => { setOvLate(e.target.checked); if (e.target.checked && preview) setLateVal(preview.late); }} />
                Late time manually
              </label>
              {ovLate && <DurationInput value={lateVal} accent="rose" onChange={setLateVal} />}
              {checkOut && (
                <>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={ovOt} onChange={e => { setOvOt(e.target.checked); if (e.target.checked && preview) setOtVal(preview.ot); }} />
                    Overtime manually
                  </label>
                  {ovOt && <DurationInput value={otVal} accent="amber" onChange={setOtVal} />}
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={ovEarly} onChange={e => { setOvEarly(e.target.checked); if (e.target.checked && preview) setEarlyVal(preview.early); }} />
                    Early exit manually
                  </label>
                  {ovEarly && <DurationInput value={earlyVal} accent="rose" onChange={setEarlyVal} />}
                </>
              )}
            </div>
          </>
        )}

        <ReasonBox value={reason} onChange={setReason} />

        <div className="pt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs cursor-pointer"
          >
            {saving ? 'Saving…' : 'Save Correction'}
          </button>
        </div>
      </form>
    </Shell>
  );
};

// ================= ADD =================
interface AddProps {
  workers: Worker[];
  defaultDate: string;
  rules: AttendanceRulesConfig | null;
  onClose: () => void;
  onSaved: (note: string) => void;
}

export const AddAttendanceModal: React.FC<AddProps> = ({ workers, defaultDate, rules, onClose, onSaved }) => {
  const [workerId, setWorkerId] = useState(workers[0]?.id || '');
  const worker = workers.find(w => w.id === workerId);
  const [workingTime, setWorkingTime] = useState(worker?.workingTime || '09:00 AM – 07:00 PM');
  const [checkIn, setCheckIn] = useState(`${defaultDate}T09:00`);
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => previewMetrics(checkIn, checkOut, workingTime, rules), [checkIn, checkOut, workingTime, rules]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !checkIn || !reason.trim()) return;
    if (preview?.error) return alert(preview.error);
    const wtErr = validateWorkingTime(workingTime);
    if (wtErr) return alert(wtErr);
    setSaving(true);
    try {
      await ApiService.addManualAttendance({
        workerId,
        checkInDateTime: toIso(checkIn),
        checkOutDateTime: checkOut ? toIso(checkOut) : undefined,
        workingTime,
        reason: reason.trim(),
      });
      onSaved('Attendance added. Recalculate payroll for that month if it is already generated.');
    } catch (err: any) {
      alert(err.message || 'Failed to add attendance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Add Attendance Manually" subtitle="For a punch the guard missed. No photo is attached." onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelCls}>Worker</label>
          <select
            value={workerId}
            onChange={e => {
              setWorkerId(e.target.value);
              const w = workers.find(x => x.id === e.target.value);
              if (w) setWorkingTime(w.workingTime);
            }}
            className={inputCls}
          >
            {workers.map(w => (
              <option key={w.id} value={w.id}>
                {w.fullName} ({w.employeeId})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Check-In *</label>
            <input type="datetime-local" required value={checkIn} onChange={e => setCheckIn(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Check-Out (optional)</label>
            <input type="datetime-local" value={checkOut} onChange={e => setCheckOut(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Shift used for calculation</label>
          <WorkingTimePicker value={workingTime} onChange={setWorkingTime} />
        </div>
        <PreviewBox p={preview} />
        <ReasonBox value={reason} onChange={setReason} />
        <div className="pt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !workerId}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs cursor-pointer"
          >
            {saving ? 'Saving…' : 'Add Attendance'}
          </button>
        </div>
      </form>
    </Shell>
  );
};

// ================= DELETE / REOPEN (reason only) =================
interface ReasonProps {
  kind: 'delete' | 'reopen';
  record: AttendanceRecord;
  onClose: () => void;
  onDone: (note: string) => void;
}

export const ReasonActionModal: React.FC<ReasonProps> = ({ kind, record, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isDelete = kind === 'delete';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    try {
      if (isDelete) await ApiService.deleteAttendance(record.id, reason.trim());
      else await ApiService.reopenAttendance(record.id, reason.trim());
      onDone(isDelete ? 'Attendance record deleted.' : 'Punch re-opened: worker is shown inside again, check-out cleared.');
    } catch (err: any) {
      alert(err.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title={isDelete ? 'Delete Attendance Record' : 'Re-open Punch'}
      subtitle={`${record.workerName} (${record.workerEmployeeId}) • ${record.date}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <p className={`text-xs ${isDelete ? 'text-rose-300' : 'text-slate-300'}`}>
          {isDelete
            ? 'This permanently removes the record and its photos. This cannot be undone.'
            : 'Check-out is removed and OT / early exit / worked time reset. The worker can be checked out again at the gate.'}
        </p>
        <ReasonBox value={reason} onChange={setReason} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`px-4 py-1.5 disabled:opacity-50 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 ${
              isDelete ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {isDelete ? <Trash2 className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {busy ? 'Please wait…' : isDelete ? 'Delete Record' : 'Re-open Punch'}
          </button>
        </div>
      </form>
    </Shell>
  );
};