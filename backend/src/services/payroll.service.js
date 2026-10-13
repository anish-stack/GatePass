import { Payroll, Worker, Advance, AdvanceDeduction, PUBLIC } from '../models/index.js';
import { addAuditLog } from './audit.service.js';
import { getRules } from './rules.service.js';
import { getAttendance } from './attendance.service.js';
import { genId, round2 } from '../utils/dateUtils.js';
import { calculateSalaryBreakdown } from '../utils/timeCalculations.js';

/**
 * Initial seed payroll (port of db.ts generateInitialSeedPayroll) — pure function
 */
export function generateInitialSeedPayroll(workers, attendance, rules, month, advances, advanceDeductions, today) {
  return workers.map((w, idx) => {
    const records = attendance.filter(a => a.workerId === w.id && a.date.startsWith(month));
    let daysAbsent = 0;
    let totalLateMinutes = 0;
    let totalOtMinutes = 0;
    let totalEarlyExitMinutes = 0;

    if (records.length > 0) {
      daysAbsent = records.filter(a => a.status === 'ABSENT').length;
      totalLateMinutes = records.reduce((s, r) => s + (r.lateMinutes || 0), 0);
      totalOtMinutes = records.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
      totalEarlyExitMinutes = records.reduce((s, r) => s + (r.earlyExitMinutes || 0), 0);
    }

    // 30 Calendar Days Basis
    const workingDaysInMonth = 30;
    const daysPresent = workingDaysInMonth - daysAbsent;

    const workerDeductions = advanceDeductions.filter(d => d.workerId === w.id && d.month === month);
    const totalAdvanceDeducted = workerDeductions.reduce((sum, d) => sum + d.deductedAmount, 0);

    const linkedAdvanceDeductions = workerDeductions.map(d => {
      const tx = advances.find(a => a.id === d.advanceTransactionId);
      return {
        transactionId: d.advanceTransactionId,
        transactionNumber: d.transactionNumber,
        advanceDate: tx?.advanceDate || `${month}-01`,
        paymentMode: tx?.paymentMode || 'Cash',
        amountDeducted: d.deductedAmount,
        totalAdvanceAmount: tx?.amount || d.deductedAmount,
        remarks: tx?.remarks,
      };
    });

    const workerAdvances = advances.filter(a => a.workerId === w.id && a.salaryMonth === month && a.status !== 'VOIDED');
    const advanceAvailable = workerAdvances.reduce((sum, a) => sum + a.amount, 0);

    const breakdown = calculateSalaryBreakdown({
      monthlySalary: w.monthlySalary,
      workingTime: w.workingTime,
      daysPresent,
      daysAbsent,
      totalLateMinutes,
      totalEarlyExitMinutes,
      totalOtMinutes,
      otRateMultiplier: rules.otRateMultiplier || 1.0,
      advanceDeduction: totalAdvanceDeducted,
    });

    return {
      id: `pay-${w.id}-${month}`,
      workerId: w.id,
      workerName: w.fullName,
      employeeId: w.employeeId,
      month,
      department: w.department,
      workingTime: w.workingTime,
      baseSalary: w.monthlySalary,
      salaryBasisDays: 30,
      dailyWage: breakdown.perDaySalary,
      normalWorkingMinutesPerDay: breakdown.normalWorkingMinutes,
      perMinuteSalary: breakdown.perMinuteSalary,
      totalDaysInMonth: 30,
      daysPresent: breakdown.daysPresent,
      daysAbsent: breakdown.daysAbsent,
      absentDeduction: breakdown.absentDeduction,
      totalLateMinutes: breakdown.totalLateMinutes,
      totalLateDeduction: breakdown.lateDeduction,
      totalEarlyExitMinutes: breakdown.totalEarlyExitMinutes,
      totalEarlyExitDeduction: breakdown.earlyExitDeduction,
      totalOtMinutes: breakdown.totalOtMinutes,
      totalOtPay: breakdown.otAmount,
      advanceAvailable: advanceAvailable > 0 ? advanceAvailable : totalAdvanceDeducted,
      advanceDeduction: breakdown.advanceDeduction,
      advanceCarriedForward: Math.max(0, advanceAvailable - breakdown.advanceDeduction),
      linkedAdvanceDeductions,
      netSalary: breakdown.netSalary,
      paymentStatus: w.employeeId === 'EMP-002' || w.employeeId === 'EMP-006' ? 'PAID' : 'APPROVED',
      generatedAt: `${today}T08:00:00Z`,
      recordSource: 'seed',
      seq: idx,
    };
  });
}

