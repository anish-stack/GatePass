import { asyncHandler, HttpError } from '../utils/httpError.js';
import * as svc from '../services/report.service.js';
import { getAuditLogs } from '../services/audit.service.js';
import { seedDatabase } from '../services/seed.service.js';
import { getCurrentMonth, getLocalDateString, isValidMonth, isValidDate } from '../utils/dateUtils.js';
import { env } from '../config/env.js';

export const reports = asyncHandler(async (req, res) => {
  const month = req.query.month || getCurrentMonth();
  if (!isValidMonth(month)) throw new HttpError(400, 'month must be YYYY-MM');
  res.json(await svc.getReports(month));
});

export const stats = asyncHandler(async (req, res) => {
  const date = req.query.date || getLocalDateString();
  const month = req.query.month || getCurrentMonth();
  if (!isValidDate(date) || !isValidMonth(month)) throw new HttpError(400, 'Invalid date/month');
  res.json(await svc.getDashboardStats(date, month));
});

export const auditLogs = asyncHandler(async (req, res) => res.json(await getAuditLogs()));

export const resetDb = asyncHandler(async (req, res) => {
  if (!env.allowDbReset) throw new HttpError(403, 'Database reset is disabled on this server.');
  await seedDatabase();
  res.json({ success: true, message: 'Database reset to seed data successfully.' });
});
