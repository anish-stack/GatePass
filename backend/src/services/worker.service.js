import { Worker, WorkerFile, nextSeq, PUBLIC } from '../models/index.js';
import { addAuditLog } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';
import { genId } from '../utils/dateUtils.js';

// Fields a security guard must never receive
const GUARD_HIDDEN = '-bankAccountNumber -bankIfsc -aadhaarNumber -panNumber -documents -address';

// Fields clients may never set directly
// documents are managed only through the /documents endpoints (real file upload)
const PROTECTED_FIELDS = ['_id', 'seq', 'recordSource', 'documents'];
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
    documents: [],
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
  await WorkerFile.deleteMany({ workerId: id });

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

// ================= KYC DOCUMENTS (real file upload) =================
export const DOCUMENT_TYPES = [
  'Aadhaar / ID Card',
  'PAN Card',
  'Employment Contract',
  'Medical Fitness',
  'Bank Passbook',
  'Other',
];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function addWorkerDocument(workerId, { type, fileName, dataUrl }, actor) {
  const worker = await Worker.findOne({ id: workerId });
  if (!worker) throw new HttpError(404, 'Worker not found');
  if (!DOCUMENT_TYPES.includes(type)) throw new HttpError(400, 'Select a valid document type.');

  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Please attach a document file (JPG, PNG, WEBP or PDF).');
  const mimeType = m[1].toLowerCase();
  if (!ALLOWED_MIME.includes(mimeType)) throw new HttpError(400, 'Only JPG, PNG, WEBP or PDF files are allowed.');
  const data = Buffer.from(m[2], 'base64');
  if (!data.length) throw new HttpError(400, 'Attached file is empty.');
  if (data.length > MAX_FILE_BYTES) throw new HttpError(400, 'File too large. Maximum size is 5 MB.');

  const docId = genId('doc');
  const now = new Date();
  const safeName = String(fileName || type).replace(/[^\w.\- ()]/g, '_').slice(0, 120);

  await WorkerFile.create({
    id: docId,
    workerId,
    mimeType,
    fileName: safeName,
    size: data.length,
    data,
    createdAt: now.toISOString(),
  });

  worker.documents.push({
    id: docId,
    name: type,
    type,
    fileUrl: `/api/workers/${workerId}/documents/${docId}/file`,
    uploadedAt: now.toISOString().slice(0, 10),
    fileName: safeName,
    mimeType,
    size: data.length,
    hasFile: true,
  });
  await worker.save();

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'System Admin',
    actionType: 'WORKER_UPDATED',
    details: `Document "${type}" (${safeName}) uploaded for ${worker.fullName} (${worker.employeeId}).`,
    targetWorkerId: worker.id,
    targetWorkerName: worker.fullName,
  });

  return getWorkerById(workerId);
}

export async function getWorkerDocumentFile(workerId, docId) {
  const file = await WorkerFile.findOne({ id: docId, workerId }).lean();
  if (!file) throw new HttpError(404, 'Document file not found.');
  return file;
}

export async function deleteWorkerDocument(workerId, docId, actor) {
  const worker = await Worker.findOne({ id: workerId });
  if (!worker) throw new HttpError(404, 'Worker not found');
  const doc = worker.documents.find(d => d.id === docId);
  if (!doc) throw new HttpError(404, 'Document not found.');

  worker.documents = worker.documents.filter(d => d.id !== docId);
  await worker.save();
  await WorkerFile.deleteOne({ id: docId, workerId });

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'System Admin',
    actionType: 'WORKER_UPDATED',
    details: `Document "${doc.type}" removed from ${worker.fullName} (${worker.employeeId}).`,
    targetWorkerId: worker.id,
    targetWorkerName: worker.fullName,
  });

  return getWorkerById(workerId);
}

/** Remove placeholder documents that never had a real file (old auto "Aadhaar Identity Card" entries) */
export async function cleanupPlaceholderDocuments() {
  const workers = await Worker.find({ 'documents.0': { $exists: true } }).select('id documents');
  let fixed = 0;
  for (const w of workers) {
    const real = w.documents.filter(d => d.hasFile === true);
    if (real.length !== w.documents.length) {
      w.documents = real;
      await w.save();
      fixed += 1;
    }
  }
  if (fixed) console.log(`[Cleanup] Removed placeholder documents from ${fixed} workers`);
}
