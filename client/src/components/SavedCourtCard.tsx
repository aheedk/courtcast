import type { SavedCourtDetail } from '../types';
import { SPORT_EMOJI } from '../types';
import { PlayabilityBadge } from './PlayabilityBadge';
import { WeatherStats } from './WeatherStats';

interface Props {
  court: SavedCourtDetail;
  onSelect: (placeId: string) => void;
}

export function SavedCourtCard({ court, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(court.placeId)}
      className="w-full text-left bg-white border border-neutral-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base" title={court.sport} aria-label={court.sport}>
              {SPORT_EMOJI[court.sport]}
            </span>
            <h3 className="font-bold text-base truncate">{court.name}</h3>
          </div>
          {court.address && <p className="text-sm text-neutral-500 truncate ml-7">{court.address}</p>}
        </div>
        {court.score && <PlayabilityBadge score={court.score} />}
      </div>

      {court.weather ? (
        <div className="mt-3">
          <WeatherStats weather={court.weather} compact />
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">Weather unavailable right now.</p>
      )}
    </button>
  );
}
