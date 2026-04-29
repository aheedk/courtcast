# CourtClimate — Time-Changer (Forecast Scrubbing) Design

## Goal

Let users pick a future time within the next 48 hours and have the entire app — map pin colors, court detail panel, saved-court cards — score and display weather for that selected time, instead of always showing "now."

## User stories

- "Is Saturday afternoon a good time to play tennis?" — User opens the map, drags the bottom slider to Sat 2pm; all pins recolor for that time, the open court panel updates, and `WeatherStats` shows the slot.
- "What about my regular spots tomorrow morning?" — User opens My Courts, taps the time pill at the top, scrubs to "Tomorrow 9am" in the bottom sheet; all saved cards reflect that.
- "Just show me now." — User taps the "Now" button on the slider; everything snaps back to current time.

## Architecture

Two coupled changes:

1. **Weather provider abstraction.** Switch the default provider from OpenWeatherMap (3-hour resolution, free tier) to Open-Meteo (1-hour resolution, free, no API key) behind a `WEATHER_PROVIDER` env var. OWM remains callable when the env var is set to `'openweather'`, for fallback or rollback.
2. **Forecast in API responses + global selected-time state on the client.** Server returns a 48-hour hourly forecast per court; client picks the slot for the user's selected time and scores it.

This pulls forward work that was scheduled for an autonomous agent firing 2026-05-11 (routine `trig_01KD12VvGPQnspTqWwfNDE13`). That routine is canceled when this work ships.

## Provider — Open-Meteo

- New env var `WEATHER_PROVIDER`, default `'open-meteo'`. Accepts `'openweather'`.
- New module `server/src/lib/openmeteo.ts`.
  - Endpoint: `https://api.open-meteo.com/v1/forecast`
  - Free, no API key required.
  - Query params: `latitude`, `longitude`, `hourly=temperature_2m,wind_speed_10m,precipitation_probability`, `temperature_unit=fahrenheit`, `wind_speed_unit=mph`, `forecast_hours=48`, `timezone=auto`.
  - Response shape: parallel arrays under `hourly.time[]`, `hourly.temperature_2m[]`, `hourly.wind_speed_10m[]`, `hourly.precipitation_probability[]`. Module zips into a 48-element `ForecastSlot[]`.
- New thin module `server/src/lib/weather.ts` exporting `fetchForecast(lat, lng) → Promise<{ forecast: Forecast; stale: boolean }>`. Dispatches to Open-Meteo or OWM based on `WEATHER_PROVIDER`.
- Existing `openweather.ts` is repurposed: its public function becomes `fetchOpenWeatherForecast(lat, lng) → Promise<Forecast>`, returning the same `Forecast` shape derived from the 5-day/3-hour endpoint. Hourly slots are interpolated linearly between OWM's 3-hour samples (rain probability is forward-filled rather than interpolated, since `pop` is per-3h-window).
- All existing callers of `fetchWeather` move to `fetchForecast`.

## Data model — server

```ts
// server/src/lib/forecast.ts (new)
export interface ForecastSlot {
  ts: number;          // epoch ms, aligned to top-of-hour in UTC (= top-of-hour locally for whole-hour zones)
  tempF: number;       // rounded to nearest int
  windMph: number;     // rounded to nearest int
  rainPct: number;     // 0..100, hour's precipitation probability
}

export interface Forecast {
  slots: ForecastSlot[];   // 48 hourly slots, ts ascending; slots[0] = current hour
  fetchedAt: number;       // epoch ms when provider responded
}
```

- `weatherCache` table payload changes from `WeatherSummary` to `Forecast`. Rows from before the deploy are abandoned — the 10-minute TTL means most cached rows expire within a few minutes anyway, and `clampForecast`-style read-time validation drops malformed payloads.
- The existing `WeatherSummary` type is retained and derived from `slots[0]` when needed: `{ tempF: slots[0].tempF, windMph: slots[0].windMph, rainPctNext2h: slots[0].rainPct }`. `WeatherSummary.rainPctNext2h` is approximated by `slots[0].rainPct` (single hour, not next-2h max). Acceptable: it's only used as the server-side fallback score for unauthenticated map calls.
- Server-side `score(weather)` (from `server/src/lib/playability.ts`) is unchanged. It continues to take a `WeatherSummary` derived from `slots[0]`.

## API responses

`GET /api/courts`, `GET /api/court/:placeId`, `GET /api/me/courts`, and `GET /api/weather` each gain a `forecast` field on every court/result object:

```ts
forecast: Forecast | null
// null when fetch failed and no cache exists; otherwise the 48-slot forecast
```

Existing fields (`weather`, `score`, `stale`) are unchanged in shape and meaning — they continue to reflect the "now" view.

## Data model — client

### `useSelectedTime` store

New global store under `client/src/stores/selectedTime.ts`, matching the pattern of `useSport`, `useEnabledSports`, `useThresholds`:

