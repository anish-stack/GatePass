import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ShieldCheck, Building2, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';

export const Navbar: React.FC = () => {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  if (!session) return null;
  const isAdmin = session.role === 'ADMIN';

  const handleLogout = () => {
    if (confirm('Log out of GatePass Pro?')) {
      logout();
      navigate('/login', { replace: true });
    }
  };

  const switchBtn = (active: boolean, activeCls: string) =>
    `px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
      active ? `${activeCls} text-white shadow-sm` : 'text-slate-400 hover:text-white'
    }`;

  return (
    <header className="no-print bg-slate-900/95 backdrop-blur border-b border-slate-800 text-white sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-gradient-to-tr from-emerald-600 to-sky-600 rounded-xl shadow-lg shadow-emerald-950 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-base sm:text-lg tracking-tight text-white truncate">GatePass Pro</span>
              <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800">
                Guard-Operated
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden md:block">Industrial Factory Attendance & Payroll System</p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Active User Badge */}
          <div className="hidden lg:flex items-center gap-2.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
            <div
              className={`p-1.5 rounded-lg ${
                isAdmin
                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              }`}
            >
              {isAdmin ? <Shield className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            </div>
            <div className="text-left text-xs">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="truncate max-w-[160px]">{session.name}</span>
                <span
                  className={`text-[10px] font-mono px-1 rounded ${
                    isAdmin ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {isAdmin ? 'ADMIN' : session.guardCode || 'GUARD'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                {isAdmin ? 'Full Factory Access' : session.gate || 'Gate 1 – Main'}
              </div>
            </div>
          </div>

          {/* Admin-only view switcher (guards cannot open admin portal) */}
          {isAdmin && (
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <NavLink
                to="/guard"
                className={({ isActive }) => switchBtn(isActive, 'bg-emerald-600')}
                title="Guard Attendance Gate Terminal"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Gate Terminal</span>
              </NavLink>
              <NavLink
                to="/admin"
                className={({ isActive }) => switchBtn(isActive, 'bg-amber-600')}
                title="Admin Management & Payroll Portal"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Admin Portal</span>
              </NavLink>
            </div>
          )}

          <ThemeToggle />

          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Log out session"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
