import {
  calculateLateMinutes,
  calculateCheckOutMetrics,
  applyOtThreshold,
  getWorkingTimeDetails,
  formatTime12,
} from './timeCalculations.js';
import { getLocalDateString } from './dateUtils.js';

export const MAX_OT_MINUTES = 16 * 60;
export const MAX_SHIFT_SPAN_MS = 24 * 3600 * 1000;

const isNum = v => v !== undefined && v !== null && v !== '' && !isNaN(Number(v));

/**
 * Pure recalculation of one attendance record.
 * checkIn / checkOut: Date (checkOut may be null = still inside)
 * overrides: optional { lateMinutes, earlyExitMinutes, overtimeMinutes } -> manual values win
 */
export function computeRecordMetrics({ checkIn, checkOut, workingTime, rules, overrides = {} }) {
  const grace = Number(rules?.gracePeriodMinutes) || 0;
  const otMin = rules?.otMinimumMinutes ?? 30;

  const autoLate = calculateLateMinutes(checkIn, workingTime, grace);
  let lateMinutes = autoLate;
  let lateManual = false;
  if (isNum(overrides.lateMinutes)) {
    const v = Math.max(0, Math.round(Number(overrides.lateMinutes)));
    if (v !== autoLate) {
      lateMinutes = v;
      lateManual = true;
    }
  }

  const out = {
    lateMinutes,
    lateManual,
    totalWorkingMinutes: 0,
    earlyExitMinutes: 0,
    overtimeMinutes: 0,
    otCalculatedMinutes: undefined,
    otManuallyAdjusted: false,
    earlyManual: false,
    status: lateMinutes > 0 ? 'PRESENT - LATE' : 'PRESENT',
  };
  if (!checkOut) return out;

  const m = calculateCheckOutMetrics(checkIn, checkOut, workingTime);
  const calcOt = applyOtThreshold(m.overtimeMinutes, otMin);
  out.totalWorkingMinutes = m.totalWorkingMinutes;
  out.earlyExitMinutes = m.earlyExitMinutes;
  out.overtimeMinutes = calcOt;
  out.otCalculatedMinutes = calcOt;
  out.status = 'COMPLETED';

  if (isNum(overrides.overtimeMinutes)) {
    const v = Math.max(0, Math.round(Number(overrides.overtimeMinutes)));
    if (v > MAX_OT_MINUTES) throw new RangeError('Overtime must be between 0 and 16 hours.');
    if (v !== calcOt) {
      out.overtimeMinutes = v;
      out.otManuallyAdjusted = true;
    }
  }
  if (isNum(overrides.earlyExitMinutes)) {
    const v = Math.max(0, Math.round(Number(overrides.earlyExitMinutes)));
    if (v !== m.earlyExitMinutes) {
      out.earlyExitMinutes = v;
      out.earlyManual = true;
    }
  }
  return out;
}

/**
 * Parse an admin supplied wall-clock value.
 * "YYYY-MM-DDTHH:mm" (no offset) is read in APP_TIMEZONE (process.env.TZ); ISO with Z/offset is absolute.
 */
export function parseAdminDateTime(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return NaN;
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? NaN : d;
}

/** Fields written onto an attendance doc for a given check-in/out pair */
export function punchFields(checkIn, checkOut) {
  return {
    date: getLocalDateString(checkIn),
    checkInTime: formatTime12(checkIn),
    checkInDateTime: checkIn.toISOString(),
    checkOutTime: checkOut ? formatTime12(checkOut) : undefined,
    checkOutDateTime: checkOut ? checkOut.toISOString() : undefined,
  };
}

export function shiftFields(workingTime) {
  const d = getWorkingTimeDetails(workingTime);
  return { workingTime: d.label, workingStartTime: d.startTime12, workingEndTime: d.endTime12 };
}