import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Clock,
  Coins,
  History,
  Sliders,
  FileSpreadsheet,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import { Worker, GuardUser, AttendanceRulesConfig, AttendanceRecord, CurrentUserSession } from '../types';
import { ApiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getTodayDateString } from '../utils/dateUtils';

export interface AdminOutletContext {
  session: CurrentUserSession;
  workers: Worker[];
  guards: GuardUser[];
  rules: AttendanceRulesConfig;
  attendanceToday: AttendanceRecord[];
  refresh: () => Promise<void>;
  loading: boolean;
}

export const useAdminData = () => useOutletContext<AdminOutletContext>();

const DEFAULT_RULES: AttendanceRulesConfig = {
  salaryBasisDays: 30,
  gracePeriodMinutes: 0,
  otRateMultiplier: 1,
  requireCheckOutPhoto: true,
};

export const AdminLayout: React.FC = () => {
  const { session } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [guards, setGuards] = useState<GuardUser[]>([]);
  const [rules, setRules] = useState<AttendanceRulesConfig>(DEFAULT_RULES);
  const [attendanceToday, setAttendanceToday] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [w, g, r, att] = await Promise.all([
        ApiService.getWorkers(),
        ApiService.getGuards(),
        ApiService.getRules(),
        ApiService.getAttendance({ date: getTodayDateString() }),
      ]);
      setWorkers(w);
      setGuards(g);
      setRules(r);
      setAttendanceToday(att);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load factory data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep active tab visible in horizontally scrolling mobile nav
  const location = useLocation();
  const navRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    navRef.current?.querySelector('a.active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (!session) return null;

  const tabs = [
    { to: '/admin', end: true, label: 'Dashboard Overview', icon: LayoutDashboard },
    { to: '/admin/workers', label: `Worker Profiles (${workers.length})`, icon: Users },
    { to: '/admin/guards', label: `Security Guards (${guards.length})`, icon: ShieldCheck },
    { to: '/admin/attendance', label: 'Attendance & Photos', icon: Clock },
    { to: '/admin/reports', label: 'Reports (Late/Absent/OT)', icon: FileSpreadsheet },
    { to: '/admin/advances', label: 'Advance Salary', icon: Wallet, amber: true },
    { to: '/admin/payroll', label: 'Monthly Salary & Slips (30d)', icon: Coins },
    { to: '/admin/rules', label: 'Working Times & Rules', icon: Sliders },
    { to: '/admin/audit', label: 'Audit Logs', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Admin Navigation: horizontal scroll on mobile, wrap on desktop */}
      <nav className="no-print bg-slate-900 border border-slate-800 p-2 rounded-2xl shadow-lg -mx-1 sm:mx-0">
        <div ref={navRef} className="flex lg:flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar snap-x">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `snap-start shrink-0 whitespace-nowrap flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? t.amber
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-950'
                        : 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`
                }
              >
                <Icon className={`w-4 h-4 ${t.amber ? 'text-amber-300' : ''}`} />
                <span>{t.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={refresh} className="font-bold underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

      <Outlet
        context={{ session, workers, guards, rules, attendanceToday, refresh, loading } satisfies AdminOutletContext}
      />
    </div>
  );
};
