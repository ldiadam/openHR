import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { CompanyProvider } from './context/CompanyContext';
import { Layout } from './components/Layout';
import { InstallPwaPrompt } from './components/InstallPwaPrompt';
import { LoadingScreen } from './components/LoadingScreen';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { EmployeeHome } from './pages/EmployeeHome';
import { EmployeeAttendance } from './pages/EmployeeAttendance';
import { EmployeeRequests } from './pages/EmployeeRequests';
import { EmployeePayslips } from './pages/EmployeePayslips';
import { EmployeeProfile } from './pages/EmployeeProfile';
import { HRDashboard } from './pages/HRDashboard';
import { HREmployees } from './pages/HREmployees';
import { HREmployeeDetail } from './pages/HREmployeeDetail';
import { HRAttendance } from './pages/HRAttendance';
import { HRLeave } from './pages/HRLeave';
import { HRShifts } from './pages/HRShifts';
import { HRPayroll } from './pages/HRPayroll';
import { HRKasbon } from './pages/HRKasbon';
import { HRDocuments } from './pages/HRDocuments';
import { HRReports } from './pages/HRReports';
import { HRSettings } from './pages/HRSettings';

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: string[];
  allowSelfService?: boolean;
}> = ({ children, allowedRoles, allowSelfService = true }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ESS pages are one switchable area; fall back to the HR dashboard when the
  // account has no employee record linked to it.
  if (allowSelfService && !user.employeeId) {
    return <Navigate to={user.role === 'employee' ? '/login' : '/'} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'employee' ? '/app' : '/'} replace />;
  }

  return <Layout>{children}</Layout>;
};

const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'employee') return <Navigate to="/app" replace />;
  return <HRDashboard />;
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <CompanyProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
          {/* Public Authentication */}
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invite" element={<ResetPassword />} />

          {/* Root redirect */}
          <Route
            path="/"
            element={
              <ProtectedRoute allowSelfService={false}>
                <RootRedirect />
              </ProtectedRoute>
            }
          />

          {/* Employee Self-Service Mobile Routes */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <EmployeeHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/attendance"
            element={
              <ProtectedRoute>
                <EmployeeAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/requests"
            element={
              <ProtectedRoute>
                <EmployeeRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/payslips"
            element={
              <ProtectedRoute>
                <EmployeePayslips />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/profile"
            element={
              <ProtectedRoute>
                <EmployeeProfile />
              </ProtectedRoute>
            }
          />

          {/* HR & Management Desktop Routes */}
          <Route
            path="/employees"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']}>
                <HREmployees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager', 'finance']}>
                <HREmployeeDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']}>
                <HRAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leave"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']}>
                <HRLeave />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shifts"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']}>
                <HRShifts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance']}>
                <HRPayroll />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kasbon"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']}>
                <HRKasbon />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']}>
                <HRReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']}>
                <HRDocuments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin']}>
                <HRSettings />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    <InstallPwaPrompt />
    </CompanyProvider>
  </LanguageProvider>
  );
};
