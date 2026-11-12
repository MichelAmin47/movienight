import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Carousel, type CarouselItem } from '../components/Carousel'
import { GenreChips } from '../components/GenreChips'
import { Poster } from '../components/Poster'
import { Button, PageTitle } from '../components/ui'
import { ViewSwitcher } from '../components/ViewSwitcher'
import { t } from '../i18n/strings'
import type { Movie } from '../lib/database.types'
import { useViewMode } from '../lib/prefs'
import { useGenreNames } from '../lib/useGenres'
import { useHousehold } from '../state/household'

/** Title, year, Kijkwijzer, genres and the two actions of one watchlist movie. */
function WatchlistInfo({
  movie,
  genreNames,
  large = false,
  onRemove,
}: {
  movie: Movie
  genreNames: Record<number, string> | null
  large?: boolean
  onRemove: () => void
}) {
  return (
    <>
      <h2 className={`${large ? 'text-xl' : 'text-lg'} leading-tight font-extrabold text-balance`}>
        <Link to={`/movie/${movie.tmdb_id}`}>{movie.title}</Link>
      </h2>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {movie.year}
        <span className={`rounded-full bg-raised px-2 py-0.5 text-xs font-bold ${movie.certification_nl ? 'text-good' : ''}`}>
          {movie.certification_nl ? t.suggestions.ageLabel(movie.certification_nl) : t.suggestions.unknownAge}
        </span>
        {movie.runtime ? <span>{t.common.minutes(movie.runtime)}</span> : null}
      </p>
      <GenreChips genreIds={movie.genre_ids} names={genreNames} max={3} />
      <div className="mt-1 flex flex-wrap gap-2">
        <Link
          to={`/add/${movie.tmdb_id}`}
          className="inline-flex min-h-11 items-center rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent"
        >
          ✓ {t.watchlist.watched}
        </Link>
        <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={onRemove}>
          {t.common.delete}
        </Button>
      </div>
    </>
  )
}

export function Watchlist() {
  const { watchlist, watchlistIds, toggleWatchlist } = useHousehold()
  const navigate = useNavigate()
  const [view, setView] = useViewMode('watchlist')
  const genreNames = useGenreNames()

  // Newest first. A movie that is being removed disappears at once (and comes back if that fails).
  const entries = useMemo(
    () => watchlist.filter((entry) => watchlistIds.has(entry.tmdb_id)),
    [watchlist, watchlistIds],
  )
  const carouselItems = useMemo<CarouselItem[]>(
    () =>
      entries.map(({ movie }) => ({ key: String(movie.tmdb_id), title: movie.title, posterPath: movie.poster_path })),
    [entries],
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <PageTitle>{t.watchlist.title}</PageTitle>
          {entries.length > 0 && <span className="text-sm text-muted">{t.watchlist.count(entries.length)}</span>}
        </div>
        <p className="mt-1 text-muted">{t.watchlist.intro}</p>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 pt-10 text-center">
          <div className="text-6xl" aria-hidden>
            ⭐
          </div>
          <p className="max-w-xs text-lg text-muted">{t.watchlist.empty}</p>
        </div>
      ) : (
        <>
          <ViewSwitcher value={view} onChange={setView} />
          {view === 'carousel' ? (
            <Carousel items={carouselItems} onOpen={(index) => navigate(`/movie/${entries[index].tmdb_id}`)}>
              {(index) => {
                const { movie } = entries[index]
                return (
                  <WatchlistInfo
                    movie={movie}
                    genreNames={genreNames}
                    large
                    onRemove={() => void toggleWatchlist(movie.tmdb_id)}
                  />
                )
              }}
            </Carousel>
          ) : (
            <ol className="flex flex-col gap-3">
              {entries.map(({ movie }) => (
                <li key={movie.tmdb_id} className="flex gap-3 rounded-3xl border border-line bg-surface p-3">
                  <Link to={`/movie/${movie.tmdb_id}`} className="w-24 shrink-0 self-start" aria-hidden tabIndex={-1}>
                    <Poster path={movie.poster_path} title={movie.title} />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <WatchlistInfo
                      movie={movie}
                      genreNames={genreNames}
                      onRemove={() => void toggleWatchlist(movie.tmdb_id)}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
