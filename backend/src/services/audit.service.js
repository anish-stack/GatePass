import { AuditLog, nextSeq, PUBLIC } from '../models/index.js';
import { genId } from '../utils/dateUtils.js';

const MAX_LOGS = 500;

export async function addAuditLog(log) {
  const seq = await nextSeq('audit');
  await AuditLog.create({ id: log.id || genId('log'), timestamp: new Date().toISOString(), ...log, seq });

  // Keep only latest 500 (same as original)
  const count = await AuditLog.estimatedDocumentCount();
  if (count > MAX_LOGS) {
    const cutoff = await AuditLog.find().sort({ seq: -1 }).skip(MAX_LOGS - 1).limit(1).select('seq').lean();
    if (cutoff[0]) await AuditLog.deleteMany({ seq: { $lt: cutoff[0].seq } });
  }
}

export async function getAuditLogs(limit = MAX_LOGS) {
  return AuditLog.find().sort({ seq: -1 }).limit(limit).select(PUBLIC).lean();
}
