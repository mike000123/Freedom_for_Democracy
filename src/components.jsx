import { Link } from 'react-router-dom'
import { imageUrl } from './supabase'
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

export function PartyCard({ party, n }) {
  const img = imageUrl(party.image_path)
  return (
    <article className={`card pcard${party.kind === 'group' ? ' group' : ''}`}>
      {img ? (
        <div className="card-img"><img src={img} alt="" loading="lazy" /></div>
      ) : party.tier === 'full' && party.kind === 'party' ? (
        <div className="card-img ph"><span>Φωτογραφία ομάδας</span></div>
      ) : null}
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
