import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { bestPlayWindows, estimateDrying, safetyForSlot } from '../lib/intelligence';
import { useThresholds } from '../stores/thresholds';
import type { Forecast, Sport } from '../types';

export function CourtInsights({ placeId, forecast, sport }: {
  placeId: string;
  forecast: Forecast | null;
  sport: Sport;
}) {
  const [thresholds] = useThresholds(sport);
  const [selectedDay, setSelectedDay] = useState('next3');
  const report = useQuery({
    queryKey: queryKeys.courtReport(placeId),
    queryFn: () => api.courtReport(placeId),
    staleTime: 60_000,
  });
  const dayOptions = useMemo(() => forecastDays(forecast), [forecast]);
  const filteredForecast = useMemo(() => {
    if (!forecast) return null;
    const now = Date.now();
    const slots = selectedDay === 'next3'
      ? forecast.slots.filter((slot) => slot.ts >= now - 3600_000 && slot.ts < now + 72 * 3600_000)
      : forecast.slots.filter((slot) => localDayKey(slot.ts) === selectedDay);
    return { ...forecast, slots };
  }, [forecast, selectedDay]);
  const windows = bestPlayWindows(filteredForecast, thresholds, 3);
  const drying = estimateDrying(forecast, report.data);
  const currentSafety = forecast?.slots[0] ? safetyForSlot(forecast.slots[0]) : [];

  return <section className="mt-4">
    {currentSafety.length > 0 && <div className="mb-2 space-y-1 rounded-xl bg-amber-50 px-3 py-2">{currentSafety.map((notice) => <p key={notice.label} className={notice.level === 'danger' ? 'text-xs font-semibold text-red-700' : 'text-xs font-semibold text-amber-700'}>{notice.level === 'danger' ? '⚠' : '☀'} {notice.label}</p>)}</div>}
    <details className="group rounded-2xl border border-emerald-100 bg-white/80">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:hidden">
        <div className="min-w-0"><h3 className="font-bold text-emerald-950">Best times to play</h3><p className="truncate text-xs text-neutral-500">{selectedDay === 'next3' ? 'Next 3 days' : dayOptions.find((day) => day.key === selectedDay)?.label} · {windows[0] ? formatWindow(windows[0].startAt, windows[0].endAt) : 'No daylight window found'}</p></div>
        <span className="shrink-0 text-sm font-bold text-emerald-700 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-emerald-100 px-4 pb-4">
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-emerald-700">Forecast day<select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="mt-1 block w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-emerald-950"><option value="next3">Next 3 days</option>{dayOptions.map((day) => <option key={day.key} value={day.key}>{day.label}</option>)}</select></label>
        {drying && <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2"><p className="text-sm font-semibold text-sky-950">💧 {drying.summary}</p><p className="text-[11px] text-sky-700">Weather estimate · {drying.confidence} confidence · shade and drainage may change it</p></div>}
        <div className="mt-3 space-y-2">{windows.length ? windows.map((window) => <div key={window.startAt} className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3"><span className="block text-sm font-bold text-emerald-950">{formatWindow(window.startAt, window.endAt)}</span><span className="block text-xs text-neutral-600">{window.avgTempF}°F · rain ≤ {window.maxRainPct}% · wind ≤ {window.maxWindMph} mph</span></div>) : <p className="text-sm text-neutral-500">No safe daylight window found yet. Check back as the forecast changes.</p>}</div>
      </div>
    </details>
  </section>;
}

function localDayKey(ts: number) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function forecastDays(forecast: Forecast | null) {
  if (!forecast) return [];
  const seen = new Set<string>();
  const now = new Date();
  const today = localDayKey(now.getTime());
  const tomorrowDate = new Date(now); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = localDayKey(tomorrowDate.getTime());
  return forecast.slots.flatMap((slot) => {
    const key = localDayKey(slot.ts);
    if (seen.has(key)) return [];
    seen.add(key);
    const date = new Date(slot.ts);
    const prefix = key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' });
    return [{ key, label: `${prefix}, ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` }];
  }).slice(0, 7);
}

function formatWindow(start: number, end: number) {
  const a = new Date(start);
  const b = new Date(end);
  return `${a.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${a.toLocaleTimeString(undefined, { hour: 'numeric' })}–${b.toLocaleTimeString(undefined, { hour: 'numeric' })}`;
}
