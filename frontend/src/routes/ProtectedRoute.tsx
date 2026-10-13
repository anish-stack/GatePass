import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';
import { FullScreenLoader } from '../components/common/FullScreenLoader';

export const homePathFor = (role?: Role) => (role === 'ADMIN' ? '/admin' : '/guard');

/** Blocks unauthenticated users; optional role whitelist */
export const ProtectedRoute: React.FC<{ roles?: Role[] }> = ({ roles }) => {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(session.role)) return <Navigate to={homePathFor(session.role)} replace />;

  return <Outlet />;
};

/** Login page: redirect away if already logged in */
export const PublicOnlyRoute: React.FC = () => {
  const { session, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (session) return <Navigate to={homePathFor(session.role)} replace />;
  return <Outlet />;
};

export const RoleHomeRedirect: React.FC = () => {
  const { session, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  return <Navigate to={session ? homePathFor(session.role) : '/login'} replace />;
};
