import type { Movie, MovieInsert } from './database.types'
import { nlCertification, type TmdbReleaseDates } from './kijkwijzer'
import { supabase } from './supabase'

/** The subset of a TMDB movie list item the app uses (search, recommendations). */
export type TmdbMovieSummary = {
  id: number
  title: string
  original_title: string
  release_date: string
  poster_path: string | null
  genre_ids: number[]
  overview: string
}

type TmdbList = { results: TmdbMovieSummary[] }
type TmdbGenre = { id: number; name: string }
type TmdbMovieDetails = {
  id: number
  title: string
  original_title: string
  release_date: string
  poster_path: string | null
  genres: TmdbGenre[]
  runtime: number | null
  overview: string
  release_dates?: TmdbReleaseDates
}

const DAY = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'filmavond.tmdb.'

/** Calls the `tmdb` Edge Function, which proxies an allowlist of TMDB endpoints. */
async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tmdb', { body: { path, params } })
  if (error) throw error
  return data as T
}

function cacheRead<T>(key: string, maxAge: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as { at: number; value: T }
    return Date.now() - entry.at < maxAge ? entry.value : null
  } catch {
    return null
  }
}

function cacheWrite(key: string, value: unknown) {
  const entry = JSON.stringify({ at: Date.now(), value })
  try {
    localStorage.setItem(CACHE_PREFIX + key, entry)
  } catch {
    // Most likely the quota: drop our own cache and try once more.
    try {
      clearTmdbCache()
      localStorage.setItem(CACHE_PREFIX + key, entry)
    } catch {
      // Storage unavailable; carry on without caching.
    }
  }
}

export function clearTmdbCache() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key)
  }
}

function slim(movie: TmdbMovieSummary): TmdbMovieSummary {
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title,
    release_date: movie.release_date ?? '',
    poster_path: movie.poster_path,
    genre_ids: movie.genre_ids ?? [],
    overview: movie.overview ?? '',
  }
}

export function releaseYear(releaseDate: string | null | undefined): number | null {
  const year = Number.parseInt((releaseDate ?? '').slice(0, 4), 10)
  return Number.isFinite(year) ? year : null
}

export function posterUrl(posterPath: string | null, size: 'w154' | 'w342' | 'w500' = 'w342'): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null
}

const searchCache = new Map<string, TmdbMovieSummary[]>()

export async function searchMovies(query: string): Promise<TmdbMovieSummary[]> {
  const key = query.trim().toLowerCase()
  const cached = searchCache.get(key)
  if (cached) return cached
  const data = await tmdb<TmdbList>('search/movie', { query: query.trim() })
  const results = data.results.map(slim)
  searchCache.set(key, results)
  return results
}

/** Genre id → Dutch genre name. */
export async function getGenres(): Promise<Record<number, string>> {
  const cached = cacheRead<Record<number, string>>('genres', 30 * DAY)
  if (cached) return cached
  const data = await tmdb<{ genres: TmdbGenre[] }>('genre/movie/list')
  const genres = Object.fromEntries(data.genres.map((g) => [g.id, g.name]))
  cacheWrite('genres', genres)
  return genres
}

export async function getRecommendations(tmdbId: number, page = 1): Promise<TmdbMovieSummary[]> {
  const key = page === 1 ? `rec.${tmdbId}` : `rec.${tmdbId}.p${page}`
  const cached = cacheRead<TmdbMovieSummary[]>(key, 7 * DAY)
  if (cached) return cached
  const data = await tmdb<TmdbList>(`movie/${tmdbId}/recommendations`, page === 1 ? {} : { page })
  const results = data.results.map(slim)
  cacheWrite(key, results)
  return results
}

async function fetchMovie(tmdbId: number): Promise<MovieInsert> {
  const details = await tmdb<TmdbMovieDetails>(`movie/${tmdbId}`, { append_to_response: 'release_dates' })
  return {
    tmdb_id: details.id,
    title: details.title,
    original_title: details.original_title || null,
    year: releaseYear(details.release_date),
    poster_path: details.poster_path,
    genre_ids: details.genres.map((g) => g.id),
    runtime: details.runtime || null,
    certification_nl: nlCertification(details),
    overview: details.overview || null,
    cached_at: new Date().toISOString(),
  }
}

async function discoverPage(genreIds: number[], page: number): Promise<TmdbMovieSummary[]> {
  const key = `disc.${genreIds.join('-')}.p${page}`
  const cached = cacheRead<TmdbMovieSummary[]>(key, 7 * DAY)
  if (cached) return cached
  const data = await tmdb<TmdbList>('discover/movie', {
    // Comma-separated means the movie must have all of these genres.
    with_genres: genreIds.join(','),
    sort_by: 'vote_average.desc',
    'vote_count.gte': 200,
    page,
  })
  const results = data.results.map(slim)
  cacheWrite(key, results)
  return results
}

/**
 * Well-rated movies that have all the given genres. A narrow genre combination
 * may have fewer pages than asked for; an empty page falls back to page 1.
 */
export async function discoverMovies(genreIds: number[], page: number): Promise<TmdbMovieSummary[]> {
  const results = await discoverPage(genreIds, page)
  return results.length > 0 || page === 1 ? results : discoverPage(genreIds, 1)
}

/** A cached movie without a certification is re-checked after this long. */
const UNKNOWN_CERTIFICATION_TTL = 30 * DAY

function isFresh(movie: Movie): boolean {
  return movie.certification_nl !== null || Date.now() - Date.parse(movie.cached_at) < UNKNOWN_CERTIFICATION_TTL
}

/**
 * Returns full movie rows for the given ids, using the shared `movies` table
 * as a cache: only ids that are missing (or stale) are fetched from TMDB and
 * then upserted. Ids that fail to load are left out of the result.
 */
export async function ensureMovies(tmdbIds: number[]): Promise<Map<number, Movie>> {
  const result = new Map<number, Movie>()
  if (tmdbIds.length === 0) return result

  const { data, error } = await supabase.from('movies').select('*').in('tmdb_id', tmdbIds)
  if (error) throw error
  for (const movie of data) if (isFresh(movie)) result.set(movie.tmdb_id, movie)

  const missing = tmdbIds.filter((id) => !result.has(id))
  if (missing.length === 0) return result

  const fetched = (await Promise.allSettled(missing.map(fetchMovie))).flatMap((r) =>
    r.status === 'fulfilled' ? [r.value] : [],
  )
  if (fetched.length === 0) {
    if (result.size === 0) throw new Error('Could not load movie details from TMDB')
    return result
  }
  const saved = await supabase.from('movies').upsert(fetched).select()
  if (saved.error) throw saved.error
  for (const movie of saved.data) result.set(movie.tmdb_id, movie)
  return result
}

/** Loads one movie and makes sure it exists in the `movies` table. */
export async function ensureMovie(tmdbId: number): Promise<Movie> {
  const movie = (await ensureMovies([tmdbId])).get(tmdbId)
  if (!movie) throw new Error(`Movie ${tmdbId} not found`)
  return movie
}


