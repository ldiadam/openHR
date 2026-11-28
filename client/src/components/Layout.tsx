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
  Wallet,
  Wifi,
  WifiOff,
  UserCircle,
  Home,
  FileCheck,
  PenLine,
  CheckSquare,
  Megaphone,
  Laptop,
  UserMinus,
  Award,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { getOfflineQueue, syncOfflineQueue } from '../api';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, isOwnerAdmin, isManager, isFinance, isEmployee } = useAuth();
  const { t, tr } = useLanguage();
  const { companyName, isCustomCompany, initials, legalName, logoUrl, isModuleEnabled, palette } = useCompany();
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
    { name: t.nav.attendance, path: '/attendance', icon: Clock, show: (isOwnerAdmin || isManager) && isModuleEnabled('attendance') },
    { name: t.nav.leave, path: '/leave', icon: Calendar, show: (isOwnerAdmin || isManager) && isModuleEnabled('leave') },
    { name: t.nav.shifts, path: '/shifts', icon: Layers, show: (isOwnerAdmin || isManager) && isModuleEnabled('shifts') },
    { name: t.nav.payroll, path: '/payroll', icon: DollarSign, show: (isOwnerAdmin || isFinance) && isModuleEnabled('payroll') },
    { name: tr('Klaim Biaya', 'Expense Claims'), path: '/kasbon', icon: Receipt, show: (isOwnerAdmin || isFinance || isManager) && isModuleEnabled('claims') },
    { name: tr('Petty Cash', 'Petty Cash'), path: '/petty-cash', icon: Wallet, show: (isOwnerAdmin || isFinance || isManager) && isModuleEnabled('petty_cash') },
    { name: tr('Tugas (TMS)', 'Tasks (TMS)'), path: '/tasks', icon: CheckSquare, show: isModuleEnabled('tasks') },
    { name: tr('Pengumuman', 'Announcements'), path: '/announcements', icon: Megaphone, show: isModuleEnabled('announcements') },
    { name: tr('Aset & Inventaris', 'Assets'), path: '/assets', icon: Laptop, show: (isOwnerAdmin || isFinance || isManager) && isModuleEnabled('assets') },
    { name: tr('Kinerja (KPI)', 'Performance'), path: '/performance', icon: Award, show: (isOwnerAdmin || isManager) && isModuleEnabled('performance') },
    { name: tr('Rekrutmen', 'Recruitment'), path: '/recruitment', icon: Briefcase, show: (isOwnerAdmin || isManager) && isModuleEnabled('recruitment') },
    { name: tr('Offboarding', 'Offboarding'), path: '/offboarding', icon: UserMinus, show: (isOwnerAdmin || isFinance || isManager) && isModuleEnabled('offboarding') },
    { name: tr('Dokumen & Tanda Tangan', 'Documents & Signing'), path: '/documents', icon: PenLine, show: (isOwnerAdmin || isFinance || isManager) && isModuleEnabled('signing') },
    { name: t.nav.reports, path: '/reports', icon: FileText, show: (isOwnerAdmin || isFinance || isManager) && isModuleEnabled('reports') },
    { name: tr('Level Builder', 'Level Builder'), path: '/levels', icon: Layers, show: isOwnerAdmin },
    { name: t.nav.settings, path: '/settings', icon: Settings, show: isOwnerAdmin },
  ].filter((item) => item.show !== false);

  // Employee Self-Service navigation (every account linked to an employee has this)
  // Profile is reachable from the mobile header and is not shown in the bottom bar.
  const essNav = [
    { name: t.nav.home, path: '/app', icon: Home, bottomBar: true },
    { name: t.nav.myAttendance, path: '/app/attendance', icon: Clock, bottomBar: true },
    { name: t.nav.requests, path: '/app/requests', icon: FileCheck, bottomBar: true },
    { name: t.nav.payslips, path: '/app/payslips', icon: DollarSign, bottomBar: true },
    { name: t.nav.profile, path: '/app/profile', icon: UserCircle, bottomBar: true },
  ];
  const essBottomNav = essNav.filter((item) => item.bottomBar);

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
  const isNavActive = (path: string) =>
    path === '/' || path === '/app'
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(`${path}/`);
  const isClockInPage = location.pathname === '/app';
  const hideMobileHeader =
    isClockInPage ||
    ['/app/attendance', '/app/calendar', '/app/requests', '/app/payslips', '/app/profile'].includes(location.pathname) ||
    location.pathname.startsWith('/app/tasks');

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
              const active = isNavActive(item.path);
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

      {/* Mobile Top Header (hidden on full-screen ESS pages) */}
      {!hideMobileHeader && (
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
              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
              aria-label={t.nav.logout}
            >
              <LogOut size={16} />
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
                const active = isNavActive(item.path);
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
      <main
        className={`flex-1 flex flex-col min-w-0 pb-20 md:pb-6 ${
          hideMobileHeader ? 'pt-0' : 'pt-12'
        } md:pt-0`}
      >
        <div
          className={`flex-1 max-w-7xl mx-auto w-full ${
            hideMobileHeader ? 'p-0 md:p-8' : 'p-4 md:p-8'
          }`}
        >
          {children}
        </div>
      </main>

      {/* Employee Self-Service bottom bar (also while a manager is inside /app) */}
      {showEssBottomBar && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 z-40 flex items-center justify-around py-1.5 px-2 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
          {essBottomNav.map((item) => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={active ? { color: palette.primary } : undefined}
                className={`relative flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-semibold transition ${
                  active ? '' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {active && (
                  <span
                    className="absolute -top-1.5 w-6 h-0.5 rounded-full"
                    style={{ backgroundColor: palette.primary }}
                  />
                )}
                <Icon size={19} className={active ? 'stroke-[2.4]' : 'stroke-[1.75]'} />
                <span className="mt-0.5 w-full truncate text-center leading-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
};
