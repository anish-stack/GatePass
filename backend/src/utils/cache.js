import crypto from 'crypto';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';

const inflight = new Map(); // same query running at once -> ONE Mongo hit, everyone shares the result

/**
 * Version-namespaced cache. bump(ns) invalidates every key of that namespace at once.
 * Redis failure falls through to DB. DB failure is thrown ONCE (old code re-ran the query = double timeout).
 */
export async function cached(ns, keyObj, fn, ttl = env.cacheTtlSeconds) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(keyObj ?? {})).digest('hex').slice(0, 20);
  const r = getRedis();
  let key = null;

  if (r) {
    try {
      const ver = (await r.get(`gp:v:${ns}`)) || '0';
      key = `gp:${ns}:${ver}:${hash}`;
      const hit = await r.get(key);
      if (hit) return JSON.parse(hit);
    } catch {
      key = null;
    }
  }

  const fid = `${ns}:${hash}:${key || ''}`;
  if (inflight.has(fid)) return inflight.get(fid);

  const p = (async () => {
    const val = await fn();
    if (key && val !== undefined) {
      try {
        await r.set(key, JSON.stringify(val), 'EX', ttl);
      } catch {
        /* ignore */
      }
    }
    return val;
  })().finally(() => inflight.delete(fid));

  inflight.set(fid, p);
  return p;
}

export async function bump(...namespaces) {
  const r = getRedis();
  if (!r) return;
  try {
    await Promise.all(namespaces.map(ns => r.incr(`gp:v:${ns}`)));
  } catch {
    /* ignore */
  }
}
