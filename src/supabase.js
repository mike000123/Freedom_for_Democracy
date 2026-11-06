import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

// flowType 'pkce': οι σύνδεσμοι email επιστρέφουν με ?code=... (όχι #fragment), ώστε να μη συγκρούονται με το HashRouter.
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
})

export const imageUrl = (path) =>
  path ? sb.storage.from('party-images').getPublicUrl(path).data.publicUrl : ''

// Εκτελεί ερώτημα και ρίχνει σφάλμα με το μήνυμα του Supabase, ώστε να το δείξει η σελίδα.
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}
