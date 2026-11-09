import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useAuth } from '../auth'
import { useData, useTitle, fmtDateTime } from '../util'
import { hasLink, dbError } from './Post'

const COLS = ['topic_id', 'party_id', 'proposal_id', 'room_id']
const matches = (m, room) => COLS.every((c) => (room[c] ?? null) === (m[c] ?? null))
const roomKey = (r) => JSON.stringify(COLS.map((c) => r[c] ?? null))
const PAGE = 50

// Δωμάτιο συζήτησης σε πραγματικό χρόνο. Δεν εμφανίζει τίποτα όταν η λειτουργία «chat» είναι ανενεργή.
export function Chat({ room, title = 'Ζωντανή συζήτηση', canPost = true, canModerate = false, noPostText = '' }) {
  const { session, profile } = useAuth()
  const [msgs, setMsgs] = useState([])
  const [names, setNames] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [reported, setReported] = useState({})
  const [hasMore, setHasMore] = useState(false)
  const [loadingOld, setLoadingOld] = useState(false)
  const box = useRef(null)
  const lastId = useRef(null)
  const keepFrom = useRef(null)
  const key = roomKey(room)
  const on = useData(async () => (await sb.rpc('feature_on', { k: 'chat' })).data === true, [session?.user.id])

  const addNames = async (rows) => {
    const need = [...new Set(rows.map((r) => r.author_id))].filter((id) => !(id in names))
    if (!need.length) return
    const { data } = await sb.from('citizens_public').select('user_id,display_name,kind').in('user_id', need)
    setNames((n) => ({ ...n, ...Object.fromEntries((data || []).map((a) => [a.user_id, a])) }))
  }
  const addMsgs = (rows) => {
    setMsgs((cur) => {
      const ids = new Set(cur.map((m) => m.id))
      return [...cur, ...rows.filter((r) => !ids.has(r.id))].sort((a, b) => a.id - b.id)
    })
    addNames(rows)
  }

  const roomQuery = () => {
    let query = sb.from('chat_messages').select('*').eq('removed', false)
    for (const c of COLS) query = room[c] != null ? query.eq(c, room[c]) : query.is(c, null)
    return query
  }
  // Φόρτωση παλαιότερων μηνυμάτων όταν ο χρήστης φτάνει στην κορυφή.
  const loadOlder = async () => {
    if (loadingOld || !hasMore || !msgs.length) return
    setLoadingOld(true)
    const { data } = await roomQuery().lt('id', msgs[0].id).order('id', { ascending: false }).limit(PAGE)
    if (data) {
      if (box.current) keepFrom.current = box.current.scrollHeight
      addMsgs(data)
      setHasMore(data.length === PAGE)
    }
    setLoadingOld(false)
  }

  useEffect(() => {
    if (!on.data) return
    let live = true
    setMsgs([])
    setHasMore(false)
    lastId.current = null
    roomQuery().order('id', { ascending: false }).limit(PAGE).then(({ data }) => { if (live && data) { addMsgs(data); setHasMore(data.length === PAGE) } })
    const col = COLS.find((c) => room[c] != null)
    const ch = sb.channel('chat-' + key + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', ...(col ? { filter: `${col}=eq.${room[col]}` } : {}) },
        (p) => { if (matches(p.new, room) && !p.new.removed) addMsgs([p.new]) })
      .subscribe()
    return () => { live = false; sb.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on.data, key])

  // Κάτω μόνο όταν έρχεται νεότερο μήνυμα· όταν προστίθενται παλαιότερα, κρατάμε τη θέση ανάγνωσης.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const newest = msgs.length ? msgs[msgs.length - 1].id : null
    if (keepFrom.current != null) {
      el.scrollTop = el.scrollHeight - keepFrom.current
      keepFrom.current = null
    } else if (newest !== lastId.current) {
      el.scrollTop = el.scrollHeight
    }
    lastId.current = newest
  }, [msgs])

  if (!on.data) return null

  const send = async (e) => {
    e.preventDefault()
    setErr('')
    const body = new FormData(e.target).get('body').trim()
    if (!body) return
    if (hasLink(body)) return setErr('Δεν επιτρέπονται σύνδεσμοι στα μηνύματα.')
    setBusy(true)
    const { data, error } = await sb.from('chat_messages').insert({ ...room, author_id: session.user.id, body }).select().single()
    setBusy(false)
    if (error) return setErr(dbError(error.message))
    e.target.reset()
    addMsgs([data])
  }
  const modRemove = async (id) => {
    const { error } = await sb.rpc('owner_remove_message', { p_id: id })
    if (error) return setErr(dbError(error.message))
    setMsgs((cur) => cur.filter((m) => m.id !== id))
  }
  const report = async (id) => {
    const { error } = await sb.from('chat_reports').insert({ user_id: session.user.id, message_id: id })
    setReported((r) => ({ ...r, [id]: error ? (/duplicate/i.test(error.message) ? 'Έχετε ήδη κάνει αναφορά.' : dbError(error.message)) : 'Η αναφορά καταχωρίστηκε.' }))
  }

  return (
    <section className="chat">
      <h2>{title}</h2>
      <p className="note">Μηνύματα σε πραγματικό χρόνο, από πολίτες με επαληθευμένο email. Ένα μήνυμα ανά 3 δευτερόλεπτα, χωρίς σύνδεσμους. Δείχνουμε τα τελευταία 50· κυλήστε προς τα πάνω για να δείτε όλη τη συζήτηση.</p>
      <div ref={box} className="panel" style={{ maxHeight: 360, overflowY: 'auto' }}
        onScroll={(e) => { if (e.currentTarget.scrollTop < 40) loadOlder() }}>
        {hasMore && <p className="note" style={{ textAlign: 'center' }}>{loadingOld ? 'Φόρτωση…' : <button className="link" type="button" onClick={loadOlder}>Φόρτωση παλαιότερων μηνυμάτων</button>}</p>}
        {msgs.length ? msgs.map((m) => (
          <p key={m.id} style={{ margin: '0 0 .6rem' }}>
            <strong>{names[m.author_id]?.display_name ?? '…'}</strong>{' '}
            <span className="note">{fmtDateTime(m.created_at)}</span>
            {session && m.author_id !== session.user.id && (reported[m.id] ? <span className="note"> · {reported[m.id]}</span> : <> · <button className="link" type="button" onClick={() => report(m.id)}>Αναφορά</button></>)}
            {canModerate && <> · <button className="link" type="button" onClick={() => modRemove(m.id)}>Αφαίρεση</button></>}
            <br />{m.body}
          </p>
        )) : <p className="note">Κανένα μήνυμα ακόμη.</p>}
      </div>
      {!canPost ? <p className="panel note">{noPostText}</p> : !session ? <p className="panel">Για να γράψετε χρειάζεστε λογαριασμό. <Link className="btn" to="/eisodos">Είσοδος</Link> <Link className="btn ghost" to="/eggrafi">Δημιουργία λογαριασμού</Link></p>
        : !profile ? <p className="note">Δεν βρέθηκε προφίλ πολίτη για τον λογαριασμό σας.</p> : (
        <form onSubmit={send} className="panel">
          <div className="form-row"><label htmlFor={'cb' + key}>Μήνυμα (έως 500 χαρακτήρες)</label><input id={'cb' + key} name="body" maxLength={500} autoComplete="off" required /></div>
          {err && <p className="errorlist">{err}</p>}
          <button type="submit" disabled={busy}>Αποστολή</button>
          <p className="note">Γράφετε ως <strong>{profile.display_name}</strong>.</p>
        </form>
      )}
    </section>
  )
}

export function ChatPage() {
  useTitle('Συζήτηση')
  return (
    <div className="wrap pad">
      <h1>Γενική συζήτηση</h1>
      <p className="lead"><Link to="/sizitisi">← Όλα τα δωμάτια</Link></p>
      <Chat room={{}} title="Γενικό δωμάτιο" />
    </div>
  )
}
