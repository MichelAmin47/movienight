import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PersonAvatar } from '../components/PersonAvatar'
import { Poster } from '../components/Poster'
import { StarsDisplay } from '../components/Stars'
import { Card, PageTitle } from '../components/ui'
import { t } from '../i18n/strings'
import { average, formatScore } from '../lib/format'
import { ratedMovies } from '../lib/suggestions'
import { getGenres } from '../lib/tmdb'
import { useHousehold } from '../state/household'

const TOP_GENRES = 5

export function Stats() {
  const { watches, people } = useHousehold()
  const [genreNames, setGenreNames] = useState<Record<number, string> | null>(null)

  useEffect(() => {
    let cancelled = false
    getGenres()
      .then((names) => !cancelled && setGenreNames(names))
      .catch(() => {
        // Without names the genre section is simply left out.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rated = useMemo(() => ratedMovies(watches), [watches])
  const movieCount = new Set(watches.map((w) => w.tmdb_id)).size
  const overall = average(watches.flatMap((w) => w.ratings.map((r) => r.score)))

  const perPerson = useMemo(
    () =>
      people.map((person) => {
        // `watches` is newest first, so on a tie the most recently watched movie wins.
        const own = ratedMovies(watches, person.id)
        const favorite = own.reduce<(typeof own)[number] | null>(
          (best, movie) => (!best || movie.score > best.score ? movie : best),
          null,
        )
        return {
          person,
          count: own.length,
          avg: average(own.map((m) => m.score)),
          favorite,
          favoriteWatch: favorite ? watches.find((w) => w.tmdb_id === favorite.tmdbId) : undefined,
        }
      }),
    [people, watches],
  )

  const genres = useMemo(() => {
    const byGenre = new Map<number, number[]>()
    for (const movie of rated) {
      for (const id of movie.genreIds) byGenre.set(id, [...(byGenre.get(id) ?? []), movie.score])
    }
    const all = [...byGenre].map(([id, scores]) => ({ id, count: scores.length, avg: average(scores)! }))
    // Prefer genres seen more than once so a single lucky movie does not top the list.
    const repeated = all.filter((g) => g.count >= 2)
    return (repeated.length >= 3 ? repeated : all)
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, TOP_GENRES)
  }, [rated])

  if (watches.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle>{t.stats.title}</PageTitle>
        <p className="text-muted">{t.stats.empty}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t.stats.title}</PageTitle>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: t.stats.moviesWatched, value: String(movieCount) },
          { label: t.stats.viewings, value: String(watches.length) },
          { label: t.stats.averageScore, value: overall === null ? '–' : formatScore(overall) },
        ].map((tile) => (
          <div key={tile.label} className="flex flex-col-reverse rounded-3xl border border-line bg-surface p-3 text-center">
            <dt className="text-xs font-bold text-muted">{tile.label}</dt>
            <dd className="text-3xl font-extrabold">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">{t.stats.favorites}</h2>
        <ul className="flex flex-col gap-3">
          {perPerson.map(({ person, count, avg, favorite, favoriteWatch }) => (
            <li key={person.id} className="flex items-center gap-3">
              <PersonAvatar person={person} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{person.name}</p>
                {favorite && avg !== null ? (
                  <>
                    <p className="truncate text-sm">
                      <StarsDisplay value={favorite.score} className="mr-1.5" />
                      {favorite.title}
                    </p>
                    <p className="text-xs text-muted">{t.stats.personAverage(formatScore(avg), count)}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted">{t.stats.noFavorite}</p>
                )}
              </div>
              {favoriteWatch && (
                <Link to={`/watch/${favoriteWatch.id}`} aria-label={favoriteWatch.movie.title} className="shrink-0">
                  <Poster
                    path={favoriteWatch.movie.poster_path}
                    title={favoriteWatch.movie.title}
                    size="w154"
                    className="w-12 rounded-lg"
                  />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {genreNames && genres.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">{t.stats.topGenres}</h2>
          <ol className="flex flex-col gap-3">
            {genres.map((genre) => (
              <li key={genre.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-bold">{genreNames[genre.id] ?? `#${genre.id}`}</span>
                  <span className="text-sm text-muted">
                    ★ {formatScore(genre.avg)} · {t.stats.genreCount(genre.count)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-star" style={{ width: `${(genre.avg / 5) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  )
}
