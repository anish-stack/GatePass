import {
  Worker,
  GuardUser,
  AttendanceRecord,
  AttendanceRulesConfig,
  PayrollRecord,
  SystemAuditLog,
  ReportSummaryMetrics,
  AdvanceTransaction,
  AdvanceDashboardStats,
  WorkerAdvanceSummary,
  CurrentUserSession,
  Role,
} from '../types';
import { getCurrentMonth, getTodayDateString } from '../utils/dateUtils';

// Empty = same origin (Vite dev proxy / Nginx). Set VITE_API_URL=https://api.yourdomain.com for split hosting.
const API_BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api`;

const TOKEN_KEY = 'gatepass_token';

export const TokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const AUTH_EXPIRED_EVENT = 'gatepass:auth-expired';

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = TokenStore.get();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error('Cannot reach server. Check your internet connection or backend status.');
  }

  if (response.status === 401 && !path.startsWith('/auth/login')) {
    TokenStore.clear();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const ApiService = {
  // ================= AUTH =================
  async login(role: Role, username: string, password: string): Promise<{ token: string; session: CurrentUserSession }> {
    const data = await fetchJson<{ token: string; session: CurrentUserSession }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, username, password }),
    });
    TokenStore.set(data.token);
    return data;
  },

  async me(): Promise<CurrentUserSession> {
    const data = await fetchJson<{ session: CurrentUserSession }>('/auth/me');
    return data.session;
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return fetchJson<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  logout() {
    TokenStore.clear();
  },

  // ================= WORKERS =================
  getWorkers(): Promise<Worker[]> {
    return fetchJson<Worker[]>('/workers');
  },

  createWorker(worker: Omit<Worker, 'id'> & { id?: string }): Promise<Worker> {
    return fetchJson<Worker>('/workers', { method: 'POST', body: JSON.stringify(worker) });
  },

  updateWorker(id: string, updates: Partial<Worker>): Promise<Worker> {
    return fetchJson<Worker>(`/workers/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },

  async deleteWorker(id: string): Promise<boolean> {
    await fetchJson<{ success: boolean }>(`/workers/${id}`, { method: 'DELETE' });
    return true;
  },

  // ================= WORKER KYC DOCUMENTS =================
  addWorkerDocument(workerId: string, payload: { type: string; fileName: string; dataUrl: string }): Promise<Worker> {
    return fetchJson<Worker>(`/workers/${workerId}/documents`, { method: 'POST', body: JSON.stringify(payload) });
  },

  deleteWorkerDocument(workerId: string, docId: string): Promise<Worker> {
    return fetchJson<Worker>(`/workers/${workerId}/documents/${docId}`, { method: 'DELETE' });
  },

  /** Download protected document file as Blob (Authorization header required) */
  async getWorkerDocumentBlob(workerId: string, docId: string): Promise<Blob> {
    const token = TokenStore.get();
    const res = await fetch(`${API_BASE}/workers/${workerId}/documents/${docId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {
      TokenStore.clear();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  // ================= GUARDS =================
  getGuards(): Promise<GuardUser[]> {
    return fetchJson<GuardUser[]>('/guards');
  },

  createGuard(guard: Partial<GuardUser> & { password?: string }): Promise<GuardUser> {
    return fetchJson<GuardUser>('/guards', { method: 'POST', body: JSON.stringify(guard) });
  },

  updateGuard(id: string, updates: Partial<GuardUser> & { password?: string }): Promise<GuardUser> {
    return fetchJson<GuardUser>(`/guards/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },

  toggleGuardStatus(id: string): Promise<GuardUser | null> {
    return fetchJson<GuardUser>(`/guards/${id}/status`, { method: 'PATCH' });
  },

  // ================= ATTENDANCE =================
  getAttendance(filters?: { date?: string; month?: string; workerId?: string; status?: string }): Promise<AttendanceRecord[]> {
    return fetchJson<AttendanceRecord[]>(`/attendance${qs({ ...filters })}`);
  },

  checkIn(payload: { workerId: string; photoDataUrl: string; gateName?: string }): Promise<AttendanceRecord> {
    return fetchJson<AttendanceRecord>('/attendance/check-in', { method: 'POST', body: JSON.stringify(payload) });
  },

  checkOut(payload: {
    workerId: string;
    photoDataUrl?: string;
    gateName?: string;
    overtimeMinutesOverride?: number;
  }): Promise<AttendanceRecord> {
    return fetchJson<AttendanceRecord>('/attendance/check-out', { method: 'POST', body: JSON.stringify(payload) });
  },

  adminOverrideAttendance(
    recordId: string,
    updates: Partial<AttendanceRecord>,
    adminName: string,
    reason: string
  ): Promise<AttendanceRecord> {
    return fetchJson<AttendanceRecord>('/attendance/override', {
      method: 'POST',
      body: JSON.stringify({ recordId, updates, adminName, reason }),
    });
  },

  // ================= RULES =================
  getRules(): Promise<AttendanceRulesConfig> {
    return fetchJson<AttendanceRulesConfig>('/rules');
  },

  updateRules(rules: AttendanceRulesConfig): Promise<AttendanceRulesConfig> {
    return fetchJson<AttendanceRulesConfig>('/rules', { method: 'PUT', body: JSON.stringify(rules) });
  },

  // ================= PAYROLL =================
  getPayroll(month: string = getCurrentMonth()): Promise<PayrollRecord[]> {
    return fetchJson<PayrollRecord[]>(`/payroll${qs({ month })}`);
  },

  recalculatePayroll(month: string = getCurrentMonth()): Promise<PayrollRecord[]> {
    return fetchJson<PayrollRecord[]>('/payroll/calculate', { method: 'POST', body: JSON.stringify({ month }) });
  },

  adjustPayroll(
    id: string,
    payload: { bonusAmount: number; otherDeduction: number; adjustmentRemarks: string }
  ): Promise<PayrollRecord> {
    return fetchJson<PayrollRecord>(`/payroll/${id}/adjust`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  markPayrollPaid(id: string): Promise<PayrollRecord> {
    return fetchJson<PayrollRecord>(`/payroll/${id}/pay`, { method: 'PATCH' });
  },

  // ================= REPORTS =================
  getReports(month: string = getCurrentMonth()): Promise<{
    month: string;
    summary: ReportSummaryMetrics;
    lateRecords: any[];
    absentRecords: any[];
    otRecords: any[];
    workerMonthlyMatrix: PayrollRecord[];
  }> {
    return fetchJson(`/reports${qs({ month })}`);
  },

  // ================= ADVANCES =================
  getAdvances(filters?: {
    workerId?: string;
    month?: string;
    status?: string;
    paymentMode?: string;
    search?: string;
  }): Promise<AdvanceTransaction[]> {
    return fetchJson<AdvanceTransaction[]>(`/advances${qs({ ...filters })}`);
  },

  getAdvanceStats(month: string = getCurrentMonth()): Promise<AdvanceDashboardStats> {
    return fetchJson<AdvanceDashboardStats>(`/advances/stats${qs({ month })}`);
  },

  getWorkerAdvanceSummary(workerId: string): Promise<WorkerAdvanceSummary> {
    return fetchJson<WorkerAdvanceSummary>(`/advances/worker/${workerId}`);
  },

  createAdvance(payload: {
    workerId: string;
    amount: number;
    advanceDate: string;
    salaryMonth?: string;
    paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
    paymentReference?: string;
    remarks?: string;
    createdBy?: string;
  }): Promise<AdvanceTransaction> {
    return fetchJson<AdvanceTransaction>('/advances', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateAdvance(
    id: string,
    updates: Partial<{
      amount: number;
      advanceDate: string;
      salaryMonth: string;
      paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
      paymentReference: string;
      remarks: string;
      updatedBy: string;
    }>
  ): Promise<AdvanceTransaction> {
    return fetchJson<AdvanceTransaction>(`/advances/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },

  voidAdvance(id: string, voidedBy: string, reason: string): Promise<AdvanceTransaction> {
    return fetchJson<AdvanceTransaction>(`/advances/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidedBy, reason }),
    });
  },

  // ================= DASHBOARD STATS =================
  getDashboardStats(date: string = getTodayDateString(), month: string = getCurrentMonth()) {
    return fetchJson<any>(`/stats${qs({ date, month })}`);
  },

  // ================= AUDIT LOGS =================
  getAuditLogs(): Promise<SystemAuditLog[]> {
    return fetchJson<SystemAuditLog[]>('/audit-logs');
  },

  // ================= DATABASE RESET =================
  async resetDatabase(): Promise<void> {
    await fetchJson('/database/reset', { method: 'POST' });
  },
};
