import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Users,
  Clock,
  Calendar,
  Layers,
  DollarSign,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  CreditCard,
  Receipt,
  Wifi,
  WifiOff,
  UserCircle,
  Home,
  FileCheck,
  PenLine,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { getOfflineQueue, syncOfflineQueue } from '../api';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, isOwnerAdmin, isManager, isFinance, isEmployee } = useAuth();
  const { t, tr } = useLanguage();
  const { companyName, isCustomCompany, initials, legalName, logoUrl } = useCompany();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState(getOfflineQueue().length);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setSyncing(true);
      await syncOfflineQueue();
      setOfflineCount(getOfflineQueue().length);
      setSyncing(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setOfflineCount(getOfflineQueue().length);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(() => {
      setOfflineCount(getOfflineQueue().length);
    }, 5000);

    // Auto-sync any punches queued while offline as soon as the app opens online
    if (navigator.onLine && getOfflineQueue().length > 0) {
      setSyncing(true);
      syncOfflineQueue()
        .then(() => setOfflineCount(getOfflineQueue().length))
        .finally(() => setSyncing(false));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const result = await syncOfflineQueue({
        promptGeofenceReason: (item) =>
          window.prompt(
            tr(
              'Presensi ini berada di luar radius kantor. Mohon isi alasan presensi:',
              'This punch is outside the office radius. Please enter a reason:'
            ),
            ''
          ),
      });
      setOfflineCount(getOfflineQueue().length);
      setSyncNotice(
        result.failed > 0
          ? tr(
              `${result.synced} tersinkron, ${result.failed} gagal. Periksa koneksi lalu coba lagi.`,
              `${result.synced} synced, ${result.failed} failed. Check your connection and try again.`
            )
          : tr(`${result.synced} catatan tersinkron.`, `${result.synced} records synced.`)
      );
    } catch {
      setSyncNotice(tr('Sinkronisasi gagal. Coba lagi.', 'Sync failed. Please try again.'));
    } finally {
      setSyncing(false);
      window.setTimeout(() => setSyncNotice(null), 5000);
    }
  };

  // Navigation Items for Admin/HR/Finance/Manager
  const adminNav = [
    { name: t.nav.dashboard, path: '/', icon: Home },
    { name: t.nav.employees, path: '/employees', icon: Users, show: isOwnerAdmin || isManager },
    { name: t.nav.attendance, path: '/attendance', icon: Clock, show: isOwnerAdmin || isManager },
    { name: t.nav.leave, path: '/leave', icon: Calendar, show: isOwnerAdmin || isManager },
    {
      name: tr('Persetujuan Cuti', 'Leave Approvals'),
      path: '/leave-applications',
      icon: FileCheck,
      show: isOwnerAdmin || isManager,
    },
    { name: t.nav.shifts, path: '/shifts', icon: Layers, show: isOwnerAdmin || isManager },
    { name: t.nav.payroll, path: '/payroll', icon: DollarSign, show: isOwnerAdmin || isFinance },
    { name: tr('Klaim Biaya', 'Expense Claims'), path: '/kasbon', icon: Receipt, show: isOwnerAdmin || isFinance || isManager },
    { name: tr('Dokumen & Tanda Tangan', 'Documents & Signing'), path: '/documents', icon: PenLine, show: isOwnerAdmin || isFinance || isManager },
    { name: t.nav.reports, path: '/reports', icon: FileText, show: isOwnerAdmin || isFinance || isManager },
    { name: t.nav.settings, path: '/settings', icon: Settings, show: isOwnerAdmin },
  ].filter((item) => item.show !== false);

  // Employee Self-Service navigation (every account linked to an employee has this)
  const essNav = [
    { name: t.nav.home, path: '/app', icon: Home },
    { name: t.nav.myAttendance, path: '/app/attendance', icon: Clock },
    { name: t.nav.requests, path: '/app/requests', icon: FileCheck },
    {
      name: tr('Permohonan Cuti', 'Leave Application'),
      path: '/app/leave-application',
      icon: Calendar,
    },
    { name: t.nav.payslips, path: '/app/payslips', icon: DollarSign },
    { name: t.nav.profile, path: '/app/profile', icon: UserCircle },
  ];

  // Any role that is also a staff member (manager, finance, admin) gets ESS too
  const hasEssAccess = Boolean(user?.employeeId);
  const inEssArea = location.pathname.startsWith('/app');
  const showEssNav = isEmployee || hasEssAccess;
  const showEssBottomBar = isEmployee || (hasEssAccess && inEssArea);

  const roleBadgeMap: Record<string, { label: string; color: string }> = {
    owner_admin: { label: t.nav.roleAdmin, color: 'bg-purple-100 text-purple-700 border-purple-200' },
    manager: { label: t.nav.roleManager, color: 'bg-blue-100 text-blue-700 border-blue-200' },
    finance: { label: t.nav.roleFinance, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    employee: { label: t.nav.roleEmployee, color: 'bg-slate-100 text-slate-700 border-slate-200' },
  };

  const currentRole = user?.role ? roleBadgeMap[user.role] : roleBadgeMap.employee;
  const navItems = isEmployee ? essNav : adminNav;
  const isClockInPage = location.pathname === '/app';

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col md:flex-row ${isEmployee ? 'ess-no-select' : ''}`}>
      {/* Offline Alert Bar */}
      {(!isOnline || offlineCount > 0) && (
        <div className="fixed bottom-[56px] left-0 right-0 md:bottom-0 z-50 bg-amber-600 text-white text-xs px-4 py-2 flex items-center justify-between gap-2 shadow-md">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {!isOnline ? <WifiOff size={16} className="shrink-0" /> : <Wifi size={16} className="shrink-0" />}
            <span className="min-w-0 truncate">
              {syncNotice
                ? syncNotice
                : !isOnline
                ? t.common.offlineQueueBanner
                : tr(`${offlineCount} catatan presensi offline menunggu sinkron.`, `${offlineCount} offline attendance records pending sync.`)}
            </span>
          </div>
          {isOnline && offlineCount > 0 && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing}
              className="shrink-0 bg-white text-amber-900 font-semibold px-2.5 py-1 rounded shadow text-xs hover:bg-amber-50 disabled:opacity-60 cursor-pointer"
            >
              {syncing ? t.common.submitting : t.common.syncNow}
            </button>
          )}
        </div>
      )}

      {/* Desktop Sidebar (All roles) */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-0 h-screen bg-slate-900 text-slate-100 border-r border-slate-800">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            {logoUrl ? (
              <div className="w-full space-y-1.5">
                <div className="bg-white rounded-xl px-3 py-2 flex items-center justify-center shadow-xs overflow-hidden">
                  <img src={logoUrl} alt={companyName} className="max-h-7 w-auto object-contain" />
                </div>
                <p className="text-[10px] text-slate-400 truncate text-center">
                  {isCustomCompany ? (legalName !== companyName ? legalName : companyName) : 'SME HR & Payroll'}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow shrink-0">
                  {initials}
                </div>
                <div className="overflow-hidden">
                  <h1 className="font-bold text-sm tracking-tight text-white truncate">{companyName}</h1>
                  <p className="text-[10px] text-slate-400 truncate">{isCustomCompany ? (legalName !== companyName ? legalName : 'HR & Payroll') : 'SME HR & Payroll'}</p>
                </div>
              </div>
            )}
          </div>

          {/* User info */}
          <div className="p-4 border-b border-slate-800/80 bg-slate-900/50">
            <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
            <div className="text-xs text-slate-400 truncate mb-2">{user?.email}</div>
            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded border ${currentRole.color}`}>
              {currentRole.label}
            </span>
          </div>

          <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon size={17} />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            {showEssNav && !isEmployee && (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <p className="px-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {tr('Saya sebagai Karyawan', 'My Employee Self-Service')}
                </p>
                {essNav.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                        active
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {isEmployee && hasEssAccess && user?.role !== 'employee' && (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <Link
                  to="/"
                  className="flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  <Settings size={16} />
                  <span>{tr('Kembali ke HR', 'Back to HR')}</span>
                </Link>
              </div>
            )}
          </nav>

          <div className="p-4 border-t border-slate-800 space-y-3">
            <LanguageSwitcher />
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
            >
              <LogOut size={16} />
              <span>{t.nav.logout}</span>
            </button>
          </div>
        </aside>

      {/* Mobile Top Header (hidden on clock-in page) */}
      {!isClockInPage && (
      <header className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between z-40">
        <div className="flex items-center gap-2 overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="h-7 w-auto max-w-[180px] object-contain" />
          ) : (
            <>
              <div className="w-7 h-7 rounded bg-slate-900 text-white font-bold flex items-center justify-center text-[10px] shadow shrink-0">
                {initials}
              </div>
              <div className="overflow-hidden">
                <span className="font-bold text-xs text-slate-900 truncate block">{companyName}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          {!isEmployee && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
          {isEmployee && (
            <button
              onClick={logout}
              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md text-xs font-semibold cursor-pointer"
            >
              {t.nav.logout}
            </button>
          )}
        </div>
      </header>
      )}

      {/* Mobile Drawer Menu for Admin/Manager/Finance */}
      {!isEmployee && mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <div className="w-72 bg-slate-900 text-slate-100 h-full flex flex-col p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              {logoUrl ? (
                <div className="bg-white rounded-lg px-2.5 py-1 flex items-center justify-center max-w-[190px] overflow-hidden">
                  <img src={logoUrl} alt={companyName} className="max-h-6 w-auto object-contain" />
                </div>
              ) : (
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-7 h-7 rounded bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                    {initials}
                  </div>
                  <span className="font-bold text-white text-sm truncate">{companyName}</span>
                </div>
              )}
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>

            <nav className="my-4 space-y-1 flex-1 overflow-y-auto">
              {adminNav.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold ${
                      active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}

              {showEssNav && !isEmployee && (
                <div className="mt-3 border-t border-slate-800 pt-3">
                  <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {tr('Saya sebagai Karyawan', 'My Employee Self-Service')}
                  </p>
                  {essNav.map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold ${
                          active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Icon size={16} />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </nav>

            <div className="space-y-3">
              <LanguageSwitcher />
              <button
                onClick={logout}
                className="flex items-center gap-3 w-full px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 rounded-lg cursor-pointer"
              >
                <LogOut size={16} />
                <span>{t.nav.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 pt-12 pb-20 md:pt-0 md:pb-6">
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">{children}</div>
      </main>

      {/* Employee Self-Service bottom bar (also while a manager is inside /app) */}
      {showEssBottomBar && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 flex items-center justify-around py-1.5 px-2 shadow-lg">
          {essNav.map((item) => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[10px] font-semibold transition ${
                  active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon size={18} className={active ? 'stroke-[2.5]' : 'stroke-[1.75]'} />
                <span className="mt-0.5 w-full truncate text-center leading-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
};
