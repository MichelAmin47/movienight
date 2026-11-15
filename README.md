# Filmavond

A small web app where a family keeps track of the movies they watched together,
gives each movie 1–5 stars per family member, and gets suggestions for what to
watch next. The UI is in Dutch.

Live: https://michelamin47.github.io/movienight/

## Architecture

```
Browser (Vite + React, GitHub Pages)
  ├── Supabase Auth      magic-link login
  ├── Supabase Postgres  households, people, watches, ratings (RLS)
  └── Edge Function      `tmdb` → TMDB API v3 (token stays server-side)
```

- **Frontend** – Vite, React, TypeScript, Tailwind CSS. Mobile-first, follows the
  system light/dark setting. `HashRouter` and `base: '/movienight/'` make it
  work on GitHub Pages without 404 tricks.
- **Database and auth** – Supabase. Row Level Security restricts every table to
  members of the household, so the publishable key in `.env.production` is safe
  to commit. The schema lives in `supabase/migrations/` **for reference
  only**: every file there is already applied to the hosted project.
- **Movie data** – TMDB. The browser never talks to TMDB directly; it calls the
  `tmdb` Edge Function, which checks the user's session and forwards an
  allowlist of endpoints with the `TMDB_TOKEN` secret.

### Data model

One household shares one watched list. Parents have accounts
(`household_members`); everyone who gives stars, including children without an
account, is a row in `people`. Watching a movie again adds another `watches`
row. A watch without a date (`watched_on` is null) means "watched at some
earlier time"; it is shown as *Eerder gekeken*, sorts after all dated watches,
and counts fully for suggestions and stats. *Snel toevoegen* (`/add/bulk`) adds
many such watches at once to backfill the family's history. `movies` is a shared cache of TMDB data, `dismissed` holds suggestions the
family is not interested in, and `watchlist` holds the movies the family still
wants to watch (*Willen we zien*). A movie is starred from a tip, a search
result or its detail page (`/movie/:tmdbId`); saving it as watched takes it off
the list again.

A second parent with their own email address logs in, copies the code shown on
the welcome screen, and the first parent pastes it under
*Instellingen → Accounts*.

### Suggestions

Implemented in `src/lib/suggestions.ts` (pure, unit tested):

1. Every watched movie gets an average score (optionally for one person).
2. Movies averaging 3.5 or higher are sources; TMDB recommendations are fetched
   for each.
3. Candidate score = Σ over sources of (average − 3), plus
   0.25 × the mean genre affinity of its genres. Genre affinity is the damped
   mean of (score − 3) over watched movies in that genre, so liked genres add a
   little and disliked genres subtract a little.
4. Watched and dismissed movies are excluded.
5. The age filter uses the Dutch (Kijkwijzer) certification from TMDB release
   dates. Movies rated 16 or 18 are hidden unless *16+ films tonen* is on.
   Movies without a certification are labelled "Leeftijd onbekend" and can be
   hidden.
6. The top 20 that are not on the watchlist are shown. On top of those, at
   most 3 watchlist movies are mixed in: the best scored ones, each at its
   scored position, with a filled star. Other watchlist movies are left out.

**Nieuwe tips (shuffle).** The button draws a different set of 20 from a pool
of the 80 best candidates by weighted random sampling without replacement:
weight = (score − lowest score + 0.25)^(1/0.7), times 0.02 for movies shown in
the last two shuffles. The result is displayed in random order. Each shuffle
also widens the pool with at most 7 TMDB calls: page 2 of the recommendations
of up to 5 liked movies, and one `discover/movie` call for the household's two
favorite genres (well-rated movies, random page 1–5). Genre-based movies score
from genre affinity only, so up to 15 pool places are kept for them. The same
filters apply as in the default view, and so does the watchlist rule: 20
movies that are not on the watchlist, plus the first 3 watchlist movies the
sampling draws.

The age filter settings are stored per device in `localStorage`.

