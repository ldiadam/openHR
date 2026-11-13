import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { Sheet } from './Sheet';
import { useLanguage } from '../../context/LanguageContext';

interface MobileTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const parseTime = (value?: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || '');
  return match ? { h: Number(match[1]), m: Number(match[2]) } : null;
};

export const MobileTimePicker: React.FC<MobileTimePickerProps> = ({ value, onChange, placeholder }) => {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const initial = parseTime(value);
  const [hour, setHour] = useState(initial?.h ?? 8);
  const [minute, setMinute] = useState(initial?.m ?? 0);
  const hourRef = useRef<HTMLButtonElement | null>(null);
  const minuteRef = useRef<HTMLButtonElement | null>(null);

  const openSheet = () => {
    const current = parseTime(value);
    const now = new Date();
    setHour(current?.h ?? now.getHours());
    setMinute(current?.m ?? now.getMinutes());
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      hourRef.current?.scrollIntoView({ block: 'center' });
      minuteRef.current?.scrollIntoView({ block: 'center' });
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const renderColumn = (
    items: number[],
    selected: number,
    onSelect: (n: number) => void,
    selectedRef: React.MutableRefObject<HTMLButtonElement | null>
  ) => (
    <div className="h-52 overflow-y-auto rounded-xl bg-slate-50 p-1">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          ref={item === selected ? selectedRef : null}
          onClick={() => onSelect(item)}
          className={`flex w-full items-center justify-center rounded-lg py-2.5 text-sm transition cursor-pointer ${
            item === selected
              ? 'bg-blue-600 font-bold text-white'
              : 'text-slate-700 hover:bg-slate-200/70'
          }`}
        >
          {pad(item)}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-900 transition hover:border-slate-400 cursor-pointer"
      >
        <span className={value ? 'font-medium font-mono' : 'text-slate-400'}>
          {value || placeholder || tr('Pilih jam', 'Select time')}
        </span>
        <Clock size={16} className="shrink-0 text-slate-400" />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr('Pilih Jam', 'Select Time')}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {tr('Jam', 'Hour')}
            </p>
            {renderColumn(hours, hour, setHour, hourRef)}
          </div>
          <div>
            <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {tr('Menit', 'Minute')}
            </p>
            {renderColumn(minutes, minute, setMinute, minuteRef)}
          </div>
        </div>

        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setHour(now.getHours());
              setMinute(now.getMinutes());
            }}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
          >
            {tr('Sekarang', 'Now')}
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(`${pad(hour)}:${pad(minute)}`);
              setOpen(false);
            }}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 cursor-pointer"
          >
            {tr('Selesai', 'Done')}
          </button>
        </div>
      </Sheet>
    </>
  );
};
