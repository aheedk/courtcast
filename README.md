# CourtClimate

Tennis / pickleball / basketball / etc. court weather + playability web
app and PWA. Sign in with Google, browse nearby courts on a map, save
your regulars into per-sport tabs and named lists, and at any moment
know whether conditions are **GOOD**, **OK**, or **BAD** for play based
on rain probability and wind — with **per-sport, user-tunable
thresholds**.

## Status (as of last commit)

- **Live in production** at `https://courtclimate.com` (custom domain)
  and the Railway-generated `*.up.railway.app` URL
- **Single Railway service** — Express serves the built client at the
  root and the API at `/api/*`. Postgres is a Railway add-on. Netlify
  is no longer used; the previous `netlify.toml` and `BACKEND_URL`
  proxy were dropped in commit `e1c65d8` (2026-04-27).
- **Repo:** `github.com/aheedk/courtcast` — note the disk path
  (`/Users/aheedkamil/projects/CourtCast`) and repo name still say
  *courtcast*, but the user-facing brand is **CourtClimate** (rebranded
  in commit `0055f9a`).
- **Working branch:** `main`. All commits go directly to main; no PR
  workflow set up yet. The local push is direct.
- **Deploy:** Railway auto-redeploys on push to `main`.

## Stack

| Layer | Tech |
|---|---|
| Client | Vite + React 18 + TypeScript + TailwindCSS, TanStack Query, Google Maps JS + Places, vite-plugin-pwa |
| Server | Node 20 + Express + TypeScript + Prisma |
| DB | PostgreSQL (Docker locally; Railway-managed in prod) |
| Auth | Google Sign-In (Identity Services) → server-side ID token verification → HTTP-only `cc_session` cookie |
| Weather | OpenWeatherMap (5-day/3-hour forecast, geohash-5 cached 10 min) |
| Places | Google Maps Places Nearby Search (geohash-4 cached 7 days) |

## Features (rough chronological build order)

| Round | What landed |
|---|---|
| 1 | MVP — map + nearby tennis courts + weather + GOOD/OK/BAD score + Google sign-in + saved courts list |
| 2 | PWA (`vite-plugin-pwa` with manifest, icons, service worker) |
| 3 | Map exploration — search bar with **Place autocomplete** + **Keyword filter** modes; sport chips on map; **Custom pin drop** via "+ Add a spot" FAB |
| 4 | My Courts gets sport tabs (All / Tennis / Basketball / Pickleball); pickleball added; SavedCourt PK gains `sport` so the same court can be saved per-sport |
| 5 | **Per-user nicknames** on saved courts; **user-defined Custom lists** (Spotify-style); 5th `📝 Custom` tab on My Courts |
| 6 | "Add to list" trigger on `CourtPanel` (auto-saves to current sport if needed) |
| 7 | `'custom'` becomes a 4th sport so saving in custom mode doesn't pollute the other sport tabs |
| 8 | Map pins **colored by playability** (green / yellow / red / gray-unknown); saved courts render as **stars** instead of circles |
| 9 | **`/settings` page** — account info, **playability threshold sliders**, default sport, sign out (avatar in top bar now opens Settings instead of signing out) |
| 10 | **Sport toggles** — built-in list expanded to 9 sports (added soccer / volleyball / football / baseball / hockey); user picks which subset to show as tabs/chips via Settings |
| 11 | **Per-sport thresholds** — tab row in Settings → Playability so each sport can have its own GOOD/OK/BAD rules. The score on a card uses `court.sport`'s thresholds; the score on the map and CourtPanel uses the current chip's thresholds. |

UI polish along the way: dark star outlines for visibility, mobile
top-bar fix (no wrapping), `100dvh` fix so the map fills the viewport
on iOS, hard-reload sign-out for reliability.

## Local dev

### Prereqs
- Node 20+, npm 10+
- Docker Desktop (for local Postgres)

### One-time setup
```bash
# Install deps
npm install --prefix server
npm install --prefix client

# Postgres
docker compose up -d postgres

# Env vars (see SETUP.md for how to obtain each key)
cp server/.env.example server/.env
cp client/.env.example client/.env
# ... fill in the keys (Google Maps, Google OAuth, OpenWeatherMap)

# Schema
cd server && npx prisma db push --accept-data-loss --skip-generate
```

### Day-to-day
```bash
# Two terminals
npm run dev --prefix server   # http://localhost:4000
npm run dev --prefix client   # http://localhost:5173 — open this
```

### Tests
```bash
npm test --prefix server   # 38 tests as of last commit
```

## Production env

These need to be set on the Railway server service:

