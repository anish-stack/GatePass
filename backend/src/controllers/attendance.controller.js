import { asyncHandler, HttpError } from '../utils/httpError.js';
import * as svc from '../services/attendance.service.js';

export const list = asyncHandler(async (req, res) => {
  const { date, month, from, to, workerId, status } = req.query;
  res.json(await svc.getAttendance({ date, month, from, to, workerId, status }));
});

export const checkIn = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.recordCheckIn(req.body || {}, req.user));
});

export const checkOut = asyncHandler(async (req, res) => {
  res.json(await svc.recordCheckOut(req.body || {}, req.user));
});

// PATCH /attendance/:id  - edit punches, recalculates late / OT / early / total / status
export const edit = asyncHandler(async (req, res) => {
  res.json(await svc.adminEditAttendance(req.params.id, req.body || {}, req.user));
});

// POST /attendance/override  (kept for old clients: { recordId, updates, reason })
export const override = asyncHandler(async (req, res) => {
  const { recordId, updates, reason } = req.body || {};
  if (!recordId) throw new HttpError(400, 'recordId is required');
  res.json(await svc.adminEditAttendance(recordId, { ...(updates || {}), reason }, req.user));
});

// POST /attendance/manual  - admin adds a missed punch record
export const addManual = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.adminAddAttendance(req.body || {}, req.user));
});

// POST /attendance/:id/reopen  - remove check-out, worker is inside again
export const reopen = asyncHandler(async (req, res) => {
  res.json(await svc.adminEditAttendance(req.params.id, { checkOutDateTime: null, reason: req.body?.reason }, req.user));
});

// DELETE /attendance/:id  { reason }
export const remove = asyncHandler(async (req, res) => {
  res.json(await svc.adminDeleteAttendance(req.params.id, req.body || {}, req.user));
});