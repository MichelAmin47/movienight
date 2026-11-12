import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackLink } from '../components/MovieHeader'
import { PersonBadge } from '../components/PersonBadge'
import { Poster } from '../components/Poster'
import { StarsInput } from '../components/Stars'
import { Button, ErrorNote, PageTitle, Spinner, TextInput } from '../components/ui'
import { t } from '../i18n/strings'
import { ensureMovies, releaseYear, type TmdbMovieSummary } from '../lib/tmdb'
import { MIN_QUERY_LENGTH, useMovieSearch } from '../lib/useMovieSearch'
import { createUndatedWatches } from '../lib/watches'
import { useHousehold } from '../state/household'

type Item = {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null
  /** person id → score; people without a score are absent. */
  scores: Record<string, number>
}

const DRAFT_KEY = 'filmavond.bulkDraft'
/** Search results shown at once; the list below needs the room. */
const MAX_RESULTS = 6

function readDraft(): Item[] {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '[]')
    return Array.isArray(draft) ? draft : []
  } catch {
    return []
  }
}

/**
 * Backfill mode: collect movies watched in the past in a running list, give
 * stars per movie, and save everything at once without a date.
 */
export function BulkAdd() {
  const navigate = useNavigate()
  const { household, people, watches, refresh } = useHousehold()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Item[]>(readDraft)
  const [expanded, setExpanded] = useState(new Set<number>())
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { movies, error } = useMovieSearch(query)
  const watchedIds = useMemo(() => new Set(watches.map((w) => w.tmdb_id)), [watches])
  const listedIds = useMemo(() => new Set(items.map((i) => i.tmdbId)), [items])
  const personIds = useMemo(() => new Set(people.map((p) => p.id)), [people])

  // Keep the list across reloads and accidental navigation until it is saved.
  useEffect(() => {
    try {
      if (items.length) localStorage.setItem(DRAFT_KEY, JSON.stringify(items))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      // Storage unavailable; the list then only lives for this visit.
    }
  }, [items])

  function addMovie(movie: TmdbMovieSummary) {
    if (listedIds.has(movie.id)) return
    if (watchedIds.has(movie.id) && !window.confirm(t.bulk.confirmDuplicate(movie.title))) return
    setItems((current) => [
      { tmdbId: movie.id, title: movie.title, year: releaseYear(movie.release_date), posterPath: movie.poster_path, scores: {} },
      ...current,
    ])
    setQuery('')
    setFailure(null)
    inputRef.current?.focus()
  }

  function update(tmdbId: number, scores: Record<string, number>) {
    setItems((current) => current.map((item) => (item.tmdbId === tmdbId ? { ...item, scores } : item)))
  }

  function setEveryone(item: Item, score: number | null) {
    update(item.tmdbId, score === null ? {} : Object.fromEntries(people.map((p) => [p.id, score])))
  }

  function setPerson(item: Item, personId: string, score: number | null) {
    const scores = { ...item.scores }
    if (score === null) delete scores[personId]
    else scores[personId] = score
    update(item.tmdbId, scores)
  }

  /** The shared score when every family member has the same one, otherwise null. */
  function everyoneScore(item: Item): number | null {
    const scores = people.map((p) => item.scores[p.id])
    return scores.length > 0 && scores.every((s) => s !== undefined && s === scores[0]) ? scores[0] : null
  }

  function toggleExpanded(tmdbId: number) {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(tmdbId)) next.add(tmdbId)
      return next
    })
  }

  async function saveAll() {
    if (!household || items.length === 0) return
    setBusy(true)
    setFailure(null)
    try {
      // Stores the movies in the shared `movies` table, which watches reference.
      const stored = await ensureMovies(items.map((i) => i.tmdbId))
      const ready = items.filter((i) => stored.has(i.tmdbId))
      await createUndatedWatches(
        household.id,
        ready.map((item) => ({
          tmdbId: item.tmdbId,
          // A draft can outlive a deleted family member; drop their scores.
          scores: Object.fromEntries(Object.entries(item.scores).filter(([id]) => personIds.has(id))),
        })),
      )
      const failed = items.filter((i) => !stored.has(i.tmdbId))
      setItems(failed)
      await refresh()
      if (failed.length) {
        setFailure(t.bulk.partialError(failed.length))
      } else {
        navigate('/', { replace: true })
      }
    } catch {
      setFailure(t.common.genericError)
    } finally {
      setBusy(false)
    }
  }

  const trimmed = query.trim()

  return (
    <div className="flex flex-col gap-4">
      <BackLink onClick={() => navigate('/add')} />
      <div>
        <PageTitle>{t.bulk.title}</PageTitle>
        <p className="mt-1 text-muted">{t.bulk.intro}</p>
      </div>

      <TextInput
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        aria-label={t.search.label}
        placeholder={t.search.placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && <ErrorNote>{t.common.genericError}</ErrorNote>}
      {trimmed.length >= MIN_QUERY_LENGTH &&
        (movies === null ? (
          !error && <Spinner />
        ) : movies.length === 0 ? (
          <p className="text-muted">{t.search.empty(trimmed)}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {movies.slice(0, MAX_RESULTS).map((movie) => {
              const listed = listedIds.has(movie.id)
              const watched = watchedIds.has(movie.id)
              return (
                <li key={movie.id}>
                  <button
                    type="button"
                    disabled={listed}
                    onClick={() => addMovie(movie)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-1.5 text-left hover:bg-raised disabled:opacity-60"
                  >
                    <Poster path={movie.poster_path} title={movie.title} size="w154" className="w-11 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{movie.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                        {releaseYear(movie.release_date)}
                        {listed ? (
                          <span className="font-bold">✓ {t.bulk.inList}</span>
                        ) : (
                          watched && <span className="font-bold text-good">✓ {t.search.alreadyWatched}</span>
                        )}
                      </span>
                    </span>
                    {!listed && (
                      <span aria-hidden className="pr-2 text-2xl font-bold text-accent">
                        +
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ))}

      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-4">
        <h2 className="text-lg font-extrabold">{t.bulk.listTitle(items.length)}</h2>
        {items.length > 0 && (
          <button
            type="button"
            className="min-h-11 text-sm font-bold text-muted underline"
            onClick={() => window.confirm(t.bulk.confirmClear) && setItems([])}
          >
            {t.bulk.clear}
          </button>
        )}
      </div>

      {failure && <ErrorNote>{failure}</ErrorNote>}

      {items.length === 0 ? (
        <p className="text-muted">{t.bulk.listEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const open = expanded.has(item.tmdbId)
            return (
              <li key={item.tmdbId} className="flex flex-col gap-1 rounded-3xl border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <Poster path={item.posterPath} title={item.title} size="w154" className="w-11 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{item.title}</p>
                    <p className="text-sm text-muted">{item.year}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={t.bulk.remove(item.title)}
                    title={t.bulk.remove(item.title)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-raised"
                    onClick={() => setItems((current) => current.filter((i) => i.tmdbId !== item.tmdbId))}
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <span className="text-sm font-bold">{t.bulk.everyone}</span>
                  <StarsInput
                    compact
                    value={everyoneScore(item)}
                    onChange={(score) => setEveryone(item, score)}
                    label={t.bulk.everyoneStarLabel}
                  />
                </div>

                {people.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggleExpanded(item.tmdbId)}
                      className="flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-muted"
                    >
                      <span aria-hidden>{open ? '▾' : '▸'}</span>
                      {t.bulk.perPerson}
                      {!open && (
                        <span className="ml-1 flex gap-1.5" aria-hidden>
                          {people.map((person) => (
                            <span key={person.id} className="flex items-center gap-0.5" title={person.name}>
                              <PersonBadge person={person} size="sm" />
                              {item.scores[person.id] ?? '–'}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                    {open && (
                      <ul className="flex flex-col">
                        {people.map((person) => (
                          <li key={person.id} className="flex items-center justify-between gap-2" title={person.name}>
                            <span className="flex min-w-0 items-center gap-2">
                              <PersonBadge person={person} size="sm" />
                              <span className="truncate text-sm font-bold">{person.name}</span>
                            </span>
                            <StarsInput
                              compact
                              value={item.scores[person.id] ?? null}
                              onChange={(score) => setPerson(item, person.id, score)}
                              label={(score) => t.watchForm.starLabel(person.name, score)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="sticky bottom-20 z-10">
          <Button className="w-full shadow-lg" disabled={busy} onClick={() => void saveAll()}>
            {busy ? t.common.saving : t.bulk.saveAll(items.length)}
          </Button>
        </div>
      )}
    </div>
  )
}
