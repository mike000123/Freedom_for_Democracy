import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { partyImageUrl } from './supabase'
import { KIND } from './util'

export function Loading({ state }) {
  if (state.error)
    return (
      <div className="wrap pad">
        <p className="note"><strong>Δεν φορτώθηκαν τα δεδομένα.</strong> {state.error}</p>
        <p><button onClick={() => window.location.reload()}>Δοκίμασε ξανά</button></p>
      </div>
    )
  return state.loading ? <div className="wrap pad"><p className="note">Φόρτωση…</p></div> : null
}

export function PartyCard({ party, n, pick }) {
  const img = partyImageUrl(party)
  return (
    <article className={`card pcard${party.kind === 'group' ? ' group' : ''}`}>
      {img ? (
        <div className={`card-img${!party.image_path ? ' party-logo' : ''}`}><img src={img} alt={!party.image_path ? `Λογότυπο ${party.name}` : ''} loading="lazy" /></div>
      ) : (
        <div className="card-img ph"><span>Χωρίς φωτογραφία</span></div>
      )}
      {pick && <label className="pick"><input type="checkbox" checked={pick.checked} onChange={pick.onChange} /> Σύγκριση</label>}
      <p>
        {party.is_example && <span className="pill pill-example">Παράδειγμα</span>}
        {party.kind === 'group' ? <span className="pill outline">Ομάδα υπό σύσταση</span>
          : party.tier === 'full' ? <span className="pill pill-teal">Πλήρες προφίλ</span>
          : <span className="pill pill-soft">Σε εξέλιξη</span>}
        {party.graduated && <span className="pill pill-accent">Απόφοιτο</span>}
      </p>
      <h3><Link to={`/kommata/${party.slug}`}>{party.name}</Link></h3>
      <p className="slogan">{party.slogan}</p>
      <p className="card-foot">
        <span>{n ?? 0} προτάσεις</span>
        {party.founded_year && <span>Ίδρυση {party.founded_year}</span>}
      </p>
    </article>
  )
}

export const kindLabel = (k) => KIND[k] || k

// Οριζόντιο καρουζέλ: 4 κάρτες ανά σειρά, βέλη, αυτόματη κύλιση κάθε 2 δευτερόλεπτα (σταματά με ποντίκι/εστίαση).
export function Carousel({ children, label }) {
  const ref = useRef(null)
  const [paused, setPaused] = useState(false)
  const step = (dir) => {
    const el = ref.current
    if (!el) return
    const card = el.firstElementChild
    if (!card) return
    const w = card.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || 16)
    const max = el.scrollWidth - el.clientWidth
    if (dir > 0 && el.scrollLeft >= max - 4) el.scrollTo({ left: 0, behavior: 'smooth' })
    else if (dir < 0 && el.scrollLeft <= 4) el.scrollTo({ left: max, behavior: 'smooth' })
    else el.scrollBy({ left: dir * w, behavior: 'smooth' })
  }
  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => step(1), 2000)
    return () => clearInterval(t)
  }, [paused])
  return (
    <div className="carousel" role="region" aria-label={label} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <button type="button" className="car-btn prev" aria-label="Προηγούμενες" onClick={() => step(-1)}>‹</button>
      <div className="car-track" ref={ref}>{children}</div>
      <button type="button" className="car-btn next" aria-label="Επόμενες" onClick={() => step(1)}>›</button>
    </div>
  )
}
