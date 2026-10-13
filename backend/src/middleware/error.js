import { env } from '../config/env.js';

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Payload too large (photo too big).';
  } else if (err.name === 'ValidationError') {
    status = 400;
  } else if (err.code === 11000) {
    status = 409;
    message = `Duplicate value: ${Object.keys(err.keyValue || {}).join(', ')}`;
  } else if (err.name === 'CastError') {
    status = 400;
  }

  if (status >= 500) console.error('[Error]', err);
  res.status(status).json({ error: status >= 500 && env.isProd ? 'Internal server error' : message });
}
