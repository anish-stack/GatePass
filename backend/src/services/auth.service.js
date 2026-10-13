import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Admin, Guard } from '../models/index.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export const signToken = (sub, role) => jwt.sign({ sub, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

const adminSession = a => ({
  role: 'ADMIN',
  id: a.id,
  name: a.fullName,
  username: a.username,
});

const guardSession = g => ({
  role: 'GUARD',
  id: g.id,
  name: g.fullName,
  username: g.username,
  guardCode: g.guardId,
  gate: g.gateAssigned,
  factory: g.factoryLocation,
});

export async function login({ role, username, password }) {
  const user = String(username || '').trim().toLowerCase();
  const pass = String(password || '').trim();
  if (!user || !pass) throw new HttpError(400, 'Username and password are required.');

  if (role === 'ADMIN') {
    const admin = await Admin.findOne({ username: user }).select('+passwordHash');
    if (!admin || !(await bcrypt.compare(pass, admin.passwordHash))) {
      throw new HttpError(401, 'Invalid Admin credentials.');
    }
    if (admin.status !== 'ACTIVE') throw new HttpError(403, 'Admin account is inactive.');
    admin.lastLogin = new Date().toISOString();
    await admin.save();
    return { token: signToken(admin.id, 'ADMIN'), session: adminSession(admin) };
  }

  // GUARD (default)
  const guard = await Guard.findOne({ username: user }).select('+passwordHash');
  if (!guard || !(await bcrypt.compare(pass, guard.passwordHash))) {
    throw new HttpError(401, 'Invalid Security Guard credentials.');
  }
  if (guard.status !== 'ACTIVE') {
    throw new HttpError(403, 'This Security Guard account is currently INACTIVE. Contact Administrator.');
  }
  guard.lastLogin = new Date().toISOString();
  await guard.save();
  return { token: signToken(guard.id, 'GUARD'), session: guardSession(guard) };
}

/** Resolve token payload -> live session (re-checks account status every request) */
export async function resolveSession(payload) {
  if (payload.role === 'ADMIN') {
    const admin = await Admin.findOne({ id: payload.sub }).lean();
    if (!admin || admin.status !== 'ACTIVE') return null;
    return adminSession(admin);
  }
  if (payload.role === 'GUARD') {
    const guard = await Guard.findOne({ id: payload.sub }).lean();
    if (!guard || guard.status !== 'ACTIVE') return null;
    return guardSession(guard);
  }
  return null;
}

export async function changeAdminPassword(adminId, currentPassword, newPassword) {
  const admin = await Admin.findOne({ id: adminId }).select('+passwordHash');
  if (!admin) throw new HttpError(404, 'Admin not found.');
  if (!(await bcrypt.compare(String(currentPassword || ''), admin.passwordHash))) {
    throw new HttpError(400, 'Current password is incorrect.');
  }
  if (!newPassword || String(newPassword).length < 6) {
    throw new HttpError(400, 'New password must be at least 6 characters.');
  }
  admin.passwordHash = await bcrypt.hash(String(newPassword), 10);
  await admin.save();
}
