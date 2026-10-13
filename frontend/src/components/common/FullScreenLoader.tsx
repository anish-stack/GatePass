import React from 'react';

export const FullScreenLoader: React.FC<{ label?: string }> = ({ label = 'Loading GatePass Terminal...' }) => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center">
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-sm font-mono text-slate-400">{label}</span>
    </div>
  </div>
);
