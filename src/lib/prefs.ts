import { useCallback, useState } from 'react'

/** Per-device preferences (there is no settings table in the schema). */
export type Prefs = {
  /** Also suggest movies with Kijkwijzer 16 or 18. */
  showAdult: boolean
  /** Hide suggestions that have no Dutch certification. */
  hideUnknown: boolean
}

const KEY = 'filmavond.prefs'
const defaults: Prefs = { showAdult: false, hideUnknown: false }

function read(): Prefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // Read field by field so keys from older versions are dropped.
    return { showAdult: stored.showAdult === true, hideUnknown: stored.hideUnknown === true }
  } catch {
    return defaults
  }
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState(read)
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Storage can be unavailable (private mode); the choice then lasts for this visit.
      }
      return next
    })
  }, [])
  return [prefs, update]
}

export type ViewMode = 'grid' | 'carousel'

/** Grid or carousel, remembered per page and per device. */
export function useViewMode(page: 'watched' | 'suggestions' | 'watchlist'): [ViewMode, (mode: ViewMode) => void] {
  const key = `filmavond.view.${page}`
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(key) === 'carousel' ? 'carousel' : 'grid'
    } catch {
      return 'grid'
    }
  })
  const update = useCallback(
    (next: ViewMode) => {
      setMode(next)
      try {
        localStorage.setItem(key, next)
      } catch {
        // Storage unavailable; the choice then lasts for this visit.
      }
    },
    [key],
  )
  return [mode, update]
}
