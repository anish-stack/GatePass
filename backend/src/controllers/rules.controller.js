import { asyncHandler } from '../utils/httpError.js';
import * as svc from '../services/rules.service.js';

export const get = asyncHandler(async (req, res) => res.json(await svc.getRules()));
export const update = asyncHandler(async (req, res) => res.json(await svc.updateRules(req.body || {}, req.user)));
