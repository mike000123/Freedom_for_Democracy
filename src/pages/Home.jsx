import { Link } from 'react-router-dom'
import { sb, q } from '../supabase'
import { useData, useTitle } from '../util'
import { readPages, summarizeLandscape } from '../homeData'
import { Loading } from '../components'
import HomeLandscape from '../components/HomeLandscape'

export default function Home() {
  useTitle('')
  const s = useData(async () => {
    const [parties, proposals, topics] = await Promise.all([
      readPages((from, to) => q(sb.from('parties')
        .select('id,name,slug,kind,tier,is_published,is_example,graduated,profile_source,image_path,website')
        .eq('is_published', true).eq('graduated', false).order('id').range(from, to))),
      readPages((from, to) => q(sb.from('proposals')
        .select('id,party_id,topic_id,title,is_published,party:parties!inner(is_published,is_example,graduated)')
        .eq('is_published', true).eq('party.is_published', true).eq('party.graduated', false)
        .order('id').range(from, to))),
      readPages((from, to) => q(sb.from('topics').select('id,name,slug,order').order('order').order('id').range(from, to))),
    ])
    return summarizeLandscape(parties, proposals, topics)
  }, [])

  return (
    <div className="home-page">
      <div className="hero-bleed">
      <section className="wrap hero2">
        <div>
          <p className="eyebrow">Φωνή σε όλα τα νέα κόμματα</p>
          <h1 className="display">Νέες ιδέες.<br />Ίσες ευκαιρίες.<br /><span className="red">Ανοιχτός διάλογος.</span></h1>
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
      </div>

      <section className="wrap mission">
        <p className="eyebrow">Γιατί υπάρχει η πλατφόρμα</p>
        <p className="mission-lead">Τα μεγάλα κόμματα έχουν ήδη βήμα. Τα νέα όχι.</p>
        <div className="mission-cols">
          <p>Εδώ κάθε νέο κόμμα και κάθε ομάδα εμφανίζεται με ίση ευκαιρία και παρουσιάζει συγκεκριμένες προτάσεις, όχι συνθήματα. Εσύ διαβάζεις, ρωτάς και παίρνεις δημόσια απάντηση. Χωρίς διαφημίσεις, χωρίς κομματική προτίμηση.</p>
        </div>
      </section>

      {s.data ? <HomeLandscape data={s.data} /> : <Loading state={s} />}
    </div>
  )
}
