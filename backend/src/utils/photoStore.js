import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { HttpError } from './httpError.js';

export const UPLOAD_ROOT = path.resolve(env.uploadDir);
export const FILE_URL_PREFIX = '/api/files/';
const MAX_BYTES = 6 * 1024 * 1024;
const DATA_RE = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i;
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const isDataUrl = v => typeof v === 'string' && v.startsWith('data:image/');

function sniffOk(buf, mime) {
  if (mime === 'image/png') return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
  if (mime === 'image/webp') return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8; // jpeg
}

/** Save a base64 data URL to disk. Returns the public path stored in DB, e.g. /api/files/photos/2026-11/checkin-ab12.jpg */
export async function savePhoto(dataUrl, kind = 'photo') {
  const m = DATA_RE.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Invalid photo. Only JPG, PNG or WEBP images are allowed.');
  const mime = m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw new HttpError(400, 'Photo is empty.');
  if (buf.length > MAX_BYTES) throw new HttpError(400, 'Photo too large (max 6 MB).');
  if (!sniffOk(buf, mime)) throw new HttpError(400, 'Photo content does not match its image type.');

  const month = new Date().toISOString().slice(0, 7);
  const safeKind = String(kind).replace(/[^a-z0-9-]/gi, '').slice(0, 16) || 'photo';
  const rel = `photos/${month}/${safeKind}-${crypto.randomBytes(16).toString('hex')}.${EXT[mime]}`;
  const abs = path.join(UPLOAD_ROOT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf, { flag: 'wx' });
  return `${FILE_URL_PREFIX}${rel}`;
}

/** Turn any stored/received photo value into something safe to store:
 *  data URL -> saved to disk; absolute/relative URL of our files -> normalized relative path; other http(s) URL -> kept. */
export async function normalizePhoto(value, kind) {
  if (!value) return value;
  if (isDataUrl(value)) return savePhoto(value, kind);
  const s = String(value);
  const i = s.indexOf(`${FILE_URL_PREFIX}photos/`);
  if (i >= 0) return s.slice(i).split('?')[0];
  return s;
}

export const isLocalPhoto = url => typeof url === 'string' && url.startsWith(`${FILE_URL_PREFIX}photos/`);

/** Best-effort delete of a photo file we own. Never throws. */
export async function deletePhoto(url) {
  if (!isLocalPhoto(url)) return;
  try {
    const abs = path.resolve(UPLOAD_ROOT, url.slice(FILE_URL_PREFIX.length));
    if (!abs.startsWith(UPLOAD_ROOT + path.sep)) return; // path traversal guard
    await fs.unlink(abs);
  } catch {
    /* already gone */
  }
}