import { useEffect, useState } from 'react'
import { getGenres } from './tmdb'

let request: Promise<Record<number, string>> | null = null

/**
 * Genre id → Dutch name, or null until loaded. One request per visit at most
 * (and `getGenres` caches the answer in localStorage for a month). Without
 * names the genres are simply not shown.
 */
export function useGenreNames(): Record<number, string> | null {
  const [names, setNames] = useState<Record<number, string> | null>(null)
  useEffect(() => {
    let cancelled = false
    request ??= getGenres()
    request
      .then((loaded) => !cancelled && setNames(loaded))
      .catch(() => {
        // Try again the next time a page needs the names.
        request = null
      })
    return () => {
      cancelled = true
    }
  }, [])
  return names
}

/** The names of the given genres, in order, skipping ids without a name. */
export function genreLabels(genreIds: number[], names: Record<number, string> | null): string[] {
  if (!names) return []
  return genreIds.flatMap((id) => (names[id] ? [names[id]] : []))
}
