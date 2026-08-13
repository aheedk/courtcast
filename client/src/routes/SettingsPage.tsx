import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useThresholds } from '../stores/thresholds';
import { useSport } from '../stores/sport';
import { useEnabledSports, toggleSport } from '../stores/enabledSports';
import { SportChips } from '../components/SportChips';
import { PlayabilityBadge } from '../components/PlayabilityBadge';
import { scoreFromThresholds } from '../lib/playability';
import { SPORTS, SPORT_EMOJI, SPORT_LABEL } from '../types';
import type { Sport, User } from '../types';
import { queryKeys } from '../lib/queryClient';

export function SettingsPage({ user }: { user: User }) {
  const [sport, setSport] = useSport();
  const [enabledSports, setEnabledSports] = useEnabledSports();
  const [activeSport, setActiveSport] = useState<Sport>(enabledSports[0] ?? 'tennis');
  // If user disables the sport currently being edited, snap to first enabled.
  useEffect(() => {
    if (!enabledSports.includes(activeSport)) {
      setActiveSport(enabledSports[0] ?? 'tennis');
    }
  }, [enabledSports, activeSport]);
  const [thresholds, setThresholds, resetThresholds] = useThresholds(activeSport);
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
  const notificationPreferences = useQuery({ queryKey: queryKeys.notificationPreferences, queryFn: api.notificationPreferences });
  const updateNotifications = useMutation({
    mutationFn: api.updateNotificationPreferences,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notificationPreferences }),
  });

  // Constraints: rainMaxGood < rainMaxOk so GOOD remains reachable.
  const rainGoodMax = Math.max(0, thresholds.rainMaxOk - 1);
  const rainOkMin = Math.min(100, thresholds.rainMaxGood + 1);
  const windGoodMax = Math.max(0, thresholds.windMaxOk - 1);
  const windOkMin = Math.min(50, thresholds.windMaxGood + 1);

  // Static sample for the live preview chip.
  const preview = scoreFromThresholds(
    { tempF: 70, windMph: 8, rainPctNext2h: 20 },
    thresholds,
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">Smart alerts</h2>
        <p className="text-sm text-neutral-500 mb-4">Choose which court changes should reach your inbox.</p>
        {notificationPreferences.data && <div className="space-y-3">
          <PreferenceToggle label="A saved court becomes playable" checked={notificationPreferences.data.preferences.playableAlerts} onChange={(playableAlerts) => updateNotifications.mutate({ playableAlerts })} />
          <PreferenceToggle label="Fresh community reports" checked={notificationPreferences.data.preferences.reportAlerts} onChange={(reportAlerts) => updateNotifications.mutate({ reportAlerts })} />
          <PreferenceToggle label="Court group-chat messages" checked={notificationPreferences.data.preferences.chatAlerts} onChange={(chatAlerts) => updateNotifications.mutate({ chatAlerts })} />
          <PreferenceToggle label="Browser notifications while CourtClimate is open" checked={notificationPreferences.data.preferences.browserAlerts} onChange={async (browserAlerts) => {
            if (browserAlerts && 'Notification' in window) {
              const permission = await Notification.requestPermission();
              if (permission !== 'granted') return;
            }
            updateNotifications.mutate({ browserAlerts });
          }} />
        </div>}
        <p className="mt-3 text-[11px] text-neutral-400">Closed-app web push requires VAPID keys in the deployment. In-app and browser-open alerts work without them.</p>
      </section>

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
          Customize when GOOD / OK / BAD applies — different per sport.
        </p>

        <div className="mb-4 max-w-xs"><SportChips value={activeSport} onChange={setActiveSport} sports={enabledSports} label="Threshold sport" /></div>

        <ThresholdSlider
          label="Rain — GOOD at or below"
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
          max={windGoodMax}
          unit=" mph"
          onChange={(v) => setThresholds({ ...thresholds, windMaxGood: v })}
        />
        <ThresholdSlider
          label="Wind — BAD when above"
          value={thresholds.windMaxOk}
          min={windOkMin}
          max={50}
          unit=" mph"
          onChange={(v) => setThresholds({ ...thresholds, windMaxOk: v })}
        />

        <div className="mt-5 flex items-center gap-3 text-sm text-neutral-600">
          <span>Sample ({SPORT_LABEL[activeSport]}): 20% rain, 8 mph wind →</span>
          <PlayabilityBadge score={preview} size="sm" />
        </div>

        <button
          onClick={resetThresholds}
          className="mt-4 text-sm text-good font-semibold hover:underline"
        >
          Reset {SPORT_LABEL[activeSport]} to defaults
        </button>
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Sports
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          Choose which sports appear in dropdowns and arrange their order.
        </p>
        <div className="space-y-2">{enabledSports.map((enabledSport, index) => <div key={enabledSport} className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2"><span className="min-w-0 flex-1 text-sm font-bold text-emerald-950"><span className="mr-2 text-base">{SPORT_EMOJI[enabledSport]}</span>{SPORT_LABEL[enabledSport]}{index === 0 && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-emerald-600">First</span>}</span><button type="button" aria-label={`Move ${SPORT_LABEL[enabledSport]} up`} disabled={index === 0} onClick={() => setEnabledSports(moveSport(enabledSports, index, index - 1))} className="h-8 w-8 rounded-lg border border-emerald-200 bg-white text-emerald-800 disabled:opacity-30">↑</button><button type="button" aria-label={`Move ${SPORT_LABEL[enabledSport]} down`} disabled={index === enabledSports.length - 1} onClick={() => setEnabledSports(moveSport(enabledSports, index, index + 1))} className="h-8 w-8 rounded-lg border border-emerald-200 bg-white text-emerald-800 disabled:opacity-30">↓</button><button type="button" disabled={enabledSports.length === 1} onClick={() => setEnabledSports(toggleSport(enabledSport, enabledSports))} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 disabled:opacity-30">Remove</button></div>)}</div>
        {SPORTS.some((availableSport) => !enabledSports.includes(availableSport)) && <div className="mt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Add a sport</p><div className="flex flex-wrap gap-2">{SPORTS.filter((availableSport) => !enabledSports.includes(availableSport)).map((availableSport) => <button key={availableSport} onClick={() => setEnabledSports([...enabledSports, availableSport])} className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:border-emerald-300">+ {SPORT_EMOJI[availableSport]} {SPORT_LABEL[availableSport]}</button>)}</div></div>}
        {enabledSports.length === 1 && (
          <p className="text-xs text-neutral-500 mt-3">At least one sport must stay enabled.</p>
        )}
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Default sport
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          The sport selected when you open the app. Tennis is the initial default.
        </p>
        <div className="max-w-xs"><SportChips value={sport} onChange={setSport} sports={enabledSports} label="Default sport" /></div>
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

function PreferenceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 text-sm"><span className="font-medium text-neutral-700">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-emerald-700" /></label>;
}

function moveSport(sports: Sport[], from: number, to: number): Sport[] {
  if (to < 0 || to >= sports.length) return sports;
  const next = [...sports];
  const [sport] = next.splice(from, 1);
  next.splice(to, 0, sport);
  return next;
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
