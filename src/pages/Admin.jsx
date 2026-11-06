import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useAuth } from '../auth'
import { useData, useTitle, fmtDateTime, KIND } from '../util'
import { Loading } from '../components'

export function useIsAdmin() {
  const { session } = useAuth()
  const s = useData(async () => (session ? (await sb.rpc('is_admin')).data === true : false), [session?.user.id])
  return { isAdmin: !!s.data, loading: s.loading }
}

const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' }
export const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ου/g, 'ou')
    .replace(/[α-ω]/g, (c) => GR[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const STATE = { pending: 'Σε αναμονή', approved: 'Εγκρίθηκε', rejected: 'Απορρίφθηκε' }
const FLAG = { off: 'Ανενεργή', test: 'Δοκιμή (μόνο διαχειριστές)', on: 'Ενεργή' }

function Msg({ m }) {
  return m ? <p className={m.ok ? 'note' : 'errorlist'}>{m.text}</p> : null
}

// ───────── Αιτήσεις ─────────
function Application({ a, reload }) {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [slug, setSlug] = useState(slugify(a.name))
  const [reason, setReason] = useState('')
  const [publish, setPublish] = useState(false)
  const run = async (promise, ok) => {
    setBusy(true); setMsg(null)
    const { error } = await promise
    setBusy(false)
    if (error) return setMsg({ text: error.message })
    setMsg({ ok: true, text: ok })
    reload()
  }
  return (
    <div className="panel">
      <h3>{a.name} <span className="pill">{KIND[a.kind]}</span> <span className="pill pill-soft">{STATE[a.state] || a.state}</span></h3>
      <p className="note">{fmtDateTime(a.created_at)} · {a.contact_email}{a.website && <> · <a href={a.website} target="_blank" rel="noopener noreferrer nofollow">{a.website}</a></>}</p>
      <p><strong>Υπεύθυνα πρόσωπα:</strong></p>
      <p style={{ whiteSpace: 'pre-line' }}>{a.responsible_persons}</p>
      <p><strong>Δήλωση για τις εκλογές:</strong></p>
      <p style={{ whiteSpace: 'pre-line' }}>{a.elections_statement}</p>
      {a.state === 'pending' ? (
        <>
          <div className="form-row"><label>Slug (διεύθυνση σελίδας, λατινικά)</label><input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
          <p><label><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Δημοσίευση αμέσως (αλλιώς μένει κρυφό ως την ολοκλήρωση του προφίλ)</label></p>
          <div className="form-row"><label>Αιτιολόγηση (δημοσιεύεται στη «Διαφάνεια»· υποχρεωτική για απόρριψη)</label>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Msg m={msg} />
          <button disabled={busy} onClick={() => run(sb.rpc('approve_application', { p_id: a.id, p_slug: slug.trim(), p_publish: publish, p_reason: reason }), 'Εγκρίθηκε και δημιουργήθηκε το κόμμα. Συνδέστε μέλος από την καρτέλα «Κόμματα».')}>Έγκριση</button>{' '}
          <button className="ghost" disabled={busy} onClick={() => run(sb.rpc('reject_application', { p_id: a.id, p_reason: reason }), 'Απορρίφθηκε.')}>Απόρριψη</button>
        </>
      ) : (
        <>{a.admin_note && <p className="note">Αιτιολόγηση: {a.admin_note}</p>}<Msg m={msg} /></>
      )}
    </div>
  )
}

function Applications() {
  const [n, setN] = useState(0)
  const s = useData(() => q(sb.from('party_applications').select('*').order('created_at', { ascending: false })), [n])
  if (!s.data) return <Loading state={s} />
  const order = { pending: 0, approved: 1, rejected: 2 }
  const rows = [...s.data].sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3))
  return rows.length ? rows.map((a) => <Application key={a.id} a={a} reload={() => setN(n + 1)} />) : <p className="note">Δεν υπάρχουν αιτήσεις.</p>
}

