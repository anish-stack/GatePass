import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { protect, authorize } from '../middleware/auth.js';
import * as auth from '../controllers/auth.controller.js';
import * as workers from '../controllers/worker.controller.js';
import * as guards from '../controllers/guard.controller.js';
import * as attendance from '../controllers/attendance.controller.js';
import * as rules from '../controllers/rules.controller.js';
import * as payroll from '../controllers/payroll.controller.js';
import * as advances from '../controllers/advance.controller.js';
import * as reports from '../controllers/report.controller.js';
import { env } from '../config/env.js';

const router = Router();
const ADMIN = authorize('ADMIN');
const STAFF = authorize('ADMIN', 'GUARD');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// ---------- Public ----------
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Factory Attendance & Payroll Management Server',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timezone: env.timezone,
    serverTime: new Date().toISOString(),
  });
});
router.post('/auth/login', loginLimiter, auth.login);

// ---------- Everything below requires login ----------
router.use(protect);

router.get('/auth/me', auth.me);
router.post('/auth/change-password', ADMIN, auth.changePassword);

// Workers (guard: read-only, sensitive fields stripped)
router.get('/workers', STAFF, workers.list);
router.get('/workers/:id', ADMIN, workers.getOne);
router.post('/workers', ADMIN, workers.create);
router.put('/workers/:id', ADMIN, workers.update);
router.delete('/workers/:id', ADMIN, workers.remove);
router.post('/workers/:id/documents', ADMIN, workers.addDocument);
router.get('/workers/:id/documents/:docId/file', ADMIN, workers.documentFile);
router.delete('/workers/:id/documents/:docId', ADMIN, workers.removeDocument);

// Guards
router.get('/guards', ADMIN, guards.list);
router.post('/guards', ADMIN, guards.create);
router.put('/guards/:id', ADMIN, guards.update);
router.patch('/guards/:id/status', ADMIN, guards.toggleStatus);

// Attendance
router.get('/attendance', STAFF, attendance.list);
router.post('/attendance/check-in', STAFF, attendance.checkIn);
router.post('/attendance/check-out', STAFF, attendance.checkOut);
router.post('/attendance/override', ADMIN, attendance.override);

// Rules
router.get('/rules', STAFF, rules.get);
router.put('/rules', ADMIN, rules.update);

// Payroll
router.get('/payroll', ADMIN, payroll.list);
router.post('/payroll/calculate', ADMIN, payroll.calculate);
router.patch('/payroll/:id/pay', ADMIN, payroll.markPaid);
router.patch('/payroll/:id/adjust', ADMIN, payroll.adjust);

// Advances
router.get('/advances', ADMIN, advances.list);
router.get('/advances/stats', ADMIN, advances.stats);
router.get(['/advances/worker/:workerId', '/advances/worker/:workerId/summary'], ADMIN, advances.workerSummary);
router.get('/advances/:id', ADMIN, advances.getOne);
router.post('/advances', ADMIN, advances.create);
router.put('/advances/:id', ADMIN, advances.update);
router.post('/advances/:id/void', ADMIN, advances.voidAdv);

// Reports / stats / audit
router.get('/reports', ADMIN, reports.reports);
router.get('/stats', ADMIN, reports.stats);
router.get('/audit-logs', ADMIN, reports.auditLogs);
router.post('/database/reset', ADMIN, reports.resetDb);

export default router;
