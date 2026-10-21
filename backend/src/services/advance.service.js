import { Advance, AdvanceDeduction, Worker, PUBLIC } from '../models/index.js';
import { syncPayrollMonths } from './payroll.service.js';
import { addAuditLog } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';
import { genId, getLocalDateString, getCurrentMonth, round2 } from '../utils/dateUtils.js';

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer'];

export async function getAdvances(filters = {}) {
  const q = {};
  if (filters.workerId) q.workerId = String(filters.workerId);
  const and = [];
  if (filters.month) {
    const m = String(filters.month);
    and.push({ $or: [{ salaryMonth: m }, { advanceDate: { $regex: `^${escapeRegex(m)}` } }] });
  }
  if (filters.status && filters.status !== 'ALL') q.status = String(filters.status);
  if (filters.paymentMode && filters.paymentMode !== 'ALL') q.paymentMode = String(filters.paymentMode);
  if (filters.search) {
    const rx = { $regex: escapeRegex(String(filters.search)), $options: 'i' };
    and.push({ $or: [{ workerName: rx }, { employeeId: rx }, { transactionNumber: rx }, { paymentReference: rx }] });
  }
  if (and.length) q.$and = and;

  // Sort by advanceDate DESC
  return Advance.find(q).sort({ advanceDate: -1, createdAt: -1 }).select(PUBLIC).lean();
}

export async function getAdvanceById(id) {
  return Advance.findOne({ id }).select(PUBLIC).lean();
}

async function nextTransactionNumber() {
  // Sequential ADV-XXX (count + 1), skip collisions
  let count = (await Advance.countDocuments()) + 1;
  let tn = `ADV-${String(count).padStart(3, '0')}`;
  while (await Advance.exists({ transactionNumber: tn })) {
    count += 1;
    tn = `ADV-${String(count).padStart(3, '0')}`;
  }
  return tn;
}

export async function createAdvance(payload = {}, actor) {
  const worker = await Worker.findOne({ id: payload.workerId }).lean();
  if (!worker) throw new HttpError(404, `Worker with ID ${payload.workerId} not found.`);

  const amount = Number(payload.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new HttpError(400, 'Advance amount must be a valid number greater than zero.');
  }
  if (payload.paymentMode && !PAYMENT_MODES.includes(payload.paymentMode)) {
    throw new HttpError(400, 'Invalid payment mode.');
  }

  const transactionNumber = await nextTransactionNumber();
  const date = payload.advanceDate || getLocalDateString();
  const salaryMonth = payload.salaryMonth || date.substring(0, 7);
  const createdBy = actor?.name || payload.createdBy || 'Factory Superintendent / HR Admin';

  const now = new Date().toISOString();
  const newAdvance = {
    id: genId('adv'),
    transactionNumber,
    workerId: worker.id,
    workerName: worker.fullName,
    employeeId: worker.employeeId,
    amount,
    advanceDate: date,
    salaryMonth,
    paymentMode: payload.paymentMode || 'Cash',
    paymentReference: payload.paymentReference?.trim() || undefined,
    remarks: payload.remarks?.trim() || undefined,
    status: 'ACTIVE',
    deductedAmount: 0,
    remainingAmount: amount,
    recordSource: 'live',
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  await Advance.create(newAdvance);

  await addAuditLog({
    timestamp: now,
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: createdBy,
    actionType: 'ADVANCE_CREATED',
    details: `Advance salary of ₹${amount.toLocaleString()} granted to ${worker.fullName} (${worker.employeeId}). Transaction: ${transactionNumber}. Mode: ${newAdvance.paymentMode}. Month: ${salaryMonth}.`,
    targetWorkerId: worker.id,
    targetWorkerName: worker.fullName,
    metadata: { transactionNumber, amount, paymentMode: newAdvance.paymentMode },
  });

  // Re-apply payroll for that month if it was already generated
  await syncPayrollMonths([salaryMonth], actor);
  return getAdvanceById(newAdvance.id);
}

export async function updateAdvance(id, updates = {}, actor) {
  const adv = await Advance.findOne({ id });
  if (!adv) throw new HttpError(404, `Advance transaction ${id} not found.`);
  if (adv.status === 'VOIDED') throw new HttpError(400, 'Cannot edit a voided advance transaction.');

  if (adv.deductedAmount > 0 && updates.amount !== undefined) {
    const newAmount = Number(updates.amount);
    if (isNaN(newAmount) || newAmount < adv.deductedAmount) {
      throw new HttpError(400, `Cannot reduce advance amount below already deducted amount (₹${adv.deductedAmount}).`);
    }
    adv.amount = newAmount;
    adv.remainingAmount = Math.max(0, round2(newAmount - adv.deductedAmount));
    adv.status = adv.remainingAmount === 0 ? 'FULLY_DEDUCTED' : 'PARTIALLY_DEDUCTED';
  } else if (updates.amount !== undefined) {
    const newAmount = Number(updates.amount);
    if (isNaN(newAmount) || newAmount <= 0) throw new HttpError(400, 'Advance amount must be greater than zero.');
    adv.amount = newAmount;
    adv.remainingAmount = newAmount;
  }

  if (updates.advanceDate) adv.advanceDate = updates.advanceDate;
  if (updates.salaryMonth) adv.salaryMonth = updates.salaryMonth;
  if (updates.paymentMode) {
    if (!PAYMENT_MODES.includes(updates.paymentMode)) throw new HttpError(400, 'Invalid payment mode.');
    adv.paymentMode = updates.paymentMode;
  }
  if (updates.paymentReference !== undefined) adv.paymentReference = updates.paymentReference;
  if (updates.remarks !== undefined) adv.remarks = updates.remarks;
  adv.updatedAt = new Date().toISOString();
  await adv.save();

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || updates.updatedBy || 'Factory Superintendent / HR Admin',
    actionType: 'ADVANCE_UPDATED',
    details: `Advance transaction ${adv.transactionNumber} for ${adv.workerName} updated. Amount: ₹${adv.amount}. Mode: ${adv.paymentMode}.`,
    targetWorkerId: adv.workerId,
    targetWorkerName: adv.workerName,
  });

  // Edited advance -> recalc every month it touches (deducted months + salary month)
  const dedMonths = (await AdvanceDeduction.find({ advanceTransactionId: id }).select('month').lean()).map(d => d.month);
  await syncPayrollMonths([adv.salaryMonth, ...dedMonths], actor);
  return getAdvanceById(id);
}

