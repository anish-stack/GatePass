import { Worker, Guard } from '../models/index.js';
import { getAttendance } from './attendance.service.js';
import { getPayroll } from './payroll.service.js';
import { getRules } from './rules.service.js';
import { getAuditLogs } from './audit.service.js';
import { round2 } from '../utils/dateUtils.js';
import { getWorkingTimeDetails } from '../utils/timeCalculations.js';

export async function getReports(month) {
  const workers = await Worker.find().sort({ seq: 1 }).lean();
  const attendance = await getAttendance({ month }, { withPhotos: false });
  const payroll = await getPayroll(month);
  const rules = await getRules();

  // 1. Late Attendance Records
  const lateRecords = attendance
    .filter(a => (a.lateMinutes || 0) > 0)
    .map(a => {
      const worker = workers.find(w => w.id === a.workerId);
      const dailyWage = (worker?.monthlySalary || 15000) / 30;
      const normalMins = getWorkingTimeDetails(worker?.workingTime).normalWorkingMinutes;
      const perMin = dailyWage / normalMins;
      const deduction = round2(a.lateMinutes * perMin);
      return {
        id: a.id,
        date: a.date,
        workerId: a.workerId,
        workerName: a.workerName,
        employeeId: a.workerEmployeeId,
        department: worker?.department || 'Production',
        workingTime: a.workingTime,
        checkInTime: a.checkInTime,
        lateMinutes: a.lateMinutes,
        deductionAmount: deduction,
        guardName: a.checkInMarkedByGuardName,
        gate: a.checkInGate,
        recordSource: a.recordSource || 'seed',
      };
    });

  // 2. Absenteeism Records
  const absentRecords = attendance
    .filter(a => a.status === 'ABSENT')
    .map(a => {
      const worker = workers.find(w => w.id === a.workerId);
      const perDay = round2((worker?.monthlySalary || 15000) / 30);
      return {
        id: a.id,
        date: a.date,
        workerId: a.workerId,
        workerName: a.workerName,
        employeeId: a.workerEmployeeId,
        department: worker?.department || 'Production',
        workingTime: a.workingTime,
        deductionAmount: perDay,
        guardName: a.checkInMarkedByGuardName || 'System',
        recordSource: a.recordSource || 'seed',
      };
    });

  // 3. Overtime (OT) Records
  const otRecords = attendance
    .filter(a => (a.overtimeMinutes || 0) > 0)
    .map(a => {
      const worker = workers.find(w => w.id === a.workerId);
      const dailyWage = (worker?.monthlySalary || 15000) / 30;
      const normalMins = getWorkingTimeDetails(worker?.workingTime).normalWorkingMinutes;
      const perMin = dailyWage / normalMins;
      const otPay = round2(a.overtimeMinutes * (perMin * (rules.otRateMultiplier || 1.0)));
      return {
        id: a.id,
        date: a.date,
        workerId: a.workerId,
        workerName: a.workerName,
        employeeId: a.workerEmployeeId,
        department: worker?.department || 'Production',
        workingTime: a.workingTime,
        checkOutTime: a.checkOutTime,
        workingEndTime: a.workingEndTime,
        overtimeMinutes: a.overtimeMinutes,
        otPayAmount: otPay,
        guardName: a.checkOutMarkedByGuardName || a.checkInMarkedByGuardName,
        gate: a.checkOutGate || a.checkInGate,
        recordSource: a.recordSource || 'seed',
      };
    });

  // 4. Aggregate Monthly Metrics
  const sum = key => payroll.reduce((s, p) => s + (p[key] || 0), 0);
  const summary = {
    month,
    totalWorkers: workers.length,
    totalPresentDays: sum('daysPresent'),
    totalAbsentDays: sum('daysAbsent'),
    totalLateMinutes: sum('totalLateMinutes'),
    totalLateDeductions: round2(sum('totalLateDeduction')),
    totalOtMinutes: sum('totalOtMinutes'),
    totalOtPaid: round2(sum('totalOtPay')),
    totalEarlyExitMinutes: sum('totalEarlyExitMinutes'),
    totalEarlyExitDeductions: round2(sum('totalEarlyExitDeduction')),
    totalAdvanceDeductions: round2(sum('advanceDeduction')),
    totalWageLiability: round2(sum('netSalary')),
  };

  return { month, summary, lateRecords, absentRecords, otRecords, workerMonthlyMatrix: payroll };
}

export async function getDashboardStats(dateStr, monthStr) {
  const workers = await Worker.find().select('monthlySalary').lean();
  const guards = await Guard.find().select('status').lean();
  const todayAttendance = await getAttendance({ date: dateStr });

  const totalWorkers = workers.length;
  const insideFactory = todayAttendance.filter(a => a.checkInTime && !a.checkOutTime).length;
  const checkedInToday = todayAttendance.filter(a => Boolean(a.checkInTime)).length;
  const lateToday = todayAttendance.filter(a => (a.lateMinutes || 0) > 0).length;
  const completedToday = todayAttendance.filter(a => Boolean(a.checkOutTime)).length;
  const absentToday = todayAttendance.filter(a => a.status === 'ABSENT').length;
  const activeGuards = guards.filter(g => g.status === 'ACTIVE').length;
  const totalWageLiability = workers.reduce((s, w) => s + (w.monthlySalary || 0), 0);

  return {
    date: dateStr,
    month: monthStr,
    totalWorkers,
    insideFactory,
    checkedInToday,
    lateToday,
    completedToday,
    absentToday,
    activeGuards,
    totalWageLiability,
    todayRoll: todayAttendance.slice(0, 10),
    recentAuditLogs: await getAuditLogs(8),
  };
}
