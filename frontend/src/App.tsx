import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute, PublicOnlyRoute, RoleHomeRedirect } from './routes/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { LoginScreen } from './components/auth/LoginScreen';
import { GuardTerminalPage } from './pages/GuardTerminalPage';
import { OverviewPage } from './pages/admin/OverviewPage';
import {
  WorkersPage,
  GuardsPage,
  AttendancePage,
  ReportsPage,
  AdvancesPage,
  PayrollPage,
  RulesPage,
  AuditPage,
} from './pages/admin/AdminPages';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginScreen />} />
            </Route>

            {/* Any logged-in user */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                {/* Gate terminal: Guards + Admin */}
                <Route element={<ProtectedRoute roles={['GUARD', 'ADMIN']} />}>
                  <Route path="/guard" element={<GuardTerminalPage />} />
                </Route>

                {/* Admin portal: Admin only */}
                <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<OverviewPage />} />
                    <Route path="workers" element={<WorkersPage />} />
                    <Route path="guards" element={<GuardsPage />} />
                    <Route path="attendance" element={<AttendancePage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="advances" element={<AdvancesPage />} />
                    <Route path="payroll" element={<PayrollPage />} />
                    <Route path="rules" element={<RulesPage />} />
                    <Route path="audit" element={<AuditPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>

            <Route path="/" element={<RoleHomeRedirect />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
