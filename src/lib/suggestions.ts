import type { TmdbMovieSummary } from './tmdb'

/** Pure suggestion scoring. No I/O here so it can be unit tested. */

/** Watched movies with an average at or above this are used as recommendation sources. */
export const SOURCE_THRESHOLD = 3.5
/** Scores are centred on the middle of the 1–5 scale. */
export const NEUTRAL_SCORE = 3
/** How strongly genre taste nudges a candidate (affinity ranges from -2 to 2). */
export const GENRE_WEIGHT = 0.25
export const MAX_SUGGESTIONS = 20
/** Candidates a shuffle draws from. */
export const POOL_SIZE = 80
/** Pool places kept for genre-based (discover) candidates, which score low by design. */
export const DISCOVER_SLOTS = 15
/** Below 1 sharpens the weights so strong matches dominate a shuffle; above 1 flattens them. */
export const SHUFFLE_TEMPERATURE = 0.7
/** Added after shifting scores to zero, so the weakest candidate still has a chance. */
export const WEIGHT_FLOOR = 0.25
/** Weight multiplier for movies shown in the last few shuffles. */
export const REPEAT_PENALTY = 0.02

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
  /** Liked movies that recommended this one, strongest first. Empty for genre-based candidates. */
  sources: { tmdbId: number; title: string; weight: number }[]
  /** For genre-based candidates: the best-liked genre the movie has. */
  genreMatch?: number
}

/**
 * Ranks recommendation candidates.
 *
 * score = Σ over source movies recommending it of (source average − 3)
 *       + GENRE_WEIGHT × mean genre affinity of the candidate's genres
 *
 * Movies from `discover` that no source recommends have no first term, so
 * their score comes from genre affinity only.
 */
export function rankCandidates(input: {
  rated: RatedMovie[]
  /** Source movie id → TMDB recommendations for it. */
  recommendations: Map<number, TmdbMovieSummary[]>
  /** Movie ids never to suggest (watched and dismissed). */
  excluded: Set<number>
  /** Extra movies found by genre (TMDB discover). */
  discover?: TmdbMovieSummary[]
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

  for (const movie of input.discover ?? []) {
    if (input.excluded.has(movie.id) || candidates.has(movie.id)) continue
    const liked = movie.genre_ids
      .filter((id) => affinity.has(id))
      .sort((a, b) => affinity.get(b)! - affinity.get(a)!)
    candidates.set(movie.id, { movie, score: 0, sources: [], genreMatch: liked[0] })
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

/** The best-liked genres (positive affinity only), strongest first. */
export function topGenres(rated: RatedMovie[], count = 2): number[] {
  return [...genreAffinity(rated)]
    .filter(([, affinity]) => affinity > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, count)
    .map(([genreId]) => genreId)
}

/** Adds extra recommendation pages to the first pages, per source movie. */
export function mergeRecommendations(
  first: Map<number, TmdbMovieSummary[]>,
  more: Map<number, TmdbMovieSummary[]>,
): Map<number, TmdbMovieSummary[]> {
  const merged = new Map(first)
  for (const [sourceId, movies] of more) merged.set(sourceId, [...(merged.get(sourceId) ?? []), ...movies])
  return merged
}

/**
 * The candidates a shuffle draws from: the best `size` of a ranking. Genre-based
 * candidates always score below recommended ones, so a few places are kept for
 * the best of them; otherwise they would never make the pool.
 */
export function buildPool(ranked: Candidate[], size = POOL_SIZE, discoverSlots = DISCOVER_SLOTS): Candidate[] {
  const genreBased = ranked.filter((c) => c.sources.length === 0).slice(0, discoverSlots)
  const recommended = ranked.filter((c) => c.sources.length > 0).slice(0, size - genreBased.length)
  return [...recommended, ...genreBased.slice(0, size - recommended.length)]
}

/** Small seedable random generator (mulberry32) returning numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Puts the pool in a weighted random order: repeatedly draws one candidate
 * without replacement, so the first N are a weighted sample of size N.
 *
 * weight = (score − lowest score + WEIGHT_FLOOR) ^ (1 / temperature),
 * multiplied by `repeatPenalty` for recently shown movies.
 */
export function weightedOrder(
  pool: Candidate[],
  options: {
    rng: () => number
    recentIds?: Set<number>
    temperature?: number
    repeatPenalty?: number
  },
): Candidate[] {
  const { rng, recentIds, temperature = SHUFFLE_TEMPERATURE, repeatPenalty = REPEAT_PENALTY } = options
  const lowest = Math.min(...pool.map((c) => c.score))
  const remaining = pool.map((candidate) => ({
    candidate,
    weight:
      Math.pow(candidate.score - lowest + WEIGHT_FLOOR, 1 / temperature) *
      (recentIds?.has(candidate.movie.id) ? repeatPenalty : 1),
  }))

  const order: Candidate[] = []
  while (remaining.length > 0) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0)
    let target = rng() * total
    let index = 0
    while (index < remaining.length - 1 && target >= remaining[index].weight) {
      target -= remaining[index].weight
      index++
    }
    order.push(remaining.splice(index, 1)[0].candidate)
  }
  return order
}

/**
 * A per-movie pseudo-random sort key for displaying a shuffle in random order.
 * Unlike shuffling the array, the order of the other movies stays put when one
 * is dismissed and another takes its place.
 */
export function displayKey(tmdbId: number, seed: number): number {
  return seededRandom((seed ^ Math.imul(tmdbId, 0x9e3779b1)) >>> 0)()
}

export type VisibleSuggestion = { candidate: Candidate; certification: string | null }

/**
 * Walks candidates in the given order and keeps the first `count` that pass
 * the age filter. `certificationOf` returns undefined for movies whose details
 * are not loaded yet; the walk stops there and reports the next `batch` ids to
 * load in `pending`, so only as many lookups happen as are needed.
 */
export function selectVisible(
  order: Candidate[],
  options: {
    certificationOf: (tmdbId: number) => string | null | undefined
    /** True/false for a known certification, null when it is unknown. */
    isAllowed: (certification: string | null) => boolean | null
    hideUnknown: boolean
    count?: number
    batch?: number
    /** False once the lookup budget is spent; the walk then just ends. */
    canLookup?: boolean
  },
): { visible: VisibleSuggestion[]; pending: number[] } {
  const { certificationOf, isAllowed, hideUnknown, count = MAX_SUGGESTIONS, batch = 12, canLookup = true } = options
  const visible: VisibleSuggestion[] = []
  for (let i = 0; i < order.length && visible.length < count; i++) {
    const candidate = order[i]
    const certification = certificationOf(candidate.movie.id)
    if (certification === undefined) {
      const pending = canLookup
        ? order
            .slice(i)
            .map((c) => c.movie.id)
            .filter((id) => certificationOf(id) === undefined)
            .slice(0, batch)
        : []
      return { visible, pending }
    }
    const allowed = isAllowed(certification)
    if (allowed === false || (allowed === null && hideUnknown)) continue
    visible.push({ candidate, certification })
  }
  return { visible, pending: [] }
}
