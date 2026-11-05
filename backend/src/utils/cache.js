import crypto from 'crypto';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';

/**
 * Version-namespaced cache. bump(ns) invalidates every key of that namespace at once
 * (no KEYS/SCAN). All failures fall through to the DB - cache is never required.
 */
export async function cached(ns, keyObj, fn, ttl = env.cacheTtlSeconds) {
  const r = getRedis();
  if (!r) return fn();
  try {
    const ver = (await r.get(`gp:v:${ns}`)) || '0';
    const hash = crypto.createHash('sha1').update(JSON.stringify(keyObj ?? {})).digest('hex').slice(0, 20);
    const key = `gp:${ns}:${ver}:${hash}`;
    const hit = await r.get(key);
    if (hit) return JSON.parse(hit);
    const val = await fn();
    if (val !== undefined) await r.set(key, JSON.stringify(val), 'EX', ttl);
    return val;
  } catch {
    return fn();
  }
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