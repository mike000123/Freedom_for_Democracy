import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useData, useTitle, shuffle } from '../util'
import { Loading } from '../components'

export default function Quiz() {
  useTitle('Ερωτηματολόγιο προτιμήσεων')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const s = useData(async () => {
    const on = (await sb.rpc('feature_on', { k: 'questionnaire' })).data === true
    if (!on) return { on }
    const topics = await q(sb.from('topics').select('id,name,slug,order,pq:pref_questions(id,text,options:pref_options(id,text,order))').order('order'))
    return { on, topics: topics.filter((t) => t.pq && t.pq.options?.length) }
  }, [])
  if (!s.data) return <Loading state={s} />
  if (!s.data.on) return <div className="wrap pad"><h1>Ερωτηματολόγιο προτιμήσεων</h1><p className="note">Το ερωτηματολόγιο δεν είναι ενεργό αυτή τη στιγμή.</p></div>
  const { topics } = s.data

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const f = new FormData(e.target)
      const out = []
      for (const t of topics) {
        const raw = f.get('q' + t.id)
        const option = t.pq.options.find((o) => String(o.id) === raw)
        if (!option) continue
        const rows = await q(sb.from('proposals').select('id,title,stance_id,party:parties!inner(name,slug,is_example,is_published)')
          .eq('topic_id', t.id).eq('is_published', true).eq('party.is_published', true))
        const matches = shuffle(rows.filter((r) => r.stance_id === option.id))
        out.push({ topic: t, option, matches, undeclared: rows.filter((r) => r.stance_id == null).length })
      }
      setResults(out)
      window.scrollTo(0, 0)
    } catch (e2) { setErr(e2.message) }
    setBusy(false)
  }

  if (results) {
    return (
      <div className="wrap pad">
        <p className="eyebrow">Αποτέλεσμα ερωτηματολογίου</p>
        <h1>Προτάσεις που ταιριάζουν στις απαντήσεις σου</h1>
        <p className="lead">Δεν είναι κατάταξη. Σε κάθε θέμα βλέπεις τις προτάσεις που υποστηρίζουν την απάντησή σου, με τυχαία σειρά. Τη θέση τη δηλώνει το ίδιο το κόμμα. Οι απαντήσεις σου δεν αποθηκεύτηκαν.</p>
        {results.length ? results.map((r) => (
          <article className="panel" key={r.topic.id}>
            <h2>{r.topic.name}</h2>
            <p className="note">{r.topic.pq.text}</p>
            <p><strong>Η απάντησή σου:</strong> {r.option.text}</p>
            {r.matches.length ? (
              <>
                <ul>{r.matches.map((m) => (
                  <li key={m.id}><Link to={`/kommata/${m.party.slug}`}>{m.party.name}</Link>{m.party.is_example && <> <span className="pill pill-example">Παράδειγμα</span></>} · <Link to={`/protasi/${m.id}`}>{m.title}</Link></li>
                ))}</ul>
                {r.matches.length >= 2 && (
                  <p><Link className="btn ghost" to={`/sygkrisi?${new URLSearchParams([['topic', r.topic.slug], ...r.matches.slice(0, 12).map((m) => ['p', m.party.slug])])}`}>Σύγκρινε αυτές τις προτάσεις</Link></p>
                )}
              </>
            ) : <p className="note">Καμία δημοσιευμένη πρόταση δεν έχει δηλώσει αυτή τη θέση ακόμα.</p>}
            {r.undeclared > 0 && <p className="note">{r.undeclared} ακόμα προτάσεις σε αυτό το θέμα δεν έχουν δηλώσει θέση. <Link to={`/themata/${r.topic.slug}`}>Δες όλες τις προτάσεις του θέματος</Link>.</p>}
          </article>
        )) : <p className="note">Δεν απάντησες σε κανένα θέμα.</p>}
        <p><button className="ghost" onClick={() => setResults(null)}>Ξαναπροσπάθησε</button></p>
      </div>
    )
  }
  return (
    <div className="wrap pad">
      <p className="eyebrow">Ερωτηματολόγιο προτιμήσεων</p>
      <h1>Ποιες προτάσεις ταιριάζουν στη δική σου οπτική;</h1>
      <p className="lead">Απάντησε σε όσα θέματα θέλεις. Θα δεις ποιες προτάσεις υποστηρίζουν την απάντησή σου, ανά θέμα. Δεν υπάρχει βαθμολογία ούτε κατάταξη κομμάτων, και οι απαντήσεις σου δεν αποθηκεύονται.</p>
      {topics.length ? (
        <form onSubmit={submit}>
          {topics.map((t) => (
            <fieldset className="panel" key={t.id}>
              <legend><strong>{t.name}</strong> · {t.pq.text}</legend>
              {[...t.pq.options].sort((a, b) => a.order - b.order).map((o) => (
                <p key={o.id}><label><input type="radio" name={'q' + t.id} value={o.id} /> {o.text}</label></p>
              ))}
              <p><label className="note"><input type="radio" name={'q' + t.id} value="" defaultChecked /> Προτιμώ να μην απαντήσω</label></p>
            </fieldset>
          ))}
          {err && <p className="errorlist">{err}</p>}
          <button type="submit" disabled={busy}>Δες τις προτάσεις που ταιριάζουν</button>
        </form>
      ) : <p className="note">Δεν έχουν οριστεί ακόμα ερωτήματα.</p>}
    </div>
  )
}
