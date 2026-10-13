import { asyncHandler, HttpError } from '../utils/httpError.js';
import * as svc from '../services/payroll.service.js';
import { getCurrentMonth, isValidMonth } from '../utils/dateUtils.js';

const monthOf = v => {
  const m = v || getCurrentMonth();
  if (!isValidMonth(m)) throw new HttpError(400, 'month must be YYYY-MM');
  return m;
};

export const list = asyncHandler(async (req, res) => res.json(await svc.getPayroll(monthOf(req.query.month))));
export const calculate = asyncHandler(async (req, res) =>
  res.json(await svc.recalculatePayroll(monthOf(req.body?.month), req.user))
);
export const markPaid = asyncHandler(async (req, res) => {
  const record = await svc.markPayrollPaid(req.params.id);
  if (!record) throw new HttpError(404, 'Payroll record not found');
  res.json(record);
});
