import { asyncHandler, HttpError } from '../utils/httpError.js';
import * as svc from '../services/worker.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await svc.getWorkers({ forGuard: req.user.role === 'GUARD' }));
});

export const getOne = asyncHandler(async (req, res) => {
  const worker = await svc.getWorkerById(req.params.id);
  if (!worker) throw new HttpError(404, 'Worker not found');
  res.json(worker);
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createWorker(req.body || {}, req.user));
});

export const update = asyncHandler(async (req, res) => {
  const updated = await svc.updateWorker(req.params.id, req.body || {}, req.user);
  if (!updated) throw new HttpError(404, 'Worker not found');
  res.json(updated);
});

export const remove = asyncHandler(async (req, res) => {
  const ok = await svc.deleteWorker(req.params.id, req.user);
  if (!ok) throw new HttpError(404, 'Worker not found');
  res.json({ success: true, message: 'Worker deleted successfully' });
});
