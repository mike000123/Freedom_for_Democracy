import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'
import { findPartyLogo } from './partyLogos'

// flowType 'pkce': οι σύνδεσμοι email επιστρέφουν με ?code=... (όχι #fragment), ώστε να μη συγκρούονται με το HashRouter.
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
})

export const imageUrl = (path) =>
  path ? sb.storage.from('party-images').getPublicUrl(path).data.publicUrl : ''

export const partyImageUrl = (party) => {
  if (party.image_path) return imageUrl(party.image_path)
  const logo = findPartyLogo(party)
  return logo ? `${import.meta.env.BASE_URL}party-logos/${logo.file}` : ''
}

// Εκτελεί ερώτημα και ρίχνει σφάλμα με το μήνυμα του Supabase, ώστε να το δείξει η σελίδα.
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}