export async function voidAdvance(id, voidedBy, reason, actor) {
  const adv = await Advance.findOne({ id });
  if (!adv) throw new HttpError(404, `Advance transaction ${id} not found.`);
  if (adv.status === 'VOIDED') throw new HttpError(400, 'This advance transaction is already voided.');
  if (adv.deductedAmount > 0) {
    throw new HttpError(
      400,
      `Cannot void advance ${adv.transactionNumber} because ₹${adv.deductedAmount} has already been deducted in payroll. Reconcile or cancel payroll first.`
    );
  }

  const by = actor?.name || voidedBy || 'Admin';
  const now = new Date().toISOString();
  adv.status = 'VOIDED';
  adv.remainingAmount = 0;
  adv.voidReason = reason || 'Cancelled by Admin';
  adv.voidedAt = now;
  adv.voidedBy = by;
  adv.updatedAt = now;
  await adv.save();

  await addAuditLog({
    timestamp: now,
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: by,
    actionType: 'ADVANCE_VOIDED',
    details: `Advance transaction ${adv.transactionNumber} (₹${adv.amount}) for ${adv.workerName} was VOIDED. Reason: ${adv.voidReason}.`,
    targetWorkerId: adv.workerId,
    targetWorkerName: adv.workerName,
  });

  await syncPayrollMonths([adv.salaryMonth], actor);
  return getAdvanceById(id);
}

export async function getAdvanceStats(month) {
  const all = await Advance.find().select(PUBLIC).lean();

  const monthAdvances = all.filter(
    a => (a.salaryMonth === month || a.advanceDate.startsWith(month)) && a.status !== 'VOIDED'
  );
  const totalAdvancePaidMonth = monthAdvances.reduce((sum, a) => sum + a.amount, 0);
  const totalWorkersWithAdvance = new Set(monthAdvances.map(a => a.workerId)).size;
  const totalAdvanceTransactions = monthAdvances.length;

  // Outstanding balance across all active / partially deducted advances in system
  const outstandingAdvanceBalance = all
    .filter(a => a.status !== 'VOIDED')
    .reduce((sum, a) => sum + (a.remainingAmount || 0), 0);

  // This month's actual deductions recorded
  const monthDeds = await AdvanceDeduction.find({ month }).lean();
  const monthAdvanceDeductions = monthDeds.reduce((sum, d) => sum + d.deductedAmount, 0);

  const recentTransactions = all
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  return {
    month,
    totalAdvancePaidMonth,
    totalWorkersWithAdvance,
    totalAdvanceTransactions,
    outstandingAdvanceBalance,
    monthAdvanceDeductions,
    recentTransactions,
  };
}

export async function getWorkerAdvanceSummary(workerId) {
  const worker = await Worker.findOne({ id: workerId }).lean();
  if (!worker) throw new HttpError(404, `Worker ${workerId} not found.`);

  const currentMonth = getCurrentMonth();
  const transactions = await Advance.find({ workerId }).sort({ advanceDate: -1 }).select(PUBLIC).lean();
  const deductions = await AdvanceDeduction.find({ workerId }).sort({ createdAt: -1 }).select(PUBLIC).lean();

  const validTx = transactions.filter(a => a.status !== 'VOIDED');
  const totalAdvanceReceived = validTx.reduce((sum, a) => sum + a.amount, 0);
  const currentMonthAdvance = validTx
    .filter(a => a.salaryMonth === currentMonth || a.advanceDate.startsWith(currentMonth))
    .reduce((sum, a) => sum + a.amount, 0);
  const totalAdvanceDeducted = deductions.reduce((sum, d) => sum + d.deductedAmount, 0);
  const outstandingBalance = validTx.reduce((sum, a) => sum + (a.remainingAmount || 0), 0);

  return {
    workerId: worker.id,
    workerName: worker.fullName,
    employeeId: worker.employeeId,
    profilePhoto: worker.profilePhoto,
    department: worker.department,
    monthlySalary: worker.monthlySalary,
    totalAdvanceReceived,
    currentMonthAdvance,
    totalAdvanceDeducted,
    outstandingBalance,
    transactions,
    deductions,
  };
}
