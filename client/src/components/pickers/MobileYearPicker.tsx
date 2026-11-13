import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Sheet } from './Sheet';
import { useLanguage } from '../../context/LanguageContext';

interface MobileYearPickerProps {
  value: string;
  onChange: (value: string) => void;
  years?: number[];
  min?: number;
  max?: number;
  placeholder?: string;
}

export const MobileYearPicker: React.FC<MobileYearPickerProps> = ({
  value,
  onChange,
  years,
  min,
  max,
  placeholder,
}) => {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  const fallbackYears = Array.from({ length: 7 }, (_, index) => currentYear - index);
  const availableYears = (years && years.length > 0 ? years : fallbackYears)
    .filter((year) => (min ? year >= min : true) && (max ? year <= max : true))
    .sort((a, b) => b - a);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-900 transition hover:border-slate-400 cursor-pointer"
      >
        <span className={value ? 'font-medium' : 'text-slate-400'}>
          {value || placeholder || tr('Pilih tahun', 'Select year')}
        </span>
        <CalendarDays size={16} className="shrink-0 text-slate-400" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={tr('Pilih Tahun', 'Select Year')}>
        <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
          {availableYears.map((year) => {
            const selected = String(year) === value;
            const isCurrent = year === currentYear;
            return (
              <button
                key={year}
                type="button"
                onClick={() => {
                  onChange(String(year));
                  setOpen(false);
                }}
                className={`rounded-xl py-3 text-sm font-semibold transition cursor-pointer ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : isCurrent
                    ? 'border border-blue-300 text-blue-700'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {year}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => {
              onChange(String(currentYear));
              setOpen(false);
            }}
            className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
          >
            {tr('Tahun Ini', 'This Year')}
          </button>
        </div>
      </Sheet>
    </>
  );
};
