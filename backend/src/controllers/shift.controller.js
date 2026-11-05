import { asyncHandler } from '../utils/httpError.js';
import * as svc from '../services/shift.service.js';

export const list = asyncHandler(async (req, res) => res.json(await svc.getShifts()));
export const update = asyncHandler(async (req, res) => res.json(await svc.updateShift(req.params.id, req.body || {}, req.user)));
