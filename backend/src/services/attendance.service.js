import { Attendance, Worker, nextSeq, PUBLIC } from '../models/index.js';
import { addAuditLog } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';
import { genId, getLocalDateString, isValidDate } from '../utils/dateUtils.js';
import {
  validateWorkingTime,
  formatMinutesToReadable,
  formatTime12Short,
  getCheckInWindow,
  formatTime12,
} from '../utils/timeCalculations.js';
import { computeRecordMetrics, parseAdminDateTime, punchFields, shiftFields, MAX_SHIFT_SPAN_MS } from '../utils/attendanceMetrics.js';
import { savePhoto, deletePhoto, isDataUrl } from '../utils/photoStore.js';
import { cached, bump } from '../utils/cache.js';
import { getRules } from './rules.service.js';

const ABSENT_LIKE = ['ABSENT', 'NOT_ARRIVED'];
// Never copy a legacy base64 profile photo into attendance rows (run the migration script to convert them)
const photoRef = p => (isDataUrl(p) ? '' : p || '');

function toHttp(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RangeError) throw new HttpError(400, e.message);
    throw e;
  }
}

export async function getAttendance(filters = {}, { withPhotos = true } = {}) {
  const conds = [];
  if (filters.date) conds.push({ date: String(filters.date) });
  if (filters.month) conds.push({ date: { $regex: `^${String(filters.month).replace(/[^0-9-]/g, '')}` } });
  if (filters.from && isValidDate(String(filters.from))) conds.push({ date: { $gte: String(filters.from) } });
  if (filters.to && isValidDate(String(filters.to))) conds.push({ date: { $lte: String(filters.to) } });
  if (filters.workerId) conds.push({ workerId: String(filters.workerId) });
  if (filters.status) conds.push({ status: String(filters.status) });
  const q = conds.length ? { $and: conds } : {};

  // Legacy base64 photos are stripped INSIDE Mongo ($$REMOVE) so they never cross the network.
  // After running migrate-photos.js this is just a safety net.
  const strip = f => ({ $cond: [{ $regexMatch: { input: { $ifNull: [`$${f}`, ''] }, regex: '^data:image/' } }, '$$REMOVE', `$${f}`] });
  const pipeline = [
    { $match: q },
    { $sort: { seq: -1 } },
    { $set: withPhotos ? { checkInPhoto: strip('checkInPhoto'), checkOutPhoto: strip('checkOutPhoto'), workerPhoto: strip('workerPhoto') } : { workerPhoto: strip('workerPhoto') } },
    { $unset: withPhotos ? ['_id', 'seq'] : ['_id', 'seq', 'checkInPhoto', 'checkOutPhoto'] },
  ];

  // short TTL: guard check-in must show on admin screen fast even if another server/Redis did the write
  return cached('att', { filters: q, withPhotos }, async () => {
    const t0 = Date.now();
    const rows = await Attendance.aggregate(pipeline).allowDiskUse(true);
    const ms = Date.now() - t0;
    if (ms > 500) console.warn(`[Attendance] slow query ${ms}ms rows=${rows.length} q=${JSON.stringify(q)}`);
    return rows;
  }, 15);
}

/** Latest record checked-in but not checked-out within last 24 hours */
async function findOpenRecord(workerId, now = new Date()) {
  const yesterday = getLocalDateString(new Date(now.getTime() - 24 * 3600 * 1000));
  const list = await Attendance.find({
    workerId,
    date: { $in: [yesterday, getLocalDateString(now)] },
  })
    .select('id date checkInTime checkOutTime checkInDateTime')
    .lean();
  return (
    list
      .filter(r => r.checkInTime && !r.checkOutTime)
      .sort((a, b) => String(b.checkInDateTime || '').localeCompare(String(a.checkInDateTime || '')))[0] || null
  );
}

/**
 * Guard identity is taken from the authenticated user (JWT), never trusted from body.
 * actor = { role, id, name, guardCode, gate }
 */
