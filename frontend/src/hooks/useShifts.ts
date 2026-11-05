import { useCallback, useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { WorkingShift } from '../types';
import { WORKING_TIME_OPTIONS } from '../utils/timeCalculations';

// One shared copy for the whole app. Standard working times come from the DB (admin editable).
let cache: WorkingShift[] = [];
let pending: Promise<WorkingShift[]> | null = null;
const listeners = new Set<(s: WorkingShift[]) => void>();

/** keep the legacy static list (used by filters / fallback) equal to the DB list */
function syncStatic(list: WorkingShift[]) {
  const active = list.filter(s => s.isActive);
  if (active.length < 2) return;
  WORKING_TIME_OPTIONS.splice(
    0,
    WORKING_TIME_OPTIONS.length,
    ...active.map(s => ({
      label: s.label,
      overnight: s.overnight,
      startTime24: s.startTime24,
      endTime24: s.endTime24,
      startTime12: s.startTime12,
      endTime12: s.endTime12,
      normalWorkingMinutes: s.normalWorkingMinutes,
      normalWorkingHours: s.normalWorkingHours,
    }))
  );
}

export function setShifts(list: WorkingShift[]) {
  cache = list;
  syncStatic(list);
  listeners.forEach(fn => fn(list));
}

export function loadShifts(force = false): Promise<WorkingShift[]> {
  if (!force && cache.length) return Promise.resolve(cache);
  if (!pending) {
    pending = ApiService.getShifts()
      .then(list => {
        setShifts(list);
        return list;
      })
      .catch(() => cache) // offline / not logged in: keep static defaults
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function useShifts() {
  const [shifts, setLocal] = useState<WorkingShift[]>(cache);
  useEffect(() => {
    listeners.add(setLocal);
    loadShifts();
    return () => {
      listeners.delete(setLocal);
    };
  }, []);
  const reload = useCallback(() => loadShifts(true), []);
  return { shifts, reload };
}
