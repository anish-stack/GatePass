// One-time migration: base64 photos stored inside MongoDB  ->  files on disk (DB keeps only /api/files/... path).
//
//   node src/scripts/migrate-photos.js            DRY RUN (default): only counts, changes nothing
//   node src/scripts/migrate-photos.js --apply    writes files + updates DB
//
// Take a backup first (mongodump) before --apply. Safe to re-run: already migrated rows are skipped.
import { env } from '../config/env.js'; // loads .env, must be first
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Attendance, Worker } from '../models/index.js';
import { savePhoto, isDataUrl, UPLOAD_ROOT } from '../utils/photoStore.js';

const APPLY = process.argv.includes('--apply');
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
const mb = n => (n / 1048576).toFixed(2) + ' MB';

async function main() {
  await connectDB();
  console.log(APPLY ? `[APPLY] writing files to ${UPLOAD_ROOT}` : '[DRY RUN] nothing will be changed. Use --apply to migrate.');

  const seen = new Map(); // identical images (e.g. same profile photo on many rows) are stored once
  const stats = { workers: 0, checkIn: 0, checkOut: 0, workerPhotoOnAttendance: 0, bytes: 0, failed: 0 };

  const toUrl = async (value, kind) => {
    stats.bytes += value.length;
    if (!APPLY) return null;
    const key = sha(value);
    if (seen.has(key)) return seen.get(key);
    const url = await savePhoto(value, kind);
    seen.set(key, url);
    return url;
  };

  // 1) Worker profile photos
  for await (const w of Worker.find({ profilePhoto: /^data:image\// }).select('id profilePhoto').lean().cursor()) {
    try {
      const url = await toUrl(w.profilePhoto, 'profile');
      stats.workers++;
      if (APPLY) await Worker.updateOne({ id: w.id }, { $set: { profilePhoto: url } });
    } catch (e) {
      stats.failed++;
      console.warn(`  worker ${w.id}: ${e.message}`);
    }
  }

  // 2) Attendance photos
  const q = { $or: [{ checkInPhoto: /^data:image\// }, { checkOutPhoto: /^data:image\// }, { workerPhoto: /^data:image\// }] };
  for await (const a of Attendance.find(q).select('id checkInPhoto checkOutPhoto workerPhoto').lean().cursor()) {
    const set = {};
    try {
      if (isDataUrl(a.checkInPhoto)) {
        set.checkInPhoto = await toUrl(a.checkInPhoto, 'checkin');
        stats.checkIn++;
      }
      if (isDataUrl(a.checkOutPhoto)) {
        set.checkOutPhoto = await toUrl(a.checkOutPhoto, 'checkout');
        stats.checkOut++;
      }
      if (isDataUrl(a.workerPhoto)) {
        set.workerPhoto = await toUrl(a.workerPhoto, 'profile');
        stats.workerPhotoOnAttendance++;
      }
      if (APPLY && Object.keys(set).length) await Attendance.updateOne({ id: a.id }, { $set: set });
    } catch (e) {
      stats.failed++;
      console.warn(`  attendance ${a.id}: ${e.message}`);
    }
  }

  console.log('\nResult:', {
    ...stats,
    dbDataFound: mb(stats.bytes),
    uniqueFilesWritten: APPLY ? seen.size : '(dry run)',
  });
  if (!APPLY) console.log('Looks fine? Backup DB, then run again with --apply');
  await mongoose.disconnect();
}

main().catch(async e => {
  console.error('Migration failed:', e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});