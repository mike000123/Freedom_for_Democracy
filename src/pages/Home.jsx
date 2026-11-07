import { Link } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useData, useTitle, bar } from '../util'
import { Loading } from '../components'

const CIRC = 2 * Math.PI * 70

export default function Home() {
  useTitle('')
  const s = useData(async () => {
    const week = new Date(Date.now() - 7 * 864e5).toISOString()
    const [parties, props, qs, answered, topics] = await Promise.all([
      q(sb.from('parties').select('id,kind,tier').eq('is_published', true)),
      q(sb.from('proposals').select('topic_id,party:parties!inner(is_published)').eq('is_published', true).eq('party.is_published', true)),
      q(sb.from('questions').select('id,created_at').eq('removed', false)),
      q(sb.from('comments').select('question_id').not('official_party_id', 'is', null).not('question_id', 'is', null)),
      q(sb.from('topics').select('id,name,slug').order('order')),
    ])
    const nFull = parties.filter((p) => p.kind === 'party' && p.tier === 'full').length
    const nProg = parties.filter((p) => p.kind === 'party' && p.tier !== 'full').length
    const nGroups = parties.filter((p) => p.kind === 'group').length
    const perTopic = topics.map((t) => ({ ...t, n: props.filter((p) => p.topic_id === t.id).length }))
    const answeredIds = new Set(answered.map((a) => a.question_id))
    const nAnswered = qs.filter((x) => answeredIds.has(x.id)).length
    return {
      nParties: nFull + nProg, nGroups, nProposals: props.length, nQuestions: qs.length,
      nFull, nProg, topics, perTopic: perTopic.filter((t) => t.n > 0),
      maxTopic: Math.max(1, ...perTopic.map((t) => t.n)),
      nAnswered, answerPct: qs.length ? Math.round((nAnswered / qs.length) * 100) : 0,
      nNew: qs.filter((x) => x.created_at > week).length,
    }
  }, [])
  if (!s.data) return <Loading state={s} />
  const d = s.data
  const total = d.nFull + d.nProg + d.nGroups
  let acc = 0
  const donut = [
    ['Πλήρες προφίλ', d.nFull, 'seg-navy'],
    ['Προφίλ σε εξέλιξη', d.nProg, 'seg-red'],
    ['Ομάδες υπό σύσταση', d.nGroups, 'seg-pale'],
  ].map(([label, value, css]) => {
    const len = total ? (value / total) * CIRC : 0
    const seg = { label, value, css, dash: len, gap: CIRC - len, offset: -acc }
    acc += len
    return seg
  })

  return (
    <>
      <section className="wrap hero2">
        <div>
          <p className="eyebrow">Ανεξάρτητος χώρος πολιτικού διαλόγου</p>
          <h1 className="display">Νέες ιδέες.<br />Ίση ευκαιρία.<br /><span className="red">Ανοιχτός διάλογος.</span></h1>
          <p>
            <Link className="btn big" to="/kommata">Δες κόμματα και ομάδες</Link>{' '}
            <Link className="btn ghost big" to="/themata">Μπες στον διάλογο</Link>
          </p>
        </div>
        <aside className="glance">
          <p className="eyebrow-s">Τι αλλάζει για σένα</p>
          <ol>
            <li><span className="num">01</span><div><strong>Συγκρίνεις ουσία, όχι συνθήματα</strong><span>Κάθε πρόταση λέει ποιο πρόβλημα λύνει, πόσο κοστίζει και ποιος χάνει.</span></div></li>
            <li><span className="num">02</span><div><strong>Νέες φωνές με ίση ευκαιρία</strong><span>Δίκαιη εναλλαγή: δεν μετράνε χρήματα, κλικ ή δημοτικότητα.</span></div></li>
            <li><span className="num">03</span><div><strong>Ρωτάς. Παίρνεις δημόσια απάντηση.</strong><span>Όλα ανοιχτά και καταγεγραμμένα: ποιος είπε τι και τι άλλαξε.</span></div></li>
          </ol>
        </aside>
      </section>

      <section className="wrap mission">
        <p className="eyebrow">Γιατί υπάρχει η πλατφόρμα</p>
        <p className="mission-lead">Οι μεγάλες φωνές έχουν ήδη βήμα. Οι νέες όχι.</p>
        <div className="mission-cols">
          <p>Εδώ κάθε νέο κόμμα και κάθε ομάδα εμφανίζεται με ίση ευκαιρία και παρουσιάζει συγκεκριμένες προτάσεις, όχι συνθήματα. Εσύ διαβάζεις, ρωτάς και παίρνεις δημόσια απάντηση. Χωρίς διαφημίσεις, χωρίς κομματική προτίμηση.</p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <p className="eyebrow">Στατιστικά πλατφόρμας</p>
          <div className="band-head"><h2>Τι συμβαίνει σήμερα</h2><span className="note">Δεν υπάρχει κατάταξη κομμάτων.</span></div>
          <div className="stats">
            <div className="stat"><strong>{d.nParties}</strong><span>πολιτικές παρουσίες</span></div>
            <div className="stat"><strong>{d.nGroups}</strong><span>ομάδες υπό σύσταση</span></div>
            <div className="stat"><strong>{d.nProposals}</strong><span>δημοσιευμένες προτάσεις</span></div>
            <div className="stat"><strong className="red">{d.nQuestions}</strong><span>ερωτήματα πολιτών</span></div>
          </div>
          <div className="charts">
            <div className="chart">
              <h3>Παρουσίες ανά κατάσταση</h3>
              <div className="donut-wrap">
                <svg viewBox="0 0 200 200" role="img" aria-label="Κατανομή παρουσιών ανά κατάσταση προφίλ">
                  <circle className="donut-bg" cx="100" cy="100" r="70" fill="none" strokeWidth="28" />
                  {donut.filter((x) => x.value).map((x) => (
                    <circle key={x.label} className={x.css} cx="100" cy="100" r="70" fill="none" strokeWidth="28"
                      strokeDasharray={`${x.dash} ${x.gap}`} strokeDashoffset={x.offset} transform="rotate(-90 100 100)" />
                  ))}
                  <text x="100" y="108" textAnchor="middle" className="donut-total">{total}</text>
                </svg>
              </div>
              <ul className="legend">
                {donut.map((x) => <li key={x.label}><span className={`dot ${x.css}`}></span>{x.label} · {x.value}</li>)}
              </ul>
            </div>
            <div className="chart">
              <h3>Προτάσεις ανά θέμα</h3>
              {d.perTopic.length ? d.perTopic.map((t) => (
                <div key={t.id}>
                  <div className="bar-line"><span><Link to={`/themata/${t.slug}`}>{t.name}</Link></span><strong>{t.n}</strong></div>
                  <div className="bar-track"><span className={`bar-fill w${bar(t.n, d.maxTopic)}`}></span></div>
                </div>
              )) : <p className="note">Δεν υπάρχουν ακόμη προτάσεις.</p>}
            </div>
            <div className="chart">
              <h3>Ερωτήματα με επίσημη απάντηση</h3>
              <p className="meter-big red">{d.answerPct}%</p>
              <div className="bar-track"><span className={`bar-fill red w${bar(d.answerPct, 100)}`}></span></div>
              <p className="note">{d.nAnswered} από {d.nQuestions} ερωτήματα έχουν δημόσια απάντηση από κόμμα ή ομάδα.</p>
              <p className="note chart-foot">Νέα ερωτήματα αυτή την εβδομάδα: {d.nNew}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap pad">
        <div className="cta">
          <div>
            <h2>Ποιοι είναι οι νέοι παίκτες;</h2>
            <p>Η σειρά αλλάζει σε κάθε επίσκεψη με δίκαιη εναλλαγή. Φιλτράρισε ανά θέμα, κατάσταση και τύπο.</p>
          </div>
          <Link className="btn light" to="/kommata">Δες κόμματα και ομάδες →</Link>
        </div>
        <p className="eyebrow">Προτάσεις ανά θέμα</p>
        <h2 className="section-title">Ένα ζήτημα. Πολλές οπτικές.</h2>
        <ul className="chips">{d.topics.map((t) => <li key={t.id}><Link to={`/themata/${t.slug}`}>{t.name}</Link></li>)}</ul>
      </section>
    </>
  )
}
