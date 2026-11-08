import { useState } from 'react'
import { Link } from 'react-router-dom'
import { partyImageUrl } from '../supabase'
import { shuffle } from '../util'
import { useCoverageRotation, VISIBLE_PARTIES } from './useCoverageRotation'

const format = (n) => n.toLocaleString('el-GR')
const CIRC = 2 * Math.PI * 70

function LandscapeStats({ data: d }) {
  const [allTopics, setAllTopics] = useState(false)
  const total = d.parties.length
  let offset = 0
  const segments = [
    ['Πλήρη προφίλ', d.nFull, 'seg-navy'],
    ['Σε εξέλιξη', d.nProgress, 'seg-pale'],
    ['Ομάδες υπό σύσταση', d.nGroups, 'seg-red'],
  ].map(([label, n, color]) => {
    const length = total ? n / total * CIRC : 0
    const segment = { label, n, color, length, offset }
    offset += length
    return segment
  })
  return (
    <section className="band landscape-band" aria-labelledby="landscape-title">
      <div className="wrap">
        <p className="eyebrow">Στατιστικά πλατφόρμας</p>
        <h2 id="landscape-title" className="section-title">Η πολιτική εικόνα, με μια ματιά.</h2>
        <p className="note">Δες ποιοι συμμετέχουν, πού έχουν καταθέσει θέσεις και ποια στοιχεία περιλαμβάνουν οι προτάσεις τους.</p>
        <div className="stats landscape-stats">
          {[
            [d.nParties, 'Κόμματα', '/kommata?kind=party'],
            [d.nGroups, 'Ομάδες υπό σύσταση', '/kommata?kind=group'],
            [d.proposals.length, 'Δημοσιευμένες προτάσεις', '/themata'],
            [d.topics.length, 'Θεματικές ενότητες', '/themata'],
          ].map(([n, label, to]) => <Link className="stat" to={to} key={label}><strong>{format(n)}</strong><span>{label}</span></Link>)}
        </div>
        <p className="note landscape-scope">Μετρούν μόνο δημοσιευμένα προφίλ και προτάσεις. Εξαιρούνται δείγματα και απόφοιτα προφίλ. Δεν υπάρχει κατάταξη κομμάτων.</p>
        <div className="landscape-charts">
          <div className="chart coverage-chart">
            <h3>Πού υπάρχουν δημοσιευμένες θέσεις;</h3>
            <p className="note">Κόμματα και ομάδες με δημοσιευμένη πρόταση ανά θέμα.</p>
            {d.perTopic.length ? <ul className="topic-bars">
              {(allTopics ? d.perTopic : d.perTopic.slice(0, 6)).map((t) => (
                <li key={t.id}>
                  <Link to={`/themata/${t.slug}`}>{t.name}</Link>
                  <div className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${total ? t.n / total * 100 : 0}%` }} /></div>
                  <span className="topic-count">{format(t.n)} από {format(total)}</span>
                </li>
              ))}
            </ul> : <p className="note">Δεν έχουν καταχωριστεί ακόμη θεματικές ενότητες.</p>}
            {d.perTopic.length > 6 && <button type="button" className="link" aria-expanded={allTopics} onClick={() => setAllTopics(!allTopics)}>{allTopics ? 'Λιγότερα θέματα' : `Όλα τα θέματα (${format(d.topics.length)})`}</button>}
            {!total && <p className="note">Δεν υπάρχουν ακόμη δημοσιευμένα προφίλ για καταμέτρηση.</p>}
          </div>
          <div className="chart profile-chart">
            <h3>Πόσα γνωρίζουμε για τα προφίλ;</h3>
            <div className="profile-distribution">
              <svg viewBox="0 0 200 200" role="img" aria-labelledby="profile-distribution-title">
                <title id="profile-distribution-title">{segments.map((s) => `${s.label}: ${s.n}`).join(' · ')}</title>
                <circle className="donut-bg" cx="100" cy="100" r="70" fill="none" strokeWidth="28" />
                {segments.filter((s) => s.n).map((s) => <circle key={s.label} className={s.color} cx="100" cy="100" r="70" fill="none" strokeWidth="28" strokeDasharray={`${s.length} ${CIRC - s.length}`} strokeDashoffset={-s.offset} transform="rotate(-90 100 100)" />)}
                <text x="100" y="99" textAnchor="middle" className="donut-total">{format(total)}</text>
                <text x="100" y="120" textAnchor="middle" className="donut-caption">προφίλ</text>
              </svg>
              <ul className="legend">{segments.map((s) => <li key={s.label}><span className={`dot ${s.color}`} aria-hidden="true" /><strong>{format(s.n)}</strong> {s.label}</li>)}</ul>
            </div>
            <p className="note chart-foot">Η πληρότητα αφορά τα διαθέσιμα στοιχεία του προφίλ. Δεν αποτελεί αξιολόγηση πολιτικών θέσεων.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function PartyMark({ party }) {
  const [imageIndex, setImageIndex] = useState(0)
  const images = [...new Set([partyImageUrl(party), partyImageUrl({ ...party, image_path: '' })])].filter(Boolean)
  return images[imageIndex] ? <img src={images[imageIndex]} alt="" loading="lazy" onError={() => setImageIndex((i) => i + 1)} /> : <span className="coverage-initial" aria-hidden="true">{party.name.slice(0, 1)}</span>
}

function CoverageMatrix({ data: d }) {
  const [parties] = useState(() => shuffle(d.parties))
  const topics = d.topics
  const rotation = useCoverageRotation(parties.length)
  const rows = parties.length > VISIBLE_PARTIES ? [...parties, ...parties.slice(0, VISIBLE_PARTIES)] : parties
  return (
    <section className="wrap landscape-section" aria-labelledby="coverage-title">
      <div className="coverage-panel">
        <p className="eyebrow">Θεματική κάλυψη</p>
        <h2 id="coverage-title" className="section-title">Ποιος έχει πρόταση για τι;</h2>
        <p className="note">Δες σε ποια θέματα έχει δημοσιευμένη πρόταση κάθε κόμμα ή ομάδα. Πάτησε το ✓ για να τη διαβάσεις.</p>
        <div className="coverage-rotation-bar">
          <p className="note">{format(parties.length)} προφίλ · έως {VISIBLE_PARTIES} ορατά κάθε φορά · τυχαία αρχική σειρά</p>
          {parties.length > VISIBLE_PARTIES && topics.length > 0 && <button type="button" className="btn ghost" onClick={rotation.toggle}>{rotation.paused ? 'Συνέχεια κύλισης' : 'Παύση κύλισης'}</button>}
        </div>
        {parties.length && topics.length ? (
          <>
            <p className="note coverage-scroll-hint">Σύρετε οριζόντια για τα θέματα και κατακόρυφα για τα υπόλοιπα προφίλ.</p>
            <div className="coverage-scroll coverage-rotating" style={{ '--coverage-visible-rows': Math.min(VISIBLE_PARTIES, parties.length), '--coverage-topic-count': topics.length }} ref={rotation.ref} {...rotation.interactions} tabIndex={0} role="region" aria-label="Θεματική κάλυψη όλων των κομμάτων και ομάδων, με έξι ορατές γραμμές και κύλιση">
              <table className="coverage-table">
                <caption className="sr-only">Δημοσιευμένες προτάσεις ανά κόμμα και θέμα. Το σημάδι ελέγχου ανοίγει την πρόταση.</caption>
                <colgroup><col className="coverage-name-col" />{topics.map((t) => <col key={t.id} />)}</colgroup>
                <thead><tr><th scope="col">Κόμμα / Ομάδα</th>{topics.map((t) => <th scope="col" key={t.id}><Link to={`/themata/${t.slug}`}>{t.name}</Link></th>)}</tr></thead>
                <tbody>{rows.map((p, i) => {
                  const duplicate = i >= parties.length
                  const tabIndex = duplicate ? -1 : undefined
                  return <tr key={`${duplicate ? 'repeat' : 'party'}-${p.id}`} aria-hidden={duplicate || undefined}>
                    <th scope="row"><Link className="coverage-party" to={`/kommata/${p.slug}`} tabIndex={tabIndex} title={p.name}>
                      <PartyMark party={p} />
                      <span><span className="coverage-name">{p.name}</span>{p.kind === 'group' && <small>Ομάδα υπό σύσταση</small>}</span>
                    </Link></th>
                    {topics.map((t) => {
                      const proposal = d.coverage.get(`${p.id}:${t.id}`)
                      return <td key={t.id}>{proposal ? <Link className="coverage-proposal" to={`/protasi/${proposal.id}`} tabIndex={tabIndex} title={proposal.title} aria-label={`${p.name} — ${t.name}: ${proposal.title}. Άνοιγμα δημοσιευμένης πρότασης`}><span className="coverage-check" aria-hidden="true">✓</span></Link> : <span className="coverage-none" aria-label={`${p.name} — ${t.name}: Δεν έχει καταγραφεί δημοσιευμένη πρόταση`}>—</span>}</td>
                    })}
                  </tr>
                })}</tbody>
              </table>
            </div>
          </>
        ) : <p className="coverage-empty">{d.parties.length ? 'Δεν έχουν καταχωριστεί ακόμη θεματικές ενότητες.' : 'Δεν υπάρχουν ακόμη δημοσιευμένα προφίλ για εμφάνιση.'}</p>}
        <div className="coverage-bottom">
          <div>
            <ul className="coverage-legend"><li><span className="coverage-check" aria-hidden="true">✓</span> Δημοσιευμένη πρόταση</li><li><span className="coverage-none" aria-hidden="true">—</span> Δεν έχει καταγραφεί</li></ul>
            <p className="note">Η απουσία καταχώρισης δεν σημαίνει ότι το κόμμα δεν έχει θέση.</p>
          </div>
          {parties.length > VISIBLE_PARTIES && <p className="note">Η αυτόματη κύλιση σταματά όσο διαβάζετε ή χειρίζεστε τον πίνακα.</p>}
        </div>
      </div>
    </section>
  )
}

const GUIDE_FIELDS = [
  ['Πρόβλημα', 'Ποια ανάγκη αντιμετωπίζει η πρόταση και ποιους αφορά;', 'recorded'],
  ['Περιγραφή μέτρου', 'Τι προτείνεται να αλλάξει και πώς θα εφαρμοστεί;', 'recorded'],
  ['Νομικό πλαίσιο', 'Ποιες αλλαγές σε νόμους ή θεσμούς απαιτούνται;', 'partial'],
  ['Κόστος και χρηματοδότηση', 'Πόσο κοστίζει και από πού θα βρεθούν οι πόροι;', 'missing'],
  ['Επιπτώσεις και αντισταθμίσματα', 'Ποιοι επηρεάζονται και ποιοι κίνδυνοι ή συμβιβασμοί υπάρχουν;', 'partial'],
  ['Χρονοδιάγραμμα', 'Πότε ξεκινά και σε ποια στάδια θα υλοποιηθεί;', 'partial'],
  ['Μέτρο επιτυχίας', 'Με ποια στοιχεία θα αξιολογηθεί το αποτέλεσμα;', 'missing'],
  ['Πηγή', 'Πού μπορείς να διαβάσεις την τεκμηρίωση της πρότασης;', 'recorded'],
]
const GUIDE_STATES = [
  ['recorded', 'Υπάρχει στοιχείο', 'Το κείμενο δίνει σχετική πληροφορία.'],
  ['partial', 'Μερική αναφορά', 'Υπάρχει αναφορά, με ελλείψεις ή ασάφειες.'],
  ['missing', 'Δεν προσδιορίζεται', 'Το στοιχείο δεν αναφέρεται ή δηλώνεται ότι λείπει.'],
]

function EvidenceMark({ status }) {
  return <span className={`evidence-mark ${status}`} aria-hidden="true">{status === 'recorded' ? '✓' : ''}</span>
}

function ProposalGuide() {
  return (
    <section className="wrap landscape-section proposal-preview" aria-labelledby="proposal-preview-title">
      <h2 id="proposal-preview-title" className="section-title">Τι περιλαμβάνει μια πρόταση;</h2>
      <p className="note">Δες πώς παρουσιάζονται οι προτάσεις, ποια στοιχεία αναζητούμε και τι σημαίνουν οι ενδείξεις τους.</p>
      <article className="proposal-preview-card">
        <p className="proposal-preview-meta"><span className="pill">Ενδεικτικό παράδειγμα</span><span className="pill">Υγεία</span></p>
        <h3>Ενίσχυση της πρωτοβάθμιας φροντίδας</h3>
        <p className="note proposal-preview-excerpt">Περισσότερες τοπικές μονάδες υγείας και πρόσβαση σε οικογενειακό γιατρό.</p>
        <p className="note evidence-example-note">Υποθετική πρόταση για να γνωρίσεις το κοινό πρότυπο παρουσίασης. Οι παρακάτω ενδείξεις είναι ενδεικτικές.</p>
        <ul className="proposal-evidence evidence-guide-grid">{GUIDE_FIELDS.map(([label, question, status]) => (
          <li key={label}><EvidenceMark status={status} /><div>
            <strong>{label}</strong>
            <span>{GUIDE_STATES.find(([key]) => key === status)[1]}</span>
            <p className="evidence-question">{question}</p>
          </div></li>
        ))}</ul>
        <h4 className="evidence-legend-title">Τι σημαίνουν τα σύμβολα;</h4>
        <ul className="evidence-guide-legend">{GUIDE_STATES.map(([status, label, description]) => (
          <li key={status}><EvidenceMark status={status} /><div><strong>{label}</strong><p>{description}</p></div></li>
        ))}</ul>
        <p className="note evidence-explainer">Οι ενδείξεις αφορούν την πληρότητα της καταχώρισης. Η ακρίβεια και η εφικτότητα μιας πρότασης απαιτούν ξεχωριστό έλεγχο.</p>
        <div className="proposal-preview-bottom"><Link className="btn ghost" to="/themata">Δες τις δημοσιευμένες προτάσεις →</Link></div>
      </article>
      <p className="landscape-motto">Ίδια στοιχεία. Κοινό πρότυπο. Δική σου κρίση.</p>
    </section>
  )
}

export default function HomeLandscape({ data }) {
  return <><LandscapeStats data={data} /><CoverageMatrix data={data} /><ProposalGuide /></>
}
