import { Attendance, Worker, nextSeq, PUBLIC } from '../models/index.js';
import { addAuditLog } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';
import { genId, getLocalDateString } from '../utils/dateUtils.js';
import {
  calculateLateMinutes,
  calculateCheckOutMetrics,
  getWorkingTimeDetails,
  formatTime12,
} from '../utils/timeCalculations.js';

export async function getAttendance(filters = {}, { withPhotos = true } = {}) {
  const conds = [];
  if (filters.date) conds.push({ date: String(filters.date) });
  if (filters.month) conds.push({ date: { $regex: `^${String(filters.month).replace(/[^0-9-]/g, '')}` } });
  if (filters.workerId) conds.push({ workerId: String(filters.workerId) });
  if (filters.status) conds.push({ status: String(filters.status) });
  const q = conds.length ? { $and: conds } : {};

  const select = withPhotos ? PUBLIC : `${PUBLIC} -checkInPhoto -checkOutPhoto`;
  return Attendance.find(q).sort({ seq: -1 }).select(select).lean();
}

/**
 * Guard identity is taken from the authenticated user (JWT), never trusted from body.
 * actor = { role, id, name, guardCode, gate }
 */
export async function recordCheckIn(payload, actor) {
  if (!payload.workerId) throw new HttpError(400, 'workerId is required.');
  if (!payload.photoDataUrl || !String(payload.photoDataUrl).startsWith('data:image/')) {
    throw new HttpError(400, 'Live camera photo is required for check-in.');
  }

  const worker = await Worker.findOne({ id: payload.workerId }).lean();
  if (!worker) throw new HttpError(404, `Worker with ID ${payload.workerId} not found.`);

  const guardId = actor.guardCode || actor.id;
  const guardName = actor.name;
  const gateName = actor.role === 'GUARD' ? actor.gate : payload.gateName || actor.gate || 'Admin Gate Terminal';

  const now = new Date();
  const dateStr = getLocalDateString(now);
  const timeStr = formatTime12(now);

  // Prevent duplicate check-in today
  const existing = await Attendance.findOne({ workerId: worker.id, date: dateStr }).lean();
  if (existing && existing.checkInTime) {
    throw new HttpError(409, `Worker ${worker.fullName} is already checked in today at ${existing.checkInTime}.`);
  }

  const workingDetails = getWorkingTimeDetails(worker.workingTime);
  const lateMins = calculateLateMinutes(now, worker.workingTime);

  const newRecord = {
    id: existing ? existing.id : genId('att'),
    workerId: worker.id,
    workerName: worker.fullName,
    workerEmployeeId: worker.employeeId,
    workerPhoto: worker.profilePhoto,
    date: dateStr,
    workingTime: worker.workingTime,
    workingStartTime: workingDetails.startTime12,
    workingEndTime: workingDetails.endTime12,
    checkInTime: timeStr,
    checkInDateTime: now.toISOString(),
    checkInPhoto: payload.photoDataUrl,
    checkInMarkedByGuardId: guardId,
    checkInMarkedByGuardName: guardName,
    checkInGate: gateName,
    lateMinutes: lateMins,
    totalWorkingMinutes: 0,
    earlyExitMinutes: 0,
    overtimeMinutes: 0,
    status: lateMins > 0 ? 'PRESENT - LATE' : 'PRESENT',
    createdAt: now.toISOString(),
    recordSource: 'live',
  };

  if (existing) {
    await Attendance.replaceOne({ id: existing.id }, { ...newRecord, seq: existing.seq ?? (await nextSeq('attendance')) });
  } else {
    await Attendance.create({ ...newRecord, seq: await nextSeq('attendance') });
  }

  await addAuditLog({
    timestamp: now.toISOString(),
    actorRole: actor.role,
    actorId: guardId,
    actorName: guardName,
    actionType: 'GUARD_CHECK_IN',
    details: `Security Guard ${guardName} marked Check-In for ${worker.fullName} (${worker.employeeId}) at ${gateName}. Late Minutes: ${lateMins}. Live Photo captured. Source: live.`,
    targetWorkerId: worker.id,
    targetWorkerName: worker.fullName,
  });

  return Attendance.findOne({ id: newRecord.id }).select(PUBLIC).lean();
}

