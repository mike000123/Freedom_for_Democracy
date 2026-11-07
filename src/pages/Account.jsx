import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { sb, q } from '../supabase'
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

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

// Γραμμή στοιχείου με εικονίδιο επεξεργασίας. fields: [{ name, label, type, ... }]. onSave(values) → string σφάλματος ή null.
function EditRow({ label, display, fields, onSave, readOnly, hint }) {
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setOk(''); setBusy(true)
    const f = new FormData(e.target)
    const values = Object.fromEntries(fields.map((x) => [x.name, x.type === 'password' ? f.get(x.name) : (f.get(x.name) || '').trim()]))
    const res = await onSave(values)
    setBusy(false)
    if (res && res.error) return setErr(res.error)
    setEditing(false)
    if (res && res.ok) setOk(res.ok)
  }
  return (
    <div className="acct-row">
      <div className="acct-label">{label}</div>
      {editing ? (
        <form onSubmit={submit} className="acct-edit">
          {fields.map((x) => (
            <div key={x.name} className="form-row">
              {x.label && <label htmlFor={'f-' + x.name}>{x.label}</label>}
              <input id={'f-' + x.name} name={x.name} type={x.type || 'text'} defaultValue={x.defaultValue} maxLength={x.maxLength} minLength={x.minLength} autoComplete={x.autoComplete} required autoFocus={x === fields[0]} />
            </div>
          ))}
          {err && <p className="errorlist">{err}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Αποθήκευση…' : 'Αποθήκευση'}</button>{' '}
          <button type="button" className="btn ghost" onClick={() => { setEditing(false); setErr('') }}>Άκυρο</button>
        </form>
      ) : (
        <div className="acct-value">
          <span>{display}</span>
          {!readOnly && <button type="button" className="icon-btn" aria-label={'Επεξεργασία: ' + label} title="Επεξεργασία" onClick={() => { setEditing(true); setOk('') }}><PencilIcon /></button>}
        </div>
      )}
      {!editing && hint && <p className="note acct-hint">{hint}</p>}
      {!editing && ok && <p className="note acct-hint">{ok}</p>}
    </div>
  )
}

