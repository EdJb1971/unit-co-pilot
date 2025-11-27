import React, { useMemo, useState, useEffect } from 'react';
import { exportAllData } from '../services/storageService';

type Props = {
  initialDate?: Date;
  onSelectDate: (dateStr: string) => void;
  onClose?: () => void;
};

const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const PlanCalendar: React.FC<Props> = ({ initialDate = new Date(), onSelectDate, onClose }) => {
  const [viewDate, setViewDate] = useState<Date>(initialDate);
  const [plansByDate, setPlansByDate] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const exported = exportAllData();
    if (exported.ok && exported.data && exported.data.plans) {
      const map: Record<string, boolean> = {};
      for (const k of Object.keys(exported.data.plans)) map[k] = true;
      setPlansByDate(map);
    }
  }, [viewDate]);

  const monthMatrix = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weeks: Array<Array<number | null>> = [];
    let week: Array<number | null> = [];
    for (let i = 0; i < startDay; i++) week.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [viewDate]);

  const prevMonth = () => { const d = new Date(viewDate); d.setMonth(d.getMonth() - 1); setViewDate(d); };
  const nextMonth = () => { const d = new Date(viewDate); d.setMonth(d.getMonth() + 1); setViewDate(d); };

  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="px-2 py-1 rounded hover:bg-slate-100">◀</button>
            <div className="font-bold">{monthLabel}</div>
            <button onClick={nextMonth} className="px-2 py-1 rounded hover:bg-slate-100">▶</button>
          </div>
          <div>
            <button onClick={() => onClose && onClose()} className="text-sm text-slate-500">Close</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-2">
          {weekdays.map(w => <div key={w} className="py-1">{w}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {monthMatrix.map((week, wi) => (
            <React.Fragment key={wi}>
              {week.map((day, di) => {
                if (day === null) return <div key={di} className="p-2 h-12"></div>;
                const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
                const key = date.toLocaleDateString();
                const hasPlan = !!plansByDate[key];
                return (
                  <button key={di} onClick={() => { onSelectDate(key); }} className={`p-2 h-12 rounded-lg flex flex-col items-center justify-center ${hasPlan ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50'}`}>
                    <div className="text-sm font-medium">{day}</div>
                    {hasPlan && <div className="w-2 h-2 bg-indigo-600 rounded-full mt-1" />}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlanCalendar;
