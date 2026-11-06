import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useAuth } from '../auth'
import { useData, useTitle } from '../util'
import { Loading } from '../components'

export const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0)
export const hasLink = (t) => /(https?:\/\/|www\.)/i.test(t)

export function dbError(m = '') {
  if (/one_citizen_proposal_per_topic|duplicate key/i.test(m)) return 'Έχετε ήδη υποβάλει πρόταση σε αυτό το θέμα.'
  if (/row-level security/i.test(m)) return 'Η ενέργεια δεν επιτρέπεται αυτή τη στιγμή. Η λειτουργία μπορεί να είναι ανενεργή.'
  return m
}

export const KINDS = { for: 'Υπέρ (με επιχείρημα)', against: 'Κατά (με επιχείρημα)', question: 'Ερώτηση προς το κόμμα', comment: 'Σχόλιο' }
export const PROPOSAL_KINDS = ['for', 'against', 'question']

function LoginPrompt({ what }) {
  return (
    <div className="panel">
      <p>Για να {what} χρειάζεστε λογαριασμό με επαληθευμένο email.</p>
      <p><Link className="btn" to="/eisodos">Είσοδος</Link> <Link className="btn ghost" to="/eggrafi">Δημιουργία λογαριασμού</Link></p>
    </div>
  )
}

// Επιστρέφει null όταν ο χρήστης μπορεί να δημοσιεύσει, αλλιώς το μήνυμα που πρέπει να δει.
function useGate(what) {
  const { session, profile, loading } = useAuth()
  if (loading) return { gate: <p className="note">Φόρτωση…</p> }
  if (!session) return { gate: <LoginPrompt what={what} /> }
  if (!profile) return { gate: <div className="panel"><p>Δεν βρέθηκε προφίλ πολίτη για τον λογαριασμό σας. <Link to="/logariasmos">Ο λογαριασμός μου</Link></p></div> }
  return { gate: null, session, profile }
}

export function CommentForm({ column, id, kinds, onDone }) {
  const { gate, session, profile } = useGate('σχολιάσετε')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (gate) return gate
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const f = new FormData(e.target)
    const body = (f.get('body') || '').trim()
    if (!body) return setErr('Γράψτε ένα σχόλιο.')
    if (hasLink(body)) return setErr('Δεν επιτρέπονται σύνδεσμοι στα κείμενα των πολιτών.')
    setBusy(true)
    const { error } = await sb.from('comments').insert({ [column]: id, kind: f.get('kind') || kinds[0], author_id: session.user.id, body })
    setBusy(false)
    if (error) return setErr(dbError(error.message))
    e.target.reset()
    onDone()
  }
  return (
    <form onSubmit={submit} className="panel">
      {kinds.length > 1 && (
        <div className="form-row"><label htmlFor="kind">Τύπος σχολίου</label>
          <select id="kind" name="kind">{kinds.map((k) => <option key={k} value={k}>{KINDS[k]}</option>)}</select></div>
      )}
      <div className="form-row"><label htmlFor="body">Κείμενο (έως 1.000 χαρακτήρες)</label>
        <textarea id="body" name="body" rows={5} maxLength={1000} required /></div>
      {err && <p className="errorlist">{err}</p>}
      <p className="note">Δημοσιεύετε ως <strong>{profile.display_name}</strong> ({profile.kind === 'org' ? 'Οργανισμός' : 'Πολίτης'}). Μπορείτε να διαγράψετε το σχόλιό σας όσο είστε συνδεδεμένοι.</p>
      <button type="submit" disabled={busy}>Δημοσίευση</button>
    </form>
  )
}

export function QuestionForm({ topicId, onDone }) {
  const { gate, session, profile } = useGate('θέσετε ερώτημα')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (gate) return gate
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const body = (new FormData(e.target).get('body') || '').trim()
    if (!body) return setErr('Γράψτε το ερώτημά σας.')
    if (words(body) > 150) return setErr('Το ερώτημα πρέπει να έχει έως 150 λέξεις.')
    if (hasLink(body)) return setErr('Δεν επιτρέπονται σύνδεσμοι στα κείμενα των πολιτών.')
    setBusy(true)
    const { error } = await sb.from('questions').insert({ topic_id: topicId, author_id: session.user.id, body })
    setBusy(false)
    if (error) return setErr(dbError(error.message))
    e.target.reset()
    onDone()
  }
  return (
    <form onSubmit={submit} className="panel">
      <div className="form-row"><label htmlFor="qbody">Το ερώτημά σας (έως 150 λέξεις, ένα ερώτημα ανά ανάρτηση)</label>
        <textarea id="qbody" name="body" rows={4} maxLength={1500} required /></div>
      {err && <p className="errorlist">{err}</p>}
      <p className="note">Δημοσιεύετε ως <strong>{profile.display_name}</strong>.</p>
      <button type="submit" disabled={busy}>Δημοσίευση</button>
    </form>
  )
}

