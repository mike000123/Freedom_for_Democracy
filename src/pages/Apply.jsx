import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../supabase'
import { useData, useTitle, lines } from '../util'
import { Loading } from '../components'
import { useAuth } from '../auth'

export default function Apply() {
  useTitle('Αίτηση συμμετοχής')
  const { session, loading } = useAuth()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const flags = useData(async () => (await sb.from('feature_flags').select('key,state').eq('key', 'applications')).data, [])
  if (!flags.data || loading) return <Loading state={flags.data ? { loading: true } : flags} />
  const on = flags.data[0]?.state === 'on'
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const f = new FormData(e.target)
    if (f.get('website_hp')) return setDone(true) // honeypot
    const row = {
      applicant_id: session.user.id,
      name: (f.get('name') || '').trim(), kind: f.get('kind'),
      responsible_persons: lines(f.get('responsible_persons')).join('\n'),
      contact_email: (f.get('contact_email') || '').trim(), elections_statement: (f.get('elections_statement') || '').trim(),
      website: (f.get('website') || '').trim(),
    }
    const n = lines(row.responsible_persons).length
    if (n < 1 || n > 3) return setErr('Δηλώστε 1 έως 3 υπεύθυνα πρόσωπα, ένα όνομα ανά γραμμή.')
    if (row.website && !/^https?:\/\//i.test(row.website)) return setErr('Η ιστοσελίδα πρέπει να ξεκινά με http:// ή https://.')
    setBusy(true)
    const { error } = await sb.from('party_applications').insert(row)
    setBusy(false)
    if (error) return setErr(/row-level security/i.test(error.message) ? 'Οι αιτήσεις δεν είναι ενεργές αυτή τη στιγμή.' : error.message)
    setDone(true)
  }
  return (
    <div className="wrap pad">
      <h1>Αίτηση συμμετοχής κόμματος ή ομάδας</h1>
      {!on ? <p className="note">Οι αιτήσεις δεν είναι ανοιχτές αυτή τη στιγμή.</p>
        : !session ? <div className="panel"><p>Για να υποβάλετε αίτηση πρέπει πρώτα να συνδεθείτε με τον λογαριασμό που θα διαχειρίζεται το προφίλ του κόμματος ή της ομάδας.</p><p><Link to="/eisodos">Σύνδεση</Link> · <Link to="/eggrafi">Εγγραφή</Link></p></div>
        : done ? <div className="panel"><p><strong>Η αίτηση καταχωρίστηκε.</strong> Μετά την έγκριση ο λογαριασμός σας θα συνδεθεί αυτόματα με το κόμμα (μενού «Το κόμμα μου»). Θα επικοινωνήσουμε στο email που δηλώσατε για τυχόν διευκρινίσεις.</p><p><Link to="/">Αρχική</Link></p></div> : (
        <>
          <p className="lead">Η συμμετοχή είναι δωρεάν και όλα τα κόμματα και οι ομάδες έχουν ίση έκθεση. Δεν χρειάζεται καταχωρισμένο κόμμα· οι ομάδες υπό σύσταση γίνονται δεκτές.</p>
          <form onSubmit={submit} className="panel">
            <div className="form-row"><label htmlFor="name">Επωνυμία</label><input id="name" name="name" maxLength={120} required /></div>
            <div className="form-row"><label htmlFor="kind">Είδος</label>
              <select id="kind" name="kind"><option value="party">Κόμμα</option><option value="group">Ομάδα υπό σύσταση</option></select></div>
            <div className="form-row"><label htmlFor="rp">Υπεύθυνα πρόσωπα (1 έως 3, ένα όνομα ανά γραμμή)</label><textarea id="rp" name="responsible_persons" rows={3} required /></div>
            <div className="form-row"><label htmlFor="ce">Email επικοινωνίας για την αίτηση (δεν δημοσιεύεται)</label><input id="ce" name="contact_email" type="email" maxLength={200} required /></div>
            <div className="form-row"><label htmlFor="es">Δήλωση για τις εκλογές (θα κατέβετε στις εκλογές; με ποιον τρόπο;)</label><textarea id="es" name="elections_statement" rows={4} maxLength={2000} required /></div>
            <div className="form-row"><label htmlFor="web">Ιστοσελίδα (προαιρετικά)</label><input id="web" name="website" type="url" placeholder="https://" /></div>
            <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true"><input name="website_hp" tabIndex={-1} autoComplete="off" /></div>
            {err && <p className="errorlist">{err}</p>}
            <button type="submit" disabled={busy}>Υποβολή αίτησης</button>
          </form>
        </>
      )}
    </div>
  )
}
