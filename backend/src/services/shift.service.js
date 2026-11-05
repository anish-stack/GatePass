import { WorkingShift, Worker, PUBLIC } from '../models/index.js';
import { addAuditLog } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';
import { cached, bump } from '../utils/cache.js';
import { buildWorkingTimeLabel, validateWorkingTime, getWorkingTimeDetails } from '../utils/timeCalculations.js';

// Seeded ONCE (only when missing). After that the admin edits them from the UI.
const DEFAULT_SHIFTS = [
  { id: 'shift-1', order: 1, title: 'Working Time 1', startTime24: '09:00', endTime24: '17:00' }, // 8 h
  { id: 'shift-2', order: 2, title: 'Working Time 2', startTime24: '09:00', endTime24: '19:00' }, // 10 h
  { id: 'shift-3', order: 3, title: 'Working Time 3', startTime24: '09:00', endTime24: '21:00' }, // 12 h
];

const T24 = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Derived fields are computed, never stored -> start/end can never disagree with duration / OT trigger */
export function toPublicShift(d) {
  const label = buildWorkingTimeLabel(d.startTime24, d.endTime24);
  const x = getWorkingTimeDetails(label);
  return {
    id: d.id,
    order: d.order,
    title: d.title,
    isActive: d.isActive !== false,
    label: x.label,
    startTime24: x.startTime24,
    endTime24: x.endTime24,
    startTime12: x.startTime12,
    endTime12: x.endTime12,
    normalWorkingMinutes: x.normalWorkingMinutes,
    normalWorkingHours: x.normalWorkingHours,
    overnight: Boolean(x.overnight),
    overtimeTrigger: x.endTime12, // overtime counts after this time
    dutyTitle: `${x.normalWorkingHours} Hours Duty`,
    updatedAt: d.updatedAt,
    updatedBy: d.updatedBy,
  };
}

export async function ensureDefaultShifts() {
  for (const s of DEFAULT_SHIFTS) {
    await WorkingShift.updateOne({ id: s.id }, { $setOnInsert: { ...s, isActive: true } }, { upsert: true });
  }
}

export async function getShifts() {
  return cached(
    'shifts',
    {},
    async () => (await WorkingShift.find().sort({ order: 1 }).select(PUBLIC).lean()).map(toPublicShift),
    300
  );
}

export async function updateShift(id, body = {}, actor) {
  const cur = await WorkingShift.findOne({ id });
  if (!cur) throw new HttpError(404, 'Working time not found.');

  const start = body.startTime24 ?? cur.startTime24;
  const end = body.endTime24 ?? cur.endTime24;
  if (!T24.test(String(start)) || !T24.test(String(end))) throw new HttpError(400, 'Start / end time must be HH:mm (24 hour).');

  const oldLabel = buildWorkingTimeLabel(cur.startTime24, cur.endTime24);
  const newLabel = buildWorkingTimeLabel(start, end);
  try {
    validateWorkingTime(newLabel); // 30 min .. 20 h
  } catch (e) {
    throw new HttpError(400, e.message);
  }

  const others = await WorkingShift.find({ id: { $ne: id } }).select('startTime24 endTime24').lean();
  if (others.some(o => buildWorkingTimeLabel(o.startTime24, o.endTime24) === newLabel)) {
    throw new HttpError(409, 'Another working time already has the same start and end.');
  }

  const title = body.title !== undefined ? String(body.title).trim().slice(0, 40) || cur.title : cur.title;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : cur.isActive;
  const changedTimes = newLabel !== oldLabel;

  cur.set({ startTime24: start, endTime24: end, title, isActive, updatedAt: new Date().toISOString(), updatedBy: actor?.name || 'Admin' });
  await cur.save();

  // Workers keep the shift as a label string -> move every worker on the old label to the new one.
  // Past attendance / payroll rows keep their own snapshot (history is NOT rewritten).
  let moved = 0;
  if (changedTimes) {
    moved = (await Worker.updateMany({ workingTime: oldLabel }, { $set: { workingTime: newLabel } })).modifiedCount || 0;
  }
  await bump('shifts', 'workers');

  if (changedTimes) {
    await addAuditLog({
      actorRole: 'ADMIN',
      actorId: actor?.id || 'admin',
      actorName: actor?.name || 'Admin',
      actionType: 'SHIFT_UPDATED',
      details: `Standard working time "${title}" changed ${oldLabel} -> ${newLabel}. ${moved} worker(s) moved to the new time.`,
    });
  }

  return { shift: toPublicShift(cur.toObject()), workersMoved: moved };
}
