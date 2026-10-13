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
