import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { resolveSession } from '../services/auth.service.js';

/** Require valid JWT. Attaches req.user = live session */
export async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }

    const session = await resolveSession(payload);
    if (!session) return res.status(401).json({ error: 'Account inactive or removed. Please log in again.' });

    req.user = session;
    next();
  } catch (err) {
    next(err);
  }
}

/** Role guard: authorize('ADMIN') or authorize('ADMIN', 'GUARD') */
export const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
