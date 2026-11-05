// node src/scripts/check-today.js [YYYY-MM-DD]
// Shows what Mongo REALLY holds. Use when admin screen shows 0 but workers are inside factory.
import { env } from '../config/env.js';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Attendance } from '../models/index.js';
import { getLocalDateString } from '../utils/dateUtils.js';

const date = process.argv[2] || getLocalDateString();
await connectDB();
console.log(`TZ=${env.timezone}  server date=${date}  now=${new Date().toISOString()}`);
console.log('DB host:', mongoose.connection.host, ' db:', mongoose.connection.name);

const t0 = Date.now();
const today = await Attendance.find({ date }).select('id workerName date checkInTime checkInDateTime checkOutTime status').lean();
console.log(`\nRecords with date=${date}: ${today.length}  (${Date.now() - t0} ms)`);
today.forEach(r => console.log(' ', r.workerName, '|', r.checkInTime, '|', r.checkOutTime || '-', '|', r.status));

const last = await Attendance.find().sort({ seq: -1 }).limit(8).select('workerName date checkInTime checkInDateTime createdAt').lean();
console.log('\nLast 8 records by insert order (newest first):');
last.forEach(r => console.log(' ', r.date, '|', r.workerName, '|', r.checkInTime, '|', r.createdAt));
console.log('\nIf the newest row is OLD -> check-in writes are NOT reaching this DB (timeout / other server / other DB).');
await mongoose.disconnect();
