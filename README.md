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
  to commit. The schema lives in `supabase/migrations/0001_init_schema.sql`
  **for reference only**: it is already applied to the hosted project.
- **Movie data** – TMDB. The browser never talks to TMDB directly; it calls the
  `tmdb` Edge Function, which checks the user's session and forwards an
  allowlist of endpoints with the `TMDB_TOKEN` secret.

### Data model

One household shares one watched list. Parents have accounts
(`household_members`); everyone who gives stars, including children without an
account, is a row in `people`. Watching a movie again adds another `watches`
row. `movies` is a shared cache of TMDB data, `dismissed` holds suggestions the
family is not interested in.

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
5. The Kijkwijzer filter uses the Dutch certification from TMDB release dates.
   Movies without one are labelled "Leeftijd onbekend" and can be hidden.
6. The top 20 are shown.

The age filter settings are stored per device in `localStorage`.

### Caching

- Movie details and certifications: the `movies` table (shared by all users).
- Recommendations (7 days) and genre names (30 days): `localStorage`.
- Search results: in memory for the visit.

Certifications are only looked up for as many top-ranked candidates as are
needed to fill the list.

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
  lib/              Supabase client, database types, TMDB client, scoring
  state/            auth and household data contexts
  components/       shared UI
  pages/            one file per screen
supabase/
  functions/tmdb/   TMDB proxy Edge Function
  migrations/       schema, for reference only
```

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
