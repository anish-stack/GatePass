import { asyncHandler, HttpError } from '../utils/httpError.js';
import * as svc from '../services/guard.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await svc.getGuards());
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createGuard(req.body || {}, req.user));
});

export const update = asyncHandler(async (req, res) => {
  const updated = await svc.updateGuard(req.params.id, req.body || {});
  if (!updated) throw new HttpError(404, 'Guard not found');
  res.json(updated);
});

export const toggleStatus = asyncHandler(async (req, res) => {
  const updated = await svc.toggleGuardStatus(req.params.id);
  if (!updated) throw new HttpError(404, 'Guard not found');
  res.json(updated);
});
