// Re-apply CURRENT grace period to already saved attendance rows.
//   node src/scripts/recalc-late.js                    DRY RUN
//   node src/scripts/recalc-late.js --apply            update DB
//   node src/scripts/recalc-late.js --from=2026-11-01  only rows from this date
// Rows where admin set late manually are skipped. After --apply: Payroll page -> Recalculate.
import { env } from '../config/env.js';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { initRedis, closeRedis } from '../config/redis.js';
import { Attendance } from '../models/index.js';
import { getRules } from '../services/rules.service.js';
import { calculateLateMinutes } from '../utils/timeCalculations.js';
import { bump } from '../utils/cache.js';

const APPLY = process.argv.includes('--apply');
const from = (process.argv.find(a => a.startsWith('--from=')) || '').slice(7);

await connectDB();
await initRedis();
const rules = await getRules();
const grace = Number(rules.gracePeriodMinutes) || 0;
console.log(`${APPLY ? '[APPLY]' : '[DRY RUN]'} grace in DB = ${grace} min  (TZ=${env.timezone})`);
if (!grace) console.log('!! grace is 0 in DB -> rules page Save was not done / not reaching this DB.');

const q = { checkInDateTime: { $exists: true, $ne: null }, ...(from ? { date: { $gte: from } } : {}) };
let changed = 0;
for await (const r of Attendance.find(q).select('id workerName date workingTime checkInDateTime checkOutTime lateMinutes status modificationHistory').lean().cursor()) {
  if ((r.modificationHistory || []).some(h => String(h.fieldChanged).includes('late (manual)'))) continue;
  const late = calculateLateMinutes(new Date(r.checkInDateTime), r.workingTime, grace);
  if (late === (r.lateMinutes || 0)) continue;
  changed++;
  const set = { lateMinutes: late };
  if (!r.checkOutTime && ['PRESENT', 'PRESENT - LATE'].includes(r.status)) set.status = late > 0 ? 'PRESENT - LATE' : 'PRESENT';
  console.log(`  ${r.date} ${r.workerName}: late ${r.lateMinutes || 0} -> ${late}`);
  if (APPLY) await Attendance.updateOne({ id: r.id }, { $set: set });
}
console.log(`\nRows ${APPLY ? 'updated' : 'to update'}: ${changed}`);
if (APPLY && changed) await bump('att');
await closeRedis();
await mongoose.disconnect();
