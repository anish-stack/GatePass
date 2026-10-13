import bcrypt from 'bcryptjs';
import { Guard } from '../models/index.js';
import { addAuditLog } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';
import { genId } from '../utils/dateUtils.js';

const SELECT = '-_id';

export const hashPassword = pwd => bcrypt.hash(String(pwd), 10);

export async function getGuards() {
  return Guard.find().sort({ _id: 1 }).select(SELECT).lean();
}

export async function getGuardById(id) {
  return Guard.findOne({ id }).select(SELECT).lean();
}

export async function createGuard(guardData, actor) {
  const { password, passwordHash, ...rest } = guardData || {};
  const plain = (password || passwordHash || '').toString().trim();

  if (!rest.fullName || !rest.username) throw new HttpError(400, 'fullName and username are required.');
  if (!rest.guardId) throw new HttpError(400, 'guardId is required.');
  if (plain.length < 4) throw new HttpError(400, 'Password must be at least 4 characters.');

  const username = String(rest.username).trim().toLowerCase();
  if (await Guard.exists({ username })) throw new HttpError(400, `Username "${username}" is already taken.`);
  if (await Guard.exists({ guardId: rest.guardId })) throw new HttpError(400, `Guard ID ${rest.guardId} already exists.`);

  const id = rest.id && !(await Guard.exists({ id: rest.id })) ? rest.id : genId('guard');

  await Guard.create({
    ...rest,
    username,
    id,
    passwordHash: await hashPassword(plain),
    recordSource: 'live',
    status: rest.status || 'ACTIVE',
    createdAt: new Date().toISOString(),
  });
  const newGuard = await getGuardById(id);

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'System Admin',
    actionType: 'GUARD_CREATED',
    details: `Guard account created: ${newGuard.fullName} (${newGuard.guardId}) assigned to ${newGuard.gateAssigned}. Source: live.`,
  });

  return newGuard;
}

export async function updateGuard(id, updates) {
  const existing = await Guard.findOne({ id }).lean();
  if (!existing) return null;

  const { password, passwordHash, _id, id: _ignore, recordSource, createdAt, ...rest } = updates || {};
  const plain = (password || passwordHash || '').toString().trim();
  const $set = { ...rest };

  if (rest.username) {
    $set.username = String(rest.username).trim().toLowerCase();
    if (await Guard.exists({ username: $set.username, id: { $ne: id } })) {
      throw new HttpError(400, `Username "${$set.username}" is already taken.`);
    }
  }
  if (rest.guardId && (await Guard.exists({ guardId: rest.guardId, id: { $ne: id } }))) {
    throw new HttpError(400, `Guard ID ${rest.guardId} already exists.`);
  }
  // Empty password on edit = keep current password
  if (plain) {
    if (plain.length < 4) throw new HttpError(400, 'Password must be at least 4 characters.');
    $set.passwordHash = await hashPassword(plain);
  }

  await Guard.updateOne({ id }, { $set }, { runValidators: true });
  return getGuardById(id);
}

export async function toggleGuardStatus(id) {
  const guard = await Guard.findOne({ id });
  if (!guard) return null;
  guard.status = guard.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  await guard.save();
  return getGuardById(id);
}
