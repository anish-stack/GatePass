import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / curl (no origin) and whitelisted frontends
      if (!origin || env.clientUrls.includes('*') || env.clientUrls.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  })
);
app.use(compression());
// Large limit: live camera photos are sent as base64 data URLs
app.use(express.json({ limit: env.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.bodyLimit }));
if (!env.isProd) app.use(morgan('dev'));

app.get('/', (req, res) => res.json({ name: 'GatePass Pro API', docs: '/api/health' }));
app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
