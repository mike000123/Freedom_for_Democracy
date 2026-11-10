import { useState } from 'react'
import { sb } from '../supabase'

const KINDS = [
  ['correction', 'Διόρθωση λάθους ή παλιών στοιχείων'],
  ['reply', 'Δικαίωμα απάντησης'],
  ['removal', 'Αίτημα απόσυρσης'],
]

// Ανοιχτή σε όλους, χωρίς λογαριασμό. Το email δεν δημοσιεύεται ποτέ.
export default function CorrectionRequest({ party, proposalId = null, label = 'Διόρθωση ή δικαίωμα απάντησης' }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  if (done) return <p className="note" role="status">Λάβαμε το αίτημά σας. Θα το εξετάσουμε και η απόφαση θα καταγραφεί στη <a href="#/diafaneia">Διαφάνεια</a>.</p>
  if (!open) return <button className="link" type="button" onClick={() => setOpen(true)}>{label}</button>
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    const f = new FormData(e.currentTarget)
    const row = {
      party_id: party.id, proposal_id: proposalId, kind: f.get('kind'),
      body: (f.get('body') || '').trim(), evidence_url: (f.get('evidence_url') || '').trim(),
      contact_name: (f.get('contact_name') || '').trim(), contact_email: (f.get('contact_email') || '').trim(),
    }
    if (row.evidence_url && !/^https?:\/\//i.test(row.evidence_url)) return setErr('Ο σύνδεσμος τεκμηρίωσης πρέπει να ξεκινά με http:// ή https://.')
    setBusy(true)
    const { error } = await sb.from('party_corrections').insert(row)
    setBusy(false)
    if (error) return setErr(/πολλά αιτήματα/.test(error.message) ? error.message : 'Δεν ήταν δυνατή η υποβολή. Ελέγξτε τα πεδία (το κείμενο θέλει τουλάχιστον 10 χαρακτήρες) και δοκιμάστε ξανά.')
    setDone(true)
  }
  return <form className="panel" onSubmit={submit} style={{ marginTop: 12 }}>
    <h3>Διόρθωση ή δικαίωμα απάντησης</h3>
    <p className="note">Για το προφίλ «{party.name}». Μπορεί να το υποβάλει οποιοσδήποτε, όχι μόνο εκπρόσωποι. Το email σας δεν δημοσιεύεται. Η απόφαση καταγράφεται δημόσια με αιτιολόγηση.</p>
    <div className="form-row"><label htmlFor="cr-kind">Τι ζητάτε;</label><select id="cr-kind" name="kind" defaultValue="correction">{KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
    <div className="form-row"><label htmlFor="cr-body">Τι να διορθωθεί ή τι θέλετε να απαντήσετε</label><textarea id="cr-body" name="body" rows={5} maxLength={1500} required style={{ resize: 'vertical' }} /></div>
    <div className="form-row"><label htmlFor="cr-url">Σύνδεσμος τεκμηρίωσης (προαιρετικά)</label><input id="cr-url" name="evidence_url" type="url" maxLength={500} placeholder="https://" /></div>
    <div className="form-row"><label htmlFor="cr-name">Όνομα (και ιδιότητα)</label><input id="cr-name" name="contact_name" required minLength={2} maxLength={120} /></div>
    <div className="form-row"><label htmlFor="cr-mail">Email επικοινωνίας</label><input id="cr-mail" name="contact_email" type="email" required maxLength={200} /></div>
    {err && <p className="errorlist" role="alert">{err}</p>}
    <p><button type="submit" disabled={busy}>Υποβολή</button> <button className="ghost" type="button" onClick={() => setOpen(false)}>Άκυρο</button></p>
  </form>
}
