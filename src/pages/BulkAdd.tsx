import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackLink } from '../components/MovieHeader'
import { PersonAvatar } from '../components/PersonAvatar'
import { Poster } from '../components/Poster'
import { StarsInput } from '../components/Stars'
import { Button, ErrorNote, PageTitle, Spinner, TextInput, Toast } from '../components/ui'
import { t } from '../i18n/strings'
import { everyoneScore, isUnrated, parseDraft, scoresFor, type BulkItem } from '../lib/bulkSelection'
import type { Person } from '../lib/database.types'
import { ensureMovies, releaseYear } from '../lib/tmdb'
import { MIN_QUERY_LENGTH, useMovieSearch } from '../lib/useMovieSearch'
import { createUndatedWatches } from '../lib/watches'
import { useHousehold } from '../state/household'

const DRAFT_KEY = 'filmavond.bulkDraft'
const TOAST_MS = 4000

/** What a tile needs to show a movie, selected or not. */
type Candidate = Omit<BulkItem, 'scores'>

function readDraft(): BulkItem[] {
  try {
    return parseDraft(localStorage.getItem(DRAFT_KEY))
  } catch {
    return []
  }
}

/**
 * Backfill mode: tap movies in the search results to select them, give stars
 * right there, and save the whole running selection at once without a date.
 */
