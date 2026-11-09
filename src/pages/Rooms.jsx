import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useAuth } from '../auth'
import { useData, useTitle } from '../util'
import { Loading } from '../components'
import { Chat } from './Chat'
import RoomsDirectory from '../components/RoomsDirectory'

const msgOf = (e) => (/row-level security/i.test(e?.message || '') ? 'Η ενέργεια δεν επιτρέπεται.' : e?.message || '')

export function RoomsHub() {
  useTitle('Συζήτηση')
  const { session, profile, loading } = useAuth()
  const viewerId = session?.user.id || ''
  const s = useData(async () => {
    const [rooms, topics, groupsOn] = await Promise.all([
      q(sb.rpc('list_rooms')),
      q(sb.from('topics').select('id,name')),
      q(sb.rpc('feature_on', { k: 'chat_groups' })),
    ])
    return { rooms: rooms || [], topics: Object.fromEntries(topics.map((t) => [t.id, t.name])), groupsOn: groupsOn === true, viewerId }
  }, [viewerId])
  // Do not reuse a previous account's directory while auth changes are loading.
  if (loading || (s.data && s.data.viewerId !== viewerId)) return <Loading state={{ loading: true }} />
  if (!s.data) return <Loading state={s} />
  return <RoomsDirectory key={`${viewerId}:${s.data.groupsOn}`} {...s.data} session={session} profile={profile} />
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
