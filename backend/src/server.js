import { env } from './config/env.js'; // must be first (sets TZ)
import mongoose from 'mongoose';
import fs from 'fs/promises';
import { connectDB } from './config/db.js';
import { initRedis, closeRedis } from './config/redis.js';
import { UPLOAD_ROOT } from './utils/photoStore.js';
import { seedIfEmpty, ensureAdmin } from './services/seed.service.js';
import { cleanupPlaceholderDocuments } from './services/worker.service.js';
import app from './app.js';

async function start() {
  await connectDB();
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  await initRedis();
  if (env.autoSeed) await seedIfEmpty();
  else await ensureAdmin();
  await cleanupPlaceholderDocuments();

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`[GatePass API] http://0.0.0.0:${env.port}  (TZ=${env.timezone}, env=${env.nodeEnv})`);
  });

  const shutdown = async signal => {
    console.log(`\n[GatePass API] ${signal} received, shutting down...`);
    server.close(async () => {
      await closeRedis();
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});