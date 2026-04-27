import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { SavedCourtCard } from '../components/SavedCourtCard';
import { CourtPanel } from '../components/CourtPanel';
import { useUi } from '../stores/ui';
import type { User } from '../types';

export function MyCourtsPage({ user }: { user: User }) {
  const { selectedPlaceId, selectCourt } = useUi();
  const saved = useQuery({ queryKey: queryKeys.savedCourts, queryFn: api.savedCourts });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">My Courts</h1>

      {saved.isLoading && <p className="text-neutral-500">Loading your courts…</p>}

      {saved.isError && <p className="text-bad">Couldn’t load your saved courts.</p>}

      {saved.data && saved.data.courts.length === 0 && (
        <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
          <h2 className="font-semibold text-lg mb-1">No courts saved yet</h2>
          <p className="text-neutral-500 mb-4">
            Open the map, tap a court, then “Save to My Courts.”
          </p>
          <a href="/" className="inline-block px-4 py-2 rounded-xl bg-neutral-900 text-white font-semibold">
            Browse the map
          </a>
        </div>
      )}

      {saved.data && saved.data.courts.length > 0 && (
        <div className="grid gap-3">
          {saved.data.courts.map((c) => (
            <SavedCourtCard key={c.placeId} court={c} onSelect={selectCourt} />
          ))}
        </div>
      )}

      {selectedPlaceId && (
        <CourtPanel placeId={selectedPlaceId} user={user} onClose={() => selectCourt(null)} />
      )}
    </div>
  );
}