export async function recordCheckOut(payload, actor) {
  if (!payload.workerId) throw new HttpError(400, 'workerId is required.');

  const worker = await Worker.findOne({ id: payload.workerId }).lean();
  if (!worker) throw new HttpError(404, `Worker with ID ${payload.workerId} not found.`);

  const guardId = actor.guardCode || actor.id;
  const guardName = actor.name;
  const gateName = actor.role === 'GUARD' ? actor.gate : payload.gateName || actor.gate || 'Admin Gate Terminal';

  const now = new Date();
  const dateStr = getLocalDateString(now);
  const timeStr = formatTime12(now);

  const record = await Attendance.findOne({ workerId: worker.id, date: dateStr });
  if (!record || !record.checkInTime) {
    throw new HttpError(400, `Worker ${worker.fullName} has not checked in today.`);
  }
  if (record.checkOutTime) {
    throw new HttpError(409, `Worker ${worker.fullName} has already checked out today at ${record.checkOutTime}.`);
  }

  const checkInDate = record.checkInDateTime ? new Date(record.checkInDateTime) : now;
  const metrics = calculateCheckOutMetrics(checkInDate, now, worker.workingTime);

  record.checkOutTime = timeStr;
  record.checkOutDateTime = now.toISOString();
  if (payload.photoDataUrl) {
    record.checkOutPhoto = payload.photoDataUrl;
  }
  record.checkOutMarkedByGuardId = guardId;
  record.checkOutMarkedByGuardName = guardName;
  record.checkOutGate = gateName;
  record.totalWorkingMinutes = metrics.totalWorkingMinutes;
  record.earlyExitMinutes = metrics.earlyExitMinutes;
  record.overtimeMinutes = metrics.overtimeMinutes;
  record.status = 'COMPLETED';
  record.updatedAt = now.toISOString();
  record.recordSource = 'live';
  await record.save();

  await addAuditLog({
    timestamp: now.toISOString(),
    actorRole: actor.role,
    actorId: guardId,
    actorName: guardName,
    actionType: 'GUARD_CHECK_OUT',
    details: `Security Guard ${guardName} marked Check-Out for ${worker.fullName} (${worker.employeeId}). Work Mins: ${metrics.totalWorkingMinutes}, OT: ${metrics.overtimeMinutes}m, Early Exit: ${metrics.earlyExitMinutes}m. Source: live.`,
    targetWorkerId: worker.id,
    targetWorkerName: worker.fullName,
  });

  return Attendance.findOne({ id: record.id }).select(PUBLIC).lean();
}

const OVERRIDE_ALLOWED = [
  'checkInTime',
  'checkOutTime',
  'status',
  'lateMinutes',
  'overtimeMinutes',
  'earlyExitMinutes',
  'totalWorkingMinutes',
];

export async function adminOverrideAttendance(recordId, updates = {}, adminName, reason, actor) {
  const record = await Attendance.findOne({ id: recordId });
  if (!record) throw new HttpError(404, `Attendance record ${recordId} not found.`);

  // Only allow known editable fields
  const safe = {};
  for (const k of OVERRIDE_ALLOWED) if (updates[k] !== undefined) safe[k] = updates[k];
  ['lateMinutes', 'overtimeMinutes', 'earlyExitMinutes', 'totalWorkingMinutes'].forEach(k => {
    if (safe[k] !== undefined) safe[k] = Math.max(0, Number(safe[k]) || 0);
  });

  const historyEntry = {
    modifiedAt: new Date().toISOString(),
    modifiedByAdminName: adminName,
    reason,
    fieldChanged: Object.keys(safe).join(', '),
    oldValue: `In: ${record.checkInTime || '-'}, Out: ${record.checkOutTime || '-'}, Status: ${record.status}`,
    newValue: `In: ${safe.checkInTime ?? record.checkInTime}, Out: ${safe.checkOutTime ?? record.checkOutTime}, Status: ${safe.status ?? record.status}`,
  };

  record.modificationHistory = [...(record.modificationHistory || []), historyEntry];
  record.isManuallyModified = true;
  record.updatedAt = new Date().toISOString();
  record.set(safe);
  await record.save();

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: adminName,
    actionType: 'ATTENDANCE_OVERRIDE',
    details: `Admin ${adminName} corrected attendance for ${record.workerName} (${record.workerEmployeeId}) on ${record.date}. Reason: ${reason}`,
    targetWorkerId: record.workerId,
    targetWorkerName: record.workerName,
  });

  return Attendance.findOne({ id: recordId }).select(PUBLIC).lean();
}
