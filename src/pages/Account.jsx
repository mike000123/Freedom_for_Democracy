import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { sb } from '../supabase'
import { useAuth } from '../auth'
import { useData, useTitle, fmtDate } from '../util'
import { useIsAdmin } from './Admin'
import { useMembership } from './Manage'

const here = () => window.location.origin + window.location.pathname

function authError(m = '') {
  if (/invalid login/i.test(m)) return 'Λάθος email ή κωδικός.'
  if (/not confirmed/i.test(m)) return 'Το email δεν έχει επιβεβαιωθεί ακόμη. Ελέγξτε τα εισερχόμενά σας.'
  if (/already registered|already been registered/i.test(m)) return 'Υπάρχει ήδη λογαριασμός με αυτό το email.'
  if (/rate limit|too many/i.test(m)) return 'Πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο.'
  if (/password/i.test(m)) return 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.'
  return m || 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.'
}

function Field({ label, id, children }) {
  return <p><label htmlFor={id}>{label}</label>{children}</p>
}

export function Register() {
  useTitle('Δημιουργία λογαριασμού')
  const { session } = useAuth()
  const flags = useData(async () => (await sb.from('feature_flags').select('key,state').eq('key', 'citizen_accounts')).data, [])
  const [kind, setKind] = useState('person')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (session) return <Navigate to="/logariasmos" replace />
  const off = flags.data && flags.data[0]?.state !== 'on'

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const f = new FormData(e.target)
    const name = (f.get('display_name') || '').trim()
    if (name.length < 2 || name.length > 40) return setErr('Το όνομα που εμφανίζεται πρέπει να έχει 2 έως 40 χαρακτήρες.')
    if ((f.get('password') || '').length < 8) return setErr('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.')
    if (f.get('password') !== f.get('password2')) return setErr('Οι δύο κωδικοί δεν ταιριάζουν.')
    if (!f.get('consent')) return setErr('Χρειάζεται η συγκατάθεσή σας για την αποθήκευση του email.')
    setBusy(true)
    const ok = await sb.rpc('display_name_available', { p_name: name })
    if (ok.error || ok.data === false) { setBusy(false); return setErr('Το όνομα χρησιμοποιείται ήδη. Διαλέξτε άλλο.') }
    const { error } = await sb.auth.signUp({
      email: f.get('email').trim(), password: f.get('password'),
      options: {
        emailRedirectTo: here(),
        data: { display_name: name, kind, org_type: kind === 'org' ? f.get('org_type') : '', contact_person: kind === 'org' ? (f.get('contact_person') || '').trim() : '' },
      },
    })
    setBusy(false)
    if (error) return setErr(authError(error.message))
    setDone(true)
  }

  return (
    <div className="wrap pad">
      <h1>Δημιουργία λογαριασμού</h1>
      {off ? <p className="note">Οι λογαριασμοί πολιτών δεν είναι ενεργοί αυτή τη στιγμή.</p> : done ? (
        <div className="panel narrow">
          <p><strong>Σας στείλαμε email επιβεβαίωσης.</strong> Πατήστε τον σύνδεσμο που περιέχει για να ενεργοποιηθεί ο λογαριασμός. Αν δεν το βρείτε, ελέγξτε και τα ανεπιθύμητα.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="panel narrow">
          <p className="note">Ο λογαριασμός είναι προαιρετικός και χρειάζεται μόνο για σχόλια, ερωτήματα και προτάσεις. Το email δεν δημοσιεύεται ποτέ.</p>
          <Field label="Τύπος λογαριασμού" id="kind">
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="person">Πολίτης</option>
              <option value="org">Κανάλι, εκπομπή ή ομάδα</option>
            </select>
          </Field>
          <Field label="Όνομα που εμφανίζεται δημόσια (2-40 χαρακτήρες)" id="display_name"><input type="text" id="display_name" name="display_name" maxLength={40} required /></Field>
          {kind === 'org' && (
            <>
              <Field label="Είδος" id="org_type">
                <select id="org_type" name="org_type"><option value="channel">YouTube κανάλι</option><option value="show">Εκπομπή</option><option value="group">Ομάδα</option></select>
              </Field>
              <Field label="Πρόσωπο επικοινωνίας (δεν δημοσιεύεται)" id="contact_person"><input type="text" id="contact_person" name="contact_person" maxLength={120} required /></Field>
            </>
          )}
          <Field label="Email" id="email"><input type="email" id="email" name="email" required autoComplete="email" /></Field>
          <Field label="Κωδικός (τουλάχιστον 8 χαρακτήρες)" id="password"><input type="password" id="password" name="password" minLength={8} required autoComplete="new-password" /></Field>
          <Field label="Επανάληψη κωδικού" id="password2"><input type="password" id="password2" name="password2" required autoComplete="new-password" /></Field>
          <p><label><input type="checkbox" name="consent" /> Συμφωνώ να αποθηκευτεί το email μου για τη λειτουργία του λογαριασμού. Μπορώ να τον διαγράψω οποτεδήποτε. Δείτε την <Link to="/aporrito">πολιτική απορρήτου</Link>.</label></p>
          {err && <p className="errorlist">{err}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Παρακαλώ περιμένετε…' : 'Δημιουργία λογαριασμού'}</button>
          <p className="note">Έχετε ήδη λογαριασμό; <Link to="/eisodos">Σύνδεση</Link></p>
        </form>
      )}
    </div>
  )
}

