# CourtCast — Setup

This walks you click-by-click from a fresh clone to a running app.

## 0. Prerequisites

- Node 20+ (`node --version`)
- npm 10+ (`npm --version`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- A Google account
- An OpenWeatherMap account (free)

## 1. Get the API keys

You need **three** keys total. Two come from Google Cloud, one from
OpenWeatherMap.

### 1a. Google Cloud — Maps + Places API key

1. Go to https://console.cloud.google.com/
2. Top bar → project picker → **New project** → name it `courtcast` → Create.
3. Make sure the new project is selected.
4. Left nav → **APIs & Services → Library**. Search for and **Enable** each:
   - **Maps JavaScript API**
   - **Places API** (the classic one is fine)
5. Left nav → **APIs & Services → Credentials → + Create Credentials → API key**.
6. Copy the key. Then click **Edit** on the new key:
   - Application restrictions → **HTTP referrers** → add `http://localhost:5173/*`
   - API restrictions → **Restrict key** → check **Maps JavaScript API**
     and **Places API**.
   - Save.
7. Save this key as `VITE_GOOGLE_MAPS_KEY` (in `client/.env`) and
   `GOOGLE_PLACES_KEY` (in `server/.env`). The same key works for both.

### 1b. Google Cloud — OAuth 2.0 Client ID

1. Same project. Left nav → **APIs & Services → OAuth consent screen**.
2. User type → **External** → Create.
3. Fill in:
   - App name: `CourtCast`
   - User support email: your email
   - Developer contact: your email
   - Save and continue through Scopes and Test users (you can skip details).
4. Back to **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
5. Application type → **Web application**. Name → `CourtCast Local`.
6. **Authorized JavaScript origins** → add `http://localhost:5173`.
7. **Authorized redirect URIs** can be left empty (we use Google Identity
   Services, not the redirect-based flow).
8. Create. Copy the **Client ID** (the long `…apps.googleusercontent.com`
   string). The client secret isn’t used by this MVP but Google generates it
   anyway.
9. Save the Client ID as both `VITE_GOOGLE_OAUTH_CLIENT_ID` (in
   `client/.env`) and `GOOGLE_OAUTH_CLIENT_ID` (in `server/.env`).

### 1c. OpenWeatherMap

1. Sign up at https://home.openweathermap.org/users/sign_up
2. After confirming your email, go to https://home.openweathermap.org/api_keys
3. Copy the default key (or generate a named one like `courtcast`).
4. Save as `OPENWEATHER_KEY` in `server/.env`.

> New OpenWeatherMap keys can take **a few minutes to ~2 hours** to
> activate. If `/api/weather` returns 401 right after signup, wait and try
> again.

## 2. Install + start Postgres

```bash
cd /path/to/CourtCast

# Install deps
npm install --prefix server
npm install --prefix client

# Bring up Postgres (background)
docker compose up -d postgres
```

## 3. Configure env

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
# Open both and paste the keys from step 1.
```

## 4. Migrate the database

```bash
npm run prisma:migrate --prefix server
# When prompted for a migration name, enter:  init
```

This creates the `User`, `Session`, `Court`, `SavedCourt`, `WeatherCache`,
and `PlacesCache` tables.

## 5. Run the app

Two terminals:

```bash
# Terminal 1 — API
npm run dev --prefix server
# → [courtcast] api listening on http://localhost:4000
```

```bash
# Terminal 2 — Web
npm run dev --prefix client
# → http://localhost:5173
```

Open http://localhost:5173.

## 6. Try it

1. Allow location when the browser prompts.
2. Pins should appear within a few seconds.
3. Tap a pin — the panel opens with weather + a GOOD/OK/BAD badge.
4. Click **Sign in** (top right) → Google → consent → you’ll land on **My Courts**.
5. Go back to the map, tap a pin, click **Save to My Courts**.
6. Go back to **My Courts** — your court is there with live weather.

## Tests

```bash
npm test --prefix server
```

Runs the playability scorer unit tests and the Express smoke tests
(no real API calls, no real DB).

## Troubleshooting

- **"Failed to load Google Maps"** — `VITE_GOOGLE_MAPS_KEY` is missing or
  the key isn’t restricted to `http://localhost:5173/*`. Check step 1a.
- **Sign-in popup blocked** — most browsers allow Google Sign-In but you may
  need to permit pop-ups for `localhost`.
- **`/api/courts` returns 502** — usually means Places API isn’t enabled on
  the key, or the project has no billing account. Google requires a billing
  account even for the free tier of Places. Add one in **Billing**.
- **`/api/weather` returns 502 with `401`** — OpenWeatherMap key isn’t live
  yet. Wait up to two hours after signup.
- **Postgres connection refused** — `docker compose ps` should show
  `courtcast-postgres` as `healthy`. If not, `docker compose logs postgres`.
- **Prisma client out of date** after schema edits — run
  `npm run prisma:generate --prefix server`.

## Resetting

```bash
docker compose down -v        # nukes Postgres data
rm -rf postgres-data
rm -rf server/prisma/migrations
```