export function BulkAdd() {
  const navigate = useNavigate()
  const { household, people, watches, refresh } = useHousehold()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<BulkItem[]>(readDraft)
  const [expanded, setExpanded] = useState(new Set<number>())
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const { movies, error } = useMovieSearch(query)
  const watchedIds = useMemo(() => new Set(watches.map((w) => w.tmdb_id)), [watches])
  const itemById = useMemo(() => new Map(items.map((i) => [i.tmdbId, i])), [items])
  const personIds = useMemo(() => people.map((p) => p.id), [people])
  const unratedCount = items.filter((item) => isUnrated(item, personIds)).length

  // Keep the selection across reloads and accidental navigation until it is saved.
  useEffect(() => {
    try {
      if (items.length) localStorage.setItem(DRAFT_KEY, JSON.stringify(items))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      // Storage unavailable; the selection then only lives for this visit.
    }
  }, [items])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  function deselect(tmdbId: number) {
    setItems((current) => current.filter((i) => i.tmdbId !== tmdbId))
  }

  function toggle(movie: Candidate) {
    if (itemById.has(movie.tmdbId)) {
      deselect(movie.tmdbId)
      return
    }
    if (watchedIds.has(movie.tmdbId) && !window.confirm(t.bulk.confirmDuplicate(movie.title))) return
    setItems((current) => [...current, { ...movie, scores: {} }])
    setFailure(null)
  }

  function setScores(tmdbId: number, scores: Record<string, number>) {
    setItems((current) => current.map((item) => (item.tmdbId === tmdbId ? { ...item, scores } : item)))
  }

  function toggleExpanded(tmdbId: number) {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(tmdbId)) next.add(tmdbId)
      return next
    })
  }

  async function saveAll() {
    if (!household || items.length === 0 || busy) return
    setBusy(true)
    setFailure(null)
    try {
      // Stores the movies in the shared `movies` table, which watches reference.
      const stored = await ensureMovies(items.map((i) => i.tmdbId))
      const ready = items.filter((i) => stored.has(i.tmdbId))
      const failed = items.filter((i) => !stored.has(i.tmdbId))
      await createUndatedWatches(
        household.id,
        // A draft can outlive a deleted family member; drop their scores.
        ready.map((item) => ({ tmdbId: item.tmdbId, scores: scoresFor(item.scores, personIds) })),
      )
      setItems(failed)
      setExpanded(new Set())
      if (ready.length) setToast(t.bulk.added(ready.length))
      if (failed.length) {
        setFailure(t.bulk.partialError(failed.length))
      } else {
        setQuery('')
        window.scrollTo({ top: 0 })
      }
      await refresh()
    } catch {
      setFailure(t.common.genericError)
    } finally {
      setBusy(false)
    }
  }

  const trimmed = query.trim()
  const searching = trimmed.length >= MIN_QUERY_LENGTH
  const results: Candidate[] | null = movies
    ? movies.map((m) => ({ tmdbId: m.id, title: m.title, year: releaseYear(m.release_date), posterPath: m.poster_path }))
    : null

  const tiles = (candidates: Candidate[]) => (
    <ul className="flex flex-col gap-2">
      {candidates.map((movie) => (
        <MovieTile
          key={movie.tmdbId}
          movie={movie}
          item={itemById.get(movie.tmdbId)}
          watched={watchedIds.has(movie.tmdbId)}
          people={people}
          open={expanded.has(movie.tmdbId)}
          onToggle={() => toggle(movie)}
          onToggleOpen={() => toggleExpanded(movie.tmdbId)}
          onScores={(scores) => setScores(movie.tmdbId, scores)}
        />
      ))}
    </ul>
  )

  return (
    <div className="flex flex-col gap-4">
      <BackLink onClick={() => navigate('/add')} />
      <div>
        <PageTitle>{t.bulk.title}</PageTitle>
        <p className="mt-1 text-muted">{t.bulk.intro}</p>
      </div>

      {items.length > 0 && (
        <section aria-label={t.bulk.selectedTitle(items.length)} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold">{t.bulk.selectedTitle(items.length)}</h2>
            <button
              type="button"
              className="min-h-11 px-1 text-sm font-bold text-muted underline"
              onClick={() => window.confirm(t.bulk.confirmClear) && setItems([])}
            >
              {t.bulk.clear}
            </button>
          </div>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-2 pb-1">
            {items.map((item) => (
              <li key={item.tmdbId} className="shrink-0">
                <button
                  type="button"
                  aria-label={t.bulk.remove(item.title)}
                  title={t.bulk.remove(item.title)}
                  onClick={() => deselect(item.tmdbId)}
                  className="relative block w-14"
                >
                  <Poster path={item.posterPath} title={item.title} size="w154" className="rounded-lg" />
                  <span
                    aria-hidden
                    className="absolute -top-2 -right-1.5 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-xs font-bold text-ink shadow"
                  >
                    ✕
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TextInput
        type="search"
        enterKeyHint="search"
        aria-label={t.search.label}
        placeholder={t.search.placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {failure && <ErrorNote>{failure}</ErrorNote>}
      {error && <ErrorNote>{t.common.genericError}</ErrorNote>}

      {!searching ? (
        // Nothing to search for: show the selection itself, so restored or
        // earlier picks can still be scored.
        items.length === 0 ? (
          <p className="text-muted">{t.bulk.emptyHint}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{t.bulk.selectedHint}</p>
            {tiles(items)}
          </>
        )
      ) : results === null ? (
        !error && <Spinner />
      ) : results.length === 0 ? (
        <p className="text-muted">{t.search.empty(trimmed)}</p>
      ) : (
        tiles(results)
      )}

      {items.length > 0 && (
        <>
          {/* Keeps the last tile and the footer clear of the fixed bar. */}
          <div aria-hidden className="h-16" />
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 px-3 pb-2">
            <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-3xl border border-line bg-surface p-2 pl-4 shadow-lg">
              <p className="min-w-0 flex-1 text-sm leading-tight">
                <span className="block font-bold">{t.bulk.selectedTitle(items.length)}</span>
                {unratedCount > 0 && (
                  <span className="block text-muted">
                    <span aria-hidden>⚠️ </span>
                    {t.bulk.unrated(unratedCount)} · {t.bulk.unratedHint}
                  </span>
                )}
              </p>
              <Button className="shrink-0" disabled={busy} onClick={() => void saveAll()}>
                {busy ? t.common.saving : t.bulk.save(items.length)}
              </Button>
            </div>
          </div>
        </>
      )}

      {toast && <Toast>{toast}</Toast>}
    </div>
  )
}

/** A movie that toggles on tap; once selected it carries its own star rows. */
function MovieTile({
  movie,
  item,
  watched,
  people,
  open,
  onToggle,
  onToggleOpen,
  onScores,
}: {
  movie: Candidate
  /** The selection entry, when this movie is selected. */
  item: BulkItem | undefined
  watched: boolean
  people: Person[]
  open: boolean
  onToggle: () => void
  onToggleOpen: () => void
  onScores: (scores: Record<string, number>) => void
}) {
  const selected = item !== undefined
  const scores = item?.scores ?? {}

  function setPerson(personId: string, score: number | null) {
    const next = { ...scores }
    if (score === null) delete next[personId]
    else next[personId] = score
    onScores(next)
  }

  return (
    <li
      className={`rounded-2xl border-2 transition-colors ${
        selected ? 'border-accent bg-accent/10' : 'border-line bg-surface'
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        className="flex min-h-16 w-full items-center gap-3 rounded-2xl p-1.5 text-left"
      >
        <Poster path={movie.posterPath} title={movie.title} size="w154" className="w-12 shrink-0 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-balance">{movie.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {movie.year}
            {watched && <span className="font-bold text-good">✓ {t.search.alreadyWatched}</span>}
          </span>
        </span>
        <span
          aria-hidden
          className={`mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold ${
            selected ? 'border-accent bg-accent text-on-accent' : 'border-line text-transparent'
          }`}
        >
          ✓
        </span>
      </button>

      {selected && people.length > 0 && (
        <div className="flex flex-col px-3 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <span className="text-sm font-bold">{t.bulk.everyone}</span>
            <StarsInput
              compact
              value={everyoneScore(
                scores,
                people.map((p) => p.id),
              )}
              onChange={(score) =>
                onScores(score === null ? {} : Object.fromEntries(people.map((p) => [p.id, score])))
              }
              label={t.bulk.everyoneStarLabel}
            />
          </div>

          {people.length > 1 && (
            <>
              <button
                type="button"
                aria-expanded={open}
                onClick={onToggleOpen}
                className="flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-muted"
              >
                <span aria-hidden>{open ? '▾' : '▸'}</span>
                {t.bulk.perPerson}
                {!open && (
                  <span className="ml-1 flex gap-1.5" aria-hidden>
                    {people.map((person) => (
                      <span key={person.id} className="flex items-center gap-0.5" title={person.name}>
                        <PersonAvatar person={person} size="sm" />
                        {scores[person.id] ?? '–'}
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
                        <PersonAvatar person={person} size="sm" />
                        <span className="truncate text-sm font-bold">{person.name}</span>
                      </span>
                      <StarsInput
                        compact
                        value={scores[person.id] ?? null}
                        onChange={(score) => setPerson(person.id, score)}
                        label={(score) => t.watchForm.starLabel(person.name, score)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}
