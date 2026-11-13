import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet } from './Sheet';
import { useLanguage } from '../../context/LanguageContext';

interface MobileMonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const MobileMonthPicker: React.FC<MobileMonthPickerProps> = ({
  value,
  onChange,
  placeholder,
  min,
  max,
}) => {
  const { lang, tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const today = new Date();

  const parsed = /^(\d{4})-(\d{2})/.exec(value || '');
  const selectedYear = parsed ? Number(parsed[1]) : null;
  const selectedMonth = parsed ? Number(parsed[2]) - 1 : null;

  const [year, setYear] = useState(() => selectedYear ?? today.getFullYear());

  const openSheet = () => {
    const match = /^(\d{4})-(\d{2})/.exec(value || '');
    setYear(match ? Number(match[1]) : today.getFullYear());
    setOpen(true);
  };

  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  const displayValue =
    selectedYear !== null && selectedMonth !== null
      ? new Date(selectedYear, selectedMonth, 1).toLocaleDateString(locale, {
          month: 'long',
          year: 'numeric',
        })
      : '';

  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Date(2026, index, 1).toLocaleDateString(locale, { month: 'short' })
  );

  const monthIso = (monthIndex: number) => `${year}-${pad(monthIndex + 1)}`;
  const isDisabled = (iso: string) => (min ? iso < min.slice(0, 7) : false) || (max ? iso > max.slice(0, 7) : false);
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-900 transition hover:border-slate-400 cursor-pointer"
      >
        <span className={displayValue ? 'truncate font-medium' : 'truncate text-slate-400'}>
          {displayValue || placeholder || tr('Pilih bulan', 'Select month')}
        </span>
        <Calendar size={16} className="shrink-0 text-slate-400" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={tr('Pilih Bulan', 'Select Month')}>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setYear((current) => current - 1)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 cursor-pointer"
            aria-label={tr('Tahun sebelumnya', 'Previous year')}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-slate-900">{year}</span>
          <button
            type="button"
            onClick={() => setYear((current) => current + 1)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 cursor-pointer"
            aria-label={tr('Tahun berikutnya', 'Next year')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {monthNames.map((name, index) => {
            const iso = monthIso(index);
            const selected = iso === value.slice(0, 7);
            const isCurrent = iso === todayIso;
            const disabled = isDisabled(iso);

            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(iso);
                  setOpen(false);
                }}
                className={`rounded-xl py-3 text-xs font-semibold transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : isCurrent
                    ? 'border border-blue-300 text-blue-700'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => {
              onChange(todayIso);
              setOpen(false);
            }}
            className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
          >
            {tr('Bulan Ini', 'This Month')}
          </button>
        </div>
      </Sheet>
    </>
  );
};
