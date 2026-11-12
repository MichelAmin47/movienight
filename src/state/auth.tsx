import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type AuthState = {
  /** False until the stored session (or a magic link in the URL) has been processed. */
  ready: boolean
  session: Session | null
}

const AuthContext = createContext<AuthState>({ ready: false, session: null })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: false, session: null })

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ ready: true, session: data.session })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ ready: true, session })
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
