# CourtCast — Design Spec

**Date:** 2026-04-27
**Status:** Approved (verbal, this session)
**Owner:** aheedk

CourtCast is a tennis court weather + playability web app. A signed-in user
sees nearby courts on a map, can save courts to a personal list, and at any
moment can see — per court — whether conditions are GOOD, OK, or BAD for play
based on rain probability, wind, and temperature.

## Goals

- Let a user open the app, sign in with Google, and within seconds see a map
  of nearby tennis courts each tagged with a color-coded playability badge.
- Let users save courts to a "My Courts" list and view a dashboard of those
  courts with live weather and playability.
- Keep the backend the only holder of API keys and the only consumer of
  upstream API quota.

## Non-goals (MVP)

Reviews, ratings, photos, bookings, push notifications, multi-day forecast UI,
PWA / offline mode, social sharing, email/password auth, admin roles,
production deployment, comprehensive test coverage.

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  Client  (Vite + React)     │         │  Server  (Node + Express)    │
│  / map view                 │  HTTPS  │  /api/auth/google            │
│  /my-courts saved list      │ ──────► │  /api/courts                 │
│  /login                     │         │  /api/weather                │
│  Tailwind, Google Maps JS   │         │  /api/playability            │
│  Cookie session             │         │  /api/me/courts (CRUD)       │
└─────────────────────────────┘         └──────┬─────────────┬─────────┘
                                               │             │
                              ┌────────────────▼──┐  ┌───────▼──────────┐
                              │ Postgres (Prisma) │  │ External APIs    │
                              │ User              │  │ Google Places    │
                              │ Court (cache)     │  │ OpenWeatherMap   │
                              │ SavedCourt        │  │ (server-side     │
                              │ WeatherCache      │  │  cached)         │
                              │ PlacesCache       │  └──────────────────┘
                              └───────────────────┘
```

The Express server is the only component that holds Google Places and
OpenWeatherMap keys. The browser only ever uses the public Google Maps JS API
key (domain-restricted) and a Google OAuth client ID.

## Tech stack

- **Client:** Vite, React 18, TypeScript, TailwindCSS, React Router,
  TanStack Query, Zustand, Google Maps JavaScript API, Google Identity
  Services.
- **Server:** Node 20, Express 4, TypeScript, Prisma, `google-auth-library`,
  `cookie-parser`, `express-rate-limit`, `zod` for input validation,
  `ngeohash` for geohash keys.
- **Data:** PostgreSQL 16 via Docker Compose locally.

## API surface

```
Auth (cookie session)
  POST /api/auth/google    body { idToken }   200 { user }, sets cc_session
  POST /api/auth/logout                       204, clears cc_session
  GET  /api/me                                200 { user } | 401

Public
  GET  /api/courts?lat=&lng=&radius=          [{ placeId, name, lat, lng, address }]
  GET  /api/weather?lat=&lng=                 { tempF, windMph, rainPctNext2h, raw }
  GET  /api/playability?lat=&lng=             { score, weather }
  GET  /api/court/:placeId                    { court, weather, playability }

Auth-required
  GET  /api/me/courts                         [{ ...court, weather, playability }]
  POST /api/me/courts       body { placeId }  201 { savedCourt }
  DELETE /api/me/courts/:placeId              204
