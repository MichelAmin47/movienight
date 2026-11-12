# Filmavond – notes for Claude Code sessions

A web app where one family tracks the movies they watched together, gives 1–5
stars per family member, and gets suggestions. Live at
https://michelamin47.github.io/movienight/. See `README.md` for the long
version of the architecture.

## Hard rules

- **Never change Supabase from Claude Code.** No migrations, no Edge Function
  deploys, no secrets, no SQL against the hosted project — even if a Supabase
  connector or CLI happens to be available in the session. Supabase changes
  are made by Michel. When one is needed, stop and ask for it with:
  - the **exact SQL** for a schema change (then, once he confirms it is
    applied, add it as the next `supabase/migrations/000N_*.sql` for reference
    and update `src/lib/database.types.ts` by hand);
  - the **exact file path** for an Edge Function to deploy (currently only
    `supabase/functions/tmdb/index.ts`, deployed with `verify_jwt = false`),
    and wait for confirmation that it is live before building on it;
  - the **name** (never the value) of a secret to set.
- Files in `supabase/migrations/` are **reference copies of SQL that is
  already applied**. Never run them.
- Do not work around a missing schema change in the frontend. Ask.
- Never commit secrets. The TMDB token lives only as the Supabase secret
  `TMDB_TOKEN` and must never reach the frontend bundle.
- Do not change the stack (below) without asking.
- Ask instead of inventing requirements.

## Stack and architecture

```
Browser (Vite + React + TypeScript + Tailwind v4, GitHub Pages)
  ├── Supabase Auth      magic-link login (implicit flow)
  ├── Supabase Postgres  RLS limits every table to household members
  └── Edge Function      `tmdb` → TMDB API v3, token stays server-side
```

- **Supabase project** `filmavond` (eu-central-1)
  - URL: `https://gmxhporxvtgiagboaccf.supabase.co`
  - Publishable key: `sb_publishable_TTh0aHdV1vLireBDG5ktdQ_dVmoQPNz`
  - Both are public (security is enforced by RLS) and committed in
    `.env.production` and `.env.example`.
- **Hosting**: GitHub Pages, deployed by `.github/workflows/deploy.yml` on push
  to `main`. `vite.config.ts` sets `base: '/movienight/'`; routing uses
  `HashRouter`. The router mounts only after auth has consumed the magic-link
  URL hash (`src/lib/supabase.ts`, `src/App.tsx`).
- **TMDB**: the frontend only calls
  `supabase.functions.invoke('tmdb', { body: { path, params } })`
  (`src/lib/tmdb.ts`). The function allows: `search/movie`, `movie/{id}`,
  `movie/{id}/recommendations`, `movie/{id}/release_dates`, `discover/movie`,
  `genre/movie/list`, and `append_to_response` of `release_dates` /
  `recommendations` on `movie/{id}`. Defaults: `language=nl-NL`, `region=NL`.
  A new TMDB endpoint means a function change, so a redeploy request.
- **Keep-alive**: `.github/workflows/keepalive.yml` calls `rpc/ping` daily.

### Data model

One household, one shared watched list.

| Table | Purpose |
| --- | --- |
| `households`, `household_members` | The family and the accounts (parents) linked to it |
| `people` | Everyone who gives stars, including children without an account. `avatar_path` (nullable) points into the private storage bucket `avatars`; null means emoji |
| `movies` | Shared TMDB cache, keyed by `tmdb_id`; upsert the movie before inserting a watch |
| `watches` | One row per viewing. `watched_on` is nullable: null means "Eerder gekeken" and must be sent as an explicit `null` (omitting it defaults to today) |
| `ratings` | `(watch_id, person_id)` → score 1–5 |
| `dismissed` | Suggestions the household is not interested in |

Storage: private bucket `avatars` (max 2 MB, webp/jpeg/png), objects at
`<household_id>/<person_id>-<timestamp>.webp`, readable and writable by
household members only. Images are shown through signed URLs
(`src/lib/avatars.ts`, batch-signed and cached for about an hour), never
public URLs. Always render a person with `<PersonAvatar>`.

RPCs: `create_household(household_name)`, `ping()`.
`src/lib/database.types.ts` is written by hand (no `supabase gen types`).

There is no settings table: the suggestion filters ("16+ films tonen",
"hide unknown rating") are per device in `localStorage` (`src/lib/prefs.ts`).

### Code layout

```
src/i18n/strings.ts     all UI text
src/lib/                supabase client, database types, tmdb client + cache,
                        suggestions.ts (pure scoring/sampling), kijkwijzer.ts
src/state/              auth and household data contexts
src/components/         shared UI
src/pages/              one file per screen
supabase/functions/tmdb single-file Deno proxy (no local imports)
supabase/migrations/    reference only
```

Suggestion logic lives in `src/lib/suggestions.ts` and is pure and unit
tested; keep I/O in `src/pages/Suggestions.tsx` and `src/lib/tmdb.ts`.
TMDB responses are cached in the `movies` table and in `localStorage`; keep
the number of TMDB calls low.

## Conventions

- Code, identifiers, comments, commit messages, README and docs: **English**.
- User-facing text: **Dutch**, and only in `src/i18n/strings.ts`. No Dutch
  string literals in components.
- Mobile-first, large touch targets (44px or more), light and dark mode via
  the CSS variables in `src/index.css`.
- Full person names on detail and settings pages; where space is tight use the
  badge plus first letter with the full name in `title` / `aria-label`
  (`PersonFilter`).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (Node 22) |
| `npm run dev` | Dev server at http://localhost:5173/movienight/ |
| `npm run build` | Type-check (`tsc -b`) and production build |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit tests |

`npm run build`, `npm run lint` and `npm test` must all pass before every
commit. CI (`.github/workflows/ci.yml`) runs the same on pull requests.

The hosted Supabase project is usually not reachable from a cloud session, and
login needs a real mailbox, so signed-in screens cannot be tested against the
real backend there. Verify UI changes in a headless browser with Supabase and
TMDB requests mocked, and say clearly in the PR that this is what was done.

## Workflow in Claude Code cloud sessions

1. Work on the `claude/...` branch assigned to the session. Never push to
   `main` directly.
2. If that branch's previous pull request has already been merged, restart it
   from the latest `origin/main` before starting new work.
3. Small, working commits; build, lint and tests green before each.
4. Push with a normal `git push -u origin <branch>` (force pushes are blocked;
   after a merge the restarted branch is a fast-forward anyway).
5. Open a pull request against `main`. Michel reviews and merges; the merge
   triggers the Pages deploy.
6. Anything needed on the Supabase side: stop and ask, as described under
   "Hard rules".