export async function getPayroll(month) {
  const matching = await Payroll.find({ month }).sort({ seq: 1 }).select(PUBLIC).lean();
  if (matching.length === 0) {
    // Calculate from live database attendance
    return recalculatePayroll(month);
  }
  return matching;
}

export async function recalculatePayroll(month, actor) {
  const workers = await Worker.find().sort({ seq: 1 }).lean();
  const rules = await getRules();
  const attendance = await getAttendance({ month }, { withPhotos: false });

  const workerIds = workers.map(w => w.id);
  const advances = await Advance.find({}).lean();
  const advMap = new Map(advances.map(a => [a.id, a]));
  const touched = new Set();

  // Step 1: Reconcile and revert any previously applied deductions for this specific month
  // to guarantee idempotency and avoid double deduction.
  const monthDeductions = await AdvanceDeduction.find({ month }).lean();
  for (const ded of monthDeductions) {
    const tx = advMap.get(ded.advanceTransactionId);
    if (tx && tx.status !== 'VOIDED') {
      tx.deductedAmount = Math.max(0, round2(tx.deductedAmount - ded.deductedAmount));
      tx.remainingAmount = Math.max(0, round2(tx.amount - tx.deductedAmount));
      tx.status = tx.remainingAmount === 0 ? 'FULLY_DEDUCTED' : tx.deductedAmount > 0 ? 'PARTIALLY_DEDUCTED' : 'ACTIVE';
      touched.add(tx.id);
    }
  }

  const existingPayroll = await Payroll.find({ month }).lean();
  const newDeductions = [];

  const calculated = workers.map((w, idx) => {
    const records = attendance.filter(a => a.workerId === w.id);
    const daysAbsent = records.filter(a => a.status === 'ABSENT').length;
    const totalLateMinutes = records.reduce((s, r) => s + (r.lateMinutes || 0), 0);
    const totalOtMinutes = records.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
    const totalEarlyExitMinutes = records.reduce((s, r) => s + (r.earlyExitMinutes || 0), 0);

    // STRICT 30-DAY MONTHLY SALARY BASIS
    const workingDaysInMonth = 30;
    const daysPresent = workingDaysInMonth - daysAbsent;

    // Base calculation before advance
    const baseBreakdown = calculateSalaryBreakdown({
      monthlySalary: w.monthlySalary,
      workingTime: w.workingTime,
      daysPresent,
      daysAbsent,
      totalLateMinutes,
      totalEarlyExitMinutes,
      totalOtMinutes,
      otRateMultiplier: rules.otRateMultiplier || 1.0,
      advanceDeduction: 0,
    });

    const grossEarnings = baseBreakdown.grossPayableBeforeAdvance;

    // Outstanding advances eligible for this month, FIFO by advanceDate ASC
    const availableAdvances = advances
      .filter(a => a.workerId === w.id && a.salaryMonth <= month && a.status !== 'VOIDED' && a.remainingAmount > 0)
      .sort((a, b) => a.advanceDate.localeCompare(b.advanceDate));

    const totalAdvanceAvailable = availableAdvances.reduce((sum, a) => sum + a.remainingAmount, 0);

    // Deduct up to gross earnings (cannot exceed; carry forward remaining balance)
    const deductionNeeded = Math.min(totalAdvanceAvailable, grossEarnings);
    let deductionRemaining = deductionNeeded;
    const linkedDeductions = [];

    for (const adv of availableAdvances) {
      if (deductionRemaining <= 0) break;
      const deductForAdv = Math.min(adv.remainingAmount, deductionRemaining);
      if (deductForAdv > 0) {
        adv.deductedAmount = round2(adv.deductedAmount + deductForAdv);
        adv.remainingAmount = Math.max(0, round2(adv.amount - adv.deductedAmount));
        adv.status = adv.remainingAmount === 0 ? 'FULLY_DEDUCTED' : 'PARTIALLY_DEDUCTED';
        adv.updatedAt = new Date().toISOString();
        touched.add(adv.id);

        linkedDeductions.push({
          transactionId: adv.id,
          transactionNumber: adv.transactionNumber,
          advanceDate: adv.advanceDate,
          paymentMode: adv.paymentMode,
          amountDeducted: deductForAdv,
          totalAdvanceAmount: adv.amount,
          remarks: adv.remarks,
        });

        newDeductions.push({
          id: genId('ded'),
          advanceTransactionId: adv.id,
          transactionNumber: adv.transactionNumber,
          payrollId: `pay-${w.id}-${month}`,
          workerId: w.id,
          month,
          deductedAmount: deductForAdv,
          createdAt: new Date().toISOString(),
        });

        deductionRemaining = Math.max(0, round2(deductionRemaining - deductForAdv));
      }
    }

    const finalBreakdown = calculateSalaryBreakdown({
      monthlySalary: w.monthlySalary,
      workingTime: w.workingTime,
      daysPresent,
      daysAbsent,
      totalLateMinutes,
      totalEarlyExitMinutes,
      totalOtMinutes,
      otRateMultiplier: rules.otRateMultiplier || 1.0,
      advanceDeduction: deductionNeeded,
    });

    // Preserve paid status if already marked paid
    const existingPay = existingPayroll.find(p => p.workerId === w.id && p.month === month);

    return {
      id: `pay-${w.id}-${month}`,
      workerId: w.id,
      workerName: w.fullName,
      employeeId: w.employeeId,
      month,
      department: w.department,
      workingTime: w.workingTime,
      baseSalary: w.monthlySalary,
      salaryBasisDays: 30,
      dailyWage: finalBreakdown.perDaySalary,
      normalWorkingMinutesPerDay: finalBreakdown.normalWorkingMinutes,
      perMinuteSalary: finalBreakdown.perMinuteSalary,
      totalDaysInMonth: 30,
      daysPresent: finalBreakdown.daysPresent,
      daysAbsent: finalBreakdown.daysAbsent,
      absentDeduction: finalBreakdown.absentDeduction,
      totalLateMinutes: finalBreakdown.totalLateMinutes,
      totalLateDeduction: finalBreakdown.lateDeduction,
      totalEarlyExitMinutes: finalBreakdown.totalEarlyExitMinutes,
      totalEarlyExitDeduction: finalBreakdown.earlyExitDeduction,
      totalOtMinutes: finalBreakdown.totalOtMinutes,
      totalOtPay: finalBreakdown.otAmount,
      advanceAvailable: totalAdvanceAvailable,
      advanceDeduction: finalBreakdown.advanceDeduction,
      advanceCarriedForward: Math.max(0, round2(totalAdvanceAvailable - finalBreakdown.advanceDeduction)),
      linkedAdvanceDeductions: linkedDeductions,
      netSalary: finalBreakdown.netSalary,
      paymentStatus: existingPay?.paymentStatus || 'APPROVED',
      paidAt: existingPay?.paidAt,
      generatedAt: new Date().toISOString(),
      recordSource: w.recordSource || 'live',
      seq: idx,
    };
  });

  // ---- Persist ----
  if (touched.size) {
    await Advance.bulkWrite(
      [...touched].map(id => {
        const a = advMap.get(id);
        return {
          updateOne: {
            filter: { id },
            update: {
              $set: {
                deductedAmount: a.deductedAmount,
                remainingAmount: a.remainingAmount,
                status: a.status,
                updatedAt: a.updatedAt,
              },
            },
          },
        };
      })
    );
  }
  await AdvanceDeduction.deleteMany({ month });
  if (newDeductions.length) await AdvanceDeduction.insertMany(newDeductions);
  await Payroll.deleteMany({ month });
  if (calculated.length) await Payroll.insertMany(calculated);

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'System Admin',
    actionType: 'PAYROLL_GENERATED',
    details: `Monthly payroll calculated dynamically from database attendance for ${workerIds.length} workers for ${month}. Total Net: ₹${calculated
      .reduce((s, r) => s + r.netSalary, 0)
      .toLocaleString()}. Total Advance Deducted: ₹${calculated.reduce((s, r) => s + (r.advanceDeduction || 0), 0).toLocaleString()}`,
  });

  return calculated.map(({ seq, ...r }) => r);
}

export async function markPayrollPaid(id) {
  const pay = await Payroll.findOneAndUpdate(
    { id },
    { $set: { paymentStatus: 'PAID', paidAt: new Date().toISOString() } },
    { new: true }
  )
    .select(PUBLIC)
    .lean();
  return pay || null;
}
