import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Poster } from '../components/Poster'
import { ErrorNote, PageTitle, Spinner, TextInput } from '../components/ui'
import { t } from '../i18n/strings'
import { releaseYear } from '../lib/tmdb'
import { MIN_QUERY_LENGTH, useMovieSearch } from '../lib/useMovieSearch'
import { useHousehold } from '../state/household'

export function Search() {
  const { watches } = useHousehold()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const { movies: current, error } = useMovieSearch(query)
  const watchedIds = useMemo(() => new Set(watches.map((w) => w.tmdb_id)), [watches])
  const trimmed = query.trim()

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
      {trimmed.length < MIN_QUERY_LENGTH ? (
        <>
          <p className="text-muted">{t.search.hint}</p>
          <Link
            to="/add/bulk"
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2 hover:bg-raised"
          >
            <span className="text-2xl" aria-hidden>
              ⚡
            </span>
            <span className="flex-1">
              <span className="block font-bold">{t.search.bulkLink}</span>
              <span className="block text-sm text-muted">{t.search.bulkLinkHint}</span>
            </span>
            <span aria-hidden className="text-xl text-muted">
              ›
            </span>
          </Link>
        </>
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
