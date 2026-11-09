import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useAuth } from '../auth'
import { useData, useTitle } from '../util'
import { Loading } from '../components'
import { Chat } from './Chat'

const msgOf = (e) => (/row-level security/i.test(e?.message || '') ? 'Η ενέργεια δεν επιτρέπεται.' : e?.message || '')

function RoomItem({ r, topics }) {
  return (
    <div className="panel">
      <h3><Link to={`/sizitisi/${r.id}`}>{r.name}</Link>{' '}
        {r.kind === 'official' ? <span className="pill pill-teal">Επίσημο</span> : <span className="pill outline">{r.visibility === 'private' ? 'Ιδιωτική ομάδα' : 'Δημόσια ομάδα'}</span>}
        {r.is_member && r.kind === 'group' && <span className="pill pill-soft">Μέλος</span>}
        {r.topic_id && topics[r.topic_id] && <> <span className="pill">{topics[r.topic_id]}</span></>}</h3>
      {r.description && <p>{r.description}</p>}
      {r.kind === 'group' && <p className="note">{r.members} μέλη</p>}
    </div>
  )
}

export function RoomsHub() {
  useTitle('Συζήτηση')
  const { session, profile } = useAuth()
  const nav = useNavigate()
  const [n, setN] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const s = useData(async () => {
    const [rooms, topics, on] = await Promise.all([
      sb.rpc('list_rooms').then((r) => { if (r.error) throw new Error(r.error.message); return r.data }),
      q(sb.from('topics').select('id,name')),
      sb.rpc('feature_on', { k: 'chat_groups' }).then((r) => r.data === true),
    ])
    return { rooms, topics: Object.fromEntries(topics.map((t) => [t.id, t.name])), groupsOn: on }
  }, [n, session?.user.id])
  if (!s.data) return <Loading state={s} />
  const { rooms, topics, groupsOn } = s.data
  const official = rooms.filter((r) => r.kind === 'official')
  const mine = rooms.filter((r) => r.kind === 'group' && r.is_member)
  const open = rooms.filter((r) => r.kind === 'group' && !r.is_member)
  const create = async (e) => {
    e.preventDefault(); setErr('')
    const f = new FormData(e.target)
    setBusy(true)
    const { data, error } = await sb.rpc('create_room', { p_name: f.get('name'), p_desc: f.get('desc'), p_visibility: f.get('visibility') })
    setBusy(false)
    if (error) return setErr(msgOf(error))
    nav(`/sizitisi/${data}`)
  }
  const byCode = async (e) => {
    e.preventDefault(); setErr('')
    const { data, error } = await sb.rpc('join_by_code', { p_code: new FormData(e.target).get('code') })
    if (error) return setErr(msgOf(error))
    nav(`/sizitisi/${data}`)
  }
  return (
    <div className="wrap pad">
      <h1>Συζήτηση</h1>
      <p className="lead">Συζητήστε σε πραγματικό χρόνο, με πολίτες που έχουν επαληθευμένο email.</p>
      <div className="rooms-grid">
        {groupsOn && (
          <aside className="rooms-side">
            {session && profile ? (
              <>
                <form onSubmit={create} className="panel">
                  <h3>Δημιουργία ομάδας</h3>
                  <div className="form-row"><label>Όνομα (3 έως 60 χαρακτήρες)</label><input name="name" maxLength={60} required /></div>
                  <div className="form-row"><label>Περιγραφή (προαιρετικά, έως 200)</label><input name="desc" maxLength={200} /></div>
                  <div className="form-row"><label>Ορατότητα</label>
                    <select name="visibility"><option value="public">Δημόσια (όλοι μπορούν να μπουν)</option><option value="private">Ιδιωτική (μόνο με κωδικό πρόσκλησης)</option></select></div>
                  <button type="submit" disabled={busy}>Δημιουργία</button>
                  <p className="note">Έως 3 ομάδες ανά λογαριασμός. Ο δημιουργός αφαιρεί μηνύματα και μέλη.</p>
                </form>
                <form onSubmit={byCode} className="panel">
                  <h3>Είσοδος με κωδικό πρόσκλησης</h3>
                  <div className="form-row"><input name="code" required placeholder="κωδικός" /></div>
                  <button type="submit">Είσοδος</button>
                </form>
              </>
            ) : <p className="panel">Για ομάδες χρειάζεστε λογαριασμό. <Link className="btn" to="/eisodos">Είσοδος</Link></p>}
            {err && <p className="errorlist">{err}</p>}
          </aside>
        )}
        <div className="rooms-main">
          <div className="panel"><h3><Link to="/sizitisi/geniko">Γενικό δωμάτιο</Link></h3><p className="note">Ανοιχτό σε όλους, για κάθε θέμα.</p></div>
          {official.length > 0 && <><h2>Δωμάτια ανά θέμα</h2>{official.map((r) => <RoomItem key={r.id} r={r} topics={topics} />)}</>}
          {groupsOn && (
            <>
              <h2>Ομάδες χρηστών</h2>
              <p className="note">Οι δημόσιες ομάδες εμφανίζονται σε τυχαία σειρά. Για συμμετοχή σε ιδιωτικές ομάδες χρειάζεστε λογαριασμό και κωδικό πρόσκλησης.</p>
              {mine.length > 0 && <><h3>Οι ομάδες μου</h3>{mine.map((r) => <RoomItem key={r.id} r={r} topics={topics} />)}</>}
              {open.length > 0 ? open.map((r) => <RoomItem key={r.id} r={r} topics={topics} />) : !mine.length && <p className="note">Δεν υπάρχουν ομάδες ακόμη.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function RoomPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const nav = useNavigate()
  const [n, setN] = useState(0)
  const [err, setErr] = useState('')
  const s = useData(async () => {
    const room = (await q(sb.from('chat_rooms').select('*').eq('id', id).limit(1)))[0]
    if (!room) throw new Error('Η ομάδα δεν βρέθηκε ή δεν έχετε πρόσβαση.')
    const members = await q(sb.from('chat_room_members').select('user_id,role,banned').eq('room_id', id))
    const ids = members.filter((m) => !m.banned).map((m) => m.user_id)
    const names = ids.length ? await q(sb.from('citizens_public').select('user_id,display_name').in('user_id', ids)) : []
    const on = (await sb.rpc('feature_on', { k: 'chat_groups' })).data === true
    return { room, members, names: Object.fromEntries(names.map((a) => [a.user_id, a.display_name])), groupsOn: on }
  }, [id, n, session?.user.id])
  useTitle(s.data?.room.name)
  if (!s.data) return <Loading state={s} />
  const { room, members, names, groupsOn } = s.data
  const me = session?.user.id
  const mine = members.find((m) => m.user_id === me)
  const isMember = !!mine && !mine.banned
  const isOwner = room.owner_id === me
  const official = room.kind === 'official'
  const act = async (p, after) => {
    setErr('')
    const { error } = await p
    if (error) return setErr(msgOf(error))
    after ? after() : setN(n + 1)
  }
  return (
    <div className="wrap pad">
      <p className="note"><Link to="/sizitisi">← Όλα τα δωμάτια</Link></p>
      <h1>{room.name}</h1>
      {room.description && <p className="lead">{room.description}</p>}
      {err && <p className="errorlist">{err}</p>}
      {!official && (
        <div className="panel">
          {isMember ? (
            <>
              <p><strong>{members.filter((m) => !m.banned).length}</strong> μέλη: {members.filter((m) => !m.banned).map((m) => (
                <span key={m.user_id}>{names[m.user_id] ?? '…'}{m.role === 'owner' ? ' (δημιουργός)' : ''}
                  {isOwner && m.role !== 'owner' && <> <button className="link" type="button" onClick={() => act(sb.rpc('kick_member', { p_room: room.id, p_user: m.user_id }))}>αφαίρεση</button></>}{'  '}</span>
              ))}</p>
              {room.visibility === 'private' && <p>Κωδικός πρόσκλησης: <code>{room.invite_code}</code> <span className="note">(δώστε τον μόνο σε όσους θέλετε να μπουν)</span></p>}
              {isOwner
                ? <button className="ghost" onClick={() => window.confirm('Διαγραφή της ομάδας και όλων των μηνυμάτων;') && act(sb.rpc('delete_room', { p_room: room.id }), () => nav('/sizitisi'))}>Διαγραφή ομάδας</button>
                : <button className="ghost" onClick={() => act(sb.rpc('leave_room', { p_room: room.id }))}>Αποχώρηση</button>}
            </>
          ) : session && groupsOn && room.visibility === 'public' && !mine?.banned
            ? <button onClick={() => act(sb.rpc('join_room', { p_room: room.id }))}>Συμμετοχή στην ομάδα</button>
            : <p className="note">Δεν είστε μέλος.</p>}
        </div>
      )}
      <Chat room={{ room_id: room.id }} title="Μηνύματα" canPost={official || isMember} canModerate={isOwner}
        noPostText="Για να γράψετε, γίνετε μέλος της ομάδας." />
    </div>
  )
}
