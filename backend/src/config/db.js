import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(env.mongoUri);
  console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}
