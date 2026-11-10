import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useData, useTitle, shuffle } from '../util'
import { Loading, PartyCard, Carousel } from '../components'
import PartyProfile from '../components/PartyProfile'
import { useAuth } from '../auth'
import { useIsAdmin } from './Admin'

const countBy = (rows) => rows.reduce((m, r) => ((m[r.party_id] = (m[r.party_id] || 0) + 1), m), {})

export function Catalog() {
  useTitle('Κόμματα και ομάδες')
  const [params, setParams] = useSearchParams()
  const [nonce, setNonce] = useState(0)
  const qtext = params.get('q') || ''
  const kind = params.get('kind') || 'all'
  const topic = params.get('topic') || ''
  const tier = params.get('tier') || ''
  const all = params.get('all') === '1'
  const nav = useNavigate()
  const [sel, setSel] = useState([])
  const toggleSel = (slug) => setSel((a) => (a.includes(slug) ? a.filter((x) => x !== slug) : a.length >= 9 ? a : [...a, slug]))
  const card = (p, d) => <PartyCard key={p.id} party={p} n={d.counts[p.id]} pick={{ checked: sel.includes(p.slug), onChange: () => toggleSel(p.slug) }} />
  const { isAdmin } = useIsAdmin()
  const appFlag = useData(async () => (await sb.from('feature_flags').select('state').eq('key', 'applications').maybeSingle()).data?.state, [])
  const canApply = appFlag.data === 'on' || (appFlag.data === 'test' && isAdmin)
  const filtered = !!(qtext || kind !== 'all' || topic || tier)

  const s = useData(async () => {
    const [topics, props] = await Promise.all([
      q(sb.from('topics').select('id,name,slug').order('order')),
      q(sb.from('proposals').select('party_id,topic_id').eq('is_published', true)),
    ])
    const counts = countBy(props)
    if (filtered) {
      let parties = await q(sb.from('parties').select('*').eq('is_published', true).eq('graduated', false))
      if (kind !== 'all') parties = parties.filter((p) => p.kind === kind)
      if (tier) parties = parties.filter((p) => p.tier === tier)
      if (topic) {
        const t = topics.find((x) => x.slug === topic)
        const ids = new Set(props.filter((p) => p.topic_id === t?.id).map((p) => p.party_id))
        parties = parties.filter((p) => ids.has(p.id))
      }
      if (qtext) {
        const needle = qtext.toLowerCase()
        parties = parties.filter((p) => `${p.name} ${p.slogan}`.toLowerCase().includes(needle))
      }
      return { filtered: true, topics, counts, parties: shuffle(parties) }
    }
    // Ισότιμη εναλλαγή: η επιλογή γίνεται στη βάση (συνάρτηση pick_parties) και καταγράφει εμφανίσεις.
    const [full, progress, groups, all_] = await Promise.all([
      q(sb.rpc('pick_parties', { p_kind: 'party', p_tier: 'full', p_n: 60, p_record: true })),
      q(sb.rpc('pick_parties', { p_kind: 'party', p_tier: 'in_progress', p_n: 60, p_record: true })),
      q(sb.rpc('pick_parties', { p_kind: 'group', p_tier: null, p_n: 60, p_record: true })),
      q(sb.from('parties').select('id').eq('is_published', true).eq('graduated', false).eq('kind', 'party').eq('tier', 'full')),
    ])
    return { filtered: false, topics, counts, full, progress, groups, nFull: all_.length }
  }, [params.toString(), nonce])

  const onSubmit = (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const next = {}
    for (const k of ['q', 'kind', 'topic', 'tier']) if (f.get(k) && f.get(k) !== 'all') next[k] = f.get(k)
    setParams(next)
  }

  const d = s.data
  return (
    <>
      <section className="wrap pad-top">
        <div className="head-row">
          <div>
            <p className="eyebrow">Πολιτικές παρουσίες</p>
            <h1 className="display-s">Κόμματα και ομάδες</h1>
          </div>
          {canApply && <Link className="btn" to="/aitisi">Αίτηση για λογαριασμό κόμματος</Link>}
        </div>
        <p className="lead">Η σειρά αλλάζει σε κάθε επίσκεψη με δίκαιη εναλλαγή. Δεν εκφράζει δημοτικότητα, υποστήριξη ή πληρωμή. <Link to="/diafaneia">Δείτε πώς λειτουργεί.</Link></p>
        <p><Link className="btn ghost" to="/erotimatologio">Ερωτηματολόγιο προτιμήσεων</Link></p>
        <form onSubmit={onSubmit} className="filterbar" key={params.toString()}>
          <div className="f-search"><label htmlFor="q">Αναζήτηση</label><input type="text" name="q" id="q" defaultValue={qtext} maxLength={80} placeholder="Όνομα ή σύνθημα..." /></div>
          <div className="f-kind"><label htmlFor="kind">Τύπος</label>
            <select name="kind" id="kind" defaultValue={kind}>
              <option value="all">Όλα (κόμματα και ομάδες)</option>
              <option value="party">Μόνο κόμματα</option>
              <option value="group">Μόνο ομάδες υπό σύσταση</option>
            </select></div>
          <div><label htmlFor="topic">Θέμα</label>
            <select name="topic" id="topic" defaultValue={topic}>
              <option value="">Όλα</option>
              {d?.topics.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
            </select></div>
          <div><label htmlFor="tier">Κατάσταση προφίλ</label>
            <select name="tier" id="tier" defaultValue={tier}>
              <option value="">Όλα</option><option value="full">Πλήρες προφίλ</option><option value="in_progress">Προφίλ σε εξέλιξη</option>
            </select></div>
          <button type="submit">Φιλτράρισμα</button>
          <button type="button" className="btn ghost" onClick={() => (filtered ? setParams({}) : setNonce(nonce + 1))}>Νέα τυχαία σειρά ↻</button>
        </form>
      </section>

      <section className="wrap">
        <div className="cmpbar">
          <p className="note">Τσεκάρετε έως 9 κόμματα ή ομάδες και δείτε τα δίπλα-δίπλα, σε ενότητες που ανοίγουν και κλείνουν.</p>
          <p>
            <button type="button" disabled={sel.length < 2} onClick={() => nav(`/sygkrisi-kommaton?${new URLSearchParams(sel.map((v) => ['p', v]))}`)}>
              Σύγκριση επιλεγμένων{sel.length > 0 && ` (${sel.length})`}
            </button>{' '}
            {sel.length > 0 && <button type="button" className="btn ghost" onClick={() => setSel([])}>Καθαρισμός</button>}
          </p>
        </div>
      </section>

      {!d ? <Loading state={s} /> : d.filtered !== filtered ? <Loading state={{ loading: true }} /> : d.filtered ? (
        <section className="wrap pad">
          <p className="note">Τα αποτελέσματα εμφανίζονται σε τυχαία σειρά. Αυτή η προβολή δεν καταγράφει εμφανίσεις.</p>
          <div className="grid">
            {d.parties.length ? d.parties.map((p) => card(p, d)) : <p>Κανένα αποτέλεσμα.</p>}
          </div>
        </section>
      ) : (
        <>
          <section className="wrap pad">
            <h2 className="sec">Πλήρη προφίλ <span className="meta">{d.full.length} από {d.nFull} · τυχαία σειρά</span></h2>
            <Carousel label="Πλήρη προφίλ">
              {d.full.length ? d.full.map((p) => card(p, d)) : <p className="note">Δεν υπάρχουν ακόμη κόμματα με πλήρες προφίλ.</p>}
            </Carousel>
            {d.nFull > d.full.length && <p className="center"><button className="btn ghost" onClick={() => setParams({ all: '1' })}>Εμφάνιση περισσότερων</button></p>}
          </section>
          <section className="band">
            <div className="wrap">
              <h2 className="sec">Προφίλ σε εξέλιξη <span className="meta">Ξεχωριστή εναλλαγή</span></h2>
              <p className="note">Συμπληρώνουν ακόμη τα στοιχεία τους. Έχουν το ίδιο βήμα, αλλά σε δική τους σειρά.</p>
              <Carousel label="Προφίλ σε εξέλιξη">
                {d.progress.length ? d.progress.map((p) => card(p, d)) : <p className="note">Κανένα προφίλ σε εξέλιξη.</p>}
              </Carousel>
            </div>
          </section>
          <section className="wrap pad">
            <h2 className="sec">Ομάδες υπό σύσταση <span className="meta">Ξεχωριστή ενότητα · το φίλτρο «Τύπος» τις εμφανίζει μαζί με τα κόμματα</span></h2>
            <p className="note">Ιδέες που παίρνουν μορφή, με τις ίδιες απαιτήσεις ταυτότητας και διαφάνειας.</p>
            <Carousel label="Ομάδες υπό σύσταση">
              {d.groups.length ? d.groups.map((p) => card(p, d)) : <p className="note">Καμία ομάδα υπό σύσταση.</p>}
            </Carousel>
          </section>
        </>
      )}
    </>
  )
}

export function Party() {
  const { slug } = useParams()
  const { session, loading } = useAuth()
  const viewerId = session?.user.id || ''
  const { isAdmin } = useIsAdmin()
  const s = useData(async () => {
    const party = (await q(sb.from('parties').select('*').eq('slug', slug).limit(1)))[0]
    if (!party) throw new Error('Το προφίλ δεν βρέθηκε.')
    const [people, videos, proposals, topics] = await Promise.all([
      q(sb.from('party_people').select('*').eq('party_id', party.id)),
      q(sb.from('party_videos').select('*').eq('party_id', party.id).order('position')),
      q(sb.from('proposals').select('id,title,action,topic_id,is_published,topic:topics(id,name,slug,order)').eq('party_id', party.id).eq('is_published', true)),
      q(sb.from('topics').select('id,name,slug,order').order('order')),
    ])
    return { party, people, videos, proposals, topics, viewerId, requestedSlug: slug }
  }, [slug, viewerId])
  useTitle(s.data?.party.name)
  // A different profile or account must not briefly display the previous data.
  if (loading || (s.data && (s.data.requestedSlug !== slug || s.data.viewerId !== viewerId))) return <Loading state={{ loading: true }} />
  if (!s.data) return <Loading state={s} />
  return <PartyProfile key={`${s.data.party.id}:${viewerId}`} {...s.data} isAdmin={isAdmin} />
}
