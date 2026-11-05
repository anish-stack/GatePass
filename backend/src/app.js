import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { UPLOAD_ROOT } from './utils/photoStore.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server, curl, Postman
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigins = env.clientUrls;

      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(`[CORS BLOCKED] Origin: ${origin}`);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(compression());
// Large limit: live camera photos are sent as base64 data URLs
app.use(express.json({ limit: env.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.bodyLimit }));
if (!env.isProd) app.use(morgan('dev'));

// Photos on disk. Filenames are random 128-bit names (unguessable); long browser cache.
// Must stay BEFORE /api routes (those require a JWT, <img> tags cannot send one).
app.use(
  '/api/files',
  express.static(UPLOAD_ROOT, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny', fallthrough: false })
);

app.get('/', (req, res) => res.json({ name: 'GatePass Pro API', docs: '/api/health' }));
app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;