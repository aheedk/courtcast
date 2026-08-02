import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { rankPlayableCourts } from '../lib/intelligence';
import { useGeolocation } from '../hooks/useGeolocation';
import { useSport } from '../stores/sport';
import { useThresholds } from '../stores/thresholds';
import { useEnabledSports } from '../stores/enabledSports';
import { SportChips } from '../components/SportChips';
import { LatestReport } from '../components/LatestReport';
import { PlayabilityBadge } from '../components/PlayabilityBadge';

export function NearbyPage() {
  const { position, source } = useGeolocation();
  const [sport, setSport] = useSport();
  const [thresholds] = useThresholds(sport);
  const [enabledSports] = useEnabledSports();
  const [compare, setCompare] = useState<string[]>([]);
  const courts = useQuery({
    queryKey: queryKeys.nearbyCourts(position.lat, position.lng, sport),
    queryFn: () => api.nearbyCourts(position.lat, position.lng, sport),
    staleTime: 60 * 60_000,
  });
  const placeIds = useMemo(() => (courts.data?.courts ?? []).map((court) => court.placeId), [courts.data]);
  const reports = useQuery({
    queryKey: queryKeys.courtReportsBatch(placeIds),
    queryFn: () => api.courtReportsBatch(placeIds),
    enabled: placeIds.length > 0,
    staleTime: 60_000,
  });
  const ranked = useMemo(() => rankPlayableCourts(courts.data?.courts ?? [], position, thresholds), [courts.data, position.lat, position.lng, thresholds]);
  const compared = ranked.filter(({ court }) => compare.includes(court.placeId));

  return <main className="mx-auto max-w-5xl px-4 py-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold text-emerald-950">Playable nearby</h1><p className="mt-1 text-sm text-neutral-500">Ranked by current conditions, daylight forecast, and distance.</p></div><Link to="/" className="text-sm font-semibold text-emerald-700">Open map</Link></div>
    {source === 'default' && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Using the default location. Enable browser location for results near you.</p>}
    <div className="mt-4 max-w-xs"><SportChips value={sport} onChange={(next) => { setSport(next); setCompare([]); }} sports={enabledSports} label="Nearby sport" /></div>

    {compared.length >= 2 && <section className="mt-5 overflow-x-auto rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex items-center justify-between"><h2 className="font-bold text-sky-950">Court comparison</h2><button onClick={() => setCompare([])} className="text-xs font-semibold text-sky-700">Clear</button></div>
      <table className="mt-2 w-full min-w-[520px] text-left text-sm"><thead><tr className="text-xs text-sky-800"><th className="py-2">Court</th><th>Conditions</th><th>Distance</th><th>Best daylight time</th></tr></thead><tbody>{compared.map(({ court, score, distance, next }) => <tr key={court.placeId} className="border-t border-sky-100"><td className="py-3 font-semibold">{court.name}</td><td>{score ?? 'Unknown'}</td><td>{distance.toFixed(1)} mi</td><td>{next ? new Date(next.startAt).toLocaleString([], { weekday: 'short', hour: 'numeric' }) : 'None found'}</td></tr>)}</tbody></table>
    </section>}

    {courts.isLoading && <p className="mt-8 text-neutral-500">Checking nearby courts and weather…</p>}
    {courts.isError && <p className="mt-8 rounded-2xl bg-red-50 p-4 text-red-800">Couldn’t load nearby courts. Try again shortly.</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2">{ranked.map(({ court, score, distance, next }, index) => <article key={court.placeId} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-extrabold text-emerald-800">{index + 1}</span><div className="min-w-0 flex-1"><Link to={`/?court=${encodeURIComponent(court.placeId)}`} className="block truncate font-bold text-neutral-900 hover:text-emerald-800">{court.name}</Link><p className="text-xs text-neutral-500">{distance.toFixed(1)} mi away</p></div>{score && <PlayabilityBadge score={score} size="sm" />}</div>
      <div className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Best daylight window</p><p className="text-sm font-semibold text-emerald-950">{next ? formatWindow(next.startAt, next.endAt) : 'No safe window found'}</p></div>
      <div className="mt-2"><LatestReport placeId={court.placeId} report={reports.data?.reports[court.placeId]} compact /></div>
      <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-sky-800"><input type="checkbox" checked={compare.includes(court.placeId)} disabled={!compare.includes(court.placeId) && compare.length >= 3} onChange={() => setCompare((current) => current.includes(court.placeId) ? current.filter((id) => id !== court.placeId) : [...current, court.placeId])} /> Compare{compare.length ? ` (${compare.length}/3)` : ''}</label>
    </article>)}</div>
    {!courts.isLoading && !courts.isError && ranked.length === 0 && <p className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 text-center text-neutral-500">No {sport} courts found near this location.</p>}
  </main>;
}

function formatWindow(startAt: number, endAt: number) {
  const start = new Date(startAt); const end = new Date(endAt);
  return `${start.toLocaleDateString([], { weekday: 'short' })} ${start.toLocaleTimeString([], { hour: 'numeric' })}–${end.toLocaleTimeString([], { hour: 'numeric' })}`;
}
