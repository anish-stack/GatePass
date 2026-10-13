import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CurrentUserSession, Role } from '../types';
import { ApiService, AUTH_EXPIRED_EVENT, TokenStore } from '../services/api';

interface AuthContextValue {
  session: CurrentUserSession | null;
  isLoading: boolean;
  login: (role: Role, username: string, password: string) => Promise<CurrentUserSession>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<CurrentUserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore + verify session from stored JWT
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!TokenStore.get()) {
        setIsLoading(false);
        return;
      }
      try {
        const s = await ApiService.me();
        if (!cancelled) setSession(s);
      } catch {
        TokenStore.clear();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Token expired / account deactivated -> force logout
  useEffect(() => {
    const onExpired = () => setSession(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (role: Role, username: string, password: string) => {
    const { session: s } = await ApiService.login(role, username, password);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(() => {
    ApiService.logout();
    setSession(null);
  }, []);

  return <AuthContext.Provider value={{ session, isLoading, login, logout }}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
