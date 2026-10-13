import { asyncHandler, HttpError } from '../utils/httpError.js';
import * as svc from '../services/advance.service.js';
import { getCurrentMonth, isValidMonth } from '../utils/dateUtils.js';

export const list = asyncHandler(async (req, res) => {
  const { workerId, month, status, paymentMode, search } = req.query;
  res.json(await svc.getAdvances({ workerId, month, status, paymentMode, search }));
});

export const stats = asyncHandler(async (req, res) => {
  const month = req.query.month || getCurrentMonth();
  if (!isValidMonth(month)) throw new HttpError(400, 'month must be YYYY-MM');
  res.json(await svc.getAdvanceStats(month));
});

export const workerSummary = asyncHandler(async (req, res) => {
  res.json(await svc.getWorkerAdvanceSummary(req.params.workerId));
});

export const getOne = asyncHandler(async (req, res) => {
  const adv = await svc.getAdvanceById(req.params.id);
  if (!adv) throw new HttpError(404, 'Advance transaction not found');
  res.json(adv);
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createAdvance(req.body || {}, req.user));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await svc.updateAdvance(req.params.id, req.body || {}, req.user));
});

export const voidAdv = asyncHandler(async (req, res) => {
  const { voidedBy, reason } = req.body || {};
  res.json(await svc.voidAdvance(req.params.id, voidedBy, reason, req.user));
});
