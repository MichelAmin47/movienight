import { useEffect, useState } from 'react'
import { searchMovies, type TmdbMovieSummary } from './tmdb'

const DEBOUNCE_MS = 350
export const MIN_QUERY_LENGTH = 2

/**
 * Debounced TMDB search. `movies` is null while the current query has no
 * results yet (still typing or loading).
 */
export function useMovieSearch(query: string): { movies: TmdbMovieSummary[] | null; error: boolean } {
  const trimmed = query.trim()
  const [results, setResults] = useState<{ query: string; movies: TmdbMovieSummary[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return
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

  const current = trimmed.length >= MIN_QUERY_LENGTH && results?.query === trimmed ? results.movies : null
  return { movies: current, error }
}
