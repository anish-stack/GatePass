import { asyncHandler, HttpError } from '../utils/httpError.js';
import * as svc from '../services/attendance.service.js';

export const list = asyncHandler(async (req, res) => {
  const { date, month, workerId, status } = req.query;
  res.json(await svc.getAttendance({ date, month, workerId, status }));
});

export const checkIn = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.recordCheckIn(req.body || {}, req.user));
});

export const checkOut = asyncHandler(async (req, res) => {
  res.json(await svc.recordCheckOut(req.body || {}, req.user));
});

export const override = asyncHandler(async (req, res) => {
  const { recordId, updates, reason } = req.body || {};
  if (!recordId || !reason || !String(reason).trim()) {
    throw new HttpError(400, 'recordId and reason are required');
  }
  res.json(await svc.adminOverrideAttendance(recordId, updates || {}, req.user.name, String(reason).trim(), req.user));
});
