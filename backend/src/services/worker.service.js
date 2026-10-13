import { Worker, nextSeq, PUBLIC } from '../models/index.js';
import { addAuditLog } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';
import { genId } from '../utils/dateUtils.js';

// Fields a security guard must never receive
const GUARD_HIDDEN = '-bankAccountNumber -bankIfsc -aadhaarNumber -panNumber -documents -address';

// Fields clients may never set directly
const PROTECTED_FIELDS = ['_id', 'seq', 'recordSource'];
const clean = obj => {
  const copy = { ...obj };
  PROTECTED_FIELDS.forEach(f => delete copy[f]);
  return copy;
};

export async function getWorkers({ forGuard = false } = {}) {
  return Worker.find()
    .sort({ seq: 1 })
    .select(forGuard ? `${PUBLIC} ${GUARD_HIDDEN}` : PUBLIC)
    .lean();
}

export async function getWorkerById(id) {
  return Worker.findOne({ id }).select(PUBLIC).lean();
}

export async function createWorker(workerData, actor) {
  const data = clean(workerData);
  if (!data.fullName || !String(data.fullName).trim()) throw new HttpError(400, 'Worker fullName is required.');
  if (!data.employeeId || !String(data.employeeId).trim()) throw new HttpError(400, 'Worker employeeId is required.');

  const id = data.id && !(await Worker.exists({ id: data.id })) ? data.id : genId('worker');
  const dup = await Worker.exists({ employeeId: data.employeeId });
  if (dup) throw new HttpError(400, `Employee ID ${data.employeeId} already exists.`);

  const doc = await Worker.create({
    ...data,
    id,
    recordSource: 'live',
    documents: data.documents || [],
    profilePhoto: data.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&auto=format&fit=crop&q=80',
    monthlySalary: Number(data.monthlySalary) || 15000,
    seq: await nextSeq('worker'),
  });
  const newWorker = await getWorkerById(doc.id);

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'System Admin',
    actionType: 'WORKER_CREATED',
    details: `New worker profile created: ${newWorker.fullName} (${newWorker.employeeId}). Working Time: ${newWorker.workingTime}. Monthly Salary: ₹${newWorker.monthlySalary}. Source: live.`,
    targetWorkerId: newWorker.id,
    targetWorkerName: newWorker.fullName,
  });

  return newWorker;
}

export async function updateWorker(id, updates, actor) {
  const old = await getWorkerById(id);
  if (!old) return null;

  const data = clean(updates);
  delete data.id;
  if (data.employeeId && data.employeeId !== old.employeeId) {
    const dup = await Worker.exists({ employeeId: data.employeeId, id: { $ne: id } });
    if (dup) throw new HttpError(400, `Employee ID ${data.employeeId} already exists.`);
  }
  data.monthlySalary = data.monthlySalary ? Number(data.monthlySalary) : old.monthlySalary;

  await Worker.updateOne({ id }, { $set: data }, { runValidators: true });
  const updated = await getWorkerById(id);

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'System Admin',
    actionType: 'WORKER_UPDATED',
    details: `Worker ${updated.fullName} (${updated.employeeId}) profile updated by Admin.`,
    targetWorkerId: updated.id,
    targetWorkerName: updated.fullName,
  });

  return updated;
}

export async function deleteWorker(id, actor) {
  const worker = await getWorkerById(id);
  if (!worker) return false;

  await Worker.deleteOne({ id });

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'System Admin',
    actionType: 'WORKER_UPDATED',
    details: `Worker ${worker.fullName} (${worker.employeeId}) profile was deleted by Admin.`,
    targetWorkerId: worker.id,
    targetWorkerName: worker.fullName,
  });

  return true;
}
