import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example)')
}

/**
 * Magic links come back as `#access_token=...` (or `#error=...`) in the URL
 * hash, which is also where HashRouter keeps its route. Capture an auth error
 * here, before the client consumes the hash; the app only mounts the router
 * after auth has initialised, so the two never fight over the hash.
 */
function readAuthError(): string | null {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (!hash.includes('error=')) return null
  const params = new URLSearchParams(hash)
  const message = params.get('error_description') ?? params.get('error')
  if (message) window.history.replaceState(null, '', window.location.pathname)
  return message
}

export const initialAuthError = readAuthError()

export const supabase = createClient<Database>(url, key, {
  auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true },
})

/** Where the magic link sends the user back to: current origin + base path. */
export const authRedirectUrl = window.location.origin + import.meta.env.BASE_URL
