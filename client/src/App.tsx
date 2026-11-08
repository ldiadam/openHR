import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { CompanyProvider } from './context/CompanyContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { EmployeeHome } from './pages/EmployeeHome';
import { EmployeeAttendance } from './pages/EmployeeAttendance';
import { EmployeeRequests } from './pages/EmployeeRequests';
import { EmployeePayslips } from './pages/EmployeePayslips';
import { EmployeeProfile } from './pages/EmployeeProfile';
import { HRDashboard } from './pages/HRDashboard';
import { HREmployees } from './pages/HREmployees';
import { HRAttendance } from './pages/HRAttendance';
import { HRLeave } from './pages/HRLeave';
import { HRShifts } from './pages/HRShifts';
import { HRPayroll } from './pages/HRPayroll';
import { HRKasbon } from './pages/HRKasbon';
import { HRReports } from './pages/HRReports';
import { HRSettings } from './pages/HRSettings';

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({
  children,
  allowedRoles,
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-xs">
        Memuat aplikasi openHR...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
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
              <ProtectedRoute>
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
              <ProtectedRoute allowedRoles={['owner_admin', 'manager']}>
                <HREmployees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute allowedRoles={['owner_admin', 'manager']}>
                <HRAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leave"
            element={
              <ProtectedRoute allowedRoles={['owner_admin', 'manager']}>
                <HRLeave />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shifts"
            element={
              <ProtectedRoute allowedRoles={['owner_admin', 'manager']}>
                <HRShifts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll"
            element={
              <ProtectedRoute allowedRoles={['owner_admin', 'finance']}>
                <HRPayroll />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kasbon"
            element={
              <ProtectedRoute allowedRoles={['owner_admin', 'finance', 'manager']}>
                <HRKasbon />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={['owner_admin', 'finance', 'manager']}>
                <HRReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={['owner_admin']}>
                <HRSettings />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </CompanyProvider>
  </LanguageProvider>
  );
};
