import type { Sport } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

interface Props {
  value: Sport;
  onChange: (sport: Sport) => void;
  sports?: readonly Sport[];
  label?: string;
  className?: string;
}

/** Shared sport selector. The historic export name is kept to avoid a noisy rename. */
export function SportChips({ value, onChange, sports = SPORTS, label = 'Sport', className = '' }: Props) {
  return <label className={`block ${className}`}>
    <span className="sr-only">{label}</span>
    <span className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Sport)}
        aria-label={label}
        className="w-full appearance-none rounded-xl border border-emerald-200 bg-white/95 py-2.5 pl-3 pr-10 text-sm font-bold text-emerald-950 shadow-md shadow-emerald-950/10 outline-none backdrop-blur-xl hover:border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
      >
        {sports.map((sport) => <option key={sport} value={sport}>{SPORT_EMOJI[sport]} {SPORT_LABEL[sport]}</option>)}
      </select>
      <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-700"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
    </span>
  </label>;
}
