// Local (APP_TIMEZONE) date helpers. process.env.TZ is set in config/env.js
export function getLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentMonth(d = new Date()) {
  return getLocalDateString(d).substring(0, 7);
}

export const isValidMonth = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
export const isValidDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const round2 = n => Math.round(n * 100) / 100;

export const genId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
