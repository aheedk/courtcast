import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { SavedCourtCard } from '../components/SavedCourtCard';
import { CourtPanel } from '../components/CourtPanel';
import { ListsTab } from '../components/ListsTab';
import { ListView } from '../components/ListView';
import { useUi } from '../stores/ui';
import type { Sport, User } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

type TabValue = 'all' | Sport | 'custom';

export function MyCourtsPage({ user }: { user: User }) {
  const { selectedPlaceId, selectCourt } = useUi();
  const saved = useQuery({ queryKey: queryKeys.savedCourts, queryFn: api.savedCourts });
  const [tab, setTab] = useState<TabValue>('all');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const allCourts = saved.data?.courts ?? [];
  const filtered =
    tab === 'all' || tab === 'custom'
      ? allCourts
      : allCourts.filter((c) => c.sport === tab);

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: 'All' },
    ...SPORTS.map((s) => ({ value: s as TabValue, label: `${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}` })),
    { value: 'custom', label: '📝 Custom' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">My Courts</h1>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
        {tabs.map((t) => {
          const active = t.value === tab;
          return (
            <button
              key={t.value}
              onClick={() => {
                setTab(t.value);
                setSelectedListId(null);
              }}
              className={
                active
                  ? 'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold bg-neutral-900 text-white'
                  : 'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50'
              }
              aria-pressed={active}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'custom' ? (
        selectedListId ? (
          <ListView listId={selectedListId} onBack={() => setSelectedListId(null)} />
        ) : (
          <ListsTab onSelectList={setSelectedListId} />
        )
      ) : (
        <>
          {saved.isLoading && <p className="text-neutral-500">Loading your courts…</p>}
          {saved.isError && <p className="text-bad">Couldn’t load your saved courts.</p>}

          {saved.data && filtered.length === 0 && (
            <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
              <h2 className="font-semibold text-lg mb-1">
                {tab === 'all'
                  ? 'No courts saved yet'
                  : `No ${SPORT_LABEL[tab as Sport].toLowerCase()} courts saved yet`}
              </h2>
              <p className="text-neutral-500 mb-4">
                {tab === 'all'
                  ? 'Open the map, tap a court, then “Save to My Courts.”'
                  : `Switch to ${SPORT_EMOJI[tab as Sport]} ${SPORT_LABEL[tab as Sport]} on the map and save some.`}
              </p>
              <a
                href="/"
                className="inline-block px-4 py-2 rounded-xl bg-neutral-900 text-white font-semibold"
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
    </div>
  );
}