- LocalStorage key: `courtclimate.selectedTimeMs`.
- Public hook: `useSelectedTime() → [selectedMs: number | null, setSelected: (ms: number | null) => void]`.
- `null` means "now" — UI auto-tracks current time.
- When set, holds an absolute epoch-ms timestamp (cleaner than offsets across midnight transitions).
- Read-time guard: if persisted value is more than 48 hours in the past **or** more than 60 hours in the future (small slack beyond the forecast window), auto-reset to `null` on read.
- `CHANGED_EVENT` pattern: dispatched on update so consumers re-render across components.

### `slotAt` helper

```ts
// client/src/lib/forecast.ts
export function slotAt(forecast: Forecast | null, timeMs: number | null): ForecastSlot | null
```

- If `forecast` is null/empty → returns `null`.
- If `timeMs` is null → returns `slots[0]` (the "now" slot).
- Otherwise → returns the slot whose `ts` is within ±30 minutes of `timeMs` (snap to nearest hour). Returns `null` when no slot is within range (out of forecast window).

### Updated hook signatures

```ts
// client/src/stores/thresholds.ts
useScoreFor(
  forecast: Forecast | null | undefined,
  sport: Sport,
  fallback?: PlayabilityScore | null,
): PlayabilityScore | null
```

- Reads global `useSelectedTime`.
- Calls `slotAt(forecast, selectedMs)`.
- If a slot is returned, maps it to a `WeatherSummary`-shaped value and runs `scoreFromThresholds` against the sport's thresholds.
- If `slotAt` returns null *because forecast is missing* → returns `fallback`.
- If `slotAt` returns null *because the selected time is out of window* → returns `null`.

`useScoreFor` callers update from `(weather, sport, fallback)` to `(forecast, sport, fallback)`:
- `client/src/components/CourtPanel.tsx` — uses the open court's `forecast`.
- `client/src/components/SavedCourtCard.tsx` — uses the saved card's `forecast`.

`useThresholds(sport)` is unchanged (Round 11 already shipped).

### `WeatherStats` component

Accepts a `forecast` and reads the global selected time internally:

```tsx
<WeatherStats forecast={forecast} compact={false} />
```

- Renders the picked slot's `tempF`/`windMph`/`rainPct`.
- When `slotAt` returns null (out of window): renders dashes for all three stats.
- Existing prop `weather: WeatherSummary` is removed — call sites are updated to pass `forecast`.

## UI — MapPage

A slider component (`<TimeScrubber />`) anchored to the bottom of the map, above the iOS safe-area inset.

### Layout

- Position: `fixed bottom-3 left-3 right-3` on the MapPage; on mobile this stacks above any open `CourtPanel` (panel is also `fixed` at the bottom on mobile — they share vertical space; CSS uses `bottom: env(safe-area-inset-bottom)` and a small `--scrubber-height` for the panel to offset).
- Pill: white background, rounded-2xl, `shadow-lg`, padding `12px 14px`.
- Top row, flex justify-between:
  - Left: readout text — e.g. `Sat 4pm` (bold) and a smaller subdued line `in 26h` (or `Now` when selected = null).
  - Right: a small "Now" button (text-only, hidden when selected is already null).
- Track row:
  - HTML `<input type="range">` with `min=0`, `max=23`, `step=1` representing 2-hour buckets across 48 hours (`bucket * 2 = hours from now`).
  - Custom-styled track using the same accent color (`accent-good`) as existing sliders.
- Day-tick label row under the track:
  - Three labels positioned at the appropriate detents based on local-day boundaries: `Today`, `Tomorrow`, `Day after`.
  - Computed from `Date()` at component mount; recomputed on midnight.

### Behavior

- Drag captures `Date.now()` at the moment the input fires and writes `useSelectedTime = Date.now() + bucket * 2 * 3600_000`. Once written, the value is an absolute timestamp — it does not drift as wall-clock time advances; the slider thumb correspondingly slides "left" toward bucket 0 over time as `now` catches up.
- **Bucket 0 collapses to "Now":** if the slider lands on position 0, the store is set to `null` rather than the captured `Date.now()` value. This keeps "Now" semantically equivalent to the "Now" button and avoids a frozen snapshot when the user just wanted current weather.
- "Now" button: `setSelected(null)`. Slider thumb visually returns to position 0.
- When `selected = null`, the slider thumb sits at position 0 and the readout shows "Now."
- Pin colors recompute live as the slider drags — `useScoreFor(forecast, sport)` re-runs because the global selected time changed.

## UI — CourtPanel

No own time control. `WeatherStats` and `PlayabilityBadge` both reflect the global selected time:

- If `slotAt` returns a slot, `WeatherStats` renders that slot's stats and `PlayabilityBadge` shows the scored result.
- If null (out of window), `WeatherStats` shows dashes for all stats and `PlayabilityBadge` shows nothing (the surrounding container hides the badge when score is null — same pattern as today's "weather still loading" state).
- A small line under the badge — only when selected is non-null — reads "Forecast for Sat 4pm" so the user knows they're not looking at the current weather.

## UI — MyCourtsPage

A compact time pill at the top of the page (above the sport tabs):

- Closed state: `<button>Now</button>` when selected is null; `<button>Sat 4pm <span>(in 26h)</span></button>` otherwise.
- Tap → bottom sheet (matching the existing `AddSpotSheet` overlay pattern in `client/src/components/AddSpotSheet.tsx`) containing the same `<TimeScrubber />` component reused from MapPage.
- Saved-court cards' `useScoreFor` reads the same global selected time. Cards inherit, no own control.
- **Empty state:** when the user has zero saved courts across all sports, the time pill is hidden — there's nothing to score. The pill returns when the first court is saved.

## Pin coloring on the map

Pin scores and pin colors currently derive from `score: PlayabilityScore | null` baked into each `Court` by the server. With the time-changer, the client computes pin colors locally:

- Each court object delivered by `/api/courts` has `forecast: Forecast | null`.
- `MapPage` runs `useScoreFor(court.forecast, sport, court.score)` per pin to determine the color, falling back to the server's `now` score when forecast is missing.
- Map re-renders pin colors when `useSelectedTime` or `useThresholds` changes (already wired through `CHANGED_EVENT`).

## Edge cases

| Case | Behavior |
|---|---|
| Selected time > 48h ahead | Out of window. Pin renders gray; `WeatherStats` shows dashes; `PlayabilityBadge` hides; copy "No forecast for this time." appears in CourtPanel. |
| Selected time before now (clock drift) | `useSelectedTime` auto-resets to `null` on read; UI shows "Now." |
| Forecast fetch failed and no cache | `forecast: null`. Pin gray; `useScoreFor` returns the server's `now` score as fallback. CourtPanel shows the existing "stale weather" copy. |
| Provider env = `'openweather'` | Server uses OWM; hourly slots interpolated between OWM's 3h samples. Same client behavior. |
| User scrubs while map is loading | Slider works; pins gray (no forecast yet); pin colors arrive when forecast resolves. |
| Selected time persists across PWA reload | Stored in localStorage; auto-resets to null on read if drift takes it out of window. |
| Open-Meteo daylight-saving boundary | Slot timestamps already account for local clock via Open-Meteo's `timezone=auto`. Slider day labels recompute from `Date()`. |

## Tests

### Server

- `server/test/openmeteo.test.ts` (new): canned Open-Meteo response → expected 48-slot `Forecast` shape.
- `server/test/openweather.test.ts` (new): canned OWM 5-day/3-hour response → expected 48-slot `Forecast` with correct interpolation between 3-hour samples (rain probability forward-filled, not interpolated).
- `server/test/forecast.test.ts` (new): provider parity — given canned matching responses, both modules produce equivalent (within ±1° / ±1 mph / ±2% rain) `Forecast` objects.
- `server/test/api.smoke.test.ts` (modified): existing 16 tests stay green; one or two updated to assert `forecast` is present on responses.
- `server/test/playability.test.ts`: unchanged from the wind-threshold work.

### Client

The client has no test suite yet. Manual verification per the implementation plan's smoke test checklist (drag slider, recolor pins, "Now" reset, MyCourts pill, out-of-window display).

## Rollout

1. Set `WEATHER_PROVIDER=open-meteo` on Railway's server service before deploy. (Open-Meteo is the default, but explicit setting makes intent visible.)
2. Deploy. First requests refill `weatherCache` with the new shape.
3. Cancel the scheduled agent at routine `trig_01KD12VvGPQnspTqWwfNDE13` (was: open Open-Meteo PR on 2026-05-11). The work it would have done is absorbed by this change.
4. Update the README's "In-flight / scheduled" section to reflect that Open-Meteo is now live.

## Out of scope

- **Cross-device sync of selected time.** Prefs all live in localStorage (per-device) like every other UI pref today.
- **Slider step finer than 2h.** Server stores hourly slots, so changing the step to 1h is a one-line UI change later — tracked but not in this round.
- **Range beyond 48h.** Open-Meteo can return up to 16 days for some fields, but UX gets crowded with more detents. Defer.
- **Per-sport time selection.** Single global time across all sports.
- **Server-side targeted-time fetching** (the rejected option #2 from brainstorming). All time picking happens client-side from the cached forecast.

## Open / deferred decisions

- **Score badge in slider readout** — whether to show a pin-aggregated badge in the slider header. Default for this round: omit. Only the readout text and "Now" button live in the slider header.
- **Slider visual on small phones** — the existing `MapLegend` and "+ Add a spot" FAB also live near the bottom-right. The plan should verify they don't overlap the slider on the smallest viewports; if they do, the FAB or legend may need a small upward shift. Tracked in the implementation plan.

## Assumptions

- The wind→BAD threshold + Round 11 tab UI work (commit `509dce1`) is in `main` before this work begins. The time-changer doesn't depend on it functionally, but both touch `client/src/stores/thresholds.ts`'s `useScoreFor` signature — concurrent edits would conflict.
- Open-Meteo's `forecast_hours=48` parameter behaves as documented (48 hourly entries from the current hour). If it returns 49 (inclusive of hour 0) or 48 from a different anchor, the module trims/pads to enforce exactly 48 slots starting at the current top-of-hour.
- The Railway service already has outbound network access to `api.open-meteo.com` (no allowlist configured today — confirmed by reading deploy config).