| Key | Source / value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Reference variable from the Postgres add-on |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CLIENT_ORIGIN` | `https://courtclimate.com` (also accepts `*.up.railway.app`) |
| `GOOGLE_OAUTH_CLIENT_ID` | Same as client side |
| `GOOGLE_PLACES_KEY` | **Server-side key** with no application restriction (browser-restricted key won't work for server fetch) |
| `OPENWEATHER_KEY` | OWM free-tier key |

The client-side env vars (`VITE_GOOGLE_MAPS_KEY`,
`VITE_GOOGLE_OAUTH_CLIENT_ID`) are baked into the Vite build — set
them on Railway's *server* service since the build runs there.

## Project layout

```
client/                          Vite + React frontend
  src/
    routes/                      MapPage, MyCourtsPage, SettingsPage, LoginPage
    components/                  MapView, CourtPanel, SearchBar, SportChips,
                                 SavedCourtCard, CardMenu, RenameInput,
                                 AddToListMenu, AddSpotFab, AddSpotSheet,
                                 ListsTab, ListView, CustomSavesSection,
                                 PlayabilityBadge, WeatherStats, MapLegend,
                                 TopBar, AuthGate
    stores/                      sport (current chip), enabledSports,
                                 thresholds (per-sport), ui (selected court)
    hooks/                       useGeolocation
    lib/                         api (fetch wrapper), playability
                                 (scoreFromThresholds), queryClient,
                                 env

server/                          Express + Prisma backend
  prisma/schema.prisma           User, Session, Court, SavedCourt, List,
                                 ListMember, WeatherCache, PlacesCache
  src/
    routes/                      auth, courts, weather, playability, court,
                                 meCourts (saved + nickname + custom),
                                 meLists (lists CRUD + members)
    lib/                         google (Places + ID token verifier),
                                 openweather, playability (scoring),
                                 sport (keyword library), cache (geohash),
                                 prisma, env
    middleware/                  auth (loadSession + requireAuth), errors
    app.ts                       Express bootstrap; serves client/dist as
                                 static SPA in prod (the bit that lets us
                                 ditch Netlify)
  test/                          playability, sport, api.smoke (vitest)

docs/superpowers/
  specs/                         One design doc per feature round
  plans/                         One implementation plan per round

SETUP.md                         Click-by-click for getting all 3 API keys
                                 (Google Maps, Google OAuth, OWM)
DEPLOY.md                        Old Netlify + Railway flow — partly stale
                                 since the move to single-Railway. Useful
                                 for the GCP origin/referrer steps.
```

## Important gotchas

- **Repo + on-disk path is `courtcast`**, brand is `CourtClimate`. Don't
  rename the repo; renames are disruptive (Railway/GitHub integration,
  CI, history). Rename was done as a brand-only change in commit
  `0055f9a`.
- **Schema is managed by `prisma db push`**, not migrate. The server's
  `start` script runs `npx prisma db push --accept-data-loss
  --skip-generate` on every boot. Fast schema iteration; no migration
  history. When this graduates, generate a baseline migration via
  `prisma migrate diff --from-empty --to-schema-datamodel`.
- **Two Google API keys.** One *browser-restricted* (HTTP referrer →
  `localhost:5173/*` + `https://courtclimate.com/*`) for Maps JS in the
  client. One *server-side, no application restriction* (Places API
  only) for the Express server's `fetchNearbyCourts`. The earlier
  attempt to forge a `Referer` header (commit `1e86ae3`) didn't work
  reliably and was reverted in `0055f9a`.
- **Server-side weather fetch on every `/api/courts`** — geohash-5
  cached, so most pins in a small radius hit the cache. First-load
  in a new area: ~3 OWM calls.
- **All UI prefs in `localStorage`** — sport chip, enabled sports,
  per-sport thresholds, anything in Settings. Per-device, no sync. If
  cross-device sync becomes an ask, promote to a `UserSettings` table.
- **The "Custom" sport** (`'custom'`) is special: empty Places keyword,
  so server skips the Places call. The map shows zero pins until the
  user types a search keyword or drops a custom pin.
- **`100dvh`** instead of `100vh` on `MapPage` and `LoginPage` so the
  map fills the actual viewport on iOS Safari (URL bar collapses).

## In-flight / scheduled

- **Open-Meteo provider — live.** As of 2026-04-29, the default weather
  provider is Open-Meteo (hourly, free, no API key). Set
  `WEATHER_PROVIDER=openweather` to fall back to OWM. The previously
  scheduled remote agent for adding Open-Meteo (routine
  `trig_01KD12VvGPQnspTqWwfNDE13`, fire date 2026-05-11) has been
  canceled because this work absorbs it.
- **Time-changer — live.** Bottom-of-map slider on the MapPage and a
  time-pill / bottom-sheet on My Courts let users scrub the next 48h
  in 2-hour increments. Pin colors, court panel, and saved-card scores
  all reflect the selected time.

## Known issues

None tracked at the moment. If something breaks, check Railway deploy
logs and `/api/health` first.

## Where to look for design rationale

- Per-feature spec docs in [`docs/superpowers/specs/`](./docs/superpowers/specs/)
- Per-feature implementation plans in [`docs/superpowers/plans/`](./docs/superpowers/plans/)

The most recent (and most impactful) reads:

- [`2026-04-28-courtclimate-per-sport-thresholds.md`](./docs/superpowers/specs/2026-04-28-courtclimate-per-sport-thresholds.md) — most recent
- [`2026-04-28-courtclimate-sport-toggles.md`](./docs/superpowers/specs/2026-04-28-courtclimate-sport-toggles.md)
- [`2026-04-28-courtclimate-settings-page.md`](./docs/superpowers/specs/2026-04-28-courtclimate-settings-page.md)
- [`2026-04-28-courtclimate-pin-coloring.md`](./docs/superpowers/specs/2026-04-28-courtclimate-pin-coloring.md)
- [`2026-04-27-courtcast-design.md`](./docs/superpowers/specs/2026-04-27-courtcast-design.md) — original MVP design

## Default playability rule (server-side baseline)

```
GOOD   rain probability < 30%   AND   wind < 12 mph
BAD    rain probability >= 60%
OK     everything else
```

Users can tune these per-sport in Settings → Playability thresholds.
The server still computes scores using the defaults as a fallback for
when raw weather is null/unavailable.
