import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { lang, setLang } = useLanguage();

  return (
    <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200/90 shadow-2xs">
      <button
        type="button"
        title="Bahasa Indonesia"
        onClick={() => setLang('id')}
        className={`px-2 py-1 text-[11px] font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
          lang === 'id'
            ? 'bg-white text-slate-900 shadow-xs'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span>🇮🇩</span>
        {!compact && <span>ID</span>}
      </button>

      <button
        type="button"
        title="English"
        onClick={() => setLang('en')}
        className={`px-2 py-1 text-[11px] font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
          lang === 'en'
            ? 'bg-white text-slate-900 shadow-xs'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span>🇬🇧</span>
        {!compact && <span>EN</span>}
      </button>
    </div>
  );
};