// Αναφορά περιεχομένου (σχόλιο, ερώτημα, πρόταση πολίτη). Μία αναφορά ανά χρήστη και περιεχόμενο.
export function ReportButton({ type, id }) {
  const { session } = useAuth()
  const [state, setState] = useState('')
  if (!session) return <Link className="note" to="/eisodos">Αναφορά (απαιτείται σύνδεση)</Link>
  if (state) return <span className="note">{state}</span>
  const report = async () => {
    const { error } = await sb.from('content_reports').insert({ user_id: session.user.id, target_type: type, target_id: id })
    setState(error ? (/duplicate/i.test(error.message) ? 'Έχετε ήδη κάνει αναφορά.' : dbError(error.message)) : 'Η αναφορά καταχωρίστηκε.')
  }
  return <button className="link" type="button" onClick={report}>Αναφορά</button>
}

export function DeleteOwnComment({ id, onDone }) {
  const [err, setErr] = useState('')
  const del = async () => {
    const { error } = await sb.rpc('remove_own_comment', { p_id: id })
    if (error) return setErr(dbError(error.message))
    onDone()
  }
  return <>{err && <span className="errorlist">{err}</span>}<button className="link" type="button" onClick={del}>Διαγραφή</button></>
}

const FIELDS = [
  ['problem', 'Πρόβλημα (με πηγή ή δεδομένο)'], ['action', 'Πρόταση (τι αλλάζει και ποιος το υλοποιεί)'], ['legal', 'Νομικό πλαίσιο'],
  ['cost', 'Κόστος και χρηματοδότηση'], ['tradeoffs', 'Αντισταθμίσματα (ποιος χάνει ή τι θυσιάζεται)'], ['timeline', 'Χρονοδιάγραμμα'], ['metric', 'Μέτρο επιτυχίας'],
]

export function NewCitizenProposal() {
  const { slug } = useParams()
  useTitle('Νέα πρόταση')
  const nav = useNavigate()
  const { session, profile, loading } = useAuth()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const s = useData(async () => {
    const topic = (await q(sb.from('topics').select('id,name,slug').eq('slug', slug).limit(1)))[0]
    if (!topic) throw new Error('Το θέμα δεν βρέθηκε.')
    const [flags, mine] = await Promise.all([
      q(sb.from('feature_flags').select('key,state')),
      session ? q(sb.from('citizen_proposals').select('id').eq('topic_id', topic.id).eq('author_id', session.user.id)) : [],
    ])
    return { topic, on: flags.find((f) => f.key === 'citizen_proposals')?.state === 'on', mine: mine[0] }
  }, [slug, session?.user.id])
  if (loading || !s.data) return <Loading state={loading ? { loading: true } : s} />
  const { topic, on, mine } = s.data
  if (!session) return <Navigate to="/eisodos" replace />

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const f = new FormData(e.target)
    const row = { topic_id: topic.id, author_id: session.user.id, title: (f.get('title') || '').trim(), source: (f.get('source') || '').trim() }
    for (const [k, label] of FIELDS) {
      row[k] = (f.get(k) || '').trim()
      if (words(row[k]) > 150) return setErr(`Το πεδίο «${label}» έχει πάνω από 150 λέξεις.`)
      if (hasLink(row[k])) return setErr('Δεν επιτρέπονται σύνδεσμοι στα κείμενα, μόνο στην πηγή.')
    }
    if (hasLink(row.title)) return setErr('Δεν επιτρέπονται σύνδεσμοι στα κείμενα, μόνο στην πηγή.')
    if (!/^https?:\/\//i.test(row.source)) return setErr('Η πηγή τεκμηρίωσης πρέπει να είναι σύνδεσμος που ξεκινά με http:// ή https://.')
    setBusy(true)
    const { data, error } = await sb.from('citizen_proposals').insert(row).select('id').single()
    setBusy(false)
    if (error) return setErr(dbError(error.message))
    nav(`/protasi-politi/${data.id}`)
  }

  return (
    <div className="wrap pad">
      <p className="note"><Link to={`/themata/${topic.slug}`}>← {topic.name}</Link></p>
      <h1>Νέα πρόταση: {topic.name}</h1>
      {!on ? <p className="note">Οι προτάσεις πολιτών δεν είναι ενεργές αυτή τη στιγμή.</p>
        : !profile ? <p className="note">Δεν βρέθηκε προφίλ πολίτη για τον λογαριασμό σας.</p>
        : mine ? <p className="note">Έχετε ήδη υποβάλει πρόταση σε αυτό το θέμα. <Link to={`/protasi-politi/${mine.id}`}>Δείτε την</Link>.</p> : (
        <>
          <p className="lead">Δομημένη πρόταση, έως 150 λέξεις ανά πεδίο. Μία πρόταση ανά θέμα. Δεν επιτρέπονται σύνδεσμοι στα κείμενα, μόνο στην πηγή.</p>
          <form onSubmit={submit} className="panel">
            <div className="form-row"><label htmlFor="title">Τίτλος (η δράση σε μία πρόταση)</label><input type="text" id="title" name="title" maxLength={200} required /></div>
            {FIELDS.map(([k, label]) => (
              <div className="form-row" key={k}><label htmlFor={k}>{label}</label><textarea id={k} name={k} rows={4} required /><span className="note">Έως 150 λέξεις.</span></div>
            ))}
            <div className="form-row"><label htmlFor="source">Πηγή τεκμηρίωσης (σύνδεσμος)</label><input type="url" id="source" name="source" required placeholder="https://" /></div>
            {err && <p className="errorlist">{err}</p>}
            <button type="submit" disabled={busy}>Δημοσίευση</button>
          </form>
        </>
      )}
    </div>
  )
}
