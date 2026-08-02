import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { SavedCourtCard } from '../components/SavedCourtCard';
import { CourtPanel } from '../components/CourtPanel';
import { TimeScrubber } from '../components/TimeScrubber';
import { ListsTab } from '../components/ListsTab';
import { ListView } from '../components/ListView';
import { CustomSavesSection } from '../components/CustomSavesSection';
import { useUi } from '../stores/ui';
import { useEnabledSports } from '../stores/enabledSports';
import type { Sport, User } from '../types';
import { SPORT_LABEL, SPORT_EMOJI } from '../types';

type TabValue = 'all' | Sport;

export function MyCourtsPage({ user }: { user: User }) {
  const { selectedPlaceId, selectCourt } = useUi();
  const saved = useQuery({ queryKey: queryKeys.savedCourts, queryFn: api.savedCourts });
  const [enabledSports] = useEnabledSports();
  const [tab, setTab] = useState<TabValue>('all');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const allCourts = saved.data?.courts ?? [];
  const filtered =
    tab === 'all' ? allCourts : allCourts.filter((c) => c.sport === tab);

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: 'All' },
    ...enabledSports.map((s) => ({ value: s as TabValue, label: `${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}` })),
  ];

  // One batch query for the latest report on every saved court. Lets each
  // card read from the shared cache instead of each firing its own request.
  const savedPlaceIds = useMemo(
    () => Array.from(new Set(allCourts.map((c) => c.placeId))),
    [allCourts],
  );
  const reports = useQuery({
    queryKey: queryKeys.courtReportsBatch(savedPlaceIds),
    queryFn: () => api.courtReportsBatch(savedPlaceIds),
    enabled: savedPlaceIds.length > 0,
    staleTime: 60_000,
  });
  const reportMap = reports.data?.reports ?? {};

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-gradient-to-b from-emerald-50 via-sky-50/60 to-white overflow-x-hidden">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-24">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-emerald-950">My Courts</h1>
          <span className="shrink-0 rounded-full border border-emerald-100 bg-white/75 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
            {allCourts.length} saved
          </span>
        </div>

        <label className="mb-5 block max-w-xs"><span className="sr-only">Filter My Courts by sport</span><span className="relative block"><select value={tab} onChange={(event) => { setTab(event.target.value as TabValue); setSelectedListId(null); }} className="w-full appearance-none rounded-xl border border-emerald-200 bg-white py-2.5 pl-3 pr-10 text-sm font-bold text-emerald-950 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200">{tabs.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-700">⌄</span></span></label>

        {tab === 'custom' ? (
          selectedListId ? (
            <ListView listId={selectedListId} onBack={() => setSelectedListId(null)} />
          ) : (
            <>
              <CustomSavesSection />
              <section>
                <h2 className="text-sm font-semibold text-emerald-700 uppercase mb-3">
                  Your lists
                </h2>
                <ListsTab onSelectList={setSelectedListId} />
              </section>
            </>
          )
        ) : (
          <>
            {saved.isLoading && <p className="text-neutral-500">Loading your courts…</p>}
            {saved.isError && <p className="text-bad">Couldn’t load your saved courts.</p>}

            {saved.data && filtered.length === 0 && (
              <div className="bg-gradient-to-br from-white via-emerald-50/80 to-sky-50/80 border border-dashed border-emerald-200 rounded-2xl p-10 text-center shadow-sm shadow-emerald-950/5">
                <h2 className="font-semibold text-lg text-emerald-950 mb-1">
                  {tab === 'all'
                    ? 'No courts saved yet'
                    : `No ${SPORT_LABEL[tab].toLowerCase()} courts saved yet`}
                </h2>
                <p className="text-neutral-600 mb-4">
                  {tab === 'all'
                    ? 'Open the map, tap a court, then “Save to My Courts.”'
                    : `Switch to ${SPORT_EMOJI[tab]} ${SPORT_LABEL[tab]} on the map and save some.`}
                </p>
                <a
                  href="/"
                  className="inline-block px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-700 to-sky-700 text-white font-semibold shadow-md shadow-emerald-950/20"
                >
                  Browse the map
                </a>
              </div>
            )}

            {saved.data && filtered.length > 0 && (
              <div className="grid gap-3">
                {filtered.map((c) => (
                  <SavedCourtCard
                    key={`${c.placeId}:${c.sport}`}
                    court={c}
                    onSelect={selectCourt}
                    report={reports.isSuccess ? (reportMap[c.placeId] ?? null) : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {selectedPlaceId && (
          <CourtPanel
            placeId={selectedPlaceId}
            user={user}
            onClose={() => selectCourt(null)}
          />
        )}

        {/* Persistent time slider, mirroring the MapPage layout. */}
        {allCourts.length > 0 && (
          <div className="fixed bottom-3 left-3 right-3 z-20 sm:max-w-3xl sm:left-1/2 sm:-translate-x-1/2 pointer-events-auto">
            <TimeScrubber />
          </div>
        )}
      </div>
    </div>
  );
}
