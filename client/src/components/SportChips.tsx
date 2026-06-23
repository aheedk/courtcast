import type { Sport } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

interface Props {
  value: Sport;
  onChange: (s: Sport) => void;
  sports?: readonly Sport[];
}

const chipStyles: Record<Sport, { active: string; inactive: string }> = {
  tennis: {
    active: 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-900/20',
    inactive: 'text-emerald-900 border-emerald-100 hover:border-emerald-200',
  },
  basketball: {
    active: 'bg-orange-500 text-white border-orange-500 shadow-orange-900/20',
    inactive: 'text-orange-900 border-orange-100 hover:border-orange-200',
  },
  pickleball: {
    active: 'bg-lime-600 text-white border-lime-600 shadow-lime-900/20',
    inactive: 'text-lime-900 border-lime-100 hover:border-lime-200',
  },
  soccer: {
    active: 'bg-green-700 text-white border-green-700 shadow-green-900/20',
    inactive: 'text-green-900 border-green-100 hover:border-green-200',
  },
  volleyball: {
    active: 'bg-sky-600 text-white border-sky-600 shadow-sky-900/20',
    inactive: 'text-sky-900 border-sky-100 hover:border-sky-200',
  },
  football: {
    active: 'bg-amber-600 text-white border-amber-600 shadow-amber-900/20',
    inactive: 'text-amber-900 border-amber-100 hover:border-amber-200',
  },
  baseball: {
    active: 'bg-red-600 text-white border-red-600 shadow-red-900/20',
    inactive: 'text-red-900 border-red-100 hover:border-red-200',
  },
  hockey: {
    active: 'bg-blue-600 text-white border-blue-600 shadow-blue-900/20',
    inactive: 'text-blue-900 border-blue-100 hover:border-blue-200',
  },
  custom: {
    active: 'bg-slate-800 text-white border-slate-800 shadow-slate-900/20',
    inactive: 'text-slate-800 border-slate-200 hover:border-slate-300',
  },
};

export function SportChips({ value, onChange, sports = SPORTS }: Props) {
  return (
    <div className="flex gap-1.5 sm:gap-2 justify-center flex-wrap px-3">
      {sports.map((s) => {
        const active = s === value;
        const styles = chipStyles[s];
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={
              active
                ? `${styles.active} px-2.5 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold shadow-md border`
                : `bg-white/90 backdrop-blur-xl ${styles.inactive} px-2.5 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold shadow-sm border hover:bg-white`
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
