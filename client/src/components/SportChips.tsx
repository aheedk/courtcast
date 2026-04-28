import type { Sport } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

interface Props {
  value: Sport;
  onChange: (s: Sport) => void;
  sports?: readonly Sport[];
}

export function SportChips({ value, onChange, sports = SPORTS }: Props) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {sports.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={
              active
                ? 'bg-good text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-md'
                : 'bg-white text-neutral-900 px-4 py-1.5 rounded-full text-xs font-semibold shadow-md hover:bg-neutral-50'
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
