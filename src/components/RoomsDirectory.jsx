import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sb, q } from '../supabase'
import { ROOM_CATEGORIES, directoryRooms, filterRooms, paginateRooms, roomCategory } from '../roomDirectory'
import DiscussionIcon from '../icons/DiscussionIcon'

const format = (n) => Number(n || 0).toLocaleString('el-GR')
const message = (e) => /row-level security/i.test(e?.message || '') ? 'Η ενέργεια δεν επιτρέπεται.' : e?.message || 'Η ενέργεια δεν ολοκληρώθηκε. Δοκίμασε ξανά.'

function RoomCard({ room, topics, signedIn }) {
  const category = roomCategory(room, topics)
  return <article className="discussion-card">
    <div className="discussion-card-meta">
      <span className="discussion-topic"><DiscussionIcon name={category.icon} />{category.label}</span>
      {signedIn && room.is_member && room.kind === 'group' && <span className="discussion-member">{room.is_owner ? 'Δημιουργός' : 'Μέλος'}</span>}
    </div>
    <h3><Link to={`/sizitisi/${room.id}`} title={room.name}>{room.name}</Link></h3>
    <p className="discussion-description">{room.description || 'Άνοιξε τη συζήτηση και πάρε μέρος στον διάλογο.'}</p>
    <div className="discussion-visibility">{room.kind === 'official' ? 'Επίσημο δωμάτιο' : room.visibility === 'private' ? 'Ιδιωτική ομάδα' : 'Δημόσια ομάδα'}</div>
    <div className="discussion-card-footer">
      <DiscussionIcon name={room.kind === 'official' ? 'chat' : 'person'} />
      <span>{room.kind === 'official' ? 'Ανοιχτή συζήτηση' : `${format(room.members)} ${Number(room.members) === 1 ? 'μέλος' : 'μέλη'}`}</span>
    </div>
  </article>
}

function CreateRoomDialog({ open, onClose }) {
  const ref = useRef(null)
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) { setError(''); ref.current.showModal(); ref.current.querySelector('[name="name"]')?.focus() }
    else if (ref.current.open) ref.current.close()
  }, [open])
  const create = async (event) => {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const id = await q(sb.rpc('create_room', { p_name: fields.get('name').trim(), p_desc: fields.get('desc').trim(), p_visibility: fields.get('visibility') }))
      if (!id) throw new Error('Δεν ολοκληρώθηκε η δημιουργία της ομάδας.')
      onClose(); nav(`/sizitisi/${id}`)
    } catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  return <dialog ref={ref} className="room-create-dialog" aria-labelledby="room-create-title" onClose={onClose} onCancel={(e) => { if (busy) e.preventDefault() }} onClick={(e) => { if (e.target === ref.current && !busy) ref.current.close() }}>
    <button type="button" className="pop-close" aria-label="Κλείσιμο" onClick={() => ref.current.close()} disabled={busy}>×</button>
    <p className="eyebrow">Μια νέα συζήτηση</p>
    <h2 id="room-create-title">Δημιουργία ομάδας</h2>
    {open && <form onSubmit={create}>
      <div className="form-row"><label htmlFor="room-name">Όνομα (3 έως 60 χαρακτήρες)</label><input id="room-name" type="text" name="name" minLength={3} maxLength={60} required /></div>
      <div className="form-row"><label htmlFor="room-description">Περιγραφή (προαιρετικά, έως 200 χαρακτήρες)</label><textarea id="room-description" name="desc" maxLength={200} rows={5} /></div>
      <div className="form-row"><label htmlFor="room-visibility">Ορατότητα</label><select id="room-visibility" name="visibility"><option value="public">Δημόσια — ανοιχτή σε όλους</option><option value="private">Ιδιωτική — μόνο με κωδικό πρόσκλησης</option></select></div>
      <p className="note">Έως 3 ομάδες ανά λογαριασμό. Ο δημιουργός μπορεί να αφαιρεί μηνύματα και μέλη.</p>
      {error && <p className="errorlist" role="alert">{error}</p>}
      <div className="room-form-actions"><button type="button" className="btn ghost" onClick={() => ref.current.close()} disabled={busy}>Ακύρωση</button><button type="submit" disabled={busy}>{busy ? 'Δημιουργία…' : 'Δημιουργία'}</button></div>
    </form>}
  </dialog>
}

function Invitations({ enabled }) {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const join = async (event) => {
    event.preventDefault()
    if (busy || !enabled) return
    const code = new FormData(event.currentTarget).get('code').trim()
    if (!code) return setError('Συμπλήρωσε τον κωδικό πρόσκλησης.')
    setBusy(true); setError('')
    try {
      const id = await q(sb.rpc('join_by_code', { p_code: code }))
      if (!id) throw new Error('Δεν ολοκληρώθηκε η είσοδος στην ομάδα.')
      nav(`/sizitisi/${id}`)
    } catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  return <section className="room-invitations" aria-labelledby="room-invitations-title">
    <div className="room-invite-copy"><DiscussionIcon name="key" /><h2 id="room-invitations-title">Έχεις κωδικό πρόσκλησης;</h2><p>Βάλε τον κωδικό που σου έδωσε ο δημιουργός μιας ομάδας για να συμμετέχεις.</p><p className="note">Οι ιδιωτικές ομάδες εμφανίζονται στις «Ομάδες μου» αφού γίνεις μέλος τους.</p></div>
    <form onSubmit={join} className="room-invite-form">
      <h3>Είσοδος με πρόσκληση</h3>
      <div className="form-row"><label htmlFor="room-invite-code">Κωδικός πρόσκλησης</label><input id="room-invite-code" type="text" name="code" maxLength={64} autoComplete="off" spellCheck={false} required disabled={!enabled} /></div>
      {!enabled && <p className="note">Δεν βρέθηκε προφίλ πολίτη για τον λογαριασμό σου.</p>}
      {error && <p className="errorlist" role="alert">{error}</p>}
      <button type="submit" disabled={busy || !enabled}>{busy ? 'Είσοδος…' : 'Συμμετοχή στην ομάδα'}</button>
    </form>
  </section>
}

export default function RoomsDirectory({ rooms, topics, groupsOn, session, profile }) {
  const [view, setView] = useState('explore')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const results = useRef(null)
  const personal = !!session && groupsOn
  const tabs = [{ id: 'explore', label: 'Εξερεύνηση' }, ...(personal ? [{ id: 'mine', label: 'Οι ομάδες μου' }, { id: 'invitations', label: 'Προσκλήσεις' }] : [])]
  const available = directoryRooms(rooms, { signedIn: !!session, groupsOn, view })
  const filtered = filterRooms(available, topics, { category, query, type })
  const listing = paginateRooms(filtered, page)
  const counts = Object.fromEntries(ROOM_CATEGORIES.map((c) => [c.id, c.id === 'all' ? available.length : available.filter((r) => roomCategory(r, topics).id === c.id).length]))
  const changeView = (next) => { setView(next); setCategory('all'); setQuery(''); setType('all'); setPage(1) }
  const clear = () => { setCategory('all'); setQuery(''); setType('all'); setPage(1) }
  const changePage = (next) => { setPage(next); results.current?.scrollIntoView({ block: 'start' }) }
  const pageStart = Math.min(Math.max(1, listing.page - 2), Math.max(1, listing.pages - 4))
  const pageNumbers = Array.from({ length: Math.min(5, listing.pages) }, (_, i) => pageStart + i)
  const tabKeys = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = tabs.findIndex((t) => t.id === view)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    changeView(tabs[next].id)
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
  }
  return <div className="wrap pad rooms-hub">
    <div className="rooms-heading">
      <div><p className="eyebrow">Δημόσιος διάλογος</p><h1>Βρες τη συζήτηση που σε αφορά.</h1><p className="rooms-subtitle">Ανακάλυψε θέματα, γνώρισε ομάδες και πάρε μέρος στον διάλογο.</p></div>
      {groupsOn && <div className="rooms-actions">
        {session ? <><button type="button" onClick={() => setCreating(true)} disabled={!profile}><DiscussionIcon name="plus" />Δημιουργία ομάδας</button><button type="button" className="btn ghost" onClick={() => changeView('invitations')}>Είσοδος με πρόσκληση</button></>
          : <><Link className="btn" to="/eisodos"><DiscussionIcon name="plus" />Δημιουργία ομάδας</Link><Link className="btn ghost" to="/eisodos">Είσοδος με πρόσκληση</Link></>}
      </div>}
    </div>
    <div className="rooms-tabs" role="tablist" aria-label="Προβολή συζητήσεων">
      {tabs.map((t) => <button type="button" role="tab" id={`rooms-tab-${t.id}`} key={t.id} aria-selected={view === t.id} aria-controls="rooms-tab-panel" tabIndex={view === t.id ? 0 : -1} onClick={() => changeView(t.id)} onKeyDown={tabKeys}>{t.label}</button>)}
    </div>
    <div id="rooms-tab-panel" role="tabpanel" aria-labelledby={`rooms-tab-${view}`}>
      {view === 'invitations' && personal ? <Invitations enabled={!!profile} /> : <>
        {view === 'explore' && <div className="rooms-general"><DiscussionIcon name="chat" /><div><h2><Link to="/sizitisi/geniko">Γενικό δωμάτιο</Link></h2><p>Ανοιχτή συζήτηση για κάθε θέμα.</p></div><Link className="btn ghost" to="/sizitisi/geniko">Είσοδος <span aria-hidden="true">→</span></Link></div>}
        <section className="rooms-categories" aria-labelledby="rooms-categories-title">
          <h2 id="rooms-categories-title">Εξερεύνησε ανά θέμα</h2>
          <div className="rooms-category-grid">{ROOM_CATEGORIES.map((c) => <button type="button" className="room-category" key={c.id} aria-pressed={category === c.id} aria-label={`${c.label}, ${format(counts[c.id])} ${counts[c.id] === 1 ? 'συζήτηση' : 'συζητήσεις'}`} onClick={() => { setCategory(c.id); setPage(1) }}><DiscussionIcon name={c.icon} /><span>{c.id === 'environment' ? 'Περι\u00adβάλλον' : c.id === 'economy' ? 'Οικο\u00adνομία' : c.label}</span><small>{format(counts[c.id])}<span className="category-count-label"> {counts[c.id] === 1 ? 'συζήτηση' : 'συζητήσεις'}</span></small></button>)}</div>
        </section>
        <div className="rooms-toolbar">
          <div className="rooms-search"><label className="sr-only" htmlFor="room-search">Αναζήτηση συζήτησης</label><DiscussionIcon name="search" /><input id="room-search" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Αναζήτηση συζήτησης…" /></div>
          <div className="rooms-type"><label className="sr-only" htmlFor="room-type">Τύπος συζήτησης</label><select id="room-type" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
            {view === 'mine' ? <><option value="all">Όλες οι ομάδες μου</option><option value="public">Δημόσιες ομάδες</option><option value="private">Ιδιωτικές ομάδες</option></> : <><option value="all">Όλες οι συζητήσεις</option>{groupsOn && <option value="group">Δημόσιες ομάδες</option>}<option value="official">Επίσημα δωμάτια</option></>}
          </select></div>
          <span className="note rooms-order">Ισότιμη εναλλαγή</span>
        </div>
        <section ref={results} className="rooms-results" aria-labelledby="rooms-results-title">
          <div className="rooms-results-heading"><h2 id="rooms-results-title">{view === 'mine' ? 'Οι ομάδες μου' : 'Συζητήσεις και ομάδες'}</h2><p className="note" role="status">{format(listing.first)}–{format(listing.last)} από {format(filtered.length)}</p></div>
          {listing.items.length ? <div className="discussion-card-grid">{listing.items.map((r) => <RoomCard key={r.id} room={r} topics={topics} signedIn={!!session} />)}</div> : <div className="rooms-empty">
            <DiscussionIcon name="chat" /><h3>{view === 'mine' && !available.length ? 'Δεν συμμετέχεις ακόμη σε κάποια ομάδα.' : 'Δεν βρέθηκαν συζητήσεις.'}</h3>
            {category !== 'all' || query || type !== 'all' ? <><p>Δοκίμασε άλλο θέμα ή άλλαξε την αναζήτησή σου.</p><button type="button" className="btn ghost" onClick={clear}>Καθαρισμός φίλτρων</button></> : view === 'mine' ? <button type="button" className="btn ghost" onClick={() => changeView('explore')}>Εξερεύνησε τις δημόσιες ομάδες</button> : <p>Οι νέες συζητήσεις θα εμφανίζονται εδώ.</p>}
          </div>}
          {listing.pages > 1 && <nav className="rooms-pagination" aria-label="Σελίδες συζητήσεων">
            <button type="button" className="btn ghost" disabled={listing.page === 1} onClick={() => changePage(listing.page - 1)} aria-label="Προηγούμενη σελίδα"><span aria-hidden="true">←</span> <span className="page-word">Προηγούμενη</span></button>
            {pageNumbers.map((p) => <button type="button" className={`btn${p === listing.page ? '' : ' ghost'}`} key={p} aria-current={p === listing.page ? 'page' : undefined} aria-label={`Σελίδα ${p}`} onClick={() => changePage(p)}>{format(p)}</button>)}
            <button type="button" className="btn ghost" disabled={listing.page === listing.pages} onClick={() => changePage(listing.page + 1)} aria-label="Επόμενη σελίδα"><span className="page-word">Επόμενη</span> <span aria-hidden="true">→</span></button>
          </nav>}
          <p className="note rooms-directory-note">Οι δημόσιες ομάδες εμφανίζονται σε τυχαία σειρά. Για να συμμετέχεις σε ιδιωτική ομάδα χρειάζεσαι λογαριασμό και κωδικό πρόσκλησης.</p>
        </section>
      </>}
    </div>
    {personal && profile && <CreateRoomDialog open={creating} onClose={() => setCreating(false)} />}
  </div>
}
