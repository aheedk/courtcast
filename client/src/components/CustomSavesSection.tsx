import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { SavedCourtCard } from './SavedCourtCard';
import { SPORT_EMOJI, SPORT_LABEL } from '../types';

export function CustomSavesSection() {
  const { selectCourt } = useUi();
  const saved = useQuery({ queryKey: queryKeys.savedCourts, queryFn: api.savedCourts });

  const customSaves = saved.data?.courts.filter((c) => c.sport === 'custom') ?? [];

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3">
        Your custom saves
      </h2>

      {customSaves.length === 0 ? (
        <p className="text-sm text-neutral-500 bg-white border border-dashed border-neutral-300 rounded-2xl p-5 text-center">
          No custom saves yet — switch to {SPORT_EMOJI.custom} {SPORT_LABEL.custom} on the map to save one.
        </p>
      ) : (
        <div className="grid gap-3">
          {customSaves.map((c) => (
            <SavedCourtCard key={`${c.placeId}:${c.sport}`} court={c} onSelect={selectCourt} />
          ))}
        </div>
      )}
    </section>
  );
}
