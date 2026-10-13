import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import {
  Admin,
  Guard,
  Worker,
  Attendance,
  Rules,
  Payroll,
  Advance,
  AdvanceDeduction,
  AuditLog,
  Counter,
} from '../models/index.js';
import { generateInitialSeedPayroll } from './payroll.service.js';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(__dirname, '../seed/seedData.json');

export function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
}

/** Create / sync the admin account from env */
export async function ensureAdmin() {
  const existing = await Admin.findOne({ username: env.adminUsername });
  if (existing) return existing;
  const admin = await Admin.create({
    id: 'admin-1',
    username: env.adminUsername,
    passwordHash: await bcrypt.hash(env.adminPassword, 10),
    fullName: env.adminName,
    status: 'ACTIVE',
  });
  console.log(`[Seed] Admin account created: ${env.adminUsername}`);
  return admin;
}

/** Wipe & load complete seed state (port of db.resetToDefaults) */
export async function seedDatabase() {
  const seed = loadSeed();
  const { TODAY, CURRENT_MONTH } = seed;

  await Promise.all([
    Guard.deleteMany({}),
    Worker.deleteMany({}),
    Attendance.deleteMany({}),
    Rules.deleteMany({}),
    Payroll.deleteMany({}),
    Advance.deleteMany({}),
    AdvanceDeduction.deleteMany({}),
    AuditLog.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  // Guards: hash seed passwords
  const guards = await Promise.all(
    seed.guards.map(async g => ({ ...g, passwordHash: await bcrypt.hash(g.passwordHash, 10) }))
  );
  await Guard.insertMany(guards);

  // Workers keep original order (push semantics -> ascending seq, seeds negative)
  const n = seed.workers.length;
  await Worker.insertMany(seed.workers.map((w, i) => ({ ...w, seq: i - n })));

  // Attendance / audit: newest-first semantics (unshift) -> descending seq
  await Attendance.insertMany(seed.attendance.map((a, i) => ({ ...a, seq: -i })));
  await AuditLog.insertMany(seed.auditLogs.map((l, i) => ({ ...l, seq: -i })));

  await Rules.create({ key: 'default', ...seed.rules, salaryBasisDays: 30 });
  await Advance.insertMany(seed.advances);
  await AdvanceDeduction.insertMany(seed.advanceDeductions);

  const payroll = generateInitialSeedPayroll(
    seed.workers,
    seed.attendance,
    seed.rules,
    CURRENT_MONTH,
    seed.advances,
    seed.advanceDeductions,
    TODAY
  );
  await Payroll.insertMany(payroll);

  await ensureAdmin();
  console.log(
    `[Seed] Loaded: ${guards.length} guards, ${seed.workers.length} workers, ${seed.attendance.length} attendance, ${seed.advances.length} advances, ${payroll.length} payroll rows.`
  );
}

/** Seed only if DB is empty */
export async function seedIfEmpty() {
  await ensureAdmin();
  const hasData = await Worker.exists({});
  const hasGuards = await Guard.exists({});
  if (!hasData && !hasGuards) {
    console.log('[Seed] Empty database detected -> loading demo seed data');
    await seedDatabase();
  }
}
