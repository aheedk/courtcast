# Deploying CourtCast

The MVP deploys as two pieces:

- **Backend + Postgres → [Railway](https://railway.com)**
- **Frontend (PWA) → [Netlify](https://www.netlify.com)**

Netlify rewrites `/api/*` to the Railway backend so cookies stay
same-origin and there's no CORS configuration to maintain.

You'll need: a GitHub account (with this repo pushed), a Railway account,
a Netlify account, and the same Google Cloud + OpenWeatherMap keys from
[`SETUP.md`](./SETUP.md). The Google keys/origins need additional values
added for the production domains.

---

## 1. Deploy backend + Postgres to Railway

### 1a. Create the project

1. https://railway.com → **New Project** → **Deploy from GitHub repo** →
   pick `aheedk/courtcast`. (Authorize Railway to read your repo if asked.)
2. Railway scans the repo and creates a service. Railway will detect both
   `client/` and `server/`. Open the service, go to **Settings → Source →
   Root Directory** and set it to **`server`**.
3. Settings → Build → Builder will auto-pick **Nixpacks**. The build and
   start commands come from `server/railway.json` — leave them blank to
   inherit, or paste if Railway asks:
   - Build: `npm ci && npm run build`
   - Start: `npm run start`

### 1b. Add Postgres

1. In the same project, click **+ New → Database → Add PostgreSQL**.
2. Railway provisions Postgres and exposes a `DATABASE_URL` variable in
   the Postgres service's variables tab.
3. Open your **server** service → **Variables** → click **+ New Variable
   → Add Reference** → pick `Postgres.DATABASE_URL`. This injects the URL
   without copy-pasting credentials.

### 1c. Set the rest of the env vars

On the **server** service → **Variables**, add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `CLIENT_ORIGIN` | (fill after Netlify deploy — e.g. `https://courtcast.netlify.app`) |
| `SESSION_SECRET` | a long random string (`openssl rand -hex 32`) |
| `GOOGLE_OAUTH_CLIENT_ID` | same as your `SETUP.md` value |
| `GOOGLE_PLACES_KEY` | same as your `SETUP.md` value |
| `OPENWEATHER_KEY` | same as your `SETUP.md` value |

Leave `PORT` unset — Railway injects it.

### 1d. Generate a public URL

Settings → **Networking → Generate Domain**. Railway gives you something
like `courtcast-server-production.up.railway.app`. Copy this — you'll
paste it into Netlify in step 2.

The first deploy will run `prisma migrate deploy` automatically (it's in
the `start` script), so the schema is applied on first boot.

### 1e. Smoke test

`https://YOUR-RAILWAY-URL/api/health` should return `{"ok":true}`. If
not, check the deploy logs in Railway.

---

## 2. Deploy frontend to Netlify

### 2a. Connect the repo

1. https://app.netlify.com → **Add new site → Import an existing project**
   → **GitHub** → pick `aheedk/courtcast`.
2. Netlify reads `client/netlify.toml`, which sets:
   - **Base directory:** `client`
   - **Build command:** `npm run build`
   - **Publish directory:** `client/dist`
   - **Node version:** 20
3. Don't deploy yet — set env vars first (next step).

### 2b. Set env vars

**Site settings → Environment variables → Add a variable.** Add:

| Key | Value |
|---|---|
| `VITE_GOOGLE_MAPS_KEY` | same as your `SETUP.md` value |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | same as your `SETUP.md` value |

The Railway URL is hardcoded in `client/netlify.toml` rather than
injected at build time — if you ever change it, edit that file and
push.

### 2c. Deploy

**Deploys → Trigger deploy → Deploy site**. Wait ~1 minute. You'll get
a URL like `https://wonderful-name-12345.netlify.app`. Optionally rename
it under **Site settings → Site information → Change site name** to
something like `courtcast`.

### 2d. Wire it back to Railway

Go back to Railway → server service → Variables → set
`CLIENT_ORIGIN` to your Netlify URL (e.g. `https://courtcast.netlify.app`).
Redeploy the Railway service so the change takes effect.

---

## 3. Update Google Cloud restrictions for production

Both keys/clients you created in `SETUP.md` are restricted to `localhost`.
You need to add your Netlify domain to each:

### 3a. Google Maps + Places API key

Console → **APIs & Services → Credentials** → click your API key:

- **Application restrictions → HTTP referrers** → **Add an item** →
  `https://YOUR-NETLIFY-URL/*`
- Save.

### 3b. OAuth Client ID

Console → **APIs & Services → Credentials** → click your OAuth Client ID:

- **Authorized JavaScript origins → Add URI** → `https://YOUR-NETLIFY-URL`
- Save.

You may also want to **publish** the OAuth consent screen (Console →
**OAuth consent screen → Publish app**) so you don't have to manually
add every user as a test user. Publishing requires a Privacy Policy URL
and Terms of Service URL but for personal use you can usually leave the
app in **Testing** mode and add up to 100 test users by email.

---

## 4. Try it

1. Open `https://YOUR-NETLIFY-URL` on your laptop.
2. Sign in with Google (the account you added as a test user). Save a court.
3. Open the same URL on your phone. Sign in. Verify your saved courts appear.
4. **Install the PWA on iOS:** Safari → tap **Share → Add to Home Screen**.
5. **Install the PWA on Android:** Chrome should show an install prompt
   automatically; if not, tap the **⋮ menu → Install app**.
6. Launch the installed app from your home screen — it opens full-screen
   without the browser chrome.

---

## Troubleshooting

- **`/api/*` requests return your `index.html` instead of JSON** —
  the proxy rule order in `client/netlify.toml` is wrong (the SPA
  fallback `/* → /index.html` must come *after* the `/api/*` proxy).
  Or the Railway URL in that file is stale.
- **`/api/health` works but `/api/courts` returns 502** — the Google
  Places key probably doesn't have your Railway/Netlify domain in its
  HTTP referrer restrictions, or Places API isn't enabled.
- **Sign in completes then immediately bounces to `/login`** — the
  `CLIENT_ORIGIN` env var on Railway doesn't match your Netlify URL,
  so the cookie isn't being set in production. Update and redeploy.
- **PWA install prompt doesn't appear** — Chrome needs at least one
  visit and (on some platforms) a few seconds of engagement before
  surfacing the prompt. iOS never shows an automatic prompt — users
  must use Share → Add to Home Screen.
- **Service worker serves stale code after deploy** — `registerType:
  autoUpdate` should handle this on next visit, but you can also bump
  the service worker manually by clearing site data in DevTools.

---

## Cost notes

- **Railway** free trial: $5 credit. After that, **Hobby** plan is $5/mo
  flat + usage. A small Express + Postgres service typically runs ~$3-5/mo.
- **Netlify** free tier covers personal usage easily — 100 GB bandwidth,
  300 build minutes/month.
- **Google Maps Platform** has a $200/month credit. Places Nearby Search
  is the only billable call we make and the 7-day cache makes it
  effectively free at personal scale. Maps JavaScript API loads are
  free under typical PWA usage.
- **OpenWeatherMap** free tier is 1,000 calls/day — the 10-minute geohash
  cache means you can have many users in the same city for one call
  every 10 minutes.
