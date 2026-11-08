import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useData, useTitle, shuffle, fmtDate, fmtDateTime, truncWords, KIND } from '../util'
import { Loading, PartyLogo } from '../components'
import { useAuth } from '../auth'
import { OfficialReply, useMembership } from './Manage'
import { Chat } from './Chat'
import { CommentForm, QuestionForm, ReportButton, DeleteOwnComment, KINDS, PROPOSAL_KINDS } from './Post'

const SECTIONS = [
  ['problem', 'Πρόβλημα'], ['action', 'Πρόταση'], ['legal', 'Νομικό πλαίσιο'], ['cost', 'Κόστος και χρηματοδότηση'],
  ['tradeoffs', 'Αντισταθμίσματα'], ['timeline', 'Χρονοδιάγραμμα'], ['metric', 'Μέτρο επιτυχίας'],
]

export function Topics() {
  useTitle('Προτάσεις')
  const s = useData(async () => {
    const [topics, props, qs] = await Promise.all([
      q(sb.from('topics').select('id,name,slug').order('order')),
      q(sb.from('proposals').select('topic_id,party:parties!inner(is_published)').eq('is_published', true).eq('party.is_published', true)),
      q(sb.from('questions').select('topic_id').eq('removed', false)),
    ])
    return topics.map((t) => ({
      ...t, nProp: props.filter((p) => p.topic_id === t.id).length, nQ: qs.filter((x) => x.topic_id === t.id).length,
    }))
  }, [])
  return (
    <>
      <section className="wrap pad-top">
        <p className="eyebrow">Προτάσεις ανά θέμα</p>
        <h1 className="display-s">Ένα ζήτημα. Πολλές οπτικές.</h1>
        <p className="lead">Σε κάθε θέμα βλέπετε τις θέσεις όλων των κομμάτων με το ίδιο πρότυπο και μπορείτε να θέσετε ερώτημα.</p>
      </section>
      {!s.data ? <Loading state={s} /> : (
        <section className="wrap pad">
          <div className="grid tgrid">
            {s.data.map((t) => (
              <article className="card tcard" key={t.id}>
                <h3><Link to={`/themata/${t.slug}`}>{t.name}</Link></h3>
                <p className="card-foot"><span>{t.nProp} προτάσεις</span><span>{t.nQ} ερωτήματα πολιτών</span></p>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export function Topic() {
  const { slug } = useParams()
  const nav = useNavigate()
  const { session, profile } = useAuth()
  const [n, setN] = useState(0)
  const [selP, setSelP] = useState([])
  const [selC, setSelC] = useState([])
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const s = useData(async () => {
    const topic = (await q(sb.from('topics').select('*').eq('slug', slug).limit(1)))[0]
    if (!topic) throw new Error('Το θέμα δεν βρέθηκε.')
    const [props, cprops, questions, parties, flags] = await Promise.all([
      q(sb.from('proposals').select('id,title,action,party:parties!inner(id,name,slug,kind,tier,is_example,is_published,image_path,website)').eq('topic_id', topic.id).eq('is_published', true).eq('party.is_published', true)),
      q(sb.from('citizen_proposals').select('id,title,action,author_id').eq('topic_id', topic.id).eq('removed', false)),
      q(sb.from('questions').select('id,body,created_at,author_id').eq('topic_id', topic.id).eq('removed', false).order('created_at', { ascending: false })),
      q(sb.from('parties').select('id,name,slug').eq('is_published', true).eq('graduated', false)),
      q(sb.from('feature_flags').select('key,state')),
    ])
    const authorIds = [...new Set([...cprops, ...questions].map((x) => x.author_id))]
    const authors = authorIds.length ? await q(sb.from('citizens_public').select('user_id,display_name,kind,is_example').in('user_id', authorIds)) : []
    const byId = Object.fromEntries(authors.map((a) => [a.user_id, a]))
    const qIds = questions.map((x) => x.id)
    const comments = qIds.length ? await q(sb.from('comments').select('question_id').in('question_id', qIds)) : []
    const have = new Set(props.map((p) => p.party.id))
    return {
      topic,
      props: shuffle(props),
      missing: parties.filter((p) => !have.has(p.id)),
      citizenOn: flags.find((f) => f.key === 'citizen_proposals')?.state === 'on',
      cprops: shuffle(cprops).map((c) => ({ ...c, author: byId[c.author_id] })),
      questions: questions.map((x) => ({ ...x, author: byId[x.author_id], n: comments.filter((c) => c.question_id === x.id).length })),
    }
  }, [slug, n])
  useTitle(s.data?.topic.name)
  if (!s.data) return <Loading state={s} />
  const { topic, props, missing, citizenOn, cprops, questions } = s.data
  return (
    <>
      <section className="wrap pad-top">
        <p className="crumb"><Link to="/themata">← Όλα τα θέματα</Link></p>
        <p className="eyebrow">Θέμα</p>
        <h1 className="display-s">{topic.name}</h1>
        <p className="lead">{props.length} προτάσεις κομμάτων{citizenOn && ` · ${cprops.length} προτάσεις πολιτών`} · {questions.length} ερωτήματα πολιτών</p>
      </section>

      <section className="wrap pad">
        <h2 className="sec">Θέσεις κομμάτων <span className="meta">τυχαία σειρά σε κάθε επίσκεψη</span></h2>
        {props.length + (citizenOn ? cprops.length : 0) > 1 && (
          <div className="cmpbar">
            <p className="note">Τσεκάρετε τις προτάσεις που θέλετε, από κόμματα, ομάδες ή πολίτες, και δείτε τες σε έναν πίνακα.</p>
            <p>
              <button type="button" disabled={selP.length + selC.length < 2} onClick={() => nav(`/sygkrisi?${new URLSearchParams([['topic', topic.slug], ...selP.map((v) => ['p', v]), ...selC.map((v) => ['c', v])])}`)}>
                Σύγκριση επιλεγμένων{selP.length + selC.length > 0 && ` (${selP.length + selC.length})`}
              </button>{' '}
              <Link className="btn ghost" to={`/sygkrisi?topic=${topic.slug}&all=1`}>Σύγκριση όλων</Link>
            </p>
          </div>
        )}
        <div className="grid">
          {props.length ? props.map((p) => (
            <article className="card pcard proposal-card" key={p.id}>
              <PartyLogo party={p.party} className="proposal-party-logo" />
              <label className="pick"><input type="checkbox" checked={selP.includes(p.party.slug)} onChange={() => toggle(selP, setSelP, p.party.slug)} /> Σύγκριση</label>
              <p>
                {p.party.is_example && <span className="pill pill-example">Παράδειγμα</span>}
                <span className={`pill${p.party.tier === 'full' ? ' pill-teal' : ''}`}>{KIND[p.party.kind]}</span>
              </p>
              <h3><Link to={`/protasi/${p.id}`}>{p.title}</Link></h3>
              <p className="slogan">{truncWords(p.action, 30)}</p>
              <p className="card-foot"><Link to={`/kommata/${p.party.slug}`}>{p.party.name}</Link></p>
            </article>
          )) : <p className="note">Κανένα κόμμα δεν έχει δηλώσει θέση σε αυτό το θέμα ακόμη.</p>}
        </div>
        {missing.length > 0 && (
          <>
            <p className="eyebrow-s">Δεν έχει δηλωθεί θέση</p>
            <ul className="chips">{missing.map((p) => <li key={p.id}><Link to={`/kommata/${p.slug}`}>{p.name}</Link></li>)}</ul>
          </>
        )}
      </section>

      {citizenOn && (
        <section className="band">
          <div className="wrap">
            <h2 className="sec">Προτάσεις πολιτών και οργανισμών <span className="meta">τυχαία σειρά · δεν εκπροσωπούν κόμμα</span></h2>
            <p className="note">Μία πρόταση ανά θέμα για κάθε λογαριασμό. Μπορείτε να αναφέρετε πρόταση που παραβιάζει τους <Link to="/kanones">κανόνες</Link>.</p>
            <div className="grid">
              {cprops.length ? cprops.map((c) => (
                <article className="card pcard" key={c.id}>
                  <label className="pick"><input type="checkbox" checked={selC.includes(c.id)} onChange={() => toggle(selC, setSelC, c.id)} /> Σύγκριση</label>
                  <p>
                    {c.author?.is_example && <span className="pill pill-example">Παράδειγμα</span>}
                    <span className="pill outline">{c.author?.kind === 'org' ? 'Οργανισμός' : 'Πολίτης'}</span>
                  </p>
                  <h3><Link to={`/protasi-politi/${c.id}`}>{c.title}</Link></h3>
                  <p className="slogan">{truncWords(c.action, 30)}</p>
                  <p className="card-foot"><span>{c.author?.display_name}</span></p>
                </article>
              )) : <p className="note">Καμία πρόταση πολίτη ακόμη.</p>}
            </div>
            {session && profile ? <p><Link className="btn" to={`/themata/${topic.slug}/nea-protasi`}>Υποβολή πρότασης</Link></p>
              : <p className="note"><Link to="/eisodos">Συνδεθείτε</Link> ή <Link to="/eggrafi">δημιουργήστε λογαριασμό</Link> για να υποβάλετε πρόταση.</p>}
          </div>
        </section>
      )}

      <section className="wrap pad">
        <h2 className="sec">Ερωτήματα πολιτών</h2>
        {questions.length ? questions.map((x) => (
          <article className="card flat qcard" key={x.id}>
            <p><Link to={`/erotima/${x.id}`}>{truncWords(x.body, 30)}</Link></p>
            <p className="note">{x.author?.display_name} · επαληθευμένο email · {fmtDate(x.created_at)} · {x.n} σχόλια</p>
          </article>
        )) : <p className="note">Κανένα ερώτημα ακόμη.</p>}
        <h3 className="sub">Θέστε ένα ερώτημα</h3>
        <p className="note">Δεν υπάρχουν likes, ψήφοι ή μετρητές.</p>
        <QuestionForm topicId={topic.id} onDone={() => setN(n + 1)} />
      </section>
      <div className="wrap pad"><Chat room={{ topic_id: topic.id }} title={`Ζωντανή συζήτηση: ${topic.name}`} /></div>
    </>
  )
}

function Sections({ p }) {
  return (
    <dl className="fields">
      {SECTIONS.map(([k, label]) => <div key={k} style={{ display: 'contents' }}><dt>{label}</dt><dd>{p[k]}</dd></div>)}
    </dl>
  )
}

function Source({ url }) {
  if (!url) return null
  return <p className="note">Πηγή τεκμηρίωσης: <a className="source" href={url} rel="noopener noreferrer nofollow">{url}</a> (εξωτερικός σύνδεσμος, ο ιστότοπος δεν ευθύνεται για το περιεχόμενό του)</p>
}

export function Proposal() {
  const { id } = useParams()
  const s = useData(async () => {
    const p = (await q(sb.from('proposals').select('*,topic:topics(name,slug),party:parties!inner(name,slug,is_example)').eq('id', id).limit(1)))[0]
    if (!p) throw new Error('Η πρόταση δεν βρέθηκε.')
    return p
  }, [id])
  useTitle(s.data?.title)
  if (!s.data) return <Loading state={s} />
  const p = s.data
  return (
    <div className="wrap pad">
      <p className="note"><Link to={`/themata/${p.topic.slug}`}>{p.topic.name}</Link> · <Link to={`/kommata/${p.party.slug}`}>{p.party.name}</Link>{p.party.is_example && <> <span className="pill pill-example">Παράδειγμα</span></>}</p>
      <h1>{p.title}</h1>
      <div className="panel"><Sections p={p} /><Source url={p.source} /></div>
      <Chat room={{ proposal_id: p.id }} />
      <Discussion column="proposal_id" id={p.id} kinds={PROPOSAL_KINDS} ownerParty={p.party_id} />
    </div>
  )
}

export function CitizenProposal() {
  const { id } = useParams()
  const s = useData(async () => {
    const p = (await q(sb.from('citizen_proposals').select('*,topic:topics(name,slug)').eq('id', id).limit(1)))[0]
    if (!p) throw new Error('Η πρόταση δεν βρέθηκε.')
    const a = (await q(sb.from('citizens_public').select('display_name,kind,is_example').eq('user_id', p.author_id)))[0]
    return { p, a }
  }, [id])
  useTitle(s.data?.p.title)
  if (!s.data) return <Loading state={s} />
  const { p, a } = s.data
  return (
    <div className="wrap pad">
      <p className="note"><Link to={`/themata/${p.topic.slug}`}>{p.topic.name}</Link> · Πρόταση {a?.kind === 'org' ? 'οργανισμού' : 'πολίτη'}: {a?.display_name}{a?.is_example && <> <span className="pill pill-example">Παράδειγμα</span></>}</p>
      <h1>{p.title}</h1>
      <p className="note">Η πρόταση δεν εκπροσωπεί κόμμα. <ReportButton type="citizen_proposal" id={p.id} /></p>
      <div className="panel"><Sections p={p} /><Source url={p.source} /></div>
      <Discussion column="citizen_proposal_id" id={p.id} kinds={PROPOSAL_KINDS} />
    </div>
  )
}

export function Question() {
  const { id } = useParams()
  const s = useData(async () => {
    const x = (await q(sb.from('questions').select('*,topic:topics(name,slug)').eq('id', id).limit(1)))[0]
    if (!x) throw new Error('Το ερώτημα δεν βρέθηκε.')
    const a = (await q(sb.from('citizens_public').select('display_name').eq('user_id', x.author_id)))[0]
    return { x, a }
  }, [id])
  useTitle('Ερώτημα')
  if (!s.data) return <Loading state={s} />
  const { x, a } = s.data
  return (
    <div className="wrap pad">
      <p className="note"><Link to={`/themata/${x.topic.slug}`}>{x.topic.name}</Link> · Ερώτημα πολίτη</p>
      <div className="panel">
        {x.removed ? <p><em>Αφαιρέθηκε. {x.moderation_note}</em></p> : <p>{x.body}</p>}
        <p className="note">{a?.display_name} · επαληθευμένο email · {fmtDate(x.created_at)}{!x.removed && <> · <ReportButton type="question" id={x.id} /></>}</p>
      </div>
      <Discussion column="question_id" id={x.id} kinds={['comment']} />
    </div>
  )
}

function CommentItem({ c, replies, authors, parties, me, replyTo, reload }) {
  const author = authors[c.author_id]
  if (c.removed) {
    return (
      <div className="comment removed" id={`c${c.id}`}>
        {c.removed_by_author ? 'Το σχόλιο διαγράφηκε από τον συντάκτη του.' : <>Το σχόλιο αφαιρέθηκε. Η αιτιολόγηση υπάρχει στο <Link to="/diafaneia">αρχείο αποφάσεων</Link>.</>}
      </div>
    )
  }
  return (
    <div className={`comment${c.official_party_id ? ' official' : ''}`} id={`c${c.id}`}>
      <p className="who">
        {replyTo && <><span className="note">↳ Απάντηση στο σχόλιο του «{replyTo}»</span><br /></>}
        {c.official_party_id
          ? <span className="pill pill-teal">Επίσημη απάντηση: {parties[c.official_party_id]?.name}</span>
          : <><strong>{author?.display_name}</strong> <span className="pill">{author?.kind === 'org' ? 'Οργανισμός' : 'Πολίτης'}</span> · επαληθευμένο email</>}
        {' · '}<span className="pill">{KINDS[c.kind]}</span>{' · '}{fmtDateTime(c.created_at)}
      </p>
      <p style={{ whiteSpace: 'pre-line' }}>{c.body}</p>
      <span className="inline"><ReportButton type="comment" id={c.id} /></span>{' '}
      {me && c.author_id === me && <span className="inline"><DeleteOwnComment id={c.id} onDone={reload} /></span>}
    </div>
  )
}

function Discussion({ column, id, kinds, ownerParty }) {
  const { partyId } = useMembership()
  const canOfficial = partyId && (column === 'question_id' || (column === 'proposal_id' && ownerParty === partyId))
  const [random, setRandom] = useState(false)
  const [n, setN] = useState(0)
  const { session } = useAuth()
  const s = useData(async () => {
    const comments = await q(sb.from('comments').select('*').eq(column, id).order('created_at'))
    const aIds = [...new Set(comments.map((c) => c.author_id).filter(Boolean))]
    const pIds = [...new Set(comments.map((c) => c.official_party_id).filter(Boolean))]
    const [as, ps] = await Promise.all([
      aIds.length ? q(sb.from('citizens_public').select('user_id,display_name,kind').in('user_id', aIds)) : [],
      pIds.length ? q(sb.from('parties').select('id,name').in('id', pIds)) : [],
    ])
    return {
      comments,
      authors: Object.fromEntries(as.map((a) => [a.user_id, a])),
      parties: Object.fromEntries(ps.map((p) => [p.id, p])),
    }
  }, [column, id, n])
  const reload = () => setN((x) => x + 1)
  if (!s.data) return <Loading state={s} />
  const { comments, authors, parties } = s.data
  const me = session?.user.id
  const replies = {}
  comments.filter((c) => c.parent_id).forEach((c) => (replies[c.parent_id] = [...(replies[c.parent_id] || []), c]))
  let roots = comments.filter((c) => !c.parent_id)
  if (random) roots = shuffle(roots)
  return (
    <>
      <h2>Συζήτηση</h2>
      <p className="note">
        Εμφάνιση: <button className="link" type="button" onClick={() => setRandom(false)}>χρονολογικά</button> · <button className="link" type="button" onClick={() => setRandom(true)}>τυχαία σειρά</button>
      </p>
      {roots.length ? roots.map((c) => (
        <div key={c.id}>
          <CommentItem c={c} replies={replies} authors={authors} parties={parties} me={me} reload={reload} />
          {canOfficial && !c.removed && !c.official_party_id && (
            <div className="replies"><OfficialReply column={column} id={id} parentId={c.id} partyId={partyId} onDone={reload} /></div>
          )}
          {replies[c.id] && (
            <div className="replies">
              {replies[c.id].map((r) => (
                <CommentItem key={r.id} c={r} authors={authors} parties={parties} me={me} reload={reload}
                  replyTo={c.official_party_id ? parties[c.official_party_id]?.name : authors[c.author_id]?.display_name} />
              ))}
            </div>
          )}
        </div>
      )) : <p className="note">Δεν υπάρχουν σχόλια ακόμη.</p>}
      <h3>Προσθέστε σχόλιο</h3>
      <CommentForm column={column} id={id} kinds={kinds} onDone={reload} />
    </>
  )
}