export function Account() {
  useTitle('Ο λογαριασμός μου')
  const { session, profile, loading, signOut, refreshProfile } = useAuth()
  const nav = useNavigate()
  const [confirmDel, setConfirmDel] = useState(false)
  const [err, setErr] = useState('')
  const { isAdmin } = useIsAdmin()
  const { partyId } = useMembership()
  const partyQ = useData(async () => {
    if (!partyId) return null
    return (await q(sb.from('parties').select('name,slug,is_published,tier,profile_source').eq('id', partyId).limit(1)))[0] ?? null
  }, [partyId])
  const party = partyQ.data
  const roles = [isAdmin && 'Διαχειριστής', partyId && 'Εκπρόσωπος κόμματος'].filter(Boolean)
  if (loading) return <div className="wrap pad"><p className="note">Φόρτωση…</p></div>
  if (!session) return <Navigate to="/eisodos" replace />
  const verified = !!session.user.email_confirmed_at

  const saveName = async ({ name }) => {
    if (name.length < 2 || name.length > 40) return { error: 'Το όνομα πρέπει να έχει 2 έως 40 χαρακτήρες.' }
    if (name.toLowerCase() === (profile?.display_name || '').toLowerCase() && name === profile?.display_name) return { ok: 'Δεν άλλαξε τίποτα.' }
    const avail = await sb.rpc('display_name_available', { p_name: name })
    if (avail.error) return { error: avail.error.message }
    if (avail.data === false && name.toLowerCase() !== (profile?.display_name || '').toLowerCase()) return { error: 'Το όνομα χρησιμοποιείται ήδη.' }
    const { error } = await sb.from('citizen_profiles').update({ display_name: name }).eq('user_id', session.user.id)
    if (error) return { error: /unique|duplicate/i.test(error.message) ? 'Το όνομα χρησιμοποιείται ήδη.' : error.message }
    await refreshProfile()
    return { ok: 'Το όνομα ενημερώθηκε.' }
  }
  const saveEmail = async ({ email }) => {
    if (email.toLowerCase() === (session.user.email || '').toLowerCase()) return { ok: 'Δεν άλλαξε τίποτα.' }
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: here() })
    if (error) return { error: authError(error.message) }
    return { ok: 'Στείλαμε σύνδεσμο επιβεβαίωσης. Η αλλαγή ισχύει όταν τον ανοίξετε (ίσως ζητηθεί επιβεβαίωση και από το παλιό email).' }
  }
  const savePassword = async ({ password, password2 }) => {
    if (password.length < 8) return { error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.' }
    if (password !== password2) return { error: 'Οι δύο κωδικοί δεν ταιριάζουν.' }
    const { error } = await sb.auth.updateUser({ password })
    if (error) return { error: authError(error.message) }
    return { ok: 'Ο κωδικός άλλαξε.' }
  }
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
        <h2 className="acct-h">Στοιχεία λογαριασμού</h2>
        <EditRow label="Όνομα που εμφανίζεται" display={profile?.display_name ?? '—'} fields={[{ name: 'name', label: 'Νέο όνομα (2-40 χαρακτήρες)', defaultValue: profile?.display_name || '', maxLength: 40 }]} onSave={saveName} readOnly={!profile} hint={isAdmin || partyId ? 'Το όνομα φαίνεται δημόσια δίπλα στα σχόλιά σας.' : null} />
        <EditRow label="Email" display={<>{session.user.email} <span className="pill">{verified ? 'επαληθευμένο' : 'μη επαληθευμένο'}</span></>} fields={[{ name: 'email', label: 'Νέο email', type: 'email', defaultValue: session.user.email, autoComplete: 'email' }]} onSave={saveEmail} />
        <EditRow label="Κωδικός" display="••••••••" fields={[{ name: 'password', label: 'Νέος κωδικός (τουλάχιστον 8 χαρακτήρες)', type: 'password', minLength: 8, autoComplete: 'new-password' }, { name: 'password2', label: 'Επανάληψη κωδικού', type: 'password', autoComplete: 'new-password' }]} onSave={savePassword} />
        <EditRow label="Τύπος" display={roles.length ? roles.join(' · ') : profile?.kind === 'org' ? 'Κανάλι, εκπομπή ή ομάδα' : 'Πολίτης'} readOnly />
        {profile && <EditRow label="Εγγραφή" display={fmtDate(profile.created_at)} readOnly />}
        {!profile && <p className="note">Δεν βρέθηκε προφίλ πολίτη για αυτόν τον λογαριασμό.</p>}
      </div>

      {partyId && (
        <div className="panel narrow">
          <h2 className="acct-h">Το κόμμα μου</h2>
          {party ? (
            <>
              <p><strong>{party.name}</strong></p>
              <p>
                {party.is_published ? <span className="pill pill-teal">Δημοσιευμένο</span> : <span className="pill pill-soft">Μη δημοσιευμένο</span>}{' '}
                <span className="pill">{party.tier === 'full' ? 'Πλήρες προφίλ' : 'Προφίλ σε εξέλιξη'}</span>{' '}
                <span className="pill">{party.profile_source === 'party_verified' ? 'Επιβεβαιωμένο από το κόμμα' : 'Από δημόσιες πηγές'}</span>
              </p>
              <p>
                <Link className="btn" to="/to-komma-mou">Διαχείριση κόμματος</Link>{' '}
                <Link className="btn ghost" to={`/kommata/${party.slug}`}>👁 {party.is_published ? 'Δημόσια σελίδα' : 'Προεπισκόπηση'}</Link>
              </p>
            </>
          ) : <p className="note">Φόρτωση…</p>}
        </div>
      )}

      {isAdmin && (
        <div className="panel narrow">
          <h2 className="acct-h">Διαχείριση πλατφόρμας</h2>
          <p><Link className="btn" to="/diaxeirisi">Άνοιγμα διαχείρισης</Link></p>
        </div>
      )}

      <div className="panel narrow">
        <h2 className="acct-h">Διαγραφή λογαριασμού</h2>
        <p className="note">Διαγράφονται ο λογαριασμός και όλα όσα έχετε υποβάλει (σχόλια, ερωτήματα, προτάσεις). Δεν αναιρείται.</p>
        {err && <p className="errorlist">{err}</p>}
        {confirmDel ? (
          <p><button onClick={del}>Ναι, διαγραφή του λογαριασμού μου</button>{' '}<button className="btn ghost" onClick={() => setConfirmDel(false)}>Άκυρο</button></p>
        ) : <p><button className="btn ghost" onClick={() => setConfirmDel(true)}>Διαγραφή λογαριασμού…</button></p>}
      </div>
    </div>
  )
}
