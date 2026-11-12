import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Household, Movie, Person, Rating, Watch } from '../lib/database.types'
import { avatarUrlCache } from '../lib/avatars'
import { supabase } from '../lib/supabase'

/** A watch joined with its movie and the ratings given that evening. */
export type WatchEntry = Watch & { movie: Movie; ratings: Rating[] }

type HouseholdData = {
  household: Household | null
  memberCount: number
  people: Person[]
  watches: WatchEntry[]
  dismissed: number[]
  /** Signed URLs of the people's own pictures, keyed by `avatar_path`. */
  avatarUrls: Record<string, string>
}

type HouseholdState = HouseholdData & {
  loading: boolean
  error: string | null
  /** Reloads everything from the database. */
  refresh: () => Promise<void>
}

const empty: HouseholdData = { household: null, memberCount: 0, people: [], watches: [], dismissed: [], avatarUrls: {} }

const HouseholdContext = createContext<HouseholdState>({
  ...empty,
  loading: true,
  error: null,
  refresh: async () => {},
})

function avatarPaths(people: Person[]): string[] {
  return people.flatMap((person) => (person.avatar_path ? [person.avatar_path] : []))
}

/** A failure only costs the pictures (emoji fallback), never the whole page. */
async function loadAvatarUrls(people: Person[]): Promise<Record<string, string>> {
  const paths = avatarPaths(people)
  if (paths.length === 0) return {}
  try {
    return await avatarUrlCache.get(paths)
  } catch {
    return {}
  }
}

async function loadHousehold(userId: string): Promise<HouseholdData> {
  const membership = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .order('created_at')
    .limit(1)
  if (membership.error) throw membership.error
  const householdId = membership.data[0]?.household_id
  if (!householdId) return empty

  const [household, members, people, watches, dismissed] = await Promise.all([
    supabase.from('households').select('*').eq('id', householdId).single(),
    supabase.from('household_members').select('user_id').eq('household_id', householdId),
    supabase.from('people').select('*').eq('household_id', householdId).order('created_at'),
    supabase
      .from('watches')
      // Newest first; watches without a date ("watched earlier") come last.
      .select('*, movie:movies(*), ratings(*)')
      .eq('household_id', householdId)
      .order('watched_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('dismissed').select('tmdb_id').eq('household_id', householdId),
  ])
  const failed = [household, members, people, watches, dismissed].find((r) => r.error)
  if (failed?.error) throw failed.error

  return {
    household: household.data,
    memberCount: members.data?.length ?? 0,
    people: people.data ?? [],
    watches: (watches.data ?? []) as WatchEntry[],
    dismissed: (dismissed.data ?? []).map((d) => d.tmdb_id),
    avatarUrls: await loadAvatarUrls(people.data ?? []),
  }
}

export function HouseholdProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [data, setData] = useState<HouseholdData>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setData(await loadHousehold(userId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Signed URLs expire after about an hour: re-sign them in time, also when
  // the app comes back from the background (timers do not run there).
  const { people } = data
  useEffect(() => {
    const paths = avatarPaths(people)
    if (paths.length === 0) return
    let cancelled = false
    const check = async () => {
      if (document.visibilityState !== 'visible' || !avatarUrlCache.isStale(paths)) return
      const avatarUrls = await loadAvatarUrls(people)
      if (!cancelled) setData((current) => (current.people === people ? { ...current, avatarUrls } : current))
    }
    const timer = window.setInterval(() => void check(), 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [people])

  const value = useMemo(() => ({ ...data, loading, error, refresh }), [data, loading, error, refresh])
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold() {
  return useContext(HouseholdContext)
}
