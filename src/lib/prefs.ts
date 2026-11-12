import { useCallback, useState } from 'react'
import { DEFAULT_MAX_AGE, type MaxAge } from './kijkwijzer'

/** Per-device preferences (there is no settings table in the schema). */
export type Prefs = {
  /** Highest Kijkwijzer age shown in suggestions. */
  maxAge: MaxAge
  /** Hide suggestions that have no Dutch certification. */
  hideUnknown: boolean
}

const KEY = 'filmavond.prefs'
const defaults: Prefs = { maxAge: DEFAULT_MAX_AGE, hideUnknown: false }

function read(): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
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
