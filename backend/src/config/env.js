import dotenv from 'dotenv';

dotenv.config();

// Timezone MUST be set before any Date logic runs (late / OT calculations use local hours)
process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';

const bool = (v, def) => (v === undefined ? def : String(v).toLowerCase() === 'true');

export const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  timezone: process.env.TZ,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/factory_attendance',
  jwtSecret: process.env.JWT_SECRET || 'dev_only_insecure_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  adminUsername: (process.env.ADMIN_USERNAME || 'admin').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  adminName: process.env.ADMIN_NAME || 'Factory Superintendent / HR Admin',
  autoSeed: bool(process.env.AUTO_SEED, true),
  allowDbReset: bool(process.env.ALLOW_DB_RESET, true),
  bodyLimit: process.env.BODY_LIMIT || '15mb',
};

if (env.isProd && env.jwtSecret === 'dev_only_insecure_secret_change_me') {
  console.error('[FATAL] JWT_SECRET must be set in production.');
  process.exit(1);
}
