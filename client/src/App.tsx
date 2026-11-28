import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import { ToggleableModuleId } from '../../shared/modules';
import { Layout } from './components/Layout';
import { InstallPwaPrompt } from './components/InstallPwaPrompt';
import { LoadingScreen } from './components/LoadingScreen';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';

const EmployeeHome = React.lazy(() => import('./pages/EmployeeHome').then((m) => ({ default: m.EmployeeHome })));
const EmployeeAttendance = React.lazy(() => import('./pages/EmployeeAttendance').then((m) => ({ default: m.EmployeeAttendance })));
const EmployeeCalendar = React.lazy(() => import('./pages/EmployeeCalendar').then((m) => ({ default: m.EmployeeCalendar })));
const EmployeeRequests = React.lazy(() => import('./pages/EmployeeRequests').then((m) => ({ default: m.EmployeeRequests })));
const EmployeePayslips = React.lazy(() => import('./pages/EmployeePayslips').then((m) => ({ default: m.EmployeePayslips })));
const EmployeeProfile = React.lazy(() => import('./pages/EmployeeProfile').then((m) => ({ default: m.EmployeeProfile })));
const HRDashboard = React.lazy(() => import('./pages/HRDashboard').then((m) => ({ default: m.HRDashboard })));
const HREmployees = React.lazy(() => import('./pages/HREmployees').then((m) => ({ default: m.HREmployees })));
const HREmployeeDetail = React.lazy(() => import('./pages/HREmployeeDetail').then((m) => ({ default: m.HREmployeeDetail })));
const HRAttendance = React.lazy(() => import('./pages/HRAttendance').then((m) => ({ default: m.HRAttendance })));
const HRLeave = React.lazy(() => import('./pages/HRLeave').then((m) => ({ default: m.HRLeave })));
const LeaveApplicationForm = React.lazy(() => import('./pages/LeaveApplicationForm').then((m) => ({ default: m.LeaveApplicationForm })));
const HRShifts = React.lazy(() => import('./pages/HRShifts').then((m) => ({ default: m.HRShifts })));
const HRPayroll = React.lazy(() => import('./pages/HRPayroll').then((m) => ({ default: m.HRPayroll })));
const HRKasbon = React.lazy(() => import('./pages/HRKasbon').then((m) => ({ default: m.HRKasbon })));
const HRPettyCash = React.lazy(() => import('./pages/HRPettyCash').then((m) => ({ default: m.HRPettyCash })));
const TasksPage = React.lazy(() => import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })));
const AnnouncementsPage = React.lazy(() => import('./pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })));
const AssetsPage = React.lazy(() => import('./pages/AssetsPage').then((m) => ({ default: m.AssetsPage })));
const OffboardingPage = React.lazy(() => import('./pages/OffboardingPage').then((m) => ({ default: m.OffboardingPage })));
const PerformancePage = React.lazy(() => import('./pages/PerformancePage').then((m) => ({ default: m.PerformancePage })));
const RecruitmentPage = React.lazy(() => import('./pages/RecruitmentPage').then((m) => ({ default: m.RecruitmentPage })));
const PublicCareersPage = React.lazy(() => import('./pages/PublicCareersPage').then((m) => ({ default: m.PublicCareersPage })));
const HRDocuments = React.lazy(() => import('./pages/HRDocuments').then((m) => ({ default: m.HRDocuments })));
const SigningComplete = React.lazy(() => import('./pages/SigningComplete').then((m) => ({ default: m.SigningComplete })));
const PublicPettyCashVerify = React.lazy(() => import('./pages/PublicPettyCashVerify').then((m) => ({ default: m.PublicPettyCashVerify })));
const PublicIdVerify = React.lazy(() => import('./pages/PublicIdVerify').then((m) => ({ default: m.PublicIdVerify })));
const HRReports = React.lazy(() => import('./pages/HRReports').then((m) => ({ default: m.HRReports })));
const HRSettings = React.lazy(() => import('./pages/HRSettings').then((m) => ({ default: m.HRSettings })));
const LevelBuilder = React.lazy(() => import('./pages/LevelBuilder').then((m) => ({ default: m.LevelBuilder })));

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: string[];
  allowSelfService?: boolean;
  requiredModule?: ToggleableModuleId;
}> = ({ children, allowedRoles, allowSelfService = true, requiredModule }) => {
  const { user, loading } = useAuth();
  const { isModuleEnabled } = useCompany();

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

  if (requiredModule && !isModuleEnabled(requiredModule)) {
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
            <Suspense fallback={<LoadingScreen />}>
            <Routes>
          {/* Public Authentication */}
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invite" element={<ResetPassword />} />
          {/* Public: DocuSeal redirects signers here, and they are usually
              external parties with no openHR login. */}
          <Route path="/signing/complete" element={<SigningComplete />} />
          {/* Public: QR code verification & read-only view for Petty Cash PDF reports */}
          <Route path="/verify/petty-cash/:id" element={<PublicPettyCashVerify />} />
          <Route path="/verify/id-card/:id" element={<PublicIdVerify />} />
          {/* Public: External Careers & Job Application Portal */}
          <Route path="/careers" element={<PublicCareersPage />} />

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
            path="/app/calendar"
            element={
              <ProtectedRoute>
                <EmployeeCalendar />
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
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']} requiredModule="attendance">
                <HRAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leave"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']} requiredModule="leave">
                <HRLeave />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leave-applications"
            element={<Navigate to="/leave" replace />}
          />
          <Route path="/app/leave-application" element={<ProtectedRoute requiredModule="leave"><LeaveApplicationForm /></ProtectedRoute>} />
          <Route
            path="/shifts"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']} requiredModule="shifts">
                <HRShifts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance']} requiredModule="payroll">
                <HRPayroll />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kasbon"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']} requiredModule="claims">
                <HRKasbon />
              </ProtectedRoute>
            }
          />
          <Route
            path="/petty-cash"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']} requiredModule="petty_cash">
                <HRPettyCash />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']} requiredModule="tasks">
                <TasksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks/:taskId"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']} requiredModule="tasks">
                <TasksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/tasks"
            element={
              <ProtectedRoute requiredModule="tasks">
                <TasksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/tasks/:taskId"
            element={
              <ProtectedRoute requiredModule="tasks">
                <TasksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/announcements"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager', 'finance']} requiredModule="announcements">
                <AnnouncementsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/announcements"
            element={
              <ProtectedRoute requiredModule="announcements">
                <AnnouncementsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager', 'finance']} requiredModule="assets">
                <AssetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/assets"
            element={
              <ProtectedRoute requiredModule="assets">
                <AssetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/offboarding"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager', 'finance']} requiredModule="offboarding">
                <OffboardingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/performance"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']} requiredModule="performance">
                <PerformancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/performance"
            element={
              <ProtectedRoute requiredModule="performance">
                <PerformancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recruitment"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'manager']} requiredModule="recruitment">
                <RecruitmentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']} requiredModule="reports">
                <HRReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin', 'finance', 'manager']} requiredModule="signing">
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
          <Route
            path="/levels"
            element={
              <ProtectedRoute allowSelfService={false} allowedRoles={['owner_admin']}>
                <LevelBuilder />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    <InstallPwaPrompt />
    </CompanyProvider>
  </LanguageProvider>
  );
};
