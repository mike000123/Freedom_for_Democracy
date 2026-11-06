import { Link, useSearchParams } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useData, useTitle, shuffle, truncWords, KIND } from '../util'
import { Loading } from '../components'

const MAX = 12
const FIELDS = [
  ['problem', 'Πρόβλημα'], ['action', 'Πρόταση'], ['legal', 'Νομικό πλαίσιο'], ['cost', 'Κόστος και χρηματοδότηση'],
  ['tradeoffs', 'Αντισταθμίσματα'], ['timeline', 'Χρονοδιάγραμμα'], ['metric', 'Μέτρο επιτυχίας'],
]

export default function Compare() {
  useTitle('Σύγκριση θέσεων')
  const [params, setParams] = useSearchParams()
  const topicSlug = params.get('topic') || ''
  const all = params.get('all') === '1'
  const selP = params.getAll('p')
  const selC = params.getAll('c')

  const s = useData(async () => {
    const [topics, parties, flags] = await Promise.all([
      q(sb.from('topics').select('id,name,slug').order('order')),
      q(sb.from('parties').select('id,name,slug,kind,is_example').eq('is_published', true).order('name')),
      q(sb.from('feature_flags').select('key,state')),
    ])
    const on = (k) => flags.find((f) => f.key === k)?.state === 'on'
    const topic = topics.find((t) => t.slug === topicSlug)
    let cit = [], columns = [], error = ''
    if (topic) {
      if (on('citizen_proposals')) {
        cit = await q(sb.from('citizen_proposals').select('*').eq('topic_id', topic.id).eq('removed', false))
      }
      const props = await q(sb.from('proposals').select('*').eq('topic_id', topic.id).eq('is_published', true))
      const authorIds = [...new Set(cit.map((c) => c.author_id))]
      const authors = authorIds.length ? await q(sb.from('citizens_public').select('user_id,display_name,kind,is_example').in('user_id', authorIds)) : []
      const aBy = Object.fromEntries(authors.map((a) => [a.user_id, a]))
      cit = cit.map((c) => ({ ...c, author: aBy[c.author_id] }))
      const chosenParties = all ? parties.filter((p) => props.some((x) => x.party_id === p.id)) : parties.filter((p) => selP.includes(p.slug))
      const chosenCit = all ? cit : cit.filter((c) => selC.includes(c.id))
      let cols = [
        ...chosenParties.map((p) => ({ kind: 'party', name: p.name, url: `/kommata/${p.slug}`, badge: KIND[p.kind], example: p.is_example, proposal: props.find((x) => x.party_id === p.id), link: (x) => `/protasi/${x.id}` })),
        ...chosenCit.map((c) => ({ kind: 'citizen', name: c.author?.display_name, url: `/protasi-politi/${c.id}`, badge: c.author?.kind === 'org' ? 'Οργανισμός' : 'Πολίτης', example: c.author?.is_example, proposal: c })),
      ]
      if (cols.length && cols.length < 2) error = 'Επιλέξτε τουλάχιστον δύο προτάσεις.'
      else if (cols.length) columns = shuffle(cols).slice(0, MAX)
      else if (params.toString().includes('p=') || all) error = 'Δεν βρέθηκαν προτάσεις για σύγκριση.'
    }
    return { topics, parties, topic, cit, columns, error, enabled: on('comparison') }
  }, [params.toString()])

  const onSubmit = (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const next = new URLSearchParams()
    if (f.get('topic')) next.set('topic', f.get('topic'))
    f.getAll('p').forEach((v) => next.append('p', v))
    f.getAll('c').forEach((v) => next.append('c', v))
    if (e.nativeEvent.submitter?.name === 'all') next.set('all', '1')
    setParams(next)
  }

  const d = s.data
  if (d && !d.enabled) return <div className="wrap pad"><h1>Σύγκριση θέσεων</h1><p className="note">Η λειτουργία δεν είναι ενεργή αυτή τη στιγμή.</p></div>
  return (
    <div className="wrap pad">
      <h1>Σύγκριση θέσεων</h1>
      <p className="lead">Επιλέξτε ένα θέμα και δύο ή περισσότερες προτάσεις, από κόμματα, ομάδες ή πολίτες (έως {MAX}). Δεν υπάρχει βαθμολογία ή κατάταξη. Οι στήλες εμφανίζονται σε τυχαία σειρά.</p>
      {!d ? <Loading state={s} /> : (
        <>
          <form onSubmit={onSubmit} className="filters" key={params.toString()}>
            <div>
              <label htmlFor="topic">Θέμα</label>
              <select name="topic" id="topic" defaultValue={topicSlug}>
                <option value="">Επιλέξτε θέμα</option>
                {d.topics.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="p">Κόμματα και ομάδες (κρατήστε Ctrl για πολλαπλή επιλογή)</label>
              <select name="p" id="p" multiple size={6} defaultValue={selP}>
                {d.parties.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
            {d.cit.length > 0 ? (
              <div>
                <label htmlFor="c">Προτάσεις πολιτών στο θέμα (κρατήστε Ctrl για πολλαπλή επιλογή)</label>
                <select name="c" id="c" multiple size={6} defaultValue={selC}>
                  {d.cit.map((c) => <option key={c.id} value={c.id}>{c.author?.display_name}: {truncWords(c.title, 10)}</option>)}
                </select>
              </div>
            ) : d.topic && <p className="note">Δεν υπάρχουν προτάσεις πολιτών σε αυτό το θέμα.</p>}
            <button type="submit">Σύγκριση επιλεγμένων</button>{' '}
            <button type="submit" name="all" value="1" className="btn ghost">Σύγκριση όλων στο θέμα</button>
          </form>
          {d.error && <p className="errorlist">{d.error}</p>}
          {d.columns.length > 0 && (
            <>
              <h2>{d.topic.name}</h2>
              <div className="table-scroll">
                <table className="cmp">
                  <thead>
                    <tr>
                      <th></th>
                      {d.columns.map((c, i) => (
                        <th key={i}>
                          <Link to={c.url}>{c.name}</Link><br /><span className="note">{c.badge}</span>
                          {c.example && <> <span className="pill pill-example">Παράδειγμα</span></>}
                          {c.proposal && (c.kind === 'party'
                            ? <><br /><Link className="note" to={c.link(c.proposal)}>{c.proposal.title}</Link></>
                            : <><br /><span className="note">{c.proposal.title}</span></>)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FIELDS.map(([k, label]) => (
                      <tr key={k}>
                        <th>{label}</th>
                        {d.columns.map((c, i) => (
                          <td key={i}>{c.proposal ? c.proposal[k] : <span className="note">Δεν έχει δηλωθεί θέση</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
