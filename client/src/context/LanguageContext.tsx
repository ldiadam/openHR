import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from '../i18n/translations';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.id;
  tr: (id: string, en: string) => string;
  formatDate: (dateStr: string) => string;
  formatCurrency: (amount: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('openhr_lang');
    return saved === 'en' ? 'en' : 'id';
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('openhr_lang', newLang);
  };

  const t = translations[lang] || translations.id;
  const tr = (id: string, en: string) => (lang === 'en' ? en : id);

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number = 0): string => {
    return new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, language: lang, setLanguage: setLang, t, tr, formatDate, formatCurrency }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