export function Login() {
  useTitle('Σύνδεση')
  const { session } = useAuth()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  if (session) return <Navigate to="/logariasmos" replace />
  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    const f = new FormData(e.target)
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') })
    setBusy(false)
    if (error) return setErr(authError(error.message))
    nav('/logariasmos')
  }
  return (
    <div className="wrap pad">
      <h1>Σύνδεση</h1>
      <form onSubmit={submit} className="panel narrow">
        <Field label="Email" id="email"><input type="email" id="email" name="email" required autoComplete="email" /></Field>
        <Field label="Κωδικός" id="password"><input type="password" id="password" name="password" required autoComplete="current-password" /></Field>
        {err && <p className="errorlist">{err}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Παρακαλώ περιμένετε…' : 'Σύνδεση'}</button>
        <p className="note"><Link to="/xechasa-kodiko">Ξεχάσατε τον κωδικό;</Link> · <Link to="/eggrafi">Δημιουργία λογαριασμού</Link></p>
      </form>
    </div>
  )
}

export function Forgot() {
  useTitle('Επαναφορά κωδικού')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const email = new FormData(e.target).get('email').trim()
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here() })
    if (error) return setErr(authError(error.message))
    setMsg('Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς.')
  }
  return (
    <div className="wrap pad">
      <h1>Επαναφορά κωδικού</h1>
      {msg ? <div className="panel"><p>{msg}</p></div> : (
        <form onSubmit={submit} className="panel narrow">
          <Field label="Email" id="email"><input type="email" id="email" name="email" required /></Field>
          {err && <p className="errorlist">{err}</p>}
          <button type="submit">Αποστολή συνδέσμου</button>
        </form>
      )}
    </div>
  )
}

export function NewPassword() {
  useTitle('Νέος κωδικός')
  const { session, clearRecovering } = useAuth()
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const f = new FormData(e.target)
    if (f.get('password').length < 8) return setErr('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.')
    if (f.get('password') !== f.get('password2')) return setErr('Οι δύο κωδικοί δεν ταιριάζουν.')
    const { error } = await sb.auth.updateUser({ password: f.get('password') })
    if (error) return setErr(authError(error.message))
    clearRecovering()
    setDone(true)
  }
  return (
    <div className="wrap pad">
      <h1>Νέος κωδικός</h1>
      {done ? <div className="panel"><p>Ο κωδικός άλλαξε. <Link to="/logariasmos">Συνεχίστε στον λογαριασμό σας</Link>.</p></div>
        : !session ? <p className="note">Ο σύνδεσμος έληξε ή δεν είναι έγκυρος. <Link to="/xechasa-kodiko">Ζητήστε νέο</Link>.</p> : (
        <form onSubmit={submit} className="panel narrow">
          <Field label="Νέος κωδικός (τουλάχιστον 8 χαρακτήρες)" id="password"><input type="password" id="password" name="password" minLength={8} required autoComplete="new-password" /></Field>
          <Field label="Επανάληψη κωδικού" id="password2"><input type="password" id="password2" name="password2" required autoComplete="new-password" /></Field>
          {err && <p className="errorlist">{err}</p>}
          <button type="submit">Αλλαγή κωδικού</button>
        </form>
      )}
    </div>
  )
}

export function Account() {
  useTitle('Ο λογαριασμός μου')
  const { session, profile, loading, signOut } = useAuth()
  const nav = useNavigate()
  const [confirmDel, setConfirmDel] = useState(false)
  const [err, setErr] = useState('')
  const { isAdmin } = useIsAdmin()
  const { partyId } = useMembership()
  const roles = [isAdmin && 'Διαχειριστής', partyId && 'Εκπρόσωπος κόμματος'].filter(Boolean)
  if (loading) return <div className="wrap pad"><p className="note">Φόρτωση…</p></div>
  if (!session) return <Navigate to="/eisodos" replace />
  const verified = !!session.user.email_confirmed_at

  const del = async () => {
    setErr('')
    const { error } = await sb.rpc('delete_my_account')
    if (error) return setErr(error.message)
    await signOut()
    nav('/')
  }
  return (
    <div className="wrap pad">
      <h1>Ο λογαριασμός μου</h1>
      <div className="panel narrow">
        <dl className="fields">
          <dt>Όνομα που εμφανίζεται</dt><dd>{profile?.display_name ?? '—'}</dd>
          <dt>Τύπος</dt><dd>{roles.length ? roles.join(' · ') : profile?.kind === 'org' ? 'Κανάλι, εκπομπή ή ομάδα' : 'Πολίτης'}</dd>
          <dt>Email</dt><dd>{session.user.email} {verified ? '(επαληθευμένο)' : '(μη επαληθευμένο)'}</dd>
          {profile && <><dt>Εγγραφή</dt><dd>{fmtDate(profile.created_at)}</dd></>}
        </dl>
        {!profile && <p className="note">Δεν βρέθηκε προφίλ πολίτη για αυτόν τον λογαριασμό.</p>}
      </div>
      <p><Link className="btn ghost" to="/neos-kodikos">Αλλαγή κωδικού</Link>{' '}<button className="btn ghost" onClick={signOut}>Αποσύνδεση</button></p>

      <h2>Διαγραφή λογαριασμού</h2>
      <p className="note">Διαγράφονται ο λογαριασμός και όλα όσα έχετε υποβάλει (σχόλια, ερωτήματα, προτάσεις). Δεν αναιρείται.</p>
      {err && <p className="errorlist">{err}</p>}
      {confirmDel ? (
        <p><button onClick={del}>Ναι, διαγραφή του λογαριασμού μου</button>{' '}<button className="btn ghost" onClick={() => setConfirmDel(false)}>Άκυρο</button></p>
      ) : <p><button className="btn ghost" onClick={() => setConfirmDel(true)}>Διαγραφή λογαριασμού…</button></p>}
    </div>
  )
}
