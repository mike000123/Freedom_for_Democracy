import { Link, useSearchParams } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useData, useTitle, shuffle, lines, KIND, TIER } from '../util'
import { Loading } from '../components'

const MAX = 9
const NA = <span className="note">Ν/Α</span>
const text = (v) => (v && String(v).trim() ? <span style={{ whiteSpace: 'pre-line' }}>{v}</span> : NA)
const link = (v) => (v ? <a href={v} target="_blank" rel="noreferrer noopener">{v}</a> : NA)
const SRC = (p) => (p.profile_source === 'party_verified' ? 'Επιβεβαιωμένο από το κόμμα' : 'Από δημόσιες πηγές · δεν έχει επιβεβαιωθεί από το κόμμα')

const PF = [['problem', 'Πρόβλημα'], ['action', 'Πρόταση'], ['legal', 'Νομικό πλαίσιο'], ['cost', 'Κόστος και χρηματοδότηση'], ['tradeoffs', 'Αντισταθμίσματα'], ['timeline', 'Χρονοδιάγραμμα'], ['metric', 'Μέτρο επιτυχίας']]

const SECTIONS = [
  ['Βασικά στοιχεία', [
    ['Είδος', (p) => KIND[p.kind]], ['Προφίλ', (p) => TIER[p.tier]], ['Σύνθημα', (p) => text(p.slogan)],
    ['Έτος ίδρυσης', (p) => text(p.founded_year)], ['Προέλευση στοιχείων', (p) => SRC(p)],
  ]],
  ['Πρόσωπα και διαφάνεια', [
    ['Υπεύθυνα πρόσωπα', (p) => (lines(p.responsible_persons).length ? lines(p.responsible_persons).join(', ') : NA)],
    ['Ιδρυτές', (p) => (lines(p.founders).length ? lines(p.founders).join(', ') : NA)],
    ['Προηγούμενη θητεία ιδρυτών', (p) => (p.founders_prior_service ? 'Ναι' : 'Όχι')],
    ['Χρηματοδότηση', (p) => text(p.funding)], ['Νομική υπόσταση', (p) => text(p.legal_status)],
  ]],
  ['Διακήρυξη', [
    ['Κείμενο διακήρυξης', (p) => text(p.manifesto)], ['Σύνδεσμος', (p) => link(p.manifesto_url)],
  ]],
  ['Επικοινωνία', [
    ['Ιστοσελίδα', (p) => link(p.website)], ['Facebook', (p) => link(p.facebook)], ['Instagram', (p) => link(p.instagram)],
    ['X', (p) => link(p.x_url)], ['YouTube', (p) => link(p.youtube)], ['TikTok', (p) => link(p.tiktok)], ['LinkedIn', (p) => link(p.linkedin)],
  ]],
]

export default function CompareParties() {
  useTitle('Σύγκριση κομμάτων και ομάδων')
  const [params] = useSearchParams()
  const slugs = params.getAll('p')
  const s = useData(async () => {
    const parties = slugs.length ? await q(sb.from('parties').select('*').in('slug', slugs).eq('is_published', true)) : []
    const ids = parties.map((p) => p.id)
    const props = ids.length ? await q(sb.from('proposals').select('*,topic:topics(name,order)').in('party_id', ids).eq('is_published', true)) : []
    const shown = shuffle(parties).slice(0, MAX)
    const topics = [...new Map(props.filter((x) => shown.some((p) => p.id === x.party_id)).sort((a, b) => a.topic.order - b.topic.order).map((x) => [x.topic.name, x.topic.name])).keys()]
    return { parties: shown, props, topics }
  }, [params.toString()])
  const d = s.data
  return (
    <div className="wrap pad">
      <p className="crumb"><Link to="/kommata">← Κόμματα και ομάδες</Link></p>
      <h1>Σύγκριση κομμάτων και ομάδων</h1>
      <p className="lead">Ανοίξτε την ενότητα που σας ενδιαφέρει. Οι στήλες εμφανίζονται σε τυχαία σειρά, χωρίς βαθμολογία.</p>
      {!d ? <Loading state={s} /> : d.parties.length < 2 ? <p className="note">Επιλέξτε τουλάχιστον δύο κόμματα από τη <Link to="/kommata">λίστα</Link>.</p> : (
        <>
          {SECTIONS.map(([title, rows], i) => (
            <details key={title} open={i === 0} className="panel">
              <summary><strong>{title}</strong></summary>
              <div className="table-scroll" style={{ marginTop: 12 }}>
                <table className="cmp">
                  <thead><tr><th></th>{d.parties.map((p) => <th key={p.id}><Link to={`/kommata/${p.slug}`}>{p.name}</Link></th>)}</tr></thead>
                  <tbody>
                    {rows.map(([label, f]) => (
                      <tr key={label}><th>{label}</th>{d.parties.map((p) => <td key={p.id}>{f(p)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          <h2>Προτάσεις ανά θέμα</h2>
          <p className="note">Ανοίξτε ένα θέμα για να δείτε τις προτάσεις δίπλα-δίπλα.</p>
          {d.topics.map((t) => {
            const by = Object.fromEntries(d.props.filter((x) => x.topic.name === t).map((x) => [x.party_id, x]))
            const n = d.parties.filter((p) => by[p.id]).length
            return (
              <details key={t} className="panel">
                <summary><strong>{t}</strong> <span className="note">· {n} από {d.parties.length} έχουν θέση</span></summary>
                <div className="table-scroll" style={{ marginTop: 12 }}>
                  <table className="cmp">
                    <thead><tr><th></th>{d.parties.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
                    <tbody>
                      <tr><th>Τίτλος</th>{d.parties.map((p) => <td key={p.id}>{by[p.id] ? <Link to={`/protasi/${by[p.id].id}`}>{by[p.id].title}</Link> : <span className="note">Δεν έχει δηλωθεί θέση</span>}</td>)}</tr>
                      {PF.map(([k, label]) => (
                        <tr key={k}><th>{label}</th>{d.parties.map((p) => <td key={p.id}>{by[p.id] ? text(by[p.id][k]) : NA}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )
          })}
        </>
      )}
    </div>
  )
}
