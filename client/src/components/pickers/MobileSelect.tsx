import React, { useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Sheet } from './Sheet';
import { useLanguage } from '../../context/LanguageContext';

export interface SelectOption {
  value: string;
  label: string;
}

interface MobileSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  title?: string;
  searchable?: boolean;
}

export const MobileSelect: React.FC<MobileSelectProps> = ({
  value,
  onChange,
  options,
  placeholder,
  title,
  searchable,
}) => {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value);
  const showSearch = searchable ?? options.length > 7;
  const filtered = query.trim()
    ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-900 transition hover:border-slate-400 cursor-pointer"
      >
        <span className={selected ? 'truncate font-medium' : 'truncate text-slate-400'}>
          {selected ? selected.label : placeholder || tr('Pilih opsi', 'Select an option')}
        </span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={title || tr('Pilih Opsi', 'Select Option')}
      >
        {showSearch && (
          <div className="relative mb-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('Cari...', 'Search...')}
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        )}

        <div className="space-y-1">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-400">
              {tr('Tidak ada hasil', 'No results')}
            </p>
          )}
          {filtered.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-sm transition cursor-pointer ${
                  active
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 break-words">{option.label}</span>
                {active && <Check size={16} className="shrink-0 text-blue-600" />}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
};
