import '../config/env.js';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { seedDatabase, seedIfEmpty } from '../services/seed.service.js';

const force = process.argv.includes('--force');

(async () => {
  try {
    await connectDB();
    if (force) {
      await seedDatabase();
    } else {
      await seedIfEmpty();
      console.log('[Seed] Done. (Use "npm run seed:force" to wipe & reload demo data)');
    }
  } catch (err) {
    console.error('[Seed] Failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