```

Errors are JSON `{ error: { code, message } }`. Bad input → 400; missing
session → 401; upstream failure → 502 with stale cache fallback when
available. All inputs validated with `zod`.

## Playability scoring

Inputs: `rainPctNext2h` (max precipitation probability across the next two
forecast hours, 0–100), `windMph` (current sustained wind).

```
GOOD  rainPctNext2h < 30  AND  windMph < 12
BAD   rainPctNext2h > 60
OK    everything else (rain 30–60, OR wind 12–18, OR rain<30 with wind 12–18)
```

Temperature is shown in the UI but does not affect the score (MVP). Pure
function in `server/src/playability.ts`, unit-tested with table-driven cases.

## Database schema (Prisma)

```prisma
model User {
  id           String       @id @default(cuid())
  googleId     String       @unique
  email        String       @unique
  name         String?
  avatarUrl    String?
  createdAt    DateTime     @default(now())
  savedCourts  SavedCourt[]
  sessions     Session[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([userId])
}

model Court {
  placeId   String       @id
  name      String
  lat       Float
  lng       Float
  address   String?
  fetchedAt DateTime     @default(now())
  savedBy   SavedCourt[]
}

model SavedCourt {
  userId    String
  placeId   String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  court     Court    @relation(fields: [placeId], references: [placeId])
  createdAt DateTime @default(now())
  @@id([userId, placeId])
  @@index([userId])
}

model WeatherCache {
  geohash   String   @id
  payload   Json
  fetchedAt DateTime @default(now())
}

model PlacesCache {
  geohash   String   @id
  payload   Json
  fetchedAt DateTime @default(now())
}
```

Courts are deduped globally by Google `placeId`; saved-list rows reference
that single Court row. Cache tables key by geohash so users in the same area
share a single upstream call.

## Auth flow

1. Browser renders Google Identity Services button → user consents → GIS
   returns an ID token (JWT signed by Google).
2. Frontend POSTs `{ idToken }` to `/api/auth/google`.
3. Server verifies the JWT against Google's JWKS using `google-auth-library`,
   asserting `aud` matches our OAuth client ID.
4. Server upserts `User` keyed by `googleId`, writes a `Session` row with
   30-day expiry, sets HTTP-only `cc_session=<sessionId>` cookie
   (Secure in prod, SameSite=Lax).
5. Auth middleware on protected routes reads the cookie, looks up the
   Session, attaches `req.user`, returns 401 if missing/expired.
6. `POST /api/auth/logout` deletes the Session row and clears the cookie.

No JWT in localStorage. Sessions are revocable by row deletion.

## Caching and quota protection

- `PlacesCache`: geohash precision 4 (~20km cell), TTL 7 days. Tennis courts
  do not move; long TTL is safe.
- `WeatherCache`: geohash precision 5 (~5km cell), TTL 10 minutes.
- Stale-while-revalidate: serve stale rows past TTL while a background
  refresh updates the row. Upstream failure with stale row in DB returns
  the stale row plus a `stale: true` flag rather than 502.
- `express-rate-limit`: 60 req/min per IP on `/api/courts` and
  `/api/weather`.
- TanStack Query on the client: `staleTime` 5 min for weather, 1 hour for
  courts. Query keys are normalized lat/lng (rounded to 3 decimals) so
  small position changes don't burst-fetch.

## Frontend structure

Routes:
- `/` Map view. Pulls user geolocation, fetches `/api/courts`, renders pins.
  Clicking a pin opens a side panel (desktop) or bottom sheet (mobile)
  showing court name, address, weather stats, big GOOD/OK/BAD badge, and
  a Save / Unsave button.
- `/my-courts` Saved-list dashboard. Vertical scroll list of `SavedCourtCard`
  components, each rendering name, address, weather mini-stats, badge.
  Tapping a card opens the same detail panel as the map view.
- `/login` Single Google Identity Services sign-in button + brief
  explanation of what we use the account for.

Component inventory:
- `MapView` — Google Maps wrapper. Manages markers and click handlers.
- `CourtPanel` — slide-in panel for court detail.
- `PlayabilityBadge` — color-coded pill (green/yellow/red).
- `WeatherStats` — temp / wind / rain row.
- `SavedCourtCard` — list item for `/my-courts`.
- `TopBar` — logo, nav, user avatar/menu.
- `AuthGate` — wraps protected routes; redirects to `/login`.

State: TanStack Query for all server data (handles dedup + cache + retries),
Zustand store for selected court id and panel-open boolean. No Redux.

Mobile-first Tailwind. Single design token set: green-500 (GOOD),
yellow-500 (OK), red-500 (BAD), neutral grays for UI chrome.

## Project layout

```
courtcast/
  README.md
  SETUP.md
  docker-compose.yml          # Postgres for local dev
  .gitignore
  .editorconfig
  package.json                # workspace root with concurrent dev script
  client/
    package.json
    vite.config.ts
    tailwind.config.ts
    index.html
    src/
      main.tsx
      App.tsx
      routes/
        MapPage.tsx
        MyCourtsPage.tsx
        LoginPage.tsx
      components/
        MapView.tsx
        CourtPanel.tsx
        PlayabilityBadge.tsx
        WeatherStats.tsx
        SavedCourtCard.tsx
        TopBar.tsx
        AuthGate.tsx
      lib/
        api.ts                # fetch wrapper
        queryClient.ts
      stores/
        ui.ts                 # Zustand
  server/
    package.json
    tsconfig.json
    prisma/
      schema.prisma
    src/
      index.ts                # express bootstrap
      routes/
        auth.ts
        courts.ts
        weather.ts
        playability.ts
        meCourts.ts
      lib/
        prisma.ts
        cache.ts              # geohash cache helpers
        google.ts             # Places + ID token verifier
        openweather.ts
        playability.ts
      middleware/
        auth.ts
        errors.ts
    test/
      playability.test.ts
      api.smoke.test.ts
  docs/
    superpowers/
      specs/
        2026-04-27-courtcast-design.md
```

## Required external setup (user provides)

1. Google Maps JavaScript API key, Places API enabled, restricted to
   `localhost:5173` in dev. Stored as `VITE_GOOGLE_MAPS_KEY` (client) and
   `GOOGLE_PLACES_KEY` (server, can be the same key).
2. Google OAuth 2.0 Client ID + Secret (Web application, authorized
   origins `http://localhost:5173`). `VITE_GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
3. OpenWeatherMap API key (free tier). `OPENWEATHER_KEY`.
4. Docker Desktop running so `docker compose up postgres` works.

`SETUP.md` will document each of these step by step.

## Testing

- Unit: `playability.ts` table-driven test covering boundaries (29/30/31,
  59/60/61, wind 11/12/18/19, etc.).
- Smoke: spin the express app, hit each public endpoint with mocked
  upstream fetch, assert shape and status. No live API calls in CI.
- Manual: full user journey (sign in, see map, save court, view dashboard,
  sign out) documented in `SETUP.md`.

## Risks and open questions

- **Google Places API cost.** "Nearby Search" is a billable call. The 7-day
  geohash cache should keep cost negligible for a personal-scale MVP, but
  if usage grows we should switch to the new Places API (New) which has a
  free SKU for `searchNearby` text-only.
- **Geolocation permission denial.** Default fallback: center map on a
  configurable default lat/lng (env var) and let the user pan.
- **Rate limit on OpenWeatherMap free tier** is 60 calls/min; the 10-minute
  geohash cache stays well under that.

## Out of scope (re-stated)

If any of the items in the non-goals list are requested later, they each
warrant their own design + plan cycle.
