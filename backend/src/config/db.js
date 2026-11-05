import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB(overrides = {}) {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(env.mongoUri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    maxIdleTimeMS: 60_000, // drop idle sockets before Atlas/NAT kills them (cause of "connection N timed out")
    heartbeatFrequencyMS: 10_000,
    connectTimeoutMS: 15_000,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 60_000,
    compressors: 'zlib', // less bytes over the wire
    retryReads: true,
    retryWrites: true,
    ...overrides,
  });
  console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}