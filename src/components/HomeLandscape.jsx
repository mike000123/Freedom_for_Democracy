import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sb, q, partyImageUrl } from '../supabase'
import { useData, shuffle, truncWords } from '../util'
import { evidenceStatus, sourceUrl } from '../homeData'
import { Loading } from '../components'

const format = (n) => n.toLocaleString('el-GR')
const CIRC = 2 * Math.PI * 70
const MAX_PARTIES = 9

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

function SelectionFilter({ label, options, selected, onChange, max }) {
  const ref = useRef(null)
  useEffect(() => {
    const closeOutside = (event) => { if (ref.current && !ref.current.contains(event.target)) ref.current.open = false }
    const escape = (event) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.open = false
        ref.current.querySelector('summary').focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  return (
    <details className="coverage-filter" ref={ref}>
      <summary>{label} <span>({selected.length})</span></summary>
      <div className="coverage-options">
        <fieldset>
          <legend className="sr-only">{label}</legend>
          {options.map((option) => <label key={option.id}>
            <input type="checkbox" checked={selected.includes(option.id)} disabled={!!max && selected.length >= max && !selected.includes(option.id)} onChange={(e) => onChange(e.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} />
            <span>{option.name}</span>
          </label>)}
        </fieldset>
        {!options.length && <p className="note">Δεν υπάρχουν διαθέσιμες επιλογές.</p>}
        {max && <p className="note">Έως {max} κόμματα ή ομάδες.</p>}
        <div className="coverage-option-actions">
          {!max && <button type="button" className="link" onClick={() => onChange(options.map((o) => o.id))}>Όλα</button>}
          <button type="button" className="link" onClick={() => onChange([])}>Καθαρισμός</button>
        </div>
      </div>
    </details>
  )
}

function PartyMark({ party }) {
  const [imageIndex, setImageIndex] = useState(0)
  const images = [...new Set([partyImageUrl(party), partyImageUrl({ ...party, image_path: '' })])].filter(Boolean)
  return images[imageIndex] ? <img src={images[imageIndex]} alt="" loading="lazy" onError={() => setImageIndex((i) => i + 1)} /> : <span className="coverage-initial" aria-hidden="true">{party.name.slice(0, 1)}</span>
}

function CoverageMatrix({ data: d }) {
  const [partyOrder, setPartyOrder] = useState(() => shuffle(d.parties).map((p) => p.id))
  const [partyIds, setPartyIds] = useState(() => partyOrder.slice(0, 6))
  const [topicIds, setTopicIds] = useState(() => d.topics.slice(0, 6).map((t) => t.id))
  const parties = partyOrder.filter((id) => partyIds.includes(id)).map((id) => d.parties.find((p) => p.id === id))
  const topics = d.topics.filter((t) => topicIds.includes(t.id))
  const reshuffle = () => {
    const ids = shuffle(d.parties).map((p) => p.id)
    setPartyOrder(ids); setPartyIds(ids.slice(0, 6))
  }
  const comparison = `/sygkrisi-kommaton?${new URLSearchParams(parties.map((p) => ['p', p.slug]))}`
  return (
    <section className="wrap landscape-section" aria-labelledby="coverage-title">
      <div className="coverage-panel">
        <p className="eyebrow">Θεματική κάλυψη</p>
        <h2 id="coverage-title" className="section-title">Ποιος έχει πρόταση για τι;</h2>
        <p className="note">Δες σε ποια θέματα έχει δημοσιευμένη πρόταση κάθε κόμμα ή ομάδα. Πάτησε το ✓ για να τη διαβάσεις.</p>
        <div className="coverage-filters">
          <SelectionFilter label="Επιλογή κομμάτων" options={[...d.parties].sort((a, b) => a.name.localeCompare(b.name, 'el'))} selected={partyIds} onChange={setPartyIds} max={MAX_PARTIES} />
          <SelectionFilter label="Επιλογή θεμάτων" options={d.topics} selected={topicIds} onChange={setTopicIds} />
          {d.parties.length > 6 && <button type="button" className="link" onClick={reshuffle}>Νέα τυχαία επιλογή ↻</button>}
        </div>
        <p className="note coverage-count" role="status">{parties.length} από {d.parties.length} προφίλ · {topics.length} από {d.topics.length} θέματα · τυχαία σειρά προφίλ</p>
        {parties.length && topics.length ? (
          <>
            <p className="note coverage-scroll-hint">Σύρετε οριζόντια για να δείτε όλα τα θέματα.</p>
            <div className="coverage-scroll" tabIndex={0} role="region" aria-label="Πίνακας θεματικής κάλυψης με οριζόντια κύλιση">
              <table className="coverage-table">
                <caption className="sr-only">Δημοσιευμένες προτάσεις ανά κόμμα και θέμα. Το σημάδι ελέγχου ανοίγει την πρόταση.</caption>
                <thead><tr><th scope="col">Κόμμα / Ομάδα</th>{topics.map((t) => <th scope="col" key={t.id}><Link to={`/themata/${t.slug}`}>{t.name}</Link></th>)}</tr></thead>
                <tbody>{parties.map((p) => <tr key={p.id}>
                    <th scope="row"><Link className="coverage-party" to={`/kommata/${p.slug}`}>
                      <PartyMark party={p} />
                      <span>{p.name}{p.kind === 'group' && <small>Ομάδα υπό σύσταση</small>}</span>
                    </Link></th>
                    {topics.map((t) => {
                      const proposal = d.coverage.get(`${p.id}:${t.id}`)
                      return <td key={t.id}>{proposal ? <Link className="coverage-proposal" to={`/protasi/${proposal.id}`} title={proposal.title} aria-label={`${p.name} — ${t.name}: ${proposal.title}. Άνοιγμα δημοσιευμένης πρότασης`}><span className="coverage-check" aria-hidden="true">✓</span></Link> : <span className="coverage-none" aria-label={`${p.name} — ${t.name}: Δεν έχει καταγραφεί δημοσιευμένη πρόταση`}>—</span>}</td>
                    })}
                  </tr>
                )}</tbody>
              </table>
            </div>
          </>
        ) : <p className="coverage-empty">{d.parties.length ? 'Επιλέξτε τουλάχιστον ένα προφίλ και ένα θέμα για να εμφανιστεί ο πίνακας.' : 'Δεν υπάρχουν ακόμη δημοσιευμένα προφίλ για εμφάνιση.'}</p>}
        <div className="coverage-bottom">
          <div>
            <ul className="coverage-legend"><li><span className="coverage-check" aria-hidden="true">✓</span> Δημοσιευμένη πρόταση</li><li><span className="coverage-none" aria-hidden="true">—</span> Δεν έχει καταγραφεί</li></ul>
            <p className="note">Η απουσία καταχώρισης δεν σημαίνει ότι το κόμμα δεν έχει θέση.</p>
          </div>
          {parties.length >= 2 ? <Link className="coverage-compare" to={comparison}>Άνοιγμα αναλυτικής σύγκρισης →</Link> : <span className="note">Επιλέξτε τουλάχιστον δύο προφίλ για σύγκριση.</span>}
        </div>
      </div>
    </section>
  )
}

function EvidenceGrid({ proposal }) {
  const items = [
    ['action', 'Περιγραφή μέτρου'], ['source', 'Πηγή'], ['legal', 'Νομικό πλαίσιο'],
    ['cost', 'Κόστος και χρηματοδότηση'], ['timeline', 'Χρονοδιάγραμμα'], ['metric', 'Μέτρο επιτυχίας'],
  ]
  return <ul className="proposal-evidence">{items.map(([key, label]) => {
    const status = key === 'source' ? (sourceUrl(proposal.source) ? 'recorded' : 'missing') : evidenceStatus(proposal[key])
    const text = status === 'missing' ? 'Δεν προσδιορίζεται' : status === 'partial' ? 'Μερική αναφορά' : key === 'action' ? 'Περιγράφεται' : key === 'source' ? 'Σύνδεσμος διαθέσιμος' : 'Υπάρχει αναφορά'
    return <li key={key} title={proposal[key] || text}><span className={`evidence-mark ${status}`} aria-hidden="true">{status === 'recorded' ? '✓' : status === 'partial' ? '◐' : ''}</span><div><strong>{label}</strong><span>{text}</span></div></li>
  })}</ul>
}

function FeaturedProposal({ data: d }) {
  // Give each participating profile an equal chance before choosing one of its proposals.
  const [chosen] = useState(() => {
    const ids = new Set(d.proposals.map((p) => p.party_id))
    const party = shuffle(d.parties.filter((p) => ids.has(p.id)))[0]
    return party ? { party, proposal: shuffle(d.proposals.filter((p) => p.party_id === party.id))[0] } : null
  })
  const s = useData(async () => {
    if (!chosen) return null
    return (await q(sb.from('proposals').select('id,title,action,legal,cost,timeline,metric,source,party:parties!inner(is_published,is_example,graduated)')
      .eq('id', chosen.proposal.id).eq('is_published', true).eq('party.is_published', true).eq('party.is_example', false).eq('party.graduated', false).limit(1)))[0] || null
  }, [chosen?.proposal.id])
  const topic = chosen && d.topics.find((t) => t.id === chosen.proposal.topic_id)
  return (
    <section className="wrap landscape-section proposal-preview" aria-labelledby="proposal-preview-title">
      <h2 id="proposal-preview-title" className="section-title">Τι περιλαμβάνει μια πρόταση;</h2>
      <p className="note">Τα διαθέσιμα στοιχεία φαίνονται πριν ανοίξεις ολόκληρο το κείμενο. Η πρόταση εμφανίζεται σε τυχαία εναλλαγή.</p>
      {s.loading || s.error ? <Loading state={s} /> : s.data ? <article className="proposal-preview-card">
        <p className="proposal-preview-meta"><Link className="pill" to={`/themata/${topic.slug}`}>{topic.name}</Link><Link to={`/kommata/${chosen.party.slug}`}>{chosen.party.name}</Link></p>
        <h3><Link to={`/protasi/${s.data.id}`}>{s.data.title}</Link></h3>
        <p className="note proposal-preview-excerpt">{truncWords(s.data.action, 36)}</p>
        <EvidenceGrid proposal={s.data} />
        <p className="note evidence-explainer">Οι ενδείξεις αφορούν τις αναφορές του κειμένου. Δεν αποτελούν έλεγχο ακρίβειας, κοστολόγησης ή εφικτότητας. «Μερική αναφορά» σημαίνει ότι το κείμενο δηλώνει και ελλείψεις.</p>
        <div className="proposal-preview-bottom">
          <p className="note">{chosen.party.profile_source === 'party_verified' ? <span className="pill">Επιβεβαιωμένο από το κόμμα</span> : <><span className="pill">Από δημόσιες πηγές</span><span>Δεν έχει επιβεβαιωθεί από το κόμμα</span></>}</p>
          <Link className="btn ghost" to={`/protasi/${s.data.id}`}>Διάβασε την πρόταση →</Link>
        </div>
      </article> : <div className="coverage-empty"><p>Δεν υπάρχουν ακόμη διαθέσιμες δημοσιευμένες προτάσεις για προεπισκόπηση.</p><Link to="/themata">Εξερεύνησε τις θεματικές ενότητες →</Link></div>}
      <p className="landscape-motto">Ίδια στοιχεία. Κοινό πρότυπο. Δική σου κρίση.</p>
    </section>
  )
}

export default function HomeLandscape({ data }) {
  return <><LandscapeStats data={data} /><CoverageMatrix data={data} /><FeaturedProposal data={data} /></>
}
