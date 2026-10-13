import React, { useState } from 'react';
import {
  ShieldCheck,
  Shield,
  Building2,
  Lock,
  User,
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileCheck,
  KeyRound,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Role } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../common/ThemeToggle';

// Show 1-click demo credentials (set VITE_SHOW_DEMO_LOGINS=false in production)
const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_LOGINS !== 'false';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedRole, setSelectedRole] = useState<Role>('GUARD');
  const [username, setUsername] = useState(SHOW_DEMO ? 'guard01' : '');
  const [password, setPassword] = useState(SHOW_DEMO ? 'guard123' : '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setErrorMsg(null);
    if (!SHOW_DEMO) {
      setUsername('');
      setPassword('');
      return;
    }
    if (role === 'GUARD') {
      setUsername('guard01');
      setPassword('guard123');
    } else {
      setUsername('admin');
      setPassword('admin123');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const session = await login(selectedRole, username.trim().toLowerCase(), password.trim());
      const from = (location.state as { from?: string } | null)?.from;
      const home = session.role === 'ADMIN' ? '/admin' : '/guard';
      const target = from && (session.role === 'ADMIN' || !from.startsWith('/admin')) ? from : home;
      navigate(target, { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 py-10">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/20 via-slate-950 to-slate-950 pointer-events-none"></div>

      <div className="relative w-full max-w-md space-y-6">
        
        {/* Top Brand Banner */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-gradient-to-tr from-emerald-600 to-sky-600 rounded-2xl shadow-xl shadow-emerald-950/50 mb-2">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            GatePass Pro Industrial
          </h1>
          <p className="text-xs text-slate-400">
            Factory Guard-Operated Attendance & Live Photo Verification
          </p>
        </div>

        {/* WORKER NO-LOGIN POLICY BANNER */}
        <div className="bg-amber-950/40 border border-amber-600/40 rounded-xl p-3.5 text-xs text-amber-200/90 space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Strict Role & Gate System Policy</span>
          </div>
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            Workers NEVER mark their own attendance and have NO login access. Attendance is exclusively verified by <strong>Security Guards</strong> at the factory gate with live camera photo proof.
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          
          {/* Role Toggle Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleRoleSelect('GUARD')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                selectedRole === 'GUARD'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>SECURITY GUARD</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleSelect('ADMIN')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                selectedRole === 'ADMIN'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>ADMINISTRATOR</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {selectedRole === 'GUARD' ? 'Guard Username / Gate ID' : 'Administrator ID'}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={selectedRole === 'GUARD' ? 'guard01' : 'admin'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Security Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full disabled:opacity-60 disabled:cursor-wait py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                selectedRole === 'GUARD'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950'
                  : 'bg-amber-600 hover:bg-amber-500 shadow-amber-950'
              }`}
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : null}
              <span>{selectedRole === 'GUARD' ? 'Access Gate Attendance Terminal' : 'Access Admin Control Portal'}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          {/* 1-Click Fast Test Credentials */}
          {SHOW_DEMO && (
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              1-Click Demo Evaluation Credentials:
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole('GUARD');
                  setUsername('guard01');
                  setPassword('guard123');
                }}
                className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-left transition-colors cursor-pointer"
              >
                <div className="font-bold text-emerald-400">Ramesh Kumar (G-101)</div>
                <div className="text-[10px] text-slate-400">Gate 1 • guard01</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedRole('ADMIN');
                  setUsername('admin');
                  setPassword('admin123');
                }}
                className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-left transition-colors cursor-pointer"
              >
                <div className="font-bold text-amber-400">Factory Admin</div>
                <div className="text-[10px] text-slate-400">Full Access • admin</div>
              </button>
            </div>
          </div>
          )}

        </div>

        {/* Footer info */}
        <p className="text-[11px] text-slate-500 text-center">
          GatePass Pro • Real-time Gate CCTV Watermarking • ISO 9001 Compliant Muster Roll
        </p>

      </div>
    </div>
  );
};
