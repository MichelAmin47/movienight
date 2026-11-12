import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { GenreChips } from '../components/GenreChips'
import { BackLink, MovieHeader } from '../components/MovieHeader'
import { Button, ErrorNote, Spinner } from '../components/ui'
import { WatchlistStar } from '../components/WatchlistStar'
import { t } from '../i18n/strings'
import type { Movie } from '../lib/database.types'
import { ensureMovie } from '../lib/tmdb'
import { useGenreNames } from '../lib/useGenres'
import { useHousehold } from '../state/household'

/** Detail page of a movie that is not (necessarily) watched yet: a tip, a search result or a watchlist movie. */
export function MovieDetail() {
  const tmdbId = Number(useParams().tmdbId)
  const navigate = useNavigate()
  const { watches } = useHousehold()
  const genreNames = useGenreNames()
  const [loaded, setLoaded] = useState<Movie | null>(null)
  const [failedId, setFailedId] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    ensureMovie(tmdbId)
      .then((m) => !cancelled && setLoaded(m))
      .catch(() => !cancelled && setFailedId(tmdbId))
    return () => {
      cancelled = true
    }
  }, [tmdbId, attempt])

  const movie = loaded?.tmdb_id === tmdbId ? loaded : null
  // `watches` is newest first.
  const watched = watches.find((watch) => watch.tmdb_id === tmdbId)

  return (
    <div className="flex flex-col gap-4">
      <BackLink onClick={() => navigate(-1)} />
      {movie ? (
        <>
          <MovieHeader movie={movie}>
            <GenreChips genreIds={movie.genre_ids} names={genreNames} />
          </MovieHeader>
          <div className="flex flex-wrap gap-2">
            <WatchlistStar tmdbId={movie.tmdb_id} title={movie.title} labelled />
            <Link
              to={`/add/${movie.tmdb_id}`}
              className="inline-flex min-h-11 items-center rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent"
            >
              ✓ {t.movie.watched}
            </Link>
          </div>
          {watched && (
            <Link to={`/watch/${watched.id}`} className="inline-flex min-h-11 items-center self-start font-bold text-good">
              ✓ {t.movie.watchedBefore}
            </Link>
          )}
          <p className="text-muted">{movie.overview || t.movie.noOverview}</p>
        </>
      ) : failedId === tmdbId ? (
        <>
          <ErrorNote>{t.common.genericError}</ErrorNote>
          <Button
            onClick={() => {
              setFailedId(null)
              setAttempt((n) => n + 1)
            }}
          >
            {t.common.retry}
          </Button>
        </>
      ) : (
        <Spinner />
      )}
    </div>
  )
}
