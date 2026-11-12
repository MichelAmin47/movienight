import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PersonFilter } from '../components/PersonFilter'
import { Poster } from '../components/Poster'
import { Button, ErrorNote, PageTitle, Spinner } from '../components/ui'
import { t } from '../i18n/strings'
import type { Movie } from '../lib/database.types'
import { isAllowed } from '../lib/kijkwijzer'
import { usePrefs } from '../lib/prefs'
import {
  buildPool,
  displayKey,
  mergeRecommendations,
  rankCandidates,
  ratedMovies,
  selectVisible,
  sourceMovies,
  topGenres,
  weightedOrder,
  type Candidate,
} from '../lib/suggestions'
import { supabase } from '../lib/supabase'
import {
  discoverMovies,
  ensureMovies,
  getGenres,
  getRecommendations,
  releaseYear,
  type TmdbMovieSummary,
} from '../lib/tmdb'
import { useHousehold } from '../state/household'

/** Recommendation requests that run at the same time. */
const SOURCE_CONCURRENCY = 6
/** Candidates whose details (certification) are looked up per round. */
const DETAIL_BATCH = 12
/** Upper bound on detail lookups per visit, to keep TMDB usage modest. */
const MAX_DETAIL_LOOKUPS = 400

// A shuffle makes at most 7 TMDB calls for fresh candidates: page 2 of the
// recommendations of up to 5 liked movies, one discover call (two if the
// random page turns out to be empty). Cached responses cost nothing.
const SHUFFLE_EXTRA_SOURCES = 5
const DISCOVER_MAX_PAGE = 5
/** How many earlier shuffles count as "recently shown". */
const RECENT_SHUFFLES = 2
const RECENT_KEY = 'filmavond.recentTips'

function readRecent(): number[][] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

/** Random subset of at most `count` items. */
function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return picked
}

