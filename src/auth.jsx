import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { sb } from './supabase'

const Ctx = createContext({ session: null, profile: null, loading: true })
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)

  const loadProfile = useCallback(async (user) => {
    if (!user) return setProfile(null)
    const { data } = await sb.from('citizen_profiles').select('*').eq('user_id', user.id).maybeSingle()
    setProfile(data)
  }, [])

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user).finally(() => setLoading(false))
    })
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      // Όχι κλήσεις στο Supabase μέσα στο callback (κίνδυνος κολλήματος): τις αναβάλλουμε.
      setTimeout(() => loadProfile(s?.user), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [loadProfile])

  const value = {
    session, profile, loading, recovering,
    clearRecovering: () => setRecovering(false),
    refreshProfile: () => loadProfile(session?.user),
    signOut: () => sb.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
