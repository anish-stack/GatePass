import React from 'react';
import { useAdminData } from '../../layouts/AdminLayout';
import { WorkerManagement } from '../../components/admin/WorkerManagement';
import { GuardManagement } from '../../components/admin/GuardManagement';
import { LiveAttendanceView } from '../../components/admin/LiveAttendanceView';
import { ReportsView } from '../../components/admin/ReportsView';
import { AdvanceSalaryManagement } from '../../components/admin/AdvanceSalaryManagement';
import { PayrollManagementView } from '../../components/admin/PayrollManagement';
import { AttendanceRulesConfigView } from '../../components/admin/AttendanceRulesConfig';
import { AuditLogsView } from '../../components/admin/AuditLogsView';

// Thin route wrappers: pull shared admin data from <AdminLayout> outlet context

export const WorkersPage: React.FC = () => {
  const { refresh } = useAdminData();
  return <WorkerManagement onDataChanged={refresh} />;
};

export const GuardsPage: React.FC = () => {
  const { refresh } = useAdminData();
  return <GuardManagement onDataChanged={refresh} />;
};

export const AttendancePage: React.FC = () => {
  const { workers, session, refresh } = useAdminData();
  return <LiveAttendanceView workers={workers} adminName={session.name} onDataChanged={refresh} />;
};

export const ReportsPage: React.FC = () => {
  const { refresh } = useAdminData();
  return <ReportsView onRefresh={refresh} />;
};

export const AdvancesPage: React.FC = () => {
  const { session, workers, refresh } = useAdminData();
  return <AdvanceSalaryManagement session={session} workers={workers} onRefreshParent={refresh} />;
};

export const PayrollPage: React.FC = () => {
  const { workers, rules, session } = useAdminData();
  return <PayrollManagementView workers={workers} rules={rules} adminName={session.name} />;
};

export const RulesPage: React.FC = () => {
  const { refresh } = useAdminData();
  return <AttendanceRulesConfigView onDataChanged={refresh} />;
};

export const AuditPage: React.FC = () => <AuditLogsView />;