export function Suggestions() {
  const { household, watches, people, dismissed, refresh } = useHousehold()
  const [prefs, setPrefs] = usePrefs()
  const [personId, setPersonId] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState(new Map<number, TmdbMovieSummary[]>())
  /** Candidate id → full movie row, or null when it could not be loaded. */
  const [details, setDetails] = useState(new Map<number, Movie | null>())
  /** Dismissed during this visit, hidden right away while the insert runs. */
  const [hidden, setHidden] = useState(new Set<number>())
  const [error, setError] = useState(false)

  // Shuffle ("Nieuwe tips") state. Null `shuffle` is the default view: the top 20 by score.
  const [shuffle, setShuffle] = useState<{ order: number[]; seed: number } | null>(null)
  const [shuffling, setShuffling] = useState(false)
  /** Seed of the shuffle whose first full list has been shown. */
  const [settledSeed, setSettledSeed] = useState<number | null>(null)
  /** Page 2 of recommendations, per source movie, fetched by shuffles. */
  const [moreRecommendations, setMoreRecommendations] = useState(new Map<number, TmdbMovieSummary[]>())
  /** Movies found by favorite genre, fetched by shuffles. */
  const [discovered, setDiscovered] = useState<TmdbMovieSummary[]>([])
  const [genreNames, setGenreNames] = useState<Record<number, string>>({})
  /** Ids shown in the last few shuffles; they get a strong weight penalty. */
  const recent = useRef(readRecent())

  const person = people.find((p) => p.id === personId) ?? null
  const rated = useMemo(() => ratedMovies(watches, personId), [watches, personId])
  const sources = useMemo(() => sourceMovies(rated), [rated])

  // 1. Fetch TMDB recommendations for every liked movie (cached for a week).
  const missingSources = sources.filter((s) => !recommendations.has(s.tmdbId)).map((s) => s.tmdbId)
  const missingSourcesKey = missingSources.join(',')
  useEffect(() => {
    if (!missingSourcesKey) return
    let cancelled = false
    const ids = missingSourcesKey.split(',').map(Number)
    void (async () => {
      for (let i = 0; i < ids.length && !cancelled; i += SOURCE_CONCURRENCY) {
        const batch = ids.slice(i, i + SOURCE_CONCURRENCY)
        const results = await Promise.allSettled(batch.map(getRecommendations))
        if (cancelled) return
        if (results.every((r) => r.status === 'rejected')) setError(true)
        setRecommendations((current) => {
          const next = new Map(current)
          // A failed source counts as "no recommendations" so the page still completes.
          results.forEach((r, index) => next.set(batch[index], r.status === 'fulfilled' ? r.value : []))
          return next
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [missingSourcesKey])

  // 2. Rank candidates, leaving out everything watched or dismissed. The default
  //    view uses first-page recommendations only, so it stays deterministic;
  //    shuffles draw from a ranking that also includes the extra sources.
  const excluded = useMemo(
    () => new Set([...watches.map((w) => w.tmdb_id), ...dismissed, ...hidden]),
    [watches, dismissed, hidden],
  )
  const ranked = useMemo(() => rankCandidates({ rated, recommendations, excluded }), [rated, recommendations, excluded])
  const extended = useMemo(
    () =>
      rankCandidates({
        rated,
        recommendations: mergeRecommendations(recommendations, moreRecommendations),
        discover: discovered,
        excluded,
      }),
    [rated, recommendations, moreRecommendations, discovered, excluded],
  )

  // 3. Walk the candidates in order (by score, or in the shuffled order),
  //    applying the age filter. Details are loaded in batches as the walk needs them.
  const order = useMemo(() => {
    if (!shuffle) return ranked
    const byId = new Map(extended.map((c) => [c.movie.id, c]))
    return shuffle.order.flatMap((id) => byId.get(id) ?? [])
  }, [shuffle, ranked, extended])

  const { visible, pending } = useMemo(() => {
    const result = selectVisible(order, {
      certificationOf: (id) => (details.has(id) ? (details.get(id)?.certification_nl ?? null) : undefined),
      isAllowed: (certification) => isAllowed(certification, prefs.showAdult),
      hideUnknown: prefs.hideUnknown,
      batch: DETAIL_BATCH,
      canLookup: details.size < MAX_DETAIL_LOOKUPS,
    })
    // A shuffle is shown in random order rather than by score.
    if (shuffle) {
      result.visible.sort(
        (a, b) => displayKey(a.candidate.movie.id, shuffle.seed) - displayKey(b.candidate.movie.id, shuffle.seed),
      )
    }
    return result
  }, [order, details, prefs.showAdult, prefs.hideUnknown, shuffle])

  const pendingKey = pending.join(',')
  useEffect(() => {
    if (!pendingKey) return
    let cancelled = false
    const ids = pendingKey.split(',').map(Number)
    ensureMovies(ids)
      .then((movies) => {
        if (cancelled) return
        setDetails((current) => {
          const next = new Map(current)
          for (const id of ids) next.set(id, movies.get(id) ?? null)
          return next
        })
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        // Mark as unknown so the list can finish instead of retrying forever.
        setDetails((current) => {
          const next = new Map(current)
          for (const id of ids) next.set(id, null)
          return next
        })
      })
    return () => {
      cancelled = true
    }
  }, [pendingKey])

  async function dismiss(tmdbId: number) {
    if (!household) return
    setHidden((current) => new Set(current).add(tmdbId))
    const { error } = await supabase
      .from('dismissed')
      .upsert({ household_id: household.id, tmdb_id: tmdbId }, { ignoreDuplicates: true })
    if (error) {
      setError(true)
      setHidden((current) => {
        const next = new Set(current)
        next.delete(tmdbId)
        return next
      })
    } else {
      void refresh()
    }
  }

  function changePerson(id: string | null) {
    setPersonId(id)
    // Another person has other favorites: start again from their top 20.
    setShuffle(null)
  }

  async function shuffleNow() {
    if (shuffling || sources.length === 0) return
    setShuffling(true)
    setError(false)

    // What is on screen now should mostly not come back in the next shuffles.
    recent.current = [...recent.current, visible.map((v) => v.candidate.movie.id)].slice(-RECENT_SHUFFLES)
    try {
      sessionStorage.setItem(RECENT_KEY, JSON.stringify(recent.current))
    } catch {
      // Storage unavailable; the in-memory copy still works for this visit.
    }

    // Prefer liked movies whose second page has not been fetched yet, so
    // repeated shuffles keep bringing in new titles.
    const unexplored = sources.filter((source) => !moreRecommendations.has(source.tmdbId))
    const extraSources = [
      ...pickRandom(unexplored, SHUFFLE_EXTRA_SOURCES),
      ...pickRandom(
        sources.filter((source) => moreRecommendations.has(source.tmdbId)),
        SHUFFLE_EXTRA_SOURCES,
      ),
    ].slice(0, SHUFFLE_EXTRA_SOURCES)
    const genres = topGenres(rated)
    const [pages, found, names] = await Promise.all([
      Promise.allSettled(extraSources.map((source) => getRecommendations(source.tmdbId, 2))),
      genres.length
        ? discoverMovies(genres, 1 + Math.floor(Math.random() * DISCOVER_MAX_PAGE)).catch(() => [])
        : Promise.resolve([]),
      // Only needed for the "favorite genre" explanation; cached for a month.
      getGenres().catch(() => null),
    ])

    // Failed extra fetches are skipped: the shuffle then simply has fewer new titles.
    const nextMore = new Map(moreRecommendations)
    pages.forEach((page, index) => {
      if (page.status === 'fulfilled') nextMore.set(extraSources[index].tmdbId, page.value)
    })
    const known = new Set(discovered.map((m) => m.id))
    const nextDiscovered = [...discovered, ...found.filter((m) => !known.has(m.id))]
    setMoreRecommendations(nextMore)
    setDiscovered(nextDiscovered)
    if (names) setGenreNames(names)

    const pool = buildPool(
      rankCandidates({
        rated,
        recommendations: mergeRecommendations(recommendations, nextMore),
        discover: nextDiscovered,
        excluded,
      }),
    )
    const shuffled = weightedOrder(pool, { rng: Math.random, recentIds: new Set(recent.current.flat()) })
    setShuffle({ order: shuffled.map((c) => c.movie.id), seed: Math.floor(Math.random() * 2 ** 31) })
    setShuffling(false)
    window.scrollTo({ top: 0 })
  }

  function explanation(candidate: Candidate): string {
    if (candidate.sources.length === 0) {
      const genre = candidate.genreMatch === undefined ? undefined : genreNames[candidate.genreMatch]
      if (!genre) return t.suggestions.becauseGenres
      return person
        ? t.suggestions.becauseGenrePerson(person.name, genre.toLowerCase())
        : t.suggestions.becauseGenre(genre.toLowerCase())
    }
    const titles = candidate.sources.slice(0, 2).map((s) => s.title)
    const joined = titles.join(` ${t.suggestions.and} `)
    return person ? t.suggestions.becausePerson(person.name, joined) : t.suggestions.because(joined)
  }

  const loading = missingSources.length > 0 || pending.length > 0
  // While a shuffle is being put together the list is replaced by a spinner.
  // Once it has been shown in full it stays on screen, so dismissing a movie
  // (which pulls in the next one) does not blank the list.
  const settled = shuffle !== null && settledSeed === shuffle.seed
  if (shuffle && !settled && !shuffling && pending.length === 0) setSettledSeed(shuffle.seed)
  const shuffleBusy = shuffling || (shuffle !== null && !settled && pending.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <PageTitle>{t.suggestions.title}</PageTitle>
          <Button
            variant="secondary"
            className="shrink-0 px-4"
            disabled={shuffleBusy || loading || sources.length === 0}
            onClick={() => void shuffleNow()}
          >
            {shuffleBusy ? (
              <span
                aria-hidden
                className="size-5 animate-spin rounded-full border-2 border-muted border-t-transparent"
              />
            ) : (
              <span aria-hidden>🔀</span>
            )}
            {t.suggestions.shuffle}
          </Button>
        </div>
        <p className="mt-1 text-muted">{t.suggestions.intro}</p>
      </div>

      <PersonFilter people={people} value={personId} onChange={changePerson} label={t.suggestions.basedOn} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl bg-raised px-3 py-1">
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="size-5 accent-(--accent)"
            checked={prefs.showAdult}
            onChange={(e) => setPrefs({ showAdult: e.target.checked })}
          />
          {t.settings.showAdult}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="size-5 accent-(--accent)"
            checked={prefs.hideUnknown}
            onChange={(e) => setPrefs({ hideUnknown: e.target.checked })}
          />
          {t.suggestions.hideUnknownShort}
        </label>
      </div>

      {error && <ErrorNote>{t.common.genericError}</ErrorNote>}

      {sources.length === 0 ? (
        <p className="py-8 text-center text-muted">{t.suggestions.empty}</p>
      ) : shuffleBusy ? (
        <Spinner label={t.suggestions.loading} />
      ) : (
        <>
          <ol className="flex flex-col gap-3">
            {visible.map(({ candidate, certification }) => {
              const { movie } = candidate
              return (
                <li key={movie.id} className="flex gap-3 rounded-3xl border border-line bg-surface p-3">
                  <Poster path={movie.poster_path} title={movie.title} className="w-24 shrink-0 self-start" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <h2 className="text-lg leading-tight font-extrabold text-balance">{movie.title}</h2>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      {releaseYear(movie.release_date)}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          certification ? 'bg-raised text-good' : 'bg-raised text-muted'
                        }`}
                      >
                        {certification ? t.suggestions.ageLabel(certification) : t.suggestions.unknownAge}
                      </span>
                    </p>
                    <p className="text-sm font-bold text-accent">{explanation(candidate)}</p>
                    {movie.overview && <p className="line-clamp-3 text-sm text-muted">{movie.overview}</p>}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Link
                        to={`/add/${movie.id}`}
                        className="inline-flex min-h-11 items-center rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent"
                      >
                        ✓ {t.suggestions.watched}
                      </Link>
                      <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => void dismiss(movie.id)}>
                        {t.suggestions.dismiss}
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          {loading ? (
            <Spinner label={t.suggestions.loading} />
          ) : (
            visible.length === 0 && <p className="py-8 text-center text-muted">{t.suggestions.emptyFiltered}</p>
          )}
        </>
      )}
    </div>
  )
}
