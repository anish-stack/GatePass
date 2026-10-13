import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

export const NotFoundPage: React.FC = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-sm w-full space-y-3">
      <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
      <h1 className="text-xl font-black text-white">404 – Page Not Found</h1>
      <p className="text-xs text-slate-400">The page you requested does not exist.</p>
      <Link
        to="/"
        className="inline-block mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
      >
        Go to Home
      </Link>
    </div>
  </div>
);
