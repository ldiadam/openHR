import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet } from './Sheet';
import { useLanguage } from '../../context/LanguageContext';

interface MobileDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  allowClear?: boolean;
}

const parseIso = (value?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
};

const toIso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const MobileDatePicker: React.FC<MobileDatePickerProps> = ({
  value,
  onChange,
  placeholder,
  min,
  max,
  allowClear = true,
}) => {
  const { lang, tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const today = new Date();
  const parsed = parseIso(value);

  const [view, setView] = useState(() => ({
    y: parsed?.y ?? today.getFullYear(),
    m: parsed?.m ?? today.getMonth(),
  }));

  const openSheet = () => {
    const current = parseIso(value);
    setView({
      y: current?.y ?? today.getFullYear(),
      m: current?.m ?? today.getMonth(),
    });
    setOpen(true);
  };

  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
  const displayValue = parsed
    ? new Date(parsed.y, parsed.m, parsed.d).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  const weekdays =
    lang === 'id'
      ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedIso = parsed ? toIso(parsed.y, parsed.m, parsed.d) : '';

  const isDisabled = (iso: string) => (min && iso < min) || (max && iso > max);

  const shiftMonth = (offset: number) => {
    const next = new Date(view.y, view.m + offset, 1);
    setView({ y: next.getFullYear(), m: next.getMonth() });
  };

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-900 transition hover:border-slate-400 cursor-pointer"
      >
        <span className={displayValue ? 'font-medium' : 'text-slate-400'}>
          {displayValue || placeholder || tr('Pilih tanggal', 'Select date')}
        </span>
        <Calendar size={16} className="shrink-0 text-slate-400" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={tr('Pilih Tanggal', 'Select Date')}>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 cursor-pointer"
            aria-label={tr('Bulan sebelumnya', 'Previous month')}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-slate-900">{monthLabel}</span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 cursor-pointer"
            aria-label={tr('Bulan berikutnya', 'Next month')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((day) => (
            <span key={day} className="py-1 text-[10px] font-semibold uppercase text-slate-400">
              {day}
            </span>
          ))}
          {cells.map((day, index) => {
            if (day === null) return <span key={`empty-${index}`} />;
            const iso = toIso(view.y, view.m, day);
            const selected = iso === selectedIso;
            const isToday = iso === todayIso;
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
                className={`flex h-10 items-center justify-center rounded-xl text-sm transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  selected
                    ? 'bg-blue-600 font-bold text-white'
                    : isToday
                    ? 'border border-blue-300 font-semibold text-blue-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => {
              onChange(todayIso);
              setOpen(false);
            }}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
          >
            {tr('Hari Ini', 'Today')}
          </button>
          {allowClear && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
            >
              {tr('Hapus', 'Clear')}
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
};
