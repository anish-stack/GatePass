import { Rules } from '../models/index.js';
import { addAuditLog } from './audit.service.js';

const DEFAULT_RULES = {
  salaryBasisDays: 30,
  gracePeriodMinutes: 0,
  otRateMultiplier: 1,
  requireCheckOutPhoto: true,
  otMinimumMinutes: 30,
  checkInOpensBeforeMinutes: 120,
};

const toPublic = doc => ({
  salaryBasisDays: 30,
  gracePeriodMinutes: Number(doc?.gracePeriodMinutes ?? 0),
  otRateMultiplier: Number(doc?.otRateMultiplier ?? 1),
  requireCheckOutPhoto: doc?.requireCheckOutPhoto ?? true,
  otMinimumMinutes: Number(doc?.otMinimumMinutes ?? 30),
  checkInOpensBeforeMinutes: Number(doc?.checkInOpensBeforeMinutes ?? 120),
});

export async function getRules() {
  let doc = await Rules.findOne({ key: 'default' }).lean();
  if (!doc) doc = (await Rules.create({ key: 'default', ...DEFAULT_RULES })).toObject();
  return toPublic(doc);
}

export async function updateRules(rules = {}, actor) {
  const next = {
    gracePeriodMinutes: Math.max(0, Number(rules.gracePeriodMinutes) || 0),
    otRateMultiplier: Number(rules.otRateMultiplier) > 0 ? Number(rules.otRateMultiplier) : 1,
    requireCheckOutPhoto: rules.requireCheckOutPhoto !== undefined ? Boolean(rules.requireCheckOutPhoto) : true,
    otMinimumMinutes: Math.min(600, Math.max(0, Math.round(Number(rules.otMinimumMinutes ?? 30) || 0))),
    checkInOpensBeforeMinutes: Math.min(720, Math.max(0, Math.round(Number(rules.checkInOpensBeforeMinutes ?? 120) || 0))),
    salaryBasisDays: 30, // ALWAYS 30 DAYS BASIS
  };
  await Rules.updateOne({ key: 'default' }, { $set: next }, { upsert: true });
  const saved = await getRules();

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'System Admin',
    actionType: 'RULES_UPDATED',
    details: `Factory attendance policies and overtime rules updated. Basis: 30 days. OT Multiplier: ${saved.otRateMultiplier}x. OT minimum: ${saved.otMinimumMinutes} min. Check-in opens ${saved.checkInOpensBeforeMinutes} min before shift.`,
  });

  return saved;
}
