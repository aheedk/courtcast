# CourtClimate — Court Status Reports Design

## Goal

Let signed-in users post structured, community-shared updates about a court ("3+ open · Dry") that other users see in the court panel, on saved-court cards, and as a small badge on the map pin. Reports auto-hide after 24 hours.

Reports are **informational only** — they do not affect the weather-driven playability score or pin color. Pin color stays driven by the forecast and per-user thresholds (today's behavior).

## User stories

- "I'm at the park, three courts are open and dry — let me tell everyone." User taps the pin → CourtPanel → **Report status** → picks "3+" and "Dry" → submit. Anyone opening that pin in the next 24h sees the update.
- "Are any of my regular spots actually playable right now?" User opens My Courts. Each saved card shows the latest report ("None open · Wet · 14 min ago") under the playability badge, or nothing if there's no recent report.
- "Which of these pins has community info?" User pans the map. Pins with a fresh report (<24h) show a small dot/icon badge in the corner; tapping opens the panel for details.
- "I reported wrong, let me fix it." User submits a new report from the panel. Their previous report (within the last 10 minutes) is overwritten; older reports are superseded by the new one (latest wins).

## Architecture

Three pieces:

1. **Server.** New `CourtReport` table + three routes (submit, fetch latest for one place, batch-fetch latest for many places). 24h freshness applied at read time (no background sweep needed).
2. **Client surfaces.** A new `<ReportStatusForm />` (chip selectors + Submit) and a new `<LatestReport />` display block, both used inside `CourtPanel`. `SavedCourtCard` gets a compact one-liner. `MapView` adds a corner badge to pins that have a fresh report.
3. **Client data.** A single React Query for the batch endpoint, keyed on the visible pin set, hydrates both the map badges and the saved-cards list. The court panel makes its own per-place query.

## Field values

Hard-coded enums. No free text, no admin UI to add values — adding/removing values is a code change so the back end and front end stay in sync.

**Open courts** (4 values):
| code | label |
|---|---|
| `none` | None |
| `one` | 1 |
| `two` | 2 |
| `three_plus` | 3+ |

**Conditions** (3 values for MVP):
| code | label |
|---|---|
| `dry` | Dry |
| `little_wet` | Little wet |
| `unplayable` | Unplayable |

Both fields are required on submit. `Unplayable` is the catch-all for snow, debris, damage, closed gate, etc. More granular options (wet, snow/ice, debris) can be added later if users ask.

## Data model — server

New Prisma model:

```prisma
model CourtReport {
  id         String   @id @default(cuid())
  placeId    String
  userId     String
  openCourts String   // 'none' | 'one' | 'two' | 'three_plus'
  condition  String   // 'dry' | 'little_wet' | 'unplayable'
  createdAt  DateTime @default(now())

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  court Court @relation(fields: [placeId], references: [placeId])

  @@index([placeId, createdAt(sort: Desc)])
  @@index([userId, placeId, createdAt(sort: Desc)])
}
```

Add reverse relations on `User` (`reports CourtReport[]`) and `Court` (`reports CourtReport[]`).

Schema uses `String` for the two enum fields (matching existing `SavedCourt.sport` precedent). Validation lives in `server/src/lib/reports.ts` against a frozen set of values; invalid inputs reject with HTTP 400.

The 24h TTL is applied at read time: `WHERE createdAt > now() - interval '24 hours'`. No background sweep — old rows persist on disk for analytics/audit but are invisible to the API.

The `[placeId, createdAt DESC]` index makes "latest report for place X" a single index lookup. The `[userId, placeId, createdAt DESC]` index supports the 10-minute overwrite logic.

## Server — endpoints

All three under a new `server/src/routes/reports.ts`.

### `POST /api/places/:placeId/reports`

- Auth required (`requireUser` middleware, same as saved-courts routes).
- Body: `{ openCourts: string, condition: string }`. Both required.
- Validates both values against the frozen enum set. Returns 400 on invalid.
- Verifies the `placeId` exists in the `Court` table. Returns HTTP 404 with `{ code: 'COURT_UNKNOWN' }` if not — matches the existing `POST /api/me/courts` pattern (you have to open the court at least once before you can act on it).
- **Rate limit / overwrite:** if the same `(userId, placeId)` posted a report in the last 10 minutes, that row is `UPDATE`-d in place; otherwise a new row is inserted. This keeps "user fat-fingered, fixes it" cheap and avoids stacking 20 self-reports in a row.
- Returns the persisted `CourtReport` JSON (id, placeId, openCourts, condition, createdAt — no userId leaked to the client, no name/avatar).

### `GET /api/places/:placeId/report`

- No auth required (reads are public).
- Returns the latest report for the place within the last 24h, or HTTP 204 No Content when none.
- Response shape:
  ```ts
  { openCourts: string, condition: string, createdAt: string }
  ```

### `POST /api/places/reports/batch`

- No auth required.
- Body: `{ placeIds: string[] }` with a server-side cap (default 50, returns 400 above).
- Returns `{ reports: Record<string, Report | null> }` — every requested id is a key, value is the latest within 24h or `null`. POST (not GET) because the id list can be long and varies per map view.

The batch endpoint is what makes the map-pin badge cheap. Without it, the map would fire one request per visible pin.

## Data model — client

New shared type in `client/src/types.ts`:

```ts
export type OpenCourts = 'none' | 'one' | 'two' | 'three_plus';
export type CourtCondition = 'dry' | 'little_wet' | 'unplayable';

export interface CourtReport {
  openCourts: OpenCourts;
  condition: CourtCondition;
  createdAt: string;  // ISO8601
}

export const OPEN_COURTS_LABEL: Record<OpenCourts, string> = {
  none: 'None', one: '1', two: '2', three_plus: '3+',
};
export const CONDITION_LABEL: Record<CourtCondition, string> = {
  dry: 'Dry', little_wet: 'Little wet', unplayable: 'Unplayable',
};
```

`Court`, `SavedCourtDetail`, `CourtDetail` are **not** extended with an embedded `report` field — reports live in their own queries so the map's `/api/courts` payload stays unchanged and reports can refresh on a different cadence than the forecast.

## Client — queries

Two new React Query keys in `client/src/lib/queryClient.ts`:

```ts
export const queryKeys = {
  // ... existing
  courtReport: (placeId: string) => ['courtReport', placeId] as const,
  courtReportsBatch: (placeIds: string[]) =>
    ['courtReportsBatch', [...placeIds].sort().join(',')] as const,
};
```

- `courtReport(placeId)` — used by `CourtPanel`. `staleTime: 60_000` (1 min). Refetches on mount/window focus.
- `courtReportsBatch(placeIds)` — used by `MapPage` for pin badges and by `MyCourtsPage` for saved cards. `staleTime: 60_000`. Re-keys when the visible pin set changes, so panning the map naturally refetches for the new viewport.

Both queries return a `CourtReport | null` (or a record of them). Components decide rendering.

## Client — UI

### `<ReportStatusForm />` (new)

Small inline form inside `CourtPanel`, rendered between the existing save/list buttons and the bottom of the panel. Closed by default — shown only when the user taps **Report status**.

Layout (chip-style, two rows):

```
Open courts:   [ None ]  [ 1 ]  [ 2 ]  [ 3+ ]
Conditions:    [ Dry ]  [ Little wet ]  [ Unplayable ]
                            [ Submit ]
```

- Chips are styled like the existing `SportChips` component (pill, border, accent fill on selected). Single-select per row.
- Submit is disabled until both rows have a selection.
- On submit: optimistic update — local cache for the place gets the new report immediately; mutation fires; on error, rollback + small toast "Couldn't submit, try again." (Match the existing `useMutation` error pattern from `CourtPanel`'s save/unsave.)
- If the user is signed out: the **Report status** button is replaced with a small line "Sign in to report status." linking to `/login`. Same pattern as the existing "Sign in to save this court."

### `<LatestReport />` (new)

Renders the latest report for a place when one exists within the 24h window:

```
Status   Many open · Dry         12 min ago
```

- Two-column layout: left = `${OPEN_COURTS_LABEL[openCourts]} open · ${CONDITION_LABEL[condition]}`; right = relative time ("just now" / "Nm ago" / "Nh ago"). Falls back to a date when older than 24h, though the server already filters those out.
- When no recent report: renders nothing (the surrounding section header is also hidden). No "—" or "no reports yet" copy in the panel — keeps the panel quiet when the community is sparse.
- Compact variant for `SavedCourtCard`: same line, smaller text, no label prefix.

### `CourtPanel` integration

Inside `CourtPanel.tsx`, between the `WeatherStats` block and the save/list buttons:

```tsx
{detail.data && (
  <>
    <LatestReport placeId={placeId} compact={false} />
    {user ? (
      <ReportStatusForm placeId={placeId} />
    ) : (
      <p className="...">Sign in to report status.</p>
    )}
  </>
)}
```

The latest-report block renders nothing if there's no fresh report, so panels for unreported courts look exactly as they do today plus the **Report status** button.

### `SavedCourtCard` integration

A compact `<LatestReport placeId={card.placeId} compact />` line under the existing playability badge. Renders nothing when no fresh report — saved cards for quiet courts look unchanged.

Saved cards read from the shared `courtReportsBatch` query keyed on all the user's saved placeIds (built in `MyCourtsPage` and passed down, or read directly from the query cache).

### `MapView` pin badge

`PinForMap` gains a `hasFreshReport: boolean` field. `MapView` renders a small filled circle (8px) in the top-right of each saved-star or playability-circle marker when `hasFreshReport` is true.

For Google Maps `Symbol`-based markers, the badge isn't expressible as a property of the existing icon — instead we layer a tiny secondary `<Marker>` offset by ~10px x / -10px y from the same lat/lng, using a small SVG icon (`anchor: { x: -10, y: 10 }`). This keeps each marker as a `<Marker>` element (no Overlay subclassing).

The badge has one style (e.g. solid `#3b82f6` blue, white outline) — no encoding of "good vs. bad report." Tap the pin to see what the report actually says.

### `MapPage` wiring

```ts
const visiblePlaceIds = useMemo(
  () => [...placesPins.map(c => c.placeId), ...savedForSport.map(s => s.placeId)],
  [placesPins, savedForSport],
);
const reports = useQuery({
  queryKey: queryKeys.courtReportsBatch(visiblePlaceIds),
  queryFn: () => api.fetchReportsBatch(visiblePlaceIds),
  enabled: visiblePlaceIds.length > 0,
  staleTime: 60_000,
});
```

Then build `pins` with `hasFreshReport: !!reports.data?.[c.placeId]`.

If `reports` is still loading, badges render nothing — they pop in once the response arrives, no skeleton.

## Anti-abuse (MVP)

- **Auth required** for `POST`. No anonymous reports.
- **One row per (user, place) within 10 minutes** — second submit within that window updates the existing row. Prevents accidental dupes and reduces churn.
- **No free text.** Dropdown-only, no moderation surface.
- **No geofencing.** Anyone signed in can report any court. Acceptable for an MVP at the project's expected scale (personal/small-friends-list usage today). If abuse appears, the follow-up is a geo proximity check on `POST` (require user GPS to be within ~150m of the court's lat/lng).
- **Rate limit globally:** at most 30 reports per user per hour across all places, returns HTTP 429 above. Cheap to add via an in-memory counter (single Railway dyno) and prevents an authed user from spamming.

No user attribution is exposed on read endpoints — the response intentionally omits the reporter's name/avatar so reports feel like community signal, not social posts, and so a single user can't be singled out for harassment.

## Edge cases

| Case | Behavior |
|---|---|
| User submits but is signed out | Submit button disabled / hidden; "Sign in to report status" link shown instead. |
| User submits same place twice in 1 min | Second submit `UPDATE`s the first row; UI shows the new values + a fresh timestamp. |
| User submits same place after 11 min | Second submit `INSERT`s a new row. Latest wins on read. |
| Place has 0 reports in last 24h | `GET /report` returns 204; `<LatestReport />` renders nothing; pin has no badge. |
| Place has a 30h-old report | Server filters it out; UI is same as 0 reports. The row stays in the DB. |
| Network fails mid-submit | Optimistic update rolls back; small inline error appears under the form. |
| User reports against a custom court (`isCustom: true`) | Allowed. Custom courts have `placeId` rows already; same FK works. |
| Two users submit simultaneously | DB resolves both inserts; latest `createdAt` wins on read. |
| Visible pin set changes (user pans) | Batch query re-keys; new placeIds fetched; old badges may briefly persist until refetch settles (no flicker because React Query keeps last data while new query loads). |
| `placeIds.length > 50` on batch | Server returns 400; client splits into 50-id chunks (helper in `client/src/lib/api.ts`). |
| Server is down | Court panel still renders; the report section just doesn't show. No error toast (badges are not load-bearing). |

## Tests

### Server

- `server/test/reports.test.ts` (new):
  - validation: rejects unknown `openCourts` and `condition` values
  - 24h freshness: insert a 23h-old row → returned; 25h-old → omitted
  - 10-min overwrite: two `POST`s within 10 min → one row in DB, latest values
  - 10-min boundary: two `POST`s 11 min apart → two rows
  - batch endpoint: mix of placeIds (some with reports, some without, some only-stale) returns the expected shape
  - rate limit: 31 POSTs within an hour returns 429 on the 31st
- `server/test/api.smoke.test.ts`: extend with one happy-path POST → GET for reports.

### Client

The client has no test suite (per existing time-changer spec). Manual smoke-test checklist in the implementation plan: submit a report, see it on the panel, see the badge appear on the pin, refresh — still there, change to another sport — still there, wait 24h (or hack the DB timestamp) — gone.

## Rollout

1. **Prisma migration.** The repo's deploy currently uses `prisma db push --accept-data-loss` per `DEPLOY.md` §1d; the new `CourtReport` table will be created on the next Railway boot. No data loss (additive change).
2. **Deploy server first.** Endpoints become live but unused. Existing app continues to work.
3. **Deploy client.** New UI surfaces appear. First reports start populating the table.
4. **Monitor for the first week.** If abuse / nonsense reports appear, tighten anti-abuse (geofencing).

## Out of scope (deferred)

- **User attribution / social signal.** No avatars or names on reports for MVP. Adds moderation pressure and changes the feel from "community signal" to "social post."
- **Down-voting / flagging.** No way to dispute a report. Closest equivalent: another user posts a contradicting report, which becomes the latest.
- **History timeline** per place ("3 reports in last 6h"). Server has the data; UI doesn't surface it yet.
- **Push notifications** when a watched court flips to playable. Deferred until reports prove valuable.
- **Reports influencing the playability score.** Pin color and `PlayabilityBadge` stay weather-driven.
- **Geofencing** the submit endpoint. Hold until abuse is observed.
- **Multiple selections per field** ("Wet + Debris"). Single-select for now — `Unplayable` is the catch-all.
- **Configurable expiry** per field. Single 24h TTL applied uniformly.
- **Admin moderation UI.** No way to delete bad reports today other than direct DB access.
- **Quotas per place** ("only the first 10 reports/hour count"). Global per-user rate limit instead.

## Open / deferred decisions

- **Condition list length.** Settled on 3 values for MVP. Add `Wet`, `Snow / ice`, `Debris` later if users ask. `Unplayable` is the catch-all today.
- **Badge color encoding.** MVP uses one flat color (blue) for "has a report." Could later encode "freshly playable" (green) vs. "freshly unplayable" (red) directly on the pin. Adds a state-table to maintain and may conflict with the weather-based pin color. Defer.
- **Section header copy.** Proposed: section is a `Report status` button that toggles to "Hide" once open. Plain enough. The displayed-report block carries an implicit label via its layout (the `Status` left-cell). No standalone heading.

## Assumptions

- Open-Meteo / weather pipeline (recently shipped + tuned) is stable. This work does not touch the forecast path.
- Railway runs a single server dyno today, so an in-memory rate-limit counter is correct without coordination. If we scale horizontally, the counter moves to Postgres (a new `RateLimit` table) or Redis.
- Prisma's `onDelete: Cascade` on `User → CourtReport` is acceptable — if a user deletes their account (no UI for this today), their past reports go away. Once moderation/history is built, this should switch to `SetNull` and keep the rows.
- A user reporting against a place has already opened it on the map, so the `Court` row exists. The report endpoint enforces this with a 404, matching `POST /api/me/courts` — no new "ensure" helper is needed.
