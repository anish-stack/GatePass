import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';

export const AppLayout: React.FC = () => (
  <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
    {/* Top Application Header */}
    <Navbar />

    {/* Main App Container */}
    <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-4 sm:p-6 lg:p-8">
      <Outlet />
    </main>

    {/* Industrial Footer */}
    <footer className="no-print border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-600">
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>GatePass Pro • Industrial Guard-Operated Attendance & Payroll System</span>
        <span className="font-mono text-[11px]">Strict Role Accountability: Guard Gate Verification Active</span>
      </div>
    </footer>
  </div>
);
