import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Poster } from '../components/Poster'
import { ErrorNote, PageTitle, Spinner, TextInput } from '../components/ui'
import { t } from '../i18n/strings'
import { releaseYear, searchMovies, type TmdbMovieSummary } from '../lib/tmdb'
import { useHousehold } from '../state/household'

const DEBOUNCE_MS = 350

export function Search() {
  const { watches } = useHousehold()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [results, setResults] = useState<{ query: string; movies: TmdbMovieSummary[] } | null>(null)
  const [error, setError] = useState(false)

  const watchedIds = useMemo(() => new Set(watches.map((w) => w.tmdb_id)), [watches])
  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < 2) return
    let cancelled = false
    const timer = setTimeout(() => {
      searchMovies(trimmed)
        .then((movies) => {
          if (cancelled) return
          setResults({ query: trimmed, movies })
          setError(false)
        })
        .catch(() => {
          if (!cancelled) setError(true)
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [trimmed])

  const current = trimmed.length >= 2 && results?.query === trimmed ? results.movies : null

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{t.search.title}</PageTitle>
      <TextInput
        type="search"
        autoFocus
        enterKeyHint="search"
        aria-label={t.search.label}
        placeholder={t.search.placeholder}
        value={query}
        onChange={(e) => setSearchParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
      />

      {error && <ErrorNote>{t.common.genericError}</ErrorNote>}
      {trimmed.length < 2 ? (
        <p className="text-muted">{t.search.hint}</p>
      ) : current === null ? (
        !error && <Spinner />
      ) : current.length === 0 ? (
        <p className="text-muted">{t.search.empty(trimmed)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {current.map((movie) => (
            <li key={movie.id}>
              <Link
                to={`/add/${movie.id}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2 hover:bg-raised"
              >
                <Poster path={movie.poster_path} title={movie.title} size="w154" className="w-16 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-balance">{movie.title}</span>
                  <span className="block text-sm text-muted">
                    {[releaseYear(movie.release_date), movie.original_title !== movie.title && movie.original_title]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {watchedIds.has(movie.id) && (
                    <span className="mt-1 inline-block rounded-full bg-raised px-2 py-0.5 text-xs font-bold text-good">
                      ✓ {t.search.alreadyWatched}
                    </span>
                  )}
                </span>
                <span aria-hidden className="pr-2 text-xl text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
