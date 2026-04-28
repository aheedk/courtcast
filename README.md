# CourtClimate

Tennis court weather + playability web app. Sign in with Google, see nearby
courts on a map, save your regulars, and at any moment know whether
conditions are **GOOD**, **OK**, or **BAD** for play based on rain
probability and wind.

## Stack

- **Client** — Vite + React + TypeScript + TailwindCSS + Google Maps
- **Server** — Node + Express + TypeScript + Prisma
- **Data** — PostgreSQL (Docker locally)
- **Auth** — Google Sign-In (Identity Services) → server-side ID token
  verification → HTTP-only cookie session

## Quick start

```bash
# 1. Install deps
npm install --prefix server
npm install --prefix client

# 2. Bring up Postgres
docker compose up -d postgres

# 3. Configure env (see SETUP.md for how to get the keys)
cp server/.env.example server/.env
cp client/.env.example client/.env
# ... fill in the values

# 4. Migrate DB
npm run prisma:migrate --prefix server

# 5. Run dev (two terminals)
npm run dev --prefix server     # http://localhost:4000
npm run dev --prefix client     # http://localhost:5173
```

Full step-by-step (including how to get each API key) is in
[`SETUP.md`](./SETUP.md). Production deploy (Netlify + Railway) is in
[`DEPLOY.md`](./DEPLOY.md). Design rationale is in
[`docs/superpowers/specs/2026-04-27-courtcast-design.md`](./docs/superpowers/specs/2026-04-27-courtcast-design.md).

The frontend is also a PWA — add it to your phone's home screen from
Safari (Share → Add to Home Screen) or Chrome (⋮ → Install app) and it
runs full-screen like a native app.

## Project layout

```
client/                Vite + React frontend
server/                Express + Prisma backend
docker-compose.yml     Postgres for local dev
SETUP.md               Click-by-click setup instructions
docs/                  Design specs
```

## Playability scoring

```
GOOD   rain probability < 30%   AND   wind < 12 mph
BAD    rain probability > 60%
OK     everything else
```
