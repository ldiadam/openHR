import React, { createContext, useContext, useState, useEffect } from 'react';

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
}

interface CompanyContextType {
  company: CompanyInfo | null;
  companyName: string;
  legalName: string;
  isCustomCompany: boolean;
  initials: string;
  refreshCompany: () => Promise<void>;
  updateCompanyLocal: (newInfo: Partial<CompanyInfo>) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  const fetchCompany = async () => {
    try {
      const res = await fetch('/api/public/company');
      if (res.ok) {
        const data = await res.json();
        if (data && data.company) {
          setCompany(data.company);
        }
      }
    } catch {
      // Fallback silently if offline or endpoint unavailable
    }
  };

  useEffect(() => {
    fetchCompany();
  }, []);

  const hasName = Boolean(company?.name && company.name.trim() !== '');
  const companyName = hasName ? company!.name!.trim() : 'openHR';
  const legalName = company?.legal_name || companyName;
  const isCustomCompany = hasName && companyName.toLowerCase() !== 'openhr';

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
    if (isCustomCompany) {
      document.title = `${companyName} - HR Portal`;
    } else {
      document.title = 'openHR - Sistem HR & Penggajian';
    }
  }, [companyName, isCustomCompany]);

  const updateCompanyLocal = (newInfo: Partial<CompanyInfo>) => {
    setCompany((prev) => ({ ...(prev || {}), ...newInfo }));
  };

  return (
    <CompanyContext.Provider
      value={{
        company,
        companyName,
        legalName,
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
