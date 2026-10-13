import React from 'react';
import { useAuth } from '../context/AuthContext';
import { GuardAttendanceTerminal } from '../components/guard/GuardAttendanceTerminal';

export const GuardTerminalPage: React.FC = () => {
  const { session } = useAuth();
  if (!session) return null;
  // Admin opening the terminal acts under own identity (recorded by backend from JWT)
  const terminalSession =
    session.role === 'ADMIN' ? { ...session, gate: session.gate || 'Admin Gate Terminal', guardCode: 'ADMIN' } : session;
  return <GuardAttendanceTerminal guardSession={terminalSession} />;
};
