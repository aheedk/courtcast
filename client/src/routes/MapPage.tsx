import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { useGeolocation } from '../hooks/useGeolocation';
import { MapView } from '../components/MapView';
import { CourtPanel } from '../components/CourtPanel';
import type { User } from '../types';

export function MapPage({ user }: { user: User | null }) {
  const { position, source } = useGeolocation();
  const { selectedPlaceId, selectCourt } = useUi();

  const courts = useQuery({
    queryKey: queryKeys.nearbyCourts(position.lat, position.lng),
    queryFn: () => api.nearbyCourts(position.lat, position.lng),
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div className="relative h-[calc(100vh-3.5rem)]">
      <MapView
        center={position}
        courts={courts.data?.courts ?? []}
        selectedPlaceId={selectedPlaceId}
        onSelect={selectCourt}
      />

      {source === 'default' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white shadow-md border border-neutral-200 rounded-full px-4 py-1.5 text-xs text-neutral-600">
          Showing default location — enable location for nearby courts.
        </div>
      )}

      {courts.isLoading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-white shadow-md rounded-full px-4 py-1.5 text-sm text-neutral-600">
          Finding nearby courts…
        </div>
      )}

      {courts.isError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-white shadow-md rounded-full px-4 py-1.5 text-sm text-bad">
          Couldn’t fetch courts. Try again.
        </div>
      )}

      {selectedPlaceId && (
        <CourtPanel placeId={selectedPlaceId} user={user} onClose={() => selectCourt(null)} />
      )}
    </div>
  );
}
