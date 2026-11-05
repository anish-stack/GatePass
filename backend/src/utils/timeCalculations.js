// Ported 1:1 from frontend src/utils/timeCalculations.ts — identical salary / late / OT engine
const WORKING_TIME_OPTIONS = [
  {
    label: "09:00 AM \u2013 05:00 PM",
    startTime24: "09:00",
    endTime24: "17:00",
    startTime12: "09:00 AM",
    endTime12: "05:00 PM",
    normalWorkingMinutes: 480,
    normalWorkingHours: 8
  },
  {
    label: "09:00 AM \u2013 07:00 PM",
    startTime24: "09:00",
    endTime24: "19:00",
    startTime12: "09:00 AM",
    endTime12: "07:00 PM",
    normalWorkingMinutes: 600,
    normalWorkingHours: 10
  },
  {
    label: "09:00 AM \u2013 09:00 PM",
    startTime24: "09:00",
    endTime24: "21:00",
    startTime12: "09:00 AM",
    endTime12: "09:00 PM",
    normalWorkingMinutes: 720,
    normalWorkingHours: 12
  }
];
const LABEL_RE = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*[\u2013\u2014-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i;
const MIN_SHIFT_MINUTES = 30;
const MAX_SHIFT_MINUTES = 20 * 60;
const pad2 = n => String(n).padStart(2, "0");

function to24Minutes(h, m, ap) {
  let hh = h % 12;
  if (/pm/i.test(ap)) hh += 12;
  return hh * 60 + m;
}
function minutesToLabel12(mins) {
  const total = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${pad2(h12)}:${pad2(m)} ${ap}`;
}
function minutesToTime24(mins) {
  const total = ((mins % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}
/** "HH:MM" (24h) -> minutes since midnight, or null */
function time24ToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
/** Build canonical label from two 24h times: "09:00 AM \u2013 07:00 PM" */
function buildWorkingTimeLabel(start24, end24) {
  const s = time24ToMinutes(start24);
  const e = time24ToMinutes(end24);
  if (s === null || e === null) return null;
  return `${minutesToLabel12(s)} \u2013 ${minutesToLabel12(e)}`;
}
/** Parse any "hh:mm AM \u2013 hh:mm PM" label (presets or custom). null if invalid. */
function parseWorkingTime(label) {
  const m = LABEL_RE.exec(String(label || ""));
  if (!m) return null;
  const h1 = Number(m[1]), m1 = Number(m[2]), h2 = Number(m[4]), m2 = Number(m[5]);
  if (h1 < 1 || h1 > 12 || h2 < 1 || h2 > 12 || m1 > 59 || m2 > 59) return null;
  const startMin = to24Minutes(h1, m1, m[3]);
  const endMin = to24Minutes(h2, m2, m[6]);
  const overnight = endMin <= startMin;
  const normalMinutes = overnight ? endMin + 1440 - startMin : endMin - startMin;
  return { startMin, endMin, overnight, normalMinutes };
}
/** Throws Error(message) when invalid; returns canonical label otherwise. */
function validateWorkingTime(label) {
  const p = parseWorkingTime(label);
  if (!p) throw new Error("Working time must look like 09:00 AM \u2013 07:00 PM.");
  if (p.normalMinutes < MIN_SHIFT_MINUTES || p.normalMinutes > MAX_SHIFT_MINUTES) {
    throw new Error("Working time must be between 30 minutes and 20 hours.");
  }
  return `${minutesToLabel12(p.startMin)} \u2013 ${minutesToLabel12(p.endMin)}`;
}
function getWorkingTimeDetails(workingTime) {
  const p = parseWorkingTime(workingTime);
  if (!p || p.normalMinutes < MIN_SHIFT_MINUTES || p.normalMinutes > MAX_SHIFT_MINUTES) {
    return { ...WORKING_TIME_OPTIONS[1], overnight: false }; // legacy fallback
  }
  return {
    label: `${minutesToLabel12(p.startMin)} \u2013 ${minutesToLabel12(p.endMin)}`,
    startTime24: minutesToTime24(p.startMin),
    endTime24: minutesToTime24(p.endMin),
    startTime12: minutesToLabel12(p.startMin),
    endTime12: minutesToLabel12(p.endMin),
    normalWorkingMinutes: p.normalMinutes,
    normalWorkingHours: Math.round((p.normalMinutes / 60) * 100) / 100,
    overnight: p.overnight
  };
}
/**
 * Scheduled shift start for a punch time.
 * Day shifts: same calendar day (unchanged legacy behaviour).
 * Overnight shifts: nearest start among yesterday / today / tomorrow.
 */
function shiftStartFor(date, details) {
  const [sh, sm] = details.startTime24.split(":").map(Number);
  const base = new Date(date);
  base.setHours(sh, sm, 0, 0);
  if (!details.overnight) return base;
  let best = base;
  for (const delta of [-1, 1]) {
    const c = new Date(base);
    c.setDate(c.getDate() + delta);
    if (Math.abs(c.getTime() - date.getTime()) < Math.abs(best.getTime() - date.getTime())) best = c;
  }
  return best;
}
function formatDisplayDate(date = /* @__PURE__ */ new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}
function formatFullDisplayDate(date = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}
function formatTime12(dateOrTimeString) {
  if (!dateOrTimeString) return "--:--";
  const d = typeof dateOrTimeString === "string" && !dateOrTimeString.includes(":") ? new Date(dateOrTimeString) : typeof dateOrTimeString === "string" ? parseTimeStringToDate(dateOrTimeString) : dateOrTimeString;
  if (isNaN(d.getTime())) return typeof dateOrTimeString === "string" ? dateOrTimeString : "--:--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(d);
}
function formatTime12Short(dateOrTimeString) {
  if (!dateOrTimeString) return "--:--";
  const d = typeof dateOrTimeString === "string" && !dateOrTimeString.includes(":") ? new Date(dateOrTimeString) : typeof dateOrTimeString === "string" ? parseTimeStringToDate(dateOrTimeString) : dateOrTimeString;
  if (isNaN(d.getTime())) return typeof dateOrTimeString === "string" ? dateOrTimeString : "--:--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(d);
}
function parseTimeStringToDate(timeStr) {
  const d = /* @__PURE__ */ new Date();
  if (timeStr.includes("T")) {
    const parsed = new Date(timeStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  const isPM = /pm/i.test(timeStr);
  const isAM = /am/i.test(timeStr);
  const clean = timeStr.replace(/(am|pm)/i, "").trim();
  const parts = clean.split(":");
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parts[2] ? parseInt(parts[2], 10) : 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    d.setHours(h, m, s, 0);
  }
  return d;
}
function calculateLateMinutes(checkInDate, workingTime, gracePeriodMinutes = 0) {
  const details = getWorkingTimeDetails(workingTime);
  const expectedCheckIn = shiftStartFor(checkInDate, details);
  const diffMs = checkInDate.getTime() - expectedCheckIn.getTime();
  const diffMinutes = Math.floor(diffMs / (1e3 * 60));
  if (diffMinutes <= 0) return 0;
  if (gracePeriodMinutes > 0 && diffMinutes <= gracePeriodMinutes) {
    return 0;
  }
  return diffMinutes;
}
function calculateCheckOutMetrics(checkInDate, checkOutDate, workingTime) {
  const details = getWorkingTimeDetails(workingTime);
  const scheduledEndTime = new Date(shiftStartFor(checkInDate, details).getTime() + details.normalWorkingMinutes * 6e4);
  const totalMs = checkOutDate.getTime() - checkInDate.getTime();
  const totalWorkingMinutes = Math.max(0, Math.floor(totalMs / (1e3 * 60)));
  let earlyExitMinutes = 0;
  let overtimeMinutes = 0;
  const diffFromEndMs = checkOutDate.getTime() - scheduledEndTime.getTime();
  const diffFromEndMinutes = Math.floor(diffFromEndMs / (1e3 * 60));
  if (diffFromEndMinutes > 0) {
    overtimeMinutes = diffFromEndMinutes;
  } else if (diffFromEndMinutes < 0) {
    earlyExitMinutes = Math.abs(diffFromEndMinutes);
  }
  return {
    totalWorkingMinutes,
    earlyExitMinutes,
    overtimeMinutes
  };
}
function formatMinutesToReadable(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return "0 min";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
function formatMinutesToDuration(minutes) {
  return formatMinutesToReadable(minutes);
}
function applyOtThreshold(overtimeMinutes, minimumMinutes = 30) {
  const ot = Math.max(0, Math.floor(overtimeMinutes || 0));
  return ot >= Math.max(0, minimumMinutes || 0) ? ot : 0;
}
function getCheckInWindow(workingTime, date = new Date(), opensBeforeMinutes = 120) {
  const d = getWorkingTimeDetails(workingTime);
  const start = shiftStartFor(date, d);
  const end = new Date(start.getTime() + d.normalWorkingMinutes * 6e4);
  const opens = new Date(start.getTime() - Math.max(0, opensBeforeMinutes || 0) * 6e4);
  return { opens, start, end };
}
function isWithinCheckInWindow(workingTime, now = new Date(), opensBeforeMinutes = 120) {
  const w = getCheckInWindow(workingTime, now, opensBeforeMinutes);
  return now >= w.opens && now < w.end;
}
function formatCurrency(amount, showDecimals = false) {
  const safeAmount = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0
  }).format(safeAmount);
}
function calculateSalaryBreakdown({
  monthlySalary,
  workingTime,
  daysPresent,
  daysAbsent,
  totalLateMinutes,
  totalEarlyExitMinutes = 0,
  totalOtMinutes,
  otRateMultiplier = 1,
  advanceDeduction = 0
}) {
  const details = getWorkingTimeDetails(workingTime);
  const salaryBasisDays = 30;
  const perDaySalary = monthlySalary / salaryBasisDays;
  const normalWorkingMinutes = details.normalWorkingMinutes;
  const perMinuteSalary = perDaySalary / normalWorkingMinutes;
  const absentDeduction = Math.round(daysAbsent * perDaySalary * 100) / 100;
  const lateDeduction = Math.round(totalLateMinutes * perMinuteSalary * 100) / 100;
  const earlyExitDeduction = Math.round(totalEarlyExitMinutes * perMinuteSalary * 100) / 100;
  const otAmount = Math.round(totalOtMinutes * (perMinuteSalary * otRateMultiplier) * 100) / 100;
  const grossPayableBeforeAdvance = Math.max(
    0,
    Math.round((monthlySalary - absentDeduction - lateDeduction - earlyExitDeduction + otAmount) * 100) / 100
  );
  const actualAdvanceDeducted = Math.min(advanceDeduction, grossPayableBeforeAdvance);
  const advanceCarriedForward = Math.max(0, Math.round((advanceDeduction - actualAdvanceDeducted) * 100) / 100);
  const netSalary = Math.max(
    0,
    Math.round((grossPayableBeforeAdvance - actualAdvanceDeducted) * 100) / 100
  );
  return {
    monthlySalary,
    salaryBasisDays,
    perDaySalary,
    normalWorkingMinutes,
    perMinuteSalary,
    daysPresent,
    daysAbsent,
    absentDeduction,
    totalLateMinutes,
    lateDeduction,
    totalEarlyExitMinutes,
    earlyExitDeduction,
    totalOtMinutes,
    otAmount,
    advanceDeduction: actualAdvanceDeducted,
    advanceCarriedForward,
    grossPayableBeforeAdvance,
    netSalary
  };
}
export {
  WORKING_TIME_OPTIONS,
  parseWorkingTime,
  validateWorkingTime,
  buildWorkingTimeLabel,
  shiftStartFor,
  applyOtThreshold,
  getCheckInWindow,
  isWithinCheckInWindow,
  calculateCheckOutMetrics,
  calculateLateMinutes,
  calculateSalaryBreakdown,
  formatCurrency,
  formatDisplayDate,
  formatFullDisplayDate,
  formatMinutesToDuration,
  formatMinutesToReadable,
  formatTime12,
  formatTime12Short,
  getWorkingTimeDetails,
  parseTimeStringToDate
};