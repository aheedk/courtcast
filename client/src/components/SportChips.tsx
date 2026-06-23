import type { Sport } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

interface Props {
  value: Sport;
  onChange: (s: Sport) => void;
  sports?: readonly Sport[];
}

export function SportChips({ value, onChange, sports = SPORTS }: Props) {
  return (
    <div className="flex gap-2 justify-center flex-wrap px-3">
      {sports.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={
              active
                ? 'bg-good text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-md shadow-green-900/15 border border-good'
                : 'bg-white/95 text-neutral-800 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm border border-neutral-200 hover:bg-white hover:border-neutral-300'
            }
            aria-pressed={active}
          >
            {SPORT_EMOJI[s]} {SPORT_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
