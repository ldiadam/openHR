import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLanguage } from './LanguageContext';

export interface CompanyInfo {
  id?: string;
  name?: string;
  legal_name?: string;
  logo_url?: string;
  npwp?: string;
  bpjs_kesehatan_code?: string;
  bpjs_tk_code?: string;
  address?: string;
  phone?: string;
  email?: string;
  custom_domain?: string;
  purelymail_domain?: string;
  purelymail_from_address?: string;
  purelymail_api_token?: string;
  purelymail_smtp_pass?: string;
}

interface CompanyContextType {
  company: CompanyInfo | null;
  companyName: string;
  legalName: string;
  logoUrl: string | null;
  isCustomCompany: boolean;
  initials: string;
  refreshCompany: () => Promise<void>;
  updateCompanyLocal: (newInfo: Partial<CompanyInfo>) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tr, lang } = useLanguage();
  const [company, setCompany] = useState<CompanyInfo | null>(() => {
    try {
      const raw = localStorage.getItem('openhr_company_cache');
      return raw ? (JSON.parse(raw) as CompanyInfo) : null;
    } catch {
      return null;
    }
  });

  const fetchCompany = async () => {
    try {
      const res = await fetch('/api/public/company');
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && data.company) {
          setCompany(data.company);
        }
      }
    } catch {
      // Keep the cached company profile when offline
    }
  };

  useEffect(() => {
    fetchCompany();
  }, []);

  useEffect(() => {
    if (!company) return;
    try {
      localStorage.setItem('openhr_company_cache', JSON.stringify(company));
    } catch {
      // ignore storage errors
    }
  }, [company]);

  const hasName = Boolean(company?.name && company.name.trim() !== '');
  const companyName = hasName ? company!.name!.trim() : 'HR & Payroll';
  const legalName = company?.legal_name || companyName;
  const logoUrl = company?.logo_url?.trim() || null;
  const isCustomCompany = hasName && companyName !== 'HR & Payroll';

  // Compute 2-letter initials for company avatar
  let initials = 'HR';
  if (isCustomCompany && companyName) {
    // If name starts with PT / CV, check next words
    const cleanWords = companyName
      .replace(/^(PT|CV|UD|TBK|NV|FIRMA)\.?\s+/i, '')
      .trim()
      .split(/\s+/);
    if (cleanWords.length >= 2) {
      initials = (cleanWords[0][0] + cleanWords[1][0]).toUpperCase();
    } else if (cleanWords.length === 1 && cleanWords[0].length >= 2) {
      initials = cleanWords[0].substring(0, 2).toUpperCase();
    }
  }

  useEffect(() => {
    document.title = isCustomCompany
      ? `${companyName} - ${tr('Portal HR', 'HR Portal')}`
      : tr('HR & Payroll - Sistem HR & Penggajian', 'HR & Payroll - HR & Payroll System');
  }, [companyName, isCustomCompany, lang]);

  // Keep the Apple install title in sync with the company name
  useEffect(() => {
    const appName = isCustomCompany ? companyName : 'HR & Payroll';
    const cleaned = isCustomCompany
      ? companyName.replace(/^(PT|CV|UD|TBK|NV|FIRMA)\.?\s+/i, '').trim()
      : 'HR';
    const shortName =
      cleaned.length <= 15 ? cleaned : (cleaned.split(/\s+/)[0] || 'HR').slice(0, 15);

    document
      .querySelector('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute('content', shortName || appName);
  }, [companyName, isCustomCompany]);

  // Sync favicon with uploaded company logo (if configured)
  useEffect(() => {
    const iconEl = document.querySelector('link[rel="icon"]');
    if (!iconEl) return;
    if (logoUrl) {
      iconEl.setAttribute('href', logoUrl);
      iconEl.removeAttribute('type');
    } else {
      iconEl.setAttribute('type', 'image/svg+xml');
      iconEl.setAttribute(
        'href',
        "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232563eb'><path d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/></svg>"
      );
    }
  }, [logoUrl]);

  const updateCompanyLocal = (newInfo: Partial<CompanyInfo>) => {
    setCompany((prev) => ({ ...(prev || {}), ...newInfo }));
  };

  return (
    <CompanyContext.Provider
      value={{
        company,
        companyName,
        legalName,
        logoUrl,
        isCustomCompany,
        initials,
        refreshCompany: fetchCompany,
        updateCompanyLocal,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = (): CompanyContextType => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};
