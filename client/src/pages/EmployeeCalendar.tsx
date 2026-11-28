import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { apiFetchCached } from '../utils/offlineCache';
import { getLocalDateString } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { PageSkeleton } from '../components/Skeleton';

export const EmployeeCalendar: React.FC = () => {
  const { tr, lang, formatDate } = useLanguage();
  const { palette } = useCompany();
  const [selectedDay, setSelectedDay] = useState(getLocalDateString());
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const activeMonth = selectedDay.slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetchCached(`/attendance/my?month=${activeMonth}`)
      .then((res) => {
        if (!cancelled) setRecords(res.records || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeMonth]);

  if (loading && records.length === 0) return <PageSkeleton cards={2} rows={5} />;

  const baseDate = new Date(`${selectedDay}T00:00:00`);
  const dayOfWeek = baseDate.getDay();
  const weekDays = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() - dayOfWeek + idx);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const shortLabelsId = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];
    const shortLabelsEn = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const record = records.find((r) => r.date === iso);
    return {
      iso,
      dayNum: String(d.getDate()).padStart(2, '0'),
      label: (lang === 'id' ? shortLabelsId : shortLabelsEn)[idx],
      isWeekend: idx === 0 || idx === 6,
      record,
      dateObj: d,
    };
  });

  const shiftWeek = (deltaWeeks: number) => {
    const d = new Date(`${selectedDay}T00:00:00`);
    d.setDate(d.getDate() + deltaWeeks * 7);
    setSelectedDay(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  };

  return (
    <div className="max-w-md mx-auto pb-8">
      {/* Colored Hero Header */}
      <div
        className="px-4 pt-5 pb-5 rounded-b-[28px] md:rounded-3xl shadow-sm"
        style={{ background: palette.gradient, color: palette.onPrimary, viewTransitionName: 'ess-hero' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to="/app"
              viewTransition
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
              aria-label={tr('Kembali', 'Back')}
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">{tr('Kalender Kerja', 'Work Calendar')}</h2>
              <p className="text-[11px] opacity-85 truncate">
                {tr('Jadwal shift & hari kerja mingguan', 'Weekly work shift & day-off schedule')}
              </p>
            </div>
          </div>
          <span className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <Calendar size={18} />
          </span>
        </div>
      </div>

      {/* Interactive 7-Day Week Strip */}
      <div className="bg-white border-b border-slate-100 px-3 py-3 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
            aria-label={tr('Minggu sebelumnya', 'Previous week')}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span>
              {formatDate(weekDays[0].iso)} – {formatDate(weekDays[6].iso)}
            </span>
            {selectedDay !== getLocalDateString() && (
              <button
                type="button"
                onClick={() => setSelectedDay(getLocalDateString())}
                style={{ backgroundColor: palette.primarySoft, color: palette.primary }}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer"
              >
                {tr('Hari Ini', 'Today')}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
            aria-label={tr('Minggu berikutnya', 'Next week')}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekDays.map((day) => {
            const selected = day.iso === selectedDay;
            const dotColor = day.isWeekend
              ? palette.primary
              : day.record?.status === 'late'
              ? '#D97706'
              : '#1D4ED8';
            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => setSelectedDay(day.iso)}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <span
                  className="text-[10px] font-bold"
                  style={{ color: selected ? palette.primary : '#94A3B8' }}
                >
                  {day.label}
                </span>
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white transition"
                  style={{
                    backgroundColor: dotColor,
                    ...(selected ? { boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${dotColor}` } : {}),
                  }}
                >
                  {day.dayNum}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule Timeline */}
      <div className="px-4 pt-4 space-y-3">
        {weekDays.map((day) => {
          const rec = day.record;
          const isOff = day.isWeekend && !rec;
          const barColor = isOff ? palette.primary : '#1E40AF';
          const isSelected = day.iso === selectedDay;
          const formattedLong = day.dateObj.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
          return (
            <div
              key={day.iso}
              onClick={() => setSelectedDay(day.iso)}
              className={`flex items-start gap-3 rounded-2xl p-2.5 transition cursor-pointer ${
                isSelected ? 'bg-white shadow-sm border border-slate-200' : ''
              }`}
            >
              <div className="w-11 text-center shrink-0 pt-1">
                <div
                  className="text-xl font-bold leading-none"
                  style={{ color: isSelected ? barColor : '#334155' }}
                >
                  {day.dayNum}
                </div>
                <div className="text-[11px] font-medium text-slate-400 mt-1 capitalize">
                  {day.label.slice(0, 3)}
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <span
                  className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold text-white"
                  style={{ backgroundColor: barColor }}
                >
                  {formattedLong}
                </span>
                <div
                  className="rounded-xl px-3.5 py-2.5 text-white text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs"
                  style={{ backgroundColor: barColor }}
                >
                  <span className="truncate">
                    {isOff
                      ? tr('Day Off / Libur', 'Day Off')
                      : rec?.shift_name || tr('Jadwal Kerja Reguler', 'Regular Work Shift')}
                  </span>
                  <span className="font-mono text-[11px] shrink-0 opacity-95">
                    {isOff
                      ? '00:00 - 23:59'
                      : rec?.clock_in_time
                      ? `${rec.clock_in_time} - ${rec.clock_out_time || '--:--'}`
                      : '08:00 - 17:00'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
