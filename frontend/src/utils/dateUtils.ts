/** Local-date helpers (device timezone) */
export function getTodayDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonth(d: Date = new Date()): string {
  return getTodayDateString(d).substring(0, 7);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "05 Nov 2026" + tag (Today / Yesterday / '') for a check-in. Uses the exact punch time, falls back to the record date. */
export function checkInDateLabel(checkInDateTime?: string, fallbackDate?: string): { text: string; tag: string } | null {
  let d: Date | null = checkInDateTime ? new Date(checkInDateTime) : null;
  if (!d || isNaN(d.getTime())) {
    if (!fallbackDate) return null;
    const [y, m, day] = fallbackDate.split('-').map(Number);
    d = new Date(y, m - 1, day);
  }
  const key = getTodayDateString(d);
  const tag =
    key === getTodayDateString() ? 'Today' : key === getTodayDateString(new Date(Date.now() - 24 * 3600 * 1000)) ? 'Yesterday' : '';
  return { text: `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, tag };
}