import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { sb, q, imageUrl } from '../supabase'
import { useAuth } from '../auth'
import { useData, useTitle, lines, fmtDateTime } from '../util'
import { Loading } from '../components'
import { words, hasLink, dbError } from './Post'

// Επιστρέφει το κόμμα του συνδεδεμένου χρήστη (party_members), ή null.
export function useMembership() {
  const { session } = useAuth()
  const s = useData(async () => {
    if (!session) return null
    const r = await q(sb.from('party_members').select('party_id').eq('user_id', session.user.id))
    return r[0]?.party_id ?? null
  }, [session?.user.id])
  return { partyId: s.data ?? null, loading: s.loading }
}

const yt = /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com)(\/|\?|$)/i
const SOCIAL = [
  ['facebook', 'Facebook', /^https:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.me)(\/|\?|$)/i],
  ['instagram', 'Instagram', /^https:\/\/([a-z0-9-]+\.)*instagram\.com(\/|\?|$)/i],
  ['x_url', 'X (Twitter)', /^https:\/\/([a-z0-9-]+\.)*(x\.com|twitter\.com)(\/|\?|$)/i],
  ['youtube', 'YouTube', yt],
  ['tiktok', 'TikTok', /^https:\/\/([a-z0-9-]+\.)*tiktok\.com(\/|\?|$)/i],
  ['linkedin', 'LinkedIn', /^https:\/\/([a-z0-9-]+\.)*linkedin\.com(\/|\?|$)/i],
]
const PFIELDS = [
  ['problem', 'Πρόβλημα (με πηγή ή δεδομένο)'], ['action', 'Πρόταση (τι αλλάζει και ποιος το υλοποιεί)'], ['legal', 'Νομικό πλαίσιο'],
  ['cost', 'Κόστος και χρηματοδότηση'], ['tradeoffs', 'Αντισταθμίσματα (ποιος χάνει ή τι θυσιάζεται)'], ['timeline', 'Χρονοδιάγραμμα'], ['metric', 'Μέτρο επιτυχίας'],
]
const OFFICE = { none: 'Δεν έχω ασκήσει δημόσιο αξίωμα', held: 'Έχω ασκήσει δημόσιο αξίωμα', party: 'Έχω αξίωμα σε κόμμα' }

function Msg({ m }) {
  if (!m) return null
  return <p className={m.ok ? 'note' : 'errorlist'}>{m.text}</p>
}

// ───────── Επίσημη απάντηση (εμφανίζεται κάτω από σχόλια στις σελίδες πρότασης/ερωτήματος) ─────────
export function OfficialReply({ column, id, parentId, partyId, onDone }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return <button className="link" type="button" onClick={() => setOpen(true)}>Επίσημη απάντηση του κόμματος</button>
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const body = (new FormData(e.target).get('body') || '').trim()
    if (!body) return setErr('Γράψτε την απάντηση.')
    setBusy(true)
    const { error } = await sb.from('comments').insert({ [column]: id, parent_id: parentId, kind: 'comment', official_party_id: partyId, body })
    setBusy(false)
    if (error) return setErr(dbError(error.message))
    setOpen(false)
    onDone()
  }
  return (
    <form onSubmit={submit} className="panel">
      <div className="form-row"><label>Επίσημη απάντηση (έως 1.000 χαρακτήρες)</label><textarea name="body" rows={4} maxLength={1000} required /></div>
      {err && <p className="errorlist">{err}</p>}
      <button type="submit" disabled={busy}>Δημοσίευση απάντησης</button>{' '}
      <button className="link" type="button" onClick={() => setOpen(false)}>Ακύρωση</button>
    </form>
  )
}

// ───────── Προφίλ ─────────
function ProfileTab({ party, reload }) {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const img = imageUrl(party.image_path)
  const save = async (e) => {
    e.preventDefault()
    setMsg(null)
    const f = new FormData(e.target)
    const row = {
      slogan: (f.get('slogan') || '').trim(),
      founders: (f.get('founders') || '').trim(),
      founders_prior_service: !!f.get('founders_prior_service'),
      funding: (f.get('funding') || '').trim(),
      website: (f.get('website') || '').trim(),
      manifesto: (f.get('manifesto') || '').trim(),
      manifesto_url: (f.get('manifesto_url') || '').trim(),
      legal_status: (f.get('legal_status') || '').trim(),
      contact_email: (f.get('contact_email') || '').trim(),
      team: (f.get('team') || '').trim(),
      positions_url: (f.get('positions_url') || '').trim(),
      news_url: (f.get('news_url') || '').trim(),
      membership_url: (f.get('membership_url') || '').trim(),
      donate_url: (f.get('donate_url') || '').trim(),
      founded_year: f.get('founded_year') ? Number(f.get('founded_year')) : null,
    }
    if (row.slogan.length > 120) return setMsg({ text: 'Το σύνθημα έχει έως 120 χαρακτήρες.' })
    if (row.founded_year && (row.founded_year < 1800 || row.founded_year > new Date().getFullYear())) return setMsg({ text: 'Μη έγκυρο έτος ίδρυσης.' })
    if (row.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.contact_email)) return setMsg({ text: 'Μη έγκυρο email επικοινωνίας.' })
    for (const k of ['positions_url', 'news_url', 'membership_url', 'donate_url']) {
      if (row[k] && !/^https?:\/\//i.test(row[k])) return setMsg({ text: 'Οι σύνδεσμοι πρέπει να ξεκινούν με http:// ή https://.' })
    }
    if (row.manifesto.length > 8000) return setMsg({ text: 'Η διακήρυξη έχει έως 8000 χαρακτήρες.' })
    if (row.manifesto_url && !/^https?:\/\//i.test(row.manifesto_url)) return setMsg({ text: 'Ο σύνδεσμος της διακήρυξης πρέπει να ξεκινά με http:// ή https://.' })
    if (row.website && !/^https?:\/\//i.test(row.website)) return setMsg({ text: 'Η ιστοσελίδα πρέπει να ξεκινά με http:// ή https://.' })
    for (const [k, label, re] of SOCIAL) {
      row[k] = (f.get(k) || '').trim()
      if (row[k] && !re.test(row[k])) return setMsg({ text: `Ο σύνδεσμος ${label} πρέπει να είναι https και από την αντίστοιχη υπηρεσία.` })
    }
    setBusy(true)
    const { error } = await sb.from('parties').update(row).eq('id', party.id)
    setBusy(false)
    if (error) return setMsg({ text: dbError(error.message) })
    setMsg({ ok: true, text: 'Αποθηκεύτηκε.' })
    reload()
  }
  const upload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setMsg(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setMsg({ text: 'Επιτρέπονται μόνο JPG, PNG ή WebP.' })
    if (file.size > 2 * 1024 * 1024) return setMsg({ text: 'Η εικόνα πρέπει να είναι έως 2 MB.' })
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${party.id}/${Date.now()}.${ext}`
    setBusy(true)
    const up = await sb.storage.from('party-images').upload(path, file, { contentType: file.type })
    if (up.error) { setBusy(false); return setMsg({ text: up.error.message }) }
    const { error } = await sb.from('parties').update({ image_path: path }).eq('id', party.id)
    if (!error && party.image_path) await sb.storage.from('party-images').remove([party.image_path])
    setBusy(false)
    if (error) return setMsg({ text: dbError(error.message) })
    setMsg({ ok: true, text: 'Η εικόνα ενημερώθηκε.' })
    reload()
  }
  return (
    <>
      <div className="panel">
        <h3>Φωτογραφία ομάδας</h3>
        {img ? <p><img src={img} alt="" style={{ maxWidth: 260, borderRadius: 8 }} /></p> : <p className="note">Δεν έχει ανέβει εικόνα.</p>}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} />
        <p className="note">JPG, PNG ή WebP, έως 2 MB. Μην ανεβάζετε φωτογραφίες ατόμων χωρίς τη συγκατάθεσή τους.</p>
      </div>
      <form onSubmit={save} className="panel" key={party.id + (party.image_path || '')}>
        <div className="form-row"><label htmlFor="slogan">Σύνθημα (έως 120 χαρακτήρες)</label><input id="slogan" name="slogan" maxLength={120} defaultValue={party.slogan} /></div>
        <div className="form-row"><label htmlFor="founded_year">Έτος ίδρυσης</label><input id="founded_year" name="founded_year" type="number" defaultValue={party.founded_year ?? ''} /></div>
        <div className="form-row"><label htmlFor="founders">Ιδρυτές (ένα όνομα ανά γραμμή)</label><textarea id="founders" name="founders" rows={3} defaultValue={party.founders} /></div>
        <p><label><input type="checkbox" name="founders_prior_service" defaultChecked={party.founders_prior_service} /> Κάποιος από τους ιδρυτές έχει προηγούμενη θητεία σε δημόσιο αξίωμα ή κόμμα</label></p>
        <div className="form-row"><label htmlFor="funding">Χρηματοδότηση (πώς χρηματοδοτείται το κόμμα)</label><textarea id="funding" name="funding" rows={3} defaultValue={party.funding} /></div>
        <div className="form-row"><label htmlFor="website">Επίσημη ιστοσελίδα</label><input id="website" name="website" type="url" placeholder="https://" defaultValue={party.website} /></div>
        <div className="form-row"><label htmlFor="manifesto">Διακήρυξη του κόμματος (προαιρετικά· περίληψη ή πλήρες κείμενο, έως 8000 χαρακτήρες)</label><textarea id="manifesto" name="manifesto" rows={8} maxLength={8000} defaultValue={party.manifesto} /></div>
        <div className="form-row"><label htmlFor="manifesto_url">Σύνδεσμος προς το επίσημο κείμενο της διακήρυξης (προαιρετικά)</label><input id="manifesto_url" name="manifesto_url" type="url" placeholder="https://" defaultValue={party.manifesto_url} /></div>
        <div className="form-row"><label htmlFor="legal_status">Νομική υπόσταση (π.χ. πού και πότε κατατέθηκε η ιδρυτική διακήρυξη)</label><textarea id="legal_status" name="legal_status" rows={2} maxLength={500} defaultValue={party.legal_status} /></div>
        <div className="form-row"><label htmlFor="team">Ομάδα και πολιτικά όργανα (ονόματα και ρόλοι, ένα ανά γραμμή· μόνο όσα έχουν δημοσιευτεί επίσημα)</label><textarea id="team" name="team" rows={4} maxLength={2000} defaultValue={party.team} /></div>
        <div className="form-row"><label htmlFor="contact_email">Email επικοινωνίας (δημοσιεύεται· χρησιμοποιήστε διεύθυνση του κόμματος)</label><input id="contact_email" name="contact_email" type="email" maxLength={200} defaultValue={party.contact_email} /></div>
        <div className="form-row"><label htmlFor="positions_url">Σύνδεσμος: οι θέσεις του κόμματος</label><input id="positions_url" name="positions_url" type="url" placeholder="https://" defaultValue={party.positions_url} /></div>
        <div className="form-row"><label htmlFor="news_url">Σύνδεσμος: νέα και ανακοινώσεις</label><input id="news_url" name="news_url" type="url" placeholder="https://" defaultValue={party.news_url} /></div>
        <div className="form-row"><label htmlFor="membership_url">Σύνδεσμος: εγγραφή μελών</label><input id="membership_url" name="membership_url" type="url" placeholder="https://" defaultValue={party.membership_url} /></div>
        <div className="form-row"><label htmlFor="donate_url">Σύνδεσμος: οικονομική ενίσχυση</label><input id="donate_url" name="donate_url" type="url" placeholder="https://" defaultValue={party.donate_url} /></div>
        {SOCIAL.map(([k, label]) => (
          <div className="form-row" key={k}><label htmlFor={k}>{label}</label><input id={k} name={k} type="url" placeholder="https://" defaultValue={party[k]} /></div>
        ))}
        <Msg m={msg} />
        <button type="submit" disabled={busy}>Αποθήκευση</button>
        <p className="note">Οι αλλαγές καταγράφονται δημόσια στο ιστορικό αλλαγών του προφίλ.</p>
      </form>
    </>
  )
}

// ───────── Πρόσωπα ─────────
function PersonForm({ party, name, row, reload }) {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    setMsg(null)
    const f = new FormData(e.target)
    const r = { party_id: party.id, name }
    for (const k of ['occupation', 'education', 'experience', 'office_details', 'motivation', 'social_url']) r[k] = (f.get(k) || '').trim()
    r.public_office = f.get('public_office')
    if (r.social_url && !/^https:\/\//i.test(r.social_url)) return setMsg({ text: 'Ο σύνδεσμος πρέπει να ξεκινά με https://' })
    for (const k of ['education', 'experience', 'motivation']) if (words(r[k]) > 150) return setMsg({ text: 'Κάθε πεδίο έχει έως 150 λέξεις.' })
    setBusy(true)
    const { error } = await sb.from('party_people').upsert(r, { onConflict: 'party_id,name' })
    setBusy(false)
    if (error) return setMsg({ text: dbError(error.message) })
    setMsg({ ok: true, text: 'Αποθηκεύτηκε.' })
    reload()
  }
  const d = row || { public_office: 'none' }
  return (
    <form onSubmit={save} className="panel">
      <h3>{name} {row ? <span className="pill pill-teal">Συμπληρωμένο</span> : <span className="pill pill-soft">Λείπει</span>}</h3>
      <div className="form-row"><label>Επάγγελμα</label><input name="occupation" maxLength={120} defaultValue={d.occupation} /></div>
      <div className="form-row"><label>Εκπαίδευση</label><textarea name="education" rows={2} defaultValue={d.education} /></div>
      <div className="form-row"><label>Επαγγελματική και κοινωνική εμπειρία</label><textarea name="experience" rows={3} defaultValue={d.experience} /></div>
      <div className="form-row"><label>Δημόσιο αξίωμα</label>
        <select name="public_office" defaultValue={d.public_office}>{Object.entries(OFFICE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="form-row"><label>Λεπτομέρειες αξιώματος (αν υπάρχει)</label><input name="office_details" maxLength={300} defaultValue={d.office_details} /></div>
      <div className="form-row"><label>Γιατί συμμετέχει</label><textarea name="motivation" rows={3} defaultValue={d.motivation} /></div>
      <div className="form-row"><label>Προσωπικός σύνδεσμος (προαιρετικά, https)</label><input name="social_url" type="url" placeholder="https://" defaultValue={d.social_url} /></div>
      <Msg m={msg} />
      <button type="submit" disabled={busy}>Αποθήκευση</button>
    </form>
  )
}

function PeopleTab({ party, people, reload }) {
  const names = [...new Set([...lines(party.responsible_persons), ...lines(party.founders)])]
  const byName = Object.fromEntries(people.map((p) => [p.name, p]))
  return (
    <>
      <p className="lead">Βιογραφικά για τα υπεύθυνα πρόσωπα και τους ιδρυτές. Τα ονόματα προέρχονται από τα πεδία «Υπεύθυνα πρόσωπα» (διαχείριση) και «Ιδρυτές» (προφίλ).</p>
      {names.length ? names.map((n) => <PersonForm key={n + (byName[n] ? 'y' : 'n')} party={party} name={n} row={byName[n]} reload={reload} />)
        : <p className="note">Δεν υπάρχουν ονόματα. Προσθέστε ιδρυτές στο προφίλ.</p>}
    </>
  )
}

// ───────── Βίντεο ─────────
function VideosTab({ party, videos, reload }) {
  const [msg, setMsg] = useState(null)
  const add = async (e) => {
    e.preventDefault()
    setMsg(null)
    const f = new FormData(e.target)
    const url = (f.get('url') || '').trim(), title = (f.get('title') || '').trim()
    if (!yt.test(url)) return setMsg({ text: 'Δώστε σύνδεσμο https από το YouTube.' })
    if (!title || title.length > 100) return setMsg({ text: 'Ο τίτλος είναι υποχρεωτικός (έως 100 χαρακτήρες).' })
    const { error } = await sb.from('party_videos').insert({ party_id: party.id, url, title, position: videos.length })
    if (error) return setMsg({ text: dbError(error.message) })
    e.target.reset()
    reload()
  }
  const del = async (id) => {
    const { error } = await sb.from('party_videos').delete().eq('id', id)
    if (error) return setMsg({ text: dbError(error.message) })
    reload()
  }
  return (
    <>
      <p className="lead">Έως 4 βίντεο YouTube.</p>
      {videos.map((v) => (
        <div className="panel" key={v.id}><strong>{v.title}</strong><br /><a href={v.url} target="_blank" rel="noopener noreferrer nofollow">{v.url}</a>{' '}
          <button className="link" type="button" onClick={() => del(v.id)}>Διαγραφή</button></div>
      ))}
      {videos.length < 4 && (
        <form onSubmit={add} className="panel">
          <div className="form-row"><label>Σύνδεσμος YouTube</label><input name="url" type="url" placeholder="https://www.youtube.com/watch?v=…" required /></div>
          <div className="form-row"><label>Τίτλος</label><input name="title" maxLength={100} required /></div>
          <Msg m={msg} />
          <button type="submit">Προσθήκη</button>
        </form>
      )}
    </>
  )
}

// ───────── Προτάσεις ─────────
function ProposalForm({ party, topic, row, reload, question }) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    setMsg(null)
    const f = new FormData(e.target)
    const r = { party_id: party.id, topic_id: topic.id, title: (f.get('title') || '').trim(), source: (f.get('source') || '').trim(), is_published: !!f.get('is_published'), stance_id: f.get('stance_id') ? Number(f.get('stance_id')) : null }
    for (const [k, label] of PFIELDS) {
      r[k] = (f.get(k) || '').trim()
      if (words(r[k]) > 150) return setMsg({ text: `Το πεδίο «${label}» έχει πάνω από 150 λέξεις.` })
    }
    if (!/^https?:\/\//i.test(r.source)) return setMsg({ text: 'Η πηγή τεκμηρίωσης πρέπει να είναι σύνδεσμος http:// ή https://.' })
    setBusy(true)
    const { error } = await sb.from('proposals').upsert(r, { onConflict: 'party_id,topic_id' })
    setBusy(false)
    if (error) return setMsg({ text: dbError(error.message) })
    setMsg({ ok: true, text: 'Αποθηκεύτηκε.' })
    setOpen(false)
    reload()
  }
  const toggle = async () => {
    setMsg(null); setBusy(true)
    const { error } = await sb.from('proposals').update({ is_published: !row.is_published }).eq('id', row.id)
    setBusy(false)
    if (error) return setMsg({ text: dbError(error.message) })
    reload()
  }
  const d = row || {}
  return (
    <div className="panel">
      <h3>{topic.name}{' '}
        {row ? (row.is_published ? (party.is_published ? <span className="pill pill-teal">Δημοσιευμένη</span> : <span className="pill pill-teal">Έτοιμη</span>) : <span className="pill pill-soft">Πρόχειρο</span>) : <span className="pill outline">Καμία πρόταση</span>}</h3>
      {row && <p>{row.title} {row.is_published && <Link to={`/protasi/${row.id}`}>Προβολή</Link>}</p>}
      <button type="button" className="link" onClick={() => setOpen(!open)}>{open ? 'Κλείσιμο' : row ? 'Επεξεργασία' : 'Δημιουργία πρότασης'}</button>
      {row && !open && (
        <>{' · '}<button type="button" className={row.is_published ? 'link' : 'btn'} disabled={busy} onClick={toggle}>
          {row.is_published ? 'Επιστροφή σε πρόχειρο' : party.is_published ? 'Δημοσίευση πρότασης' : 'Ορισμός ως έτοιμη'}
        </button></>
      )}
      {open && (
        <form onSubmit={save}>
          <div className="form-row"><label>Τίτλος (η δράση σε μία πρόταση)</label><input name="title" maxLength={200} defaultValue={d.title} required /></div>
          {PFIELDS.map(([k, label]) => (
            <div className="form-row" key={k}><label>{label}</label><textarea name={k} rows={4} defaultValue={d[k]} required /><span className="note">Έως 150 λέξεις.</span></div>
          ))}
          <div className="form-row"><label>Πηγή τεκμηρίωσης (σύνδεσμος)</label><input name="source" type="url" placeholder="https://" defaultValue={d.source} required /></div>
          {question && (
            <div className="form-row"><label>Θέση στο ερώτημα του ερωτηματολογίου: «{question.text}»</label>
              <select name="stance_id" defaultValue={d.stance_id ?? ''}><option value="">Δεν δηλώνω θέση</option>
                {[...question.options].sort((a, b) => a.order - b.order).map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}</select>
              <span className="note">Χρησιμοποιείται μόνο στο ερωτηματολόγιο προτιμήσεων των επισκεπτών.</span></div>
          )}
          <p><label><input type="checkbox" name="is_published" defaultChecked={row ? row.is_published : true} /> Έτοιμη για δημοσίευση (αλλιώς μένει πρόχειρο){!party.is_published && ' · θα φαίνεται σε επισκέπτες όταν δημοσιευτεί και το κόμμα'}</label></p>
          <Msg m={msg} />
          <button type="submit" disabled={busy}>Αποθήκευση</button>
        </form>
      )}
      {!open && <Msg m={msg} />}
    </div>
  )
}

function ProposalsTab({ party, topics, proposals, reload, questions }) {
  const by = Object.fromEntries(proposals.map((p) => [p.topic_id, p]))
  return (
    <>
      <p className="lead">Μία πρόταση ανά θέμα, δομημένη, έως 150 λέξεις ανά πεδίο και με πηγή. Οι αλλαγές σε δημοσιευμένες προτάσεις καταγράφονται δημόσια.</p>
      {!party.is_published && <p className="muted">Το κόμμα δεν είναι δημοσιευμένο: οι προτάσεις φαίνονται μόνο σε εσάς και στη διαχείριση, ακόμα κι αν είναι «Έτοιμες».</p>}
      {topics.map((t) => <ProposalForm key={t.id} party={party} topic={t} row={by[t.id]} reload={reload} question={questions[t.id]} />)}
    </>
  )
}

// ───────── Ερωτήσεις προς το κόμμα ─────────
function InboxTab({ proposals, inbox }) {
  const pById = Object.fromEntries(proposals.map((p) => [p.id, p]))
  const open = inbox.questions.filter((c) => !inbox.answered.has(c.id))
  return (
    <>
      <p className="lead">Ερωτήσεις πολιτών προς το κόμμα, στις προτάσεις σας. Η επίσημη απάντηση γίνεται από τη σελίδα της πρότασης.</p>
      <p><strong>{open.length}</strong> αναπάντητες από {inbox.questions.length}.</p>
      {inbox.questions.map((c) => (
        <div className="panel" key={c.id}>
          <p className="note">{pById[c.proposal_id]?.title} · {fmtDateTime(c.created_at)} · {inbox.answered.has(c.id) ? 'Απαντήθηκε' : 'Αναπάντητη'}</p>
          <p style={{ whiteSpace: 'pre-line' }}>{c.body}</p>
          <Link to={`/protasi/${c.proposal_id}#c${c.id}`}>Άνοιγμα και απάντηση</Link>
        </div>
      ))}
      {!inbox.questions.length && <p className="note">Δεν υπάρχουν ερωτήσεις ακόμη.</p>}
    </>
  )
}

// ───────── Σελίδα «Το κόμμα μου» ─────────
export default function Manage() {
  useTitle('Το κόμμα μου')
  const { session, loading } = useAuth()
  const { partyId, loading: ml } = useMembership()
  const [tab, setTab] = useState('overview')
  const [n, setN] = useState(0)
  const reload = () => setN((x) => x + 1)
  const s = useData(async () => {
    if (!partyId) return null
    const [party, people, videos, proposals, topics, changes, prefq] = await Promise.all([
      q(sb.from('parties').select('*').eq('id', partyId).single()),
      q(sb.from('party_people').select('*').eq('party_id', partyId)),
      q(sb.from('party_videos').select('*').eq('party_id', partyId).order('position')),
      q(sb.from('proposals').select('*').eq('party_id', partyId)),
      q(sb.from('topics').select('id,name,slug').order('id')),
      q(sb.from('change_log').select('*').eq('party_id', partyId).order('at', { ascending: false }).limit(10)),
      q(sb.from('pref_questions').select('topic_id,text,options:pref_options(id,text,order)')),
    ])
    const stanceQs = Object.fromEntries(prefq.map((x) => [x.topic_id, x]))
    const pids = proposals.map((p) => p.id)
    const questions = pids.length ? await q(sb.from('comments').select('id,proposal_id,body,created_at').in('proposal_id', pids).eq('kind', 'question').is('parent_id', null).eq('removed', false).order('created_at', { ascending: false })) : []
    const qids = questions.map((c) => c.id)
    const replies = qids.length ? await q(sb.from('comments').select('parent_id').in('parent_id', qids).eq('official_party_id', partyId)) : []
    return { party, people, videos, proposals, topics, changes, stanceQs, inbox: { questions, answered: new Set(replies.map((r) => r.parent_id)) } }
  }, [partyId, n])

  if (loading || ml) return <Loading state={{ loading: true }} />
  if (!session) return <Navigate to="/eisodos" replace />
  if (!partyId) return <div className="wrap pad"><h1>Το κόμμα μου</h1><p className="note">Ο λογαριασμός σας δεν είναι συνδεδεμένος με κάποιο κόμμα ή ομάδα. Η σύνδεση γίνεται από τη διαχείριση μετά την έγκριση της αίτησης.</p></div>
  if (!s.data) return <Loading state={s} />
  const { party, people, videos, proposals, topics, changes, stanceQs, inbox } = s.data
  const names = [...new Set([...lines(party.responsible_persons), ...lines(party.founders)])]
  const filled = names.filter((x) => people.some((p) => p.name === x)).length
  const checks = [
    ['Φωτογραφία ομάδας', !!party.image_path], ['Σύνθημα', !!party.slogan], ['Έτος ίδρυσης', !!party.founded_year], ['Ιδρυτές', !!party.founders],
    ['Χρηματοδότηση', !!party.funding], ['Διακήρυξη', !!(party.manifesto || party.manifesto_url)], ['Ιστοσελίδα ή κοινωνικά δίκτυα', !!(party.website || party.facebook || party.instagram || party.x_url || party.youtube || party.tiktok || party.linkedin)],
    [`Βιογραφικά (${filled}/${names.length})`, names.length > 0 && filled === names.length], ['Τουλάχιστον ένα βίντεο', videos.length > 0],
    [`Προτάσεις (${proposals.filter((p) => p.is_published).length}/${topics.length} θέματα)`, proposals.filter((p) => p.is_published).length === topics.length],
  ]
  const TABS = [['overview', 'Επισκόπηση'], ['profile', 'Προφίλ'], ['people', 'Πρόσωπα'], ['videos', 'Βίντεο'], ['proposals', 'Προτάσεις'], ['inbox', `Ερωτήσεις (${inbox.questions.filter((c) => !inbox.answered.has(c.id)).length})`]]
  return (
    <div className="wrap pad">
      <div className="head-row">
        <h1>Το κόμμα μου: {party.name}</h1>
        <Link className="btn" to={`/kommata/${party.slug}`} title={party.is_published ? 'Δημόσια σελίδα του κόμματος' : 'Προεπισκόπηση σελίδας (ορατή μόνο σε εσάς και στη διαχείριση)'}>👁 {party.is_published ? 'Δημόσια σελίδα' : 'Προεπισκόπηση'}</Link>
      </div>
      <p>{party.is_published ? <span className="pill pill-teal">Δημοσιευμένο</span> : <span className="pill pill-soft">Μη δημοσιευμένο</span>}{' '}
        <span className="pill">{party.tier === 'full' ? 'Πλήρες προφίλ' : 'Προφίλ σε εξέλιξη'}</span>{' '}
</p>
      <p>{TABS.map(([k, label]) => <button key={k} type="button" className={tab === k ? '' : 'ghost'} onClick={() => setTab(k)} style={{ marginRight: 6, marginBottom: 6 }}>{label}</button>)}</p>
      {tab === 'overview' && (
        <>
          <div className="panel"><h3>Πληρότητα προφίλ</h3>
            <ul>{checks.map(([l, ok]) => <li key={l}>{ok ? '✓' : '○'} {l}</li>)}</ul>
            <p className="note">Το όνομα, το είδος, η βαθμίδα και η δημοσίευση αλλάζουν μόνο από τη διαχείριση.</p></div>
          <div className="panel"><h3>Πρόσφατες αλλαγές</h3>
            {changes.length ? <ul>{changes.map((c) => <li key={c.id}>{fmtDateTime(c.at)} · {c.summary}</li>)}</ul> : <p className="note">Καμία ακόμη.</p>}</div>
        </>
      )}
      {tab === 'profile' && <ProfileTab party={party} reload={reload} />}
      {tab === 'people' && <PeopleTab party={party} people={people} reload={reload} />}
      {tab === 'videos' && <VideosTab party={party} videos={videos} reload={reload} />}
      {tab === 'proposals' && <ProposalsTab party={party} topics={topics} proposals={proposals} reload={reload} questions={stanceQs} />}
      {tab === 'inbox' && <InboxTab proposals={proposals} inbox={inbox} />}
    </div>
  )
}
