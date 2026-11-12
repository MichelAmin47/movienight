import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PersonBadge } from '../components/PersonBadge'
import { Poster } from '../components/Poster'
import { Button, Chip, ErrorNote, PageTitle, Spinner } from '../components/ui'
import { t } from '../i18n/strings'
import type { Movie } from '../lib/database.types'
import { isAllowed, MAX_AGE_OPTIONS } from '../lib/kijkwijzer'
import { usePrefs } from '../lib/prefs'
import { MAX_SUGGESTIONS, rankCandidates, ratedMovies, sourceMovies, type Candidate } from '../lib/suggestions'
import { supabase } from '../lib/supabase'
import { ensureMovies, getRecommendations, releaseYear, type TmdbMovieSummary } from '../lib/tmdb'
import { useHousehold } from '../state/household'

/** Recommendation requests that run at the same time. */
const SOURCE_CONCURRENCY = 6
/** Candidates whose details (certification) are looked up per round. */
const DETAIL_BATCH = 12
/** Upper bound on detail lookups per visit, to keep TMDB usage modest. */
const MAX_DETAIL_LOOKUPS = 150

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

  // 2. Rank candidates, leaving out everything watched or dismissed.
  const ranked = useMemo(() => {
    const excluded = new Set([...watches.map((w) => w.tmdb_id), ...dismissed, ...hidden])
    return rankCandidates({ rated, recommendations, excluded })
  }, [rated, recommendations, watches, dismissed, hidden])

  // 3. Walk the ranking from the top, applying the age filter. The walk stops at
  //    the first candidate without details; those are then loaded in batches,
  //    so only as many lookups happen as are needed to fill the list.
  const { visible, pending } = useMemo(() => {
    const visible: { candidate: Candidate; certification: string | null }[] = []
    let pending: number[] = []
    for (let i = 0; i < ranked.length && visible.length < MAX_SUGGESTIONS; i++) {
      const candidate = ranked[i]
      if (!details.has(candidate.movie.id)) {
        if (details.size < MAX_DETAIL_LOOKUPS) {
          pending = ranked
            .slice(i)
            .map((c) => c.movie.id)
            .filter((id) => !details.has(id))
            .slice(0, DETAIL_BATCH)
        }
        break
      }
      const certification = details.get(candidate.movie.id)?.certification_nl ?? null
      const allowed = isAllowed(certification, prefs.maxAge)
      if (allowed === false || (allowed === null && prefs.hideUnknown)) continue
      visible.push({ candidate, certification })
    }
    return { visible, pending }
  }, [ranked, details, prefs.maxAge, prefs.hideUnknown])

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

  function explanation(candidate: Candidate): string {
    const titles = candidate.sources.slice(0, 2).map((s) => s.title)
    const joined = titles.join(` ${t.suggestions.and} `)
    return person ? t.suggestions.becausePerson(person.name, joined) : t.suggestions.because(joined)
  }

  const loading = missingSources.length > 0 || pending.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle>{t.suggestions.title}</PageTitle>
        <p className="mt-1 text-muted">{t.suggestions.intro}</p>
      </div>

      {people.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t.suggestions.basedOn}>
          <Chip selected={personId === null} onClick={() => setPersonId(null)}>
            {t.common.everyone}
          </Chip>
          {people.map((p) => (
            <Chip key={p.id} selected={personId === p.id} onClick={() => setPersonId(p.id)}>
              <PersonBadge person={p} size="sm" />
              {p.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-raised px-3 py-2">
        <div className="flex items-center gap-1.5" role="group" aria-label={t.settings.maxAge}>
          <span className="mr-1 text-sm font-bold text-muted">{t.suggestions.maxAgeShort}</span>
          {MAX_AGE_OPTIONS.map((age) => (
            <button
              key={age}
              type="button"
              aria-pressed={prefs.maxAge === age}
              onClick={() => setPrefs({ maxAge: age })}
              className={`min-h-11 min-w-11 rounded-full px-2 text-sm font-bold ${
                prefs.maxAge === age ? 'bg-accent text-on-accent' : 'bg-surface text-ink'
              }`}
            >
              {age}
            </button>
          ))}
        </div>
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