// ───────── Κόμματα ─────────
function Members({ partyId }) {
  const [n, setN] = useState(0)
  const [msg, setMsg] = useState(null)
  const s = useData(async () => {
    const { data, error } = await sb.rpc('list_members', { p_party: partyId })
    if (error) throw new Error(error.message)
    return data
  }, [partyId, n])
  const add = async (e) => {
    e.preventDefault(); setMsg(null)
    const email = new FormData(e.target).get('email').trim()
    const { error } = await sb.rpc('link_member', { p_email: email, p_party: partyId })
    if (error) return setMsg({ text: error.message })
    e.target.reset(); setN(n + 1)
  }
  const remove = async (uid) => {
    const { error } = await sb.rpc('unlink_member', { p_user: uid, p_party: partyId })
    if (error) return setMsg({ text: error.message })
    setN(n + 1)
  }
  return (
    <div className="panel">
      <h3>Λογαριασμοί κόμματος</h3>
      {!s.data ? <Loading state={s} /> : s.data.length ? (
        <ul>{s.data.map((m) => <li key={m.user_id}>{m.display_name || '—'} · {m.email} <button className="link" onClick={() => remove(m.user_id)}>Αφαίρεση</button></li>)}</ul>
      ) : <p className="note">Κανένας λογαριασμός δεν είναι συνδεδεμένος.</p>}
      <form onSubmit={add}>
        <div className="form-row"><label>Email λογαριασμού εκπροσώπου (πρέπει να έχει κάνει εγγραφή στο site)</label><input name="email" type="email" required /></div>
        <Msg m={msg} />
        <button type="submit">Σύνδεση</button>
      </form>
    </div>
  )
}

function PartyEditor({ party, reload }) {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault(); setMsg(null)
    const f = new FormData(e.target)
    const row = {
      name: (f.get('name') || '').trim(), kind: f.get('kind'), tier: f.get('tier'), profile_source: f.get('profile_source'),
      responsible_persons: (f.get('responsible_persons') || '').trim(),
      is_published: !!f.get('is_published'), graduated: !!f.get('graduated'),
      moderation_note: (f.get('moderation_note') || '').trim(),
    }
    if (!row.name) return setMsg({ text: 'Η επωνυμία είναι υποχρεωτική.' })
    setBusy(true)
    const { error } = await sb.from('parties').update(row).eq('id', party.id)
    setBusy(false)
    if (error) return setMsg({ text: error.message })
    setMsg({ ok: true, text: 'Αποθηκεύτηκε.' }); reload()
  }
  return (
    <>
      <form onSubmit={save} className="panel" key={party.id + party.name}>
        <h3>{party.name} {party.is_example && <span className="pill pill-example">Παράδειγμα</span>} <Link to={`/kommata/${party.slug}`}>Σελίδα</Link></h3>
        <div className="form-row"><label>Επωνυμία</label><input name="name" maxLength={120} defaultValue={party.name} /></div>
        <div className="form-row"><label>Είδος</label>
          <select name="kind" defaultValue={party.kind}><option value="party">Κόμμα</option><option value="group">Ομάδα υπό σύσταση</option></select></div>
        <div className="form-row"><label>Βαθμίδα προφίλ</label>
          <select name="tier" defaultValue={party.tier}><option value="in_progress">Προφίλ σε εξέλιξη</option><option value="full">Πλήρες προφίλ</option></select></div>
        <div className="form-row"><label>Προέλευση προφίλ</label>
          <select name="profile_source" defaultValue={party.profile_source || 'public_sources'}><option value="public_sources">Από δημόσιες πηγές (μη επιβεβαιωμένο)</option><option value="party_verified">Επιβεβαιωμένο από το κόμμα</option></select></div>
        <div className="form-row"><label>Υπεύθυνα πρόσωπα (ένα ανά γραμμή, έως 3)</label><textarea name="responsible_persons" rows={3} defaultValue={party.responsible_persons} /></div>
        <p><label><input type="checkbox" name="is_published" defaultChecked={party.is_published} /> Δημοσιευμένο</label></p>
        <p><label><input type="checkbox" name="graduated" defaultChecked={party.graduated} /> Απόφοιτο (έχει κατέβει σε εκλογές)</label></p>
        <div className="form-row"><label>Εσωτερική σημείωση εποπτείας</label><textarea name="moderation_note" rows={2} defaultValue={party.moderation_note} /></div>
        <Msg m={msg} />
        <button type="submit" disabled={busy}>Αποθήκευση</button>
      </form>
      <Members partyId={party.id} />
    </>
  )
}

function Parties() {
  const [n, setN] = useState(0)
  const [sel, setSel] = useState('')
  const s = useData(() => q(sb.from('parties').select('*').order('created_at', { ascending: false })), [n])
  if (!s.data) return <Loading state={s} />
  const party = s.data.find((p) => p.id === sel)
  return (
    <>
      <div className="form-row"><label>Κόμμα ή ομάδα</label>
        <select value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">— επιλέξτε —</option>
          {s.data.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_published ? '' : ' (μη δημοσιευμένο)'}{p.is_example ? ' [παράδειγμα]' : ''}</option>)}
        </select></div>
      {party && <PartyEditor party={party} reload={() => setN(n + 1)} />}
    </>
  )
}

// ───────── Αναφορές ─────────
const WHERE = (t, c) =>
  t === 'chat' ? (c.proposal_id ? `/protasi/${c.proposal_id}` : c.party_id ? '/kommata' : c.topic_id ? '/themata' : '/sizitisi') :
  t === 'comment' ? (c.proposal_id ? `/protasi/${c.proposal_id}#c${c.id}` : c.citizen_proposal_id ? `/protasi-politi/${c.citizen_proposal_id}#c${c.id}` : `/erotima/${c.question_id}#c${c.id}`)
    : t === 'question' ? `/erotima/${c.id}` : `/protasi-politi/${c.id}`
const TYPE = { comment: 'Σχόλιο', question: 'Ερώτημα', citizen_proposal: 'Πρόταση πολίτη', chat: 'Μήνυμα συζήτησης' }

function Report({ type, c, reload }) {
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState(null)
  const act = async (p) => {
    const { error } = await p
    if (error) return setMsg({ text: error.message })
    reload()
  }
  const text = type === 'citizen_proposal' ? `${c.title}\n${c.problem}\n${c.action}` : c.body
  return (
    <div className="panel">
      <p className="note"><span className="pill">{TYPE[type]}</span> · {c.report_count} αναφορές · {fmtDateTime(c.created_at)}{type !== 'chat' && <> · <Link to={WHERE(type, c)}>Άνοιγμα</Link></>}</p>
      <p style={{ whiteSpace: 'pre-line' }}>{text}</p>
      <div className="form-row"><label>Αιτιολόγηση αφαίρεσης (δημοσιεύεται στη «Διαφάνεια»)</label><input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <Msg m={msg} />
      <button onClick={() => reason.trim() ? act(type === 'chat' ? sb.rpc('moderate_chat', { p_id: c.id, p_note: reason.trim() }) : sb.rpc('moderate_remove', { p_type: type, p_id: c.id, p_note: reason.trim() })) : setMsg({ text: 'Γράψτε αιτιολόγηση.' })}>Αφαίρεση</button>{' '}
      <button className="ghost" onClick={() => act(type === 'chat' ? sb.rpc('clear_chat_reports', { p_id: c.id }) : sb.rpc('clear_reports', { p_type: type, p_id: c.id }))}>Απόρριψη αναφορών</button>
    </div>
  )
}

function Reports() {
  const [n, setN] = useState(0)
  const s = useData(async () => {
    const f = (t) => q(sb.from(t).select('*').gt('report_count', 0).eq('removed', false).order('report_count', { ascending: false }))
    const [comment, question, citizen_proposal, chat] = await Promise.all([f('comments'), f('questions'), f('citizen_proposals'), f('chat_messages')])
    return { comment, question, citizen_proposal, chat }
  }, [n])
  if (!s.data) return <Loading state={s} />
  const all = Object.entries(s.data).flatMap(([t, rows]) => rows.map((c) => [t, c]))
  return all.length ? all.map(([t, c]) => <Report key={t + c.id} type={t} c={c} reload={() => setN(n + 1)} />) : <p className="note">Δεν υπάρχουν αναφορές σε αναμονή.</p>
}

// ───────── Λειτουργίες ─────────
function Flags() {
  const [n, setN] = useState(0)
  const [msg, setMsg] = useState(null)
  const s = useData(() => q(sb.from('feature_flags').select('*').order('key')), [n])
  if (!s.data) return <Loading state={s} />
  const set = async (key, state) => {
    setMsg(null)
    const { error } = await sb.from('feature_flags').update({ state }).eq('key', key)
    if (error) return setMsg({ text: error.message })
    setN(n + 1)
  }
  return (
    <>
      <p className="lead">«Δοκιμή»: η λειτουργία φαίνεται μόνο σε διαχειριστές. Οι αλλαγές καταγράφονται δημόσια στη «Διαφάνεια».</p>
      <Msg m={msg} />
      {s.data.map((f) => (
        <div className="panel" key={f.key}>
          <h3>{f.label} <span className="pill">v{f.version}</span></h3>
          <p className="note">{f.description}</p>
          <select value={f.state} onChange={(e) => set(f.key, e.target.value)}>
            {Object.entries(FLAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      ))}
    </>
  )
}

// ───────── Δωμάτια ─────────
function AdminRooms() {
  const [n, setN] = useState(0)
  const [msg, setMsg] = useState(null)
  const s = useData(async () => {
    const [rooms, topics] = await Promise.all([
      sb.rpc('list_rooms').then((r) => { if (r.error) throw new Error(r.error.message); return r.data }),
      q(sb.from('topics').select('id,name').order('order')),
    ])
    return { rooms: rooms.filter((r) => r.kind === 'official'), topics }
  }, [n])
  if (!s.data) return <Loading state={s} />
  const create = async (e) => {
    e.preventDefault(); setMsg(null)
    const f = new FormData(e.target)
    const { error } = await sb.rpc('admin_create_room', { p_name: f.get('name'), p_desc: f.get('desc'), p_topic: f.get('topic') ? Number(f.get('topic')) : null })
    if (error) return setMsg({ text: error.message })
    e.target.reset(); setN(n + 1)
  }
  const del = async (id) => {
    if (!window.confirm('Διαγραφή του δωματίου και των μηνυμάτων του;')) return
    const { error } = await sb.rpc('delete_room', { p_room: id })
    if (error) return setMsg({ text: error.message })
    setN(n + 1)
  }
  return (
    <>
      <p className="lead">Επίσημα δωμάτια: τα ανοίγεις μόνο εσύ, προαιρετικά δεμένα με ένα θέμα. Γράφει κάθε συνδεδεμένος πολίτης.</p>
      {s.data.rooms.map((r) => (
        <div className="panel" key={r.id}><strong>{r.name}</strong> {r.topic_id && <span className="pill">{s.data.topics.find((t) => t.id === r.topic_id)?.name}</span>}{' '}
          <Link to={`/sizitisi/${r.id}`}>Άνοιγμα</Link> <button className="link" onClick={() => del(r.id)}>Διαγραφή</button></div>
      ))}
      <form onSubmit={create} className="panel">
        <h3>Νέο επίσημο δωμάτιο</h3>
        <div className="form-row"><label>Όνομα</label><input name="name" minLength={3} maxLength={60} required /></div>
        <div className="form-row"><label>Περιγραφή (προαιρετικά)</label><input name="desc" maxLength={200} /></div>
        <div className="form-row"><label>Θέμα (προαιρετικά)</label>
          <select name="topic"><option value="">— κανένα —</option>{s.data.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <Msg m={msg} />
        <button type="submit">Δημιουργία</button>
      </form>
    </>
  )
}

// ───────── Σελίδα ─────────
export default function Admin() {
  useTitle('Διαχείριση')
  const { session, loading } = useAuth()
  const { isAdmin, loading: al } = useIsAdmin()
  const [tab, setTab] = useState('apps')
  if (loading || al) return <Loading state={{ loading: true }} />
  if (!session) return <Navigate to="/eisodos" replace />
  if (!isAdmin) return <div className="wrap pad"><h1>Διαχείριση</h1><p className="note">Δεν έχετε πρόσβαση σε αυτή τη σελίδα.</p></div>
  const TABS = [['apps', 'Αιτήσεις'], ['parties', 'Κόμματα'], ['reports', 'Αναφορές'], ['rooms', 'Δωμάτια'], ['flags', 'Λειτουργίες']]
  return (
    <div className="wrap pad">
      <h1>Διαχείριση</h1>
      <p>{TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? '' : 'ghost'} onClick={() => setTab(k)} style={{ marginRight: 6, marginBottom: 6 }}>{l}</button>)}</p>
      {tab === 'apps' && <Applications />}
      {tab === 'parties' && <Parties />}
      {tab === 'reports' && <Reports />}
      {tab === 'rooms' && <AdminRooms />}
      {tab === 'flags' && <Flags />}
    </div>
  )
}
