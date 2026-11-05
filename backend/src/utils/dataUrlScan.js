import { isDataUrl } from './photoStore.js';

const isBin = v => Buffer.isBuffer(v) || v?._bsontype === 'Binary';

/** Walk any Mongo doc. Returns [{ path:'documents.0.fileUrl', value:'data:image/..' }] for every base64 image string. */
export function findDataUrls(v, path = '', out = []) {
  if (typeof v === 'string') {
    if (isDataUrl(v)) out.push({ path, value: v });
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => findDataUrls(x, path ? `${path}.${i}` : String(i), out));
  } else if (v && typeof v === 'object' && !isBin(v) && !(v instanceof Date) && v._bsontype === undefined) {
    for (const [k, x] of Object.entries(v)) findDataUrls(x, path ? `${path}.${k}` : k, out);
  }
  return out;
}

/** Binary fields (Buffer / BSON Binary) anywhere in a doc, with size. */
export function findBinaries(v, path = '', out = []) {
  if (isBin(v)) {
    const size = typeof v.length === 'function' ? v.length() : v.length ?? 0;
    out.push({ path, size });
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => findBinaries(x, path ? `${path}.${i}` : String(i), out));
  } else if (v && typeof v === 'object' && !(v instanceof Date) && v._bsontype === undefined) {
    for (const [k, x] of Object.entries(v)) findBinaries(x, path ? `${path}.${k}` : k, out);
  }
  return out;
}

/** photo kind from the field name (only used for the file name prefix) */
export const kindOf = path => {
  const k = path.split('.').pop().toLowerCase();
  return k.includes('checkin') ? 'checkin' : k.includes('checkout') ? 'checkout' : 'profile';
};
