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
function getWorkingTimeDetails(workingTime) {
  const match = WORKING_TIME_OPTIONS.find((o) => o.label === workingTime);
  return match || WORKING_TIME_OPTIONS[1];
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
  const [startHours, startMins] = details.startTime24.split(":").map(Number);
  const expectedCheckIn = new Date(checkInDate);
  expectedCheckIn.setHours(startHours, startMins, 0, 0);
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
  const [endHours, endMins] = details.endTime24.split(":").map(Number);
  const scheduledEndTime = new Date(checkInDate);
  scheduledEndTime.setHours(endHours, endMins, 0, 0);
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
  if (!minutes || minutes <= 0) return "0 Minutes";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} Minutes`;
  if (m === 0) return `${h} ${h === 1 ? "Hour" : "Hours"}`;
  return `${h} ${h === 1 ? "Hour" : "Hours"} ${m} Minutes`;
}
function formatMinutesToDuration(minutes) {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
