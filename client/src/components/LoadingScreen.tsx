import React from 'react';
import { useCompany } from '../context/CompanyContext';
import { useLanguage } from '../context/LanguageContext';

export const LoadingScreen: React.FC = () => {
  const { companyName, isCustomCompany, initials, legalName } = useCompany();
  const { tr } = useLanguage();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black tracking-wide text-white shadow-lg">
        {initials}
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-slate-900">{companyName}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {isCustomCompany ? legalName : tr('Portal HR & Payroll', 'HR & Payroll Portal')}
        </p>
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-1/3 animate-loading-bar rounded-full bg-blue-600" />
      </div>
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
        {tr('Menyiapkan portal', 'Preparing portal')}
      </p>
    </div>
  );
};
