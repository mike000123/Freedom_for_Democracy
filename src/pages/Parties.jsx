import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { sb, q, partyImageUrl } from '../supabase'
import { useData, useTitle, shuffle, lines, fmtDateTime, KIND, TIER } from '../util'
import { Chat } from './Chat'
import { Loading, PartyCard, Carousel } from '../components'
import SocialIcon from '../icons/SocialIcon'
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
      return { topics, counts, parties: shuffle(parties) }
    }
    // Ισότιμη εναλλαγή: η επιλογή γίνεται στη βάση (συνάρτηση pick_parties) και καταγράφει εμφανίσεις.
    const [full, progress, groups, all_] = await Promise.all([
      q(sb.rpc('pick_parties', { p_kind: 'party', p_tier: 'full', p_n: 60, p_record: true })),
      q(sb.rpc('pick_parties', { p_kind: 'party', p_tier: 'in_progress', p_n: 60, p_record: true })),
      q(sb.rpc('pick_parties', { p_kind: 'group', p_tier: null, p_n: 60, p_record: true })),
      q(sb.from('parties').select('id').eq('is_published', true).eq('graduated', false).eq('kind', 'party').eq('tier', 'full')),
    ])
    return { topics, counts, full, progress, groups, nFull: all_.length }
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

      {!d ? <Loading state={s} /> : filtered ? (
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

const SOCIALS = [
  ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['x_url', 'X (Twitter)'],
  ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn'],
]
const OFFICE = { held: 'Δημόσια θητεία', party: 'Κομματική θητεία' }

export function Party() {
  const { slug } = useParams()
  const [open, setOpen] = useState(null)
  const dlg = useRef(null)
  const { isAdmin } = useIsAdmin()
  const s = useData(async () => {
    const party = (await q(sb.from('parties').select('*').eq('slug', slug).limit(1)))[0]
    if (!party) throw new Error('Το προφίλ δεν βρέθηκε.')
    const [people, videos, proposals, changes] = await Promise.all([
      q(sb.from('party_people').select('*').eq('party_id', party.id)),
      q(sb.from('party_videos').select('*').eq('party_id', party.id).order('position')),
      q(sb.from('proposals').select('id,title,topic:topics(name,slug,order)').eq('party_id', party.id).eq('is_published', true)),
      q(sb.from('change_log').select('*').eq('party_id', party.id).order('at', { ascending: false })),
    ])
    proposals.sort((a, b) => a.topic.order - b.topic.order)
    return { party, people, videos, proposals, changes }
  }, [slug])
  useTitle(s.data?.party.name)
  if (!s.data) return <Loading state={s} />
  const { party, people, videos, proposals, changes } = s.data

  const resp = lines(party.responsible_persons)
  const founders = lines(party.founders)
  const names = [...resp, ...founders.filter((n) => !resp.includes(n))]
  const cards = names.map((name) => ({
    name,
    role: resp.includes(name) && founders.includes(name) ? 'Υπεύθυνο πρόσωπο και ιδρυτής' : resp.includes(name) ? 'Υπεύθυνο πρόσωπο' : 'Ιδρυτής',
    person: people.find((p) => p.name === name),
  }))
  const opened = cards.find((c) => c.name === open)
  const show = (name) => { setOpen(name); setTimeout(() => dlg.current?.showModal(), 0) }
  const img = partyImageUrl(party)
  const label = party.kind === 'group' ? 'η ομάδα' : 'το κόμμα'
  const socials = SOCIALS.filter(([k]) => party[k])

  return (
    <div className="wrap pad">
      <p className="crumb"><Link to="/kommata">Κόμματα και ομάδες</Link> / {party.name}</p>
      <p className="eyebrow">{KIND[party.kind]}</p>
      {img && <div className={`party-img${!party.image_path ? ' party-logo' : ''}`}><img src={img} alt={!party.image_path ? `Λογότυπο ${party.name}` : ''} /></div>}
      <div className="head-row">
        <div className="party-heading">
          <h1>{party.name}</h1>
          {socials.length > 0 && (
            <ul className="social party-social" aria-label="Κοινωνικά δίκτυα">
              {socials.map(([k, name]) => (
                <li key={k}>
                  <a href={party[k]} rel="noopener noreferrer nofollow" target="_blank" aria-label={name} title={name}>
                    <SocialIcon platform={k} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!party.is_published && <Link className="btn" to={isAdmin ? `/to-komma-mou?kommatos=${party.id}` : '/to-komma-mou'} title="Αυτή η σελίδα δεν είναι ορατή σε επισκέπτες">✕ Κλείσιμο προεπισκόπησης</Link>}
      </div>
      <p>
        {party.is_example && <span className="pill pill-example">Παράδειγμα</span>}
        <span className="pill">{KIND[party.kind]}</span>
        {!party.is_example && (party.profile_source === 'party_verified'
          ? <span className="pill pill-teal">Επιβεβαιωμένο από το κόμμα</span>
          : <span className="pill pill-soft">Από δημόσιες πηγές · δεν έχει επιβεβαιωθεί από το κόμμα</span>)}
        <span className={`pill${party.tier === 'full' ? ' pill-teal' : ''}`}>{TIER[party.tier]}</span>
        {party.graduated && <span className="pill pill-accent">Απόφοιτο: εκπροσωπείται στη Βουλή, εκτός εναλλαγής</span>}
      </p>
      {party.slogan && <p className="lead">{party.slogan}</p>}

      <div className="panel">
        <dl className="fields">
          <dt>Πρόσωπα</dt>
          <dd className="people">
            {cards.map((c) => <button key={c.name} type="button" className="person-btn" onClick={() => show(c.name)}>{c.name}<small>{c.role}</small></button>)}
          </dd>
          {party.founded_year && <><dt>Έτος ίδρυσης</dt><dd>{party.founded_year}</dd></>}
          {party.founders_prior_service && <><dt>Ένδειξη</dt><dd>Ιδρυτές με προηγούμενη κοινοβουλευτική θητεία.</dd></>}
          {party.funding && <><dt>Χρηματοδότηση</dt><dd>{party.funding}</dd></>}
          {party.legal_status && <><dt>Νομική υπόσταση</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{party.legal_status}</dd></>}
          {party.team && <><dt>Ομάδα και όργανα</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{party.team}</dd></>}
          {party.contact_email && <><dt>Επικοινωνία</dt><dd><a href={`mailto:${party.contact_email}`}>{party.contact_email}</a></dd></>}
          {party.website && <><dt>Επίσημη ιστοσελίδα</dt><dd><a href={party.website} rel="noopener nofollow">{party.website}</a></dd></>}
        </dl>
      </div>

      {[['positions_url', 'Οι θέσεις του κόμματος'], ['news_url', 'Νέα και ανακοινώσεις'], ['membership_url', 'Εγγραφή μελών'], ['donate_url', 'Οικονομική ενίσχυση']].some(([k]) => party[k]) && (
        <div className="panel">
          <h2>Χρήσιμοι σύνδεσμοι (από το ίδιο το κόμμα)</h2>
          <ul>
            {[['positions_url', 'Οι θέσεις του κόμματος'], ['news_url', 'Νέα και ανακοινώσεις'], ['membership_url', 'Εγγραφή μελών'], ['donate_url', 'Οικονομική ενίσχυση']].filter(([k]) => party[k]).map(([k, l]) => (
              <li key={k}><a href={party[k]} rel="noopener nofollow" target="_blank">{l}</a></li>
            ))}
          </ul>
        </div>
      )}

      {(party.manifesto || party.manifesto_url) && (
        <div className="panel">
          <h2>Διακήρυξη</h2>
          {party.manifesto && <p style={{ whiteSpace: 'pre-wrap' }}>{party.manifesto}</p>}
          {party.manifesto_url && <p><a href={party.manifesto_url} rel="noopener nofollow" target="_blank">Επίσημο κείμενο της διακήρυξης</a></p>}
        </div>
      )}

      <dialog ref={dlg} className="person-pop" onClose={() => setOpen(null)} onClick={(e) => e.target === dlg.current && dlg.current.close()}>
        {opened && (
          <>
            <button type="button" className="pop-close" onClick={() => dlg.current.close()} aria-label="Κλείσιμο">×</button>
            <p className="eyebrow-s">{opened.role}</p>
            <h3>{opened.name}</h3>
            {opened.person ? (
              <dl className="bio">
                {opened.person.occupation && <><dt>Ιδιότητα</dt><dd>{opened.person.occupation}</dd></>}
                {opened.person.education && <><dt>Εκπαίδευση</dt><dd>{opened.person.education}</dd></>}
                {opened.person.experience && <><dt>Εμπειρία</dt><dd>{opened.person.experience}</dd></>}
                <dt>Προηγούμενη θητεία</dt>
                <dd>{opened.person.public_office === 'none' ? 'Καμία δημόσια ή κομματική θητεία' : `${OFFICE[opened.person.public_office]}: ${opened.person.office_details}`}</dd>
                {opened.person.motivation && <><dt>Γιατί συμμετέχει</dt><dd>{opened.person.motivation}</dd></>}
              </dl>
            ) : <p className="note">Δεν έχει προστεθεί βιογραφικό.</p>}
            {opened.person?.social_url && (
              <ul className="social"><li><a href={opened.person.social_url} rel="noopener nofollow" target="_blank" aria-label="Προφίλ σε κοινωνικό δίκτυο" title="Προφίλ σε κοινωνικό δίκτυο">↗</a></li></ul>
            )}
          </>
        )}
      </dialog>

      {videos.length > 0 && (
        <>
          <h2>Βίντεο που προωθεί {label}</h2>
          <ul className="videos">
            {videos.map((v) => (
              <li key={v.id}><a href={v.url} rel="noopener nofollow" target="_blank"><span className="vplay" aria-hidden="true">▶</span><span>{v.title}<small>Άνοιγμα στο YouTube</small></span></a></li>
            ))}
          </ul>
          <p className="note">Τα βίντεο επιλέγονται από το ίδιο το κόμμα και ανοίγουν στο YouTube. Η πλατφόρμα δεν τα φιλοξενεί και δεν τα αξιολογεί.</p>
        </>
      )}

      <h2>Δομημένες προτάσεις</h2>
      {proposals.length ? (
        <table>
          <thead><tr><th>Θέμα</th><th>Πρόταση</th></tr></thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id}><td><Link to={`/themata/${p.topic.slug}`}>{p.topic.name}</Link></td><td><Link to={`/protasi/${p.id}`}>{p.title}</Link></td></tr>
            ))}
          </tbody>
        </table>
      ) : <p className="note">Δεν έχουν δημοσιευτεί προτάσεις ακόμη.</p>}

      {changes.length > 0 && (
        <>
          <h2>Ιστορικό αλλαγών</h2>
          <table>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className="col-date">{fmtDateTime(c.at)}</td>
                  <td>{c.summary}
                    {c.details?.length > 0 && (
                      <details className="diff"><summary>Τι άλλαξε ακριβώς</summary>
                        {c.details.map((x, i) => (
                          <div className="diff-row" key={i}><strong>{x.label}</strong><br />
                            {x.before && <><span className="diff-before">{x.before}</span><br /></>}
                            <span className="diff-after">{x.after || '(κενό)'}</span>
                          </div>
                        ))}
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <Chat room={{ party_id: party.id }} title={`Ζωντανή συζήτηση: ${party.name}`} />
    </div>
  )
}
