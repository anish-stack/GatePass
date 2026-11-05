// ONE-TIME: move EVERY base64 image / binary file out of MongoDB onto disk. Scans ALL collections.
//
//   node src/scripts/migrate-photos.js            DRY RUN: only counts, changes nothing
//   node src/scripts/migrate-photos.js --apply    writes files + updates DB
//
// Heavy docs are fetched ONE AT A TIME with retry (a big cursor batch times out on Atlas).
// Every converted doc is saved at once, so a crash / Ctrl+C loses nothing: just run it again.
// RUN IT ON THE SERVER THAT SERVES /api/files (or copy the uploads/ folder there afterwards).
import { env } from '../config/env.js'; // loads .env, must be first
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { initRedis, closeRedis } from '../config/redis.js';
import { savePhoto, UPLOAD_ROOT, saveDocumentFile } from '../utils/photoStore.js';
import { findDataUrls, findBinaries, kindOf } from '../utils/dataUrlScan.js';
import { bump } from '../utils/cache.js';

const APPLY = process.argv.includes('--apply');
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
const mb = n => (n / 1048576).toFixed(2) + ' MB';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seen = new Map(); // identical image stored once

async function retry(fn, label) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= 6) throw e;
      console.warn(`  retry ${i}/5 (${label}): ${e.message.slice(0, 80)}`);
      await sleep(1500 * i);
    }
  }
}

/** ids first (tiny), then each doc alone. */
async function forEachDoc(col, query, fn) {
  const ids = await retry(() => col.find(query, { projection: { _id: 1 } }).toArray(), `${col.collectionName} ids`);
  let i = 0;
  for (const { _id } of ids) {
    const doc = await retry(() => col.findOne({ _id }), `${col.collectionName}/${_id}`);
    if (doc) await fn(doc);
    if (++i % 10 === 0 || i === ids.length) console.log(`   ${col.collectionName}: ${i}/${ids.length}`);
  }
  return ids.length;
}

// Server-side size report: nothing is downloaded
async function sizeReport(db, names) {
  console.log('Collection sizes (computed inside Mongo):');
  for (const name of names) {
    const [r] = await retry(
      () =>
        db
          .collection(name)
          .aggregate([{ $group: { _id: null, docs: { $sum: 1 }, bytes: { $sum: { $bsonSize: '$$ROOT' } }, max: { $max: { $bsonSize: '$$ROOT' } } } }])
          .toArray(),
      `${name} size`
    );
    if (r) console.log(`  ${name.padEnd(18)} docs=${String(r.docs).padEnd(6)} total=${mb(r.bytes).padEnd(10)} biggest doc=${mb(r.max)}`);
  }
  console.log('');
}

async function convertImages(db, names) {
  const stats = { images: 0, bytes: 0, failed: 0, docsChanged: 0, perCollection: {} };
  for (const name of names) {
    const col = db.collection(name);
    console.log(`[scan] ${name}`);
    await forEachDoc(col, {}, async doc => {
      const hits = findDataUrls(doc);
      if (!hits.length) return;
      const $set = {};
      for (const h of hits) {
        stats.bytes += h.value.length;
        try {
          if (APPLY) {
            const key = sha(h.value);
            if (!seen.has(key)) seen.set(key, await savePhoto(h.value, kindOf(h.path)));
            $set[h.path] = seen.get(key);
          }
          stats.images++;
          stats.perCollection[name] = (stats.perCollection[name] || 0) + 1;
        } catch (e) {
          stats.failed++;
          console.warn(`  ${name}/${doc._id} ${h.path}: ${e.message}`);
        }
      }
      if (APPLY && Object.keys($set).length) {
        await retry(() => col.updateOne({ _id: doc._id }, { $set }), `${name} update`);
        stats.docsChanged++;
      }
    });
  }
  return stats;
}

const toBuf = d => (Buffer.isBuffer(d) ? d : d?.buffer ? Buffer.from(d.buffer.subarray(0, d.position ?? d.buffer.length)) : Buffer.from(d));

// KYC documents: Buffer inside Mongo (workerfiles.data) -> file on disk (workerfiles.filePath)
async function migrateKyc(db) {
  const s = { kycFiles: 0, bytes: 0, failed: 0 };
  if (!(await db.listCollections({ name: 'workerfiles' }).toArray()).length) return s;
  const col = db.collection('workerfiles');
  console.log('[scan] workerfiles (KYC)');
  await forEachDoc(col, { data: { $exists: true, $ne: null }, filePath: { $exists: false } }, async f => {
    try {
      const buf = toBuf(f.data);
      s.bytes += buf.length;
      s.kycFiles++;
      if (APPLY) {
        const rel = await saveDocumentFile(f.workerId, f.id, f.mimeType, buf);
        await retry(() => col.updateOne({ _id: f._id }, { $set: { filePath: rel }, $unset: { data: 1 } }), 'kyc update');
      }
    } catch (e) {
      s.failed++;
      console.warn(`  kyc ${f.id}: ${e.message}`);
    }
  });
  return s;
}

async function main() {
  await connectDB({ socketTimeoutMS: 600_000, maxPoolSize: 2, minPoolSize: 0 });
  await initRedis();
  const db = mongoose.connection.db;
  console.log(APPLY ? `[APPLY] files go to ${UPLOAD_ROOT}` : '[DRY RUN] nothing changes. Use --apply to migrate.');
  console.log(`DB: ${mongoose.connection.host}/${mongoose.connection.name}\n`);

  const names = (await db.listCollections().toArray()).map(c => c.name).filter(n => !n.startsWith('system.'));
  await sizeReport(db, names);

  const img = await convertImages(db, names);
  const kyc = await migrateKyc(db);

  console.log('\nBase64 images :', { found: img.images, size: mb(img.bytes), failed: img.failed, perCollection: img.perCollection });
  console.log('KYC binaries  :', { found: kyc.kycFiles, size: mb(kyc.bytes), failed: kyc.failed });

  if (APPLY) {
    console.log('Unique files written:', seen.size, ' docs updated:', img.docsChanged);
    await bump('att', 'workers');
    console.log('\nRun again once: "base64 images found" must be 0.');
  } else {
    console.log('\nLooks fine? mongodump backup, then run again with --apply');
  }
  await closeRedis();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async e => {
  console.error('Migration failed:', e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});