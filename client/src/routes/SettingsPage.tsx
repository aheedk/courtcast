import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useThresholds } from '../stores/thresholds';
import { useSport } from '../stores/sport';
import { useEnabledSports, toggleSport } from '../stores/enabledSports';
import { SportChips } from '../components/SportChips';
import { PlayabilityBadge } from '../components/PlayabilityBadge';
import { scoreFromThresholds } from '../lib/playability';
import { SPORTS, SPORT_EMOJI, SPORT_LABEL } from '../types';
import type { User } from '../types';

export function SettingsPage({ user }: { user: User }) {
  const [thresholds, setThresholds, resetThresholds] = useThresholds();
  const [sport, setSport] = useSport();
  const [enabledSports, setEnabledSports] = useEnabledSports();
  const qc = useQueryClient();

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      // Hard reload guarantees the user/me query resets and any cached
      // session-tied UI (avatar, saved courts) actually clears. React
      // Router's navigate alone left the avatar in place because the
      // me query didn't always refetch after qc.clear() + navigate.
      qc.clear();
      window.location.href = '/login';
    },
  });

  // Constraints: rainMaxGood < rainMaxOk so GOOD remains reachable.
  const rainGoodMax = Math.max(0, thresholds.rainMaxOk - 1);
  const rainOkMin = Math.min(100, thresholds.rainMaxGood + 1);

  // Static sample for the live preview chip.
  const preview = scoreFromThresholds(
    { tempF: 70, windMph: 8, rainPctNext2h: 20 },
    thresholds,
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3">
          Account
        </h2>
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full" />
          )}
          <div>
            <p className="font-bold">{user.name ?? 'You'}</p>
            <p className="text-sm text-neutral-500">{user.email}</p>
          </div>
        </div>
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Playability thresholds
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          Customize when GOOD / OK / BAD applies to courts on the map.
        </p>

        <ThresholdSlider
          label="Rain — GOOD when below"
          value={thresholds.rainMaxGood}
          min={0}
          max={rainGoodMax}
          unit="%"
          onChange={(v) => setThresholds({ ...thresholds, rainMaxGood: v })}
        />
        <ThresholdSlider
          label="Rain — BAD when above"
          value={thresholds.rainMaxOk}
          min={rainOkMin}
          max={100}
          unit="%"
          onChange={(v) => setThresholds({ ...thresholds, rainMaxOk: v })}
        />
        <ThresholdSlider
          label="Wind — GOOD when below"
          value={thresholds.windMaxGood}
          min={0}
          max={25}
          unit=" mph"
          onChange={(v) => setThresholds({ ...thresholds, windMaxGood: v })}
        />

        <div className="mt-5 flex items-center gap-3 text-sm text-neutral-600">
          <span>Sample: 20% rain, 8 mph wind →</span>
          <PlayabilityBadge score={preview} size="sm" />
        </div>

        <button
          onClick={resetThresholds}
          className="mt-4 text-sm text-good font-semibold hover:underline"
        >
          Reset to defaults
        </button>
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Sports
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          Pick which sports show as tabs and chips.
        </p>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((s) => {
            const isEnabled = enabledSports.includes(s);
            const isLast = isEnabled && enabledSports.length === 1;
            return (
              <button
                key={s}
                onClick={() => {
                  if (isLast) return;
                  setEnabledSports(toggleSport(s, enabledSports));
                }}
                disabled={isLast}
                aria-pressed={isEnabled}
                className={
                  isEnabled
                    ? 'bg-good text-white px-3 py-1.5 rounded-full text-sm font-semibold disabled:opacity-80'
                    : 'bg-white text-neutral-700 border border-neutral-300 px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-neutral-50'
                }
              >
                {SPORT_EMOJI[s]} {SPORT_LABEL[s]}
              </button>
            );
          })}
        </div>
        {enabledSports.length === 1 && (
          <p className="text-xs text-neutral-500 mt-3">At least one sport must stay enabled.</p>
        )}
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Default sport
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          The sport chip selected when you open the map.
        </p>
        <SportChips value={sport} onChange={setSport} sports={enabledSports} />
      </section>

      <button
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="w-full py-3 rounded-xl border border-bad text-bad font-semibold hover:bg-bad hover:text-white"
      >
        {logout.isPending ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

interface ThresholdSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}

function ThresholdSlider({ label, value, min, max, unit, onChange }: ThresholdSliderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-neutral-700">{label}</label>
        <span className="text-sm font-semibold text-neutral-900">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-good"
      />
    </div>
  );
}