export async function recordCheckIn(payload, actor) {
  if (!payload.workerId) throw new HttpError(400, 'workerId is required.');
  if (!isDataUrl(payload.photoDataUrl)) {
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
  // Still inside from previous day (24-hour / overnight) -> must check out first
  const openPrev = await findOpenRecord(worker.id, now);
  if (openPrev && openPrev.date !== dateStr) {
    throw new HttpError(409, `Worker ${worker.fullName} is still inside since ${openPrev.date} ${openPrev.checkInTime}. Check out first.`);
  }

  const rules = await getRules();
  if (actor.role === 'GUARD' && !rules.allowCheckInAnytime) {
    const win = getCheckInWindow(worker.workingTime, now, rules.checkInOpensBeforeMinutes);
    if (now < win.opens) {
      throw new HttpError(400, `Check-in for ${worker.fullName} opens at ${formatTime12Short(win.opens)} (shift ${worker.workingTime}).`);
    }
    if (now >= win.end) {
      throw new HttpError(400, `Shift ${worker.workingTime} for ${worker.fullName} is over. Check-in closed at ${formatTime12Short(win.end)}.`);
    }
  }

  const m = computeRecordMetrics({ checkIn: now, checkOut: null, workingTime: worker.workingTime, rules });
  const photoUrl = await savePhoto(payload.photoDataUrl, 'checkin');

  const newRecord = {
    id: existing ? existing.id : genId('att'),
    workerId: worker.id,
    workerName: worker.fullName,
    workerEmployeeId: worker.employeeId,
    workerPhoto: photoRef(worker.profilePhoto),
    date: dateStr,
    ...shiftFields(worker.workingTime),
    checkInTime: timeStr,
    checkInDateTime: now.toISOString(),
    checkInPhoto: photoUrl,
    checkInMarkedByGuardId: guardId,
    checkInMarkedByGuardName: guardName,
    checkInGate: gateName,
    lateMinutes: m.lateMinutes,
    totalWorkingMinutes: 0,
    earlyExitMinutes: 0,
    overtimeMinutes: 0,
    status: m.status,
    createdAt: now.toISOString(),
    recordSource: 'live',
  };

  try {
    if (existing) {
      await Attendance.replaceOne({ id: existing.id }, { ...newRecord, seq: existing.seq ?? (await nextSeq('attendance')) });
    } else {
      await Attendance.create({ ...newRecord, seq: await nextSeq('attendance') });
    }
  } catch (err) {
    await deletePhoto(photoUrl); // don't leave orphan file
    throw err;
  }
  await bump('att');

  await addAuditLog({
    timestamp: now.toISOString(),
    actorRole: actor.role,
    actorId: guardId,
    actorName: guardName,
    actionType: 'GUARD_CHECK_IN',
    details: `Security Guard ${guardName} marked Check-In for ${worker.fullName} (${worker.employeeId}) at ${gateName}. Late: ${formatMinutesToReadable(m.lateMinutes)}. Live Photo captured. Source: live.`,
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

  // Today's record, or an open record from yesterday (overnight / 24-hour shift)
  let record = await Attendance.findOne({ workerId: worker.id, date: dateStr });
  if (!record || !record.checkInTime) {
    const open = await findOpenRecord(worker.id, now);
    if (open) record = await Attendance.findOne({ id: open.id });
  }
  if (!record || !record.checkInTime) {
    throw new HttpError(400, `Worker ${worker.fullName} has not checked in today.`);
  }
  if (record.checkOutTime) {
    throw new HttpError(409, `Worker ${worker.fullName} has already checked out today at ${record.checkOutTime}.`);
  }

  const rules = await getRules();
  const checkInDate = record.checkInDateTime ? new Date(record.checkInDateTime) : now;
  // Shift snapshot stored on the record wins (worker's shift may have been edited since check-in)
  const wt = record.workingTime || worker.workingTime;
  const ovRaw = payload.overtimeMinutesOverride;
  const m = toHttp(() =>
    computeRecordMetrics({
      checkIn: checkInDate,
      checkOut: now,
      workingTime: wt,
      rules,
      overrides: { overtimeMinutes: ovRaw },
    })
  );
  // Late was fixed at check-in; keep it (rules/grace could have changed since)

  let photoUrl;
  if (payload.photoDataUrl) {
    if (!isDataUrl(payload.photoDataUrl)) throw new HttpError(400, 'Invalid check-out photo.');
    photoUrl = await savePhoto(payload.photoDataUrl, 'checkout');
  }

  record.checkOutTime = timeStr;
  record.checkOutDateTime = now.toISOString();
  if (photoUrl) record.checkOutPhoto = photoUrl;
  record.checkOutMarkedByGuardId = guardId;
  record.checkOutMarkedByGuardName = guardName;
  record.checkOutGate = gateName;
  record.totalWorkingMinutes = m.totalWorkingMinutes;
  record.earlyExitMinutes = m.earlyExitMinutes;
  record.overtimeMinutes = m.overtimeMinutes;
  record.otCalculatedMinutes = m.otCalculatedMinutes;
  record.otManuallyAdjusted = m.otManuallyAdjusted;
  record.status = 'COMPLETED';
  record.updatedAt = now.toISOString();
  record.recordSource = 'live';
  try {
    await record.save();
  } catch (err) {
    if (photoUrl) await deletePhoto(photoUrl);
    throw err;
  }
  await bump('att');

  await addAuditLog({
    timestamp: now.toISOString(),
    actorRole: actor.role,
    actorId: guardId,
    actorName: guardName,
    actionType: 'GUARD_CHECK_OUT',
    details: `Security Guard ${guardName} marked Check-Out for ${worker.fullName} (${worker.employeeId}). Worked: ${formatMinutesToReadable(m.totalWorkingMinutes)}, OT: ${formatMinutesToReadable(m.overtimeMinutes)}${
      m.otManuallyAdjusted ? ` (manually set, system calculated ${formatMinutesToReadable(m.otCalculatedMinutes)})` : ''
    }, Early Exit: ${formatMinutesToReadable(m.earlyExitMinutes)}. Source: live.`,
    targetWorkerId: worker.id,
    targetWorkerName: worker.fullName,
  });

  return Attendance.findOne({ id: record.id }).select(PUBLIC).lean();
}

// ======================= ADMIN: EDIT / ADD / REOPEN / DELETE =======================

const need = (v, msg) => {
  if (!String(v || '').trim()) throw new HttpError(400, msg);
  return String(v).trim();
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const summary = r =>
  `In: ${r.checkInTime || '-'}, Out: ${r.checkOutTime || '-'}, Late: ${r.lateMinutes || 0}m, OT: ${r.overtimeMinutes || 0}m, Early: ${r.earlyExitMinutes || 0}m, Status: ${r.status}`;

function pickDate(body, key, label) {
  if (!has(body, key)) return undefined; // not sent = keep
  const d = parseAdminDateTime(body[key]);
  if (Number.isNaN(d)) throw new HttpError(400, `${label} is invalid. Use date and time.`);
  return d; // Date or null (cleared)
}

/**
 * Edit one attendance record. Late / OT / early-exit / total / status are RECALCULATED from the
 * new punch times using the record's own shift snapshot (or body.workingTime) and current rules.
 * Optional manual values (lateMinutes, overtimeMinutes, earlyExitMinutes) override the calculation.
 * Sending checkOutDateTime: null re-opens the record (worker is "inside" again).
 */
export async function adminEditAttendance(recordId, body = {}, actor) {
  const reason = need(body.reason, 'A reason is required for every attendance correction.');
  const record = await Attendance.findOne({ id: recordId });
  if (!record) throw new HttpError(404, `Attendance record ${recordId} not found.`);

  const rules = await getRules();
  const worker = await Worker.findOne({ id: record.workerId }).select('workingTime').lean();

  const inPicked = pickDate(body, 'checkInDateTime', 'Check-in');
  const outPicked = pickDate(body, 'checkOutDateTime', 'Check-out');
  const checkIn = inPicked === undefined ? (record.checkInDateTime ? new Date(record.checkInDateTime) : null) : inPicked;
  const checkOut = outPicked === undefined ? (record.checkOutDateTime ? new Date(record.checkOutDateTime) : null) : outPicked;

  const before = summary(record);
  const hadCheckOut = Boolean(record.checkOutTime);
  const oldOutPhoto = record.checkOutPhoto;
  const changed = [];

  if (!checkIn) {
    // No punch at all: only Absent / Not arrived is valid
    if (record.checkInTime) throw new HttpError(400, 'Check-in cannot be removed. Use Delete to remove the whole record.');
    if (checkOut) throw new HttpError(400, 'Check-out needs a check-in time.');
    const st = ABSENT_LIKE.includes(body.status) ? body.status : ABSENT_LIKE.includes(record.status) ? record.status : 'ABSENT';
    if (st !== record.status) changed.push('status');
    record.status = st;
  } else {
    if (checkOut && checkOut.getTime() <= checkIn.getTime()) throw new HttpError(400, 'Check-out must be after check-in.');
    if (checkOut && checkOut.getTime() - checkIn.getTime() > MAX_SHIFT_SPAN_MS) {
      throw new HttpError(400, 'Check-in to check-out cannot be more than 24 hours.');
    }

    let wt = record.workingTime || worker?.workingTime;
    if (body.workingTime) {
      try {
        wt = validateWorkingTime(body.workingTime);
      } catch (e) {
        throw new HttpError(400, e.message);
      }
    }
    if (wt !== record.workingTime) changed.push('working time');

    const m = toHttp(() =>
      computeRecordMetrics({
        checkIn,
        checkOut,
        workingTime: wt,
        rules,
        overrides: {
          lateMinutes: body.lateMinutes,
          overtimeMinutes: body.overtimeMinutes,
          earlyExitMinutes: body.earlyExitMinutes,
        },
      })
    );

    const pf = punchFields(checkIn, checkOut);
    if (pf.date !== record.date) {
      const clash = await Attendance.exists({ workerId: record.workerId, date: pf.date, id: { $ne: record.id } });
      if (clash) throw new HttpError(409, `Another attendance record already exists for ${pf.date}. Edit or delete it first.`);
      changed.push('date');
    }
    if (pf.checkInDateTime !== record.checkInDateTime) changed.push('check-in');
    if ((pf.checkOutDateTime || null) !== (record.checkOutDateTime || null)) changed.push(checkOut ? 'check-out' : 'check-out removed (re-opened)');
    if (m.lateMinutes !== (record.lateMinutes || 0)) changed.push(m.lateManual ? 'late (manual)' : 'late');
    if (m.overtimeMinutes !== (record.overtimeMinutes || 0)) changed.push(m.otManuallyAdjusted ? 'OT (manual)' : 'OT');
    if (m.earlyExitMinutes !== (record.earlyExitMinutes || 0)) changed.push(m.earlyManual ? 'early exit (manual)' : 'early exit');

    record.set({
      ...pf,
      ...shiftFields(wt),
      lateMinutes: m.lateMinutes,
      totalWorkingMinutes: m.totalWorkingMinutes,
      earlyExitMinutes: m.earlyExitMinutes,
      overtimeMinutes: m.overtimeMinutes,
      otCalculatedMinutes: m.otCalculatedMinutes,
      otManuallyAdjusted: m.otManuallyAdjusted,
      status: m.status,
    });

    if (!checkOut) {
      // Re-opened: drop the cancelled check-out punch (its photo URL is kept in history)
      record.set({
        checkOutPhoto: undefined,
        checkOutMarkedByGuardId: undefined,
        checkOutMarkedByGuardName: undefined,
        checkOutGate: undefined,
      });
    } else if (!hadCheckOut) {
      // Admin added a check-out manually
      record.set({
        checkOutMarkedByGuardId: 'ADMIN',
        checkOutMarkedByGuardName: `${actor?.name || 'Admin'} (manual entry)`,
        checkOutGate: 'Manual Entry (Admin)',
      });
    }
  }

  if (!changed.length) throw new HttpError(400, 'No changes to save.');

  const nowIso = new Date().toISOString();
  record.modificationHistory = [
    ...(record.modificationHistory || []),
    {
      modifiedAt: nowIso,
      modifiedByAdminName: actor?.name || 'Admin',
      reason,
      fieldChanged: changed.join(', '),
      oldValue: `${before}${hadCheckOut && !checkOut && oldOutPhoto ? `, Check-out photo: ${oldOutPhoto}` : ''}`,
      newValue: summary(record),
    },
  ];
  record.isManuallyModified = true;
  record.updatedAt = nowIso;
  await record.save();
  await bump('att');

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'Admin',
    actionType: hadCheckOut && !checkOut ? 'ATTENDANCE_REOPENED' : 'ATTENDANCE_OVERRIDE',
    details: `Admin ${actor?.name || 'Admin'} corrected attendance for ${record.workerName} (${record.workerEmployeeId}) on ${record.date} [${changed.join(', ')}]. Reason: ${reason}`,
    targetWorkerId: record.workerId,
    targetWorkerName: record.workerName,
  });

  return Attendance.findOne({ id: recordId }).select(PUBLIC).lean();
}

/** Admin adds a punch record by hand (guard missed it, no photo). */
export async function adminAddAttendance(body = {}, actor) {
  const reason = need(body.reason, 'A reason is required to add attendance manually.');
  if (!body.workerId) throw new HttpError(400, 'workerId is required.');
  const worker = await Worker.findOne({ id: body.workerId }).lean();
  if (!worker) throw new HttpError(404, `Worker with ID ${body.workerId} not found.`);

  const checkIn = pickDate(body, 'checkInDateTime', 'Check-in');
  const checkOut = pickDate(body, 'checkOutDateTime', 'Check-out') || null;
  if (!checkIn) throw new HttpError(400, 'Check-in date & time is required.');
  if (checkOut && checkOut.getTime() <= checkIn.getTime()) throw new HttpError(400, 'Check-out must be after check-in.');
  if (checkOut && checkOut.getTime() - checkIn.getTime() > MAX_SHIFT_SPAN_MS) {
    throw new HttpError(400, 'Check-in to check-out cannot be more than 24 hours.');
  }

  let wt = worker.workingTime;
  if (body.workingTime) {
    try {
      wt = validateWorkingTime(body.workingTime);
    } catch (e) {
      throw new HttpError(400, e.message);
    }
  }

  const rules = await getRules();
  const m = toHttp(() =>
    computeRecordMetrics({
      checkIn,
      checkOut,
      workingTime: wt,
      rules,
      overrides: { lateMinutes: body.lateMinutes, overtimeMinutes: body.overtimeMinutes, earlyExitMinutes: body.earlyExitMinutes },
    })
  );

  const pf = punchFields(checkIn, checkOut);
  const existing = await Attendance.findOne({ workerId: worker.id, date: pf.date }).lean();
  if (existing && existing.checkInTime) {
    throw new HttpError(409, `${worker.fullName} already has a check-in on ${pf.date}. Edit that record instead.`);
  }

  const nowIso = new Date().toISOString();
  const adminName = actor?.name || 'Admin';
  const rec = {
    id: existing ? existing.id : genId('att'),
    workerId: worker.id,
    workerName: worker.fullName,
    workerEmployeeId: worker.employeeId,
    workerPhoto: photoRef(worker.profilePhoto),
    ...pf,
    ...shiftFields(wt),
    checkInMarkedByGuardId: 'ADMIN',
    checkInMarkedByGuardName: `${adminName} (manual entry)`,
    checkInGate: 'Manual Entry (Admin)',
    lateMinutes: m.lateMinutes,
    totalWorkingMinutes: m.totalWorkingMinutes,
    earlyExitMinutes: m.earlyExitMinutes,
    overtimeMinutes: m.overtimeMinutes,
    otCalculatedMinutes: m.otCalculatedMinutes,
    otManuallyAdjusted: m.otManuallyAdjusted,
    status: m.status,
    createdAt: nowIso,
    updatedAt: nowIso,
    isManuallyModified: true,
    modificationHistory: [
      {
        modifiedAt: nowIso,
        modifiedByAdminName: adminName,
        reason,
        fieldChanged: 'record added manually',
        oldValue: existing ? `Placeholder: ${existing.status}` : 'No record',
        newValue: `In: ${pf.checkInTime}, Out: ${pf.checkOutTime || '-'}, Status: ${m.status}`,
      },
    ],
    recordSource: 'live',
  };
  if (checkOut) {
    rec.checkOutMarkedByGuardId = 'ADMIN';
    rec.checkOutMarkedByGuardName = `${adminName} (manual entry)`;
    rec.checkOutGate = 'Manual Entry (Admin)';
  }

  if (existing) {
    await Attendance.replaceOne({ id: existing.id }, { ...rec, seq: existing.seq ?? (await nextSeq('attendance')) });
  } else {
    await Attendance.create({ ...rec, seq: await nextSeq('attendance') });
  }
  await bump('att');

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: adminName,
    actionType: 'ATTENDANCE_ADDED',
    details: `Admin ${adminName} added attendance manually for ${worker.fullName} (${worker.employeeId}) on ${pf.date}: In ${pf.checkInTime}${pf.checkOutTime ? `, Out ${pf.checkOutTime}` : ''}. Reason: ${reason}`,
    targetWorkerId: worker.id,
    targetWorkerName: worker.fullName,
  });

  return Attendance.findOne({ id: rec.id }).select(PUBLIC).lean();
}

/** Permanently remove one attendance record (and its photo files). Reason is mandatory + audited. */
export async function adminDeleteAttendance(recordId, body = {}, actor) {
  const reason = need(body.reason, 'A reason is required to delete an attendance record.');
  const record = await Attendance.findOne({ id: recordId }).lean();
  if (!record) throw new HttpError(404, `Attendance record ${recordId} not found.`);

  await Attendance.deleteOne({ id: recordId });
  await Promise.all([deletePhoto(record.checkInPhoto), deletePhoto(record.checkOutPhoto)]);
  await bump('att');

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'Admin',
    actionType: 'ATTENDANCE_DELETED',
    details: `Admin ${actor?.name || 'Admin'} DELETED attendance of ${record.workerName} (${record.workerEmployeeId}) on ${record.date}. Was: ${summary(record)}. Reason: ${reason}`,
    targetWorkerId: record.workerId,
    targetWorkerName: record.workerName,
  });

  return { success: true, id: recordId, month: String(record.date).slice(0, 7) };
}