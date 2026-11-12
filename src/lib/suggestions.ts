import type { TmdbMovieSummary } from './tmdb'

/** Pure suggestion scoring. No I/O here so it can be unit tested. */

/** Watched movies with an average at or above this are used as recommendation sources. */
export const SOURCE_THRESHOLD = 3.5
/** Scores are centred on the middle of the 1–5 scale. */
export const NEUTRAL_SCORE = 3
/** How strongly genre taste nudges a candidate (affinity ranges from -2 to 2). */
export const GENRE_WEIGHT = 0.25
export const MAX_SUGGESTIONS = 20

export type RatedMovie = { tmdbId: number; title: string; genreIds: number[]; score: number }

type WatchLike = {
  tmdb_id: number
  movie: { title: string; genre_ids: number[] }
  ratings: { person_id: string; score: number }[]
}

/**
 * One entry per watched movie with its average score over all viewings.
 * With `personId`, only that person's scores count. Unrated movies are left out.
 */
export function ratedMovies(watches: WatchLike[], personId: string | null = null): RatedMovie[] {
  const byMovie = new Map<number, { title: string; genreIds: number[]; scores: number[] }>()
  for (const watch of watches) {
    const scores = watch.ratings.filter((r) => !personId || r.person_id === personId).map((r) => r.score)
    if (scores.length === 0) continue
    const entry = byMovie.get(watch.tmdb_id) ?? {
      title: watch.movie.title,
      genreIds: watch.movie.genre_ids,
      scores: [],
    }
    entry.scores.push(...scores)
    byMovie.set(watch.tmdb_id, entry)
  }
  return [...byMovie].map(([tmdbId, { title, genreIds, scores }]) => ({
    tmdbId,
    title,
    genreIds,
    score: scores.reduce((sum, s) => sum + s, 0) / scores.length,
  }))
}

export function sourceMovies(rated: RatedMovie[]): RatedMovie[] {
  return rated.filter((movie) => movie.score >= SOURCE_THRESHOLD)
}

/**
 * Genre id → how much the genre is liked, as the mean of (score − 3) over the
 * rated movies in that genre. One phantom neutral movie is added so a genre
 * seen once does not swing as hard as one seen ten times.
 */
export function genreAffinity(rated: RatedMovie[]): Map<number, number> {
  const totals = new Map<number, { sum: number; count: number }>()
  for (const movie of rated) {
    for (const genreId of movie.genreIds) {
      const total = totals.get(genreId) ?? { sum: 0, count: 0 }
      total.sum += movie.score - NEUTRAL_SCORE
      total.count += 1
      totals.set(genreId, total)
    }
  }
  return new Map([...totals].map(([genreId, { sum, count }]) => [genreId, sum / (count + 1)]))
}

export type Candidate = {
  movie: TmdbMovieSummary
  score: number
  /** Liked movies that recommended this one, strongest first. */
  sources: { tmdbId: number; title: string; weight: number }[]
}

/**
 * Ranks recommendation candidates.
 *
 * score = Σ over source movies recommending it of (source average − 3)
 *       + GENRE_WEIGHT × mean genre affinity of the candidate's genres
 */
export function rankCandidates(input: {
  rated: RatedMovie[]
  /** Source movie id → TMDB recommendations for it. */
  recommendations: Map<number, TmdbMovieSummary[]>
  /** Movie ids never to suggest (watched and dismissed). */
  excluded: Set<number>
}): Candidate[] {
  const affinity = genreAffinity(input.rated)
  const candidates = new Map<number, Candidate>()

  for (const source of sourceMovies(input.rated)) {
    const weight = source.score - NEUTRAL_SCORE
    for (const movie of input.recommendations.get(source.tmdbId) ?? []) {
      if (input.excluded.has(movie.id)) continue
      const candidate = candidates.get(movie.id) ?? { movie, score: 0, sources: [] }
      // TMDB can list a movie twice in one response; count each source once.
      if (candidate.sources.some((s) => s.tmdbId === source.tmdbId)) continue
      candidate.score += weight
      candidate.sources.push({ tmdbId: source.tmdbId, title: source.title, weight })
      candidates.set(movie.id, candidate)
    }
  }

  for (const candidate of candidates.values()) {
    const known = candidate.movie.genre_ids.flatMap((id) => (affinity.has(id) ? [affinity.get(id)!] : []))
    if (known.length) {
      candidate.score += (GENRE_WEIGHT * known.reduce((sum, a) => sum + a, 0)) / known.length
    }
    candidate.sources.sort((a, b) => b.weight - a.weight)
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score || a.movie.id - b.movie.id)
}