**A stable list.** `src/lib/tipsStore.ts` computes a list completely
(recommendations, ranking and the certification lookups for 20 tips plus a
buffer of 8) before the page shows it; until then the page shows a skeleton.
The finished list is cached in `localStorage`, keyed by a hash of its inputs
(watched movies and ratings, dismissed movies, watchlist, filters, selected
person), so a
revisit with the same inputs shows it at once without any request. When the
inputs change, the old list stays on screen while the new one is computed and
is then replaced in one go, or, when the user is scrolled down or the carousel
is spinning, behind a *Nieuwe tips beschikbaar* button. A shuffle is stored as
the current list in the same way. Dismissing a movie replaces only that tile
with the next tip from the buffer. Starring a tip leaves the list on screen as
it is (one more tip is added at the end to keep 20 unstarred ones); the exact
list for the new watchlist is computed on the next visit.

### Caching

- Movie details and certifications: the `movies` table (shared by all users).
- Recommendations (7 days) and genre names (30 days): `localStorage`.
- The finished Tips lists (the last 5 input combinations): `localStorage`.
- Search results: in memory for the visit.

Certifications are only looked up for as many top-ranked candidates as are
needed to fill the list.

### Installable app (PWA)

The app can be installed from Chrome on Android ("Add to home screen", or the
*Installeer als app* button in Instellingen) and then opens standalone.
`vite-plugin-pwa` generates the manifest and the service worker (`sw.js`) at
build time; the configuration is in `vite.config.ts`.

- **Scope.** Another PWA is hosted on the same origin, so the manifest `id`,
  `start_url` and `scope` and the service worker scope are all `/movienight/`.
  Never widen them to the origin root.
- **Precache.** The app shell (HTML, JS, CSS, icons) is precached, so the app
  starts without a network. Without a connection it shows its own
  "Geen verbinding" screen (`OfflineNotice` in `src/components/Pwa.tsx`).
- **Not cached.** Supabase requests (database, auth, storage, Edge Functions)
  have no route in the service worker and always go to the network.
- **Posters.** `image.tmdb.org` is cache-first, at most 200 images for 30 days.
- **Updates.** A new service worker takes over immediately; the open page then
  shows "Nieuwe versie beschikbaar — Vernieuwen" instead of reloading by
  itself. An open app checks for a new version when it returns to the
  foreground, at most once an hour (`src/lib/pwa.ts`).
- **Login.** The magic link opens in Chrome; the installed app shares Chrome's
  storage, so it is signed in as well.
- **Pull-to-refresh** is left on, also in the installed app: it is the only
  manual reload there.
- **Icons.** `node scripts/generate-icons.mjs` renders `public/favicon.svg` and
  the PNGs in `public/` (needs Playwright, which is not a project dependency).
  The output is committed.

There is no service worker in `npm run dev`; use `npm run build` followed by
`npm run preview` to try it locally.

## Running locally

Requires Node 22.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173/movienight/. The app talks to the hosted Supabase
project; `http://localhost:5173` is an allowed auth redirect and CORS origin.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check and production build into `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | Lint (oxlint) |

## Deployment

### Frontend

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and
publishes `dist/` to GitHub Pages (Pages source: GitHub Actions). The build
reads the public Supabase URL and publishable key from `.env.production`.

### Edge Function

`supabase/functions/tmdb/index.ts` is a single self-contained file. Deploy it
whenever it changes, with gateway JWT verification **off** (the function
verifies the session itself, and CORS preflights carry no token):

```bash
supabase functions deploy tmdb --project-ref gmxhporxvtgiagboaccf --no-verify-jwt
```

or deploy the file as-is through the Supabase dashboard or the Supabase
connector, with `verify_jwt = false`.

It needs one secret, the TMDB *API Read Access Token*:

```bash
supabase secrets set TMDB_TOKEN=... --project-ref gmxhporxvtgiagboaccf
```

Allowed origins are listed at the top of the function; update them if the site
moves.

### Keep-alive

`.github/workflows/keepalive.yml` calls the `ping()` RPC once a day so the free
Supabase project is not paused for inactivity.

## Project layout

```
src/
  i18n/strings.ts   all UI text (Dutch)
  lib/              Supabase client, database types, TMDB client, scoring, PWA
  state/            auth and household data contexts
  components/       shared UI
  pages/            one file per screen
scripts/            icon generator
supabase/
  functions/tmdb/   TMDB proxy Edge Function
  migrations/       schema, for reference only
```

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
