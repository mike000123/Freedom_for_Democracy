import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KIND, TIER, lines } from '../util'
import { partyImageUrl } from '../supabase'
import { evidenceStatus } from '../homeData'
import { filterPartyTopics, groupPartyProposals, partyTopicIcon, partyTopicPage } from '../partyProfileData'
import { PartyLogo } from '../components'
import DiscussionIcon from '../icons/DiscussionIcon'
import SocialIcon from '../icons/SocialIcon'
import { Chat } from '../pages/Chat'
import { buildPartyPeople } from '../personPortraits'
import PersonPortrait from './PersonPortrait'
import CorrectionRequest from './CorrectionRequest'

const format = (n) => n.toLocaleString('el-GR')
const SOCIALS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['x_url', 'X (Twitter)'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn']]
const SOURCES = [['manifesto_url', 'Επίσημο κείμενο διακήρυξης'], ['positions_url', 'Οι θέσεις του κόμματος'], ['news_url', 'Νέα και ανακοινώσεις'], ['membership_url', 'Εγγραφή μελών'], ['donate_url', 'Οικονομική ενίσχυση']]
const TABS = [['proposals', 'Προτάσεις'], ['identity', 'Ταυτότητα'], ['people', 'Πρόσωπα'], ['videos', 'Βίντεο'], ['discussion', 'Συζήτηση']]
const OFFICE = { held: 'Δημόσια θητεία', party: 'Κομματική θητεία' }

function ProfileDialog({ open, onClose, titleId, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (open && !ref.current.open) ref.current.showModal()
    else if (!open && ref.current.open) ref.current.close()
  }, [open])
  return <dialog ref={ref} className="party-profile-dialog" aria-labelledby={titleId} onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current.close() }}>
    {open && <><button type="button" className="pop-close" aria-label="Κλείσιμο" onClick={() => ref.current.close()}>×</button>{children}</>}
  </dialog>
}

function TopicCard({ topic, onOpen }) {
  const count = topic.proposals.length
  return <article className={`party-topic-card${count ? '' : ' without-proposal'}`}>
    <div className="party-topic-heading"><span className="party-topic-icon"><DiscussionIcon name={partyTopicIcon(topic)} /></span><h3 title={topic.name}>{topic.name}</h3></div>
    {count ? <>
      <span className="party-topic-count">{format(count)} {count === 1 ? 'πρόταση' : 'προτάσεις'}</span>
      <p className="party-topic-preview" title={topic.proposals[0].title}>{topic.proposals[0].title}</p>
      {count === 1 ? <Link className="party-topic-action" to={`/protasi/${topic.proposals[0].id}`}>Δες την πρόταση <span aria-hidden="true">→</span></Link>
        : <button type="button" className="party-topic-action" onClick={() => onOpen(topic)} aria-label={`Δες τις ${count} προτάσεις: ${topic.name}`}>Δες τις προτάσεις <span aria-hidden="true">→</span></button>}
    </> : <><p className="party-topic-empty">Δεν έχει καταγραφεί δημοσιευμένη πρόταση.</p><span className="party-topic-action empty">Χωρίς καταχώριση</span></>}
  </article>
}

export default function PartyProfile({ party, topics, proposals, people, videos, isAdmin }) {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'proposals'
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => window.matchMedia('(max-width: 600px)').matches ? 4 : 8)
  const [topicOpen, setTopicOpen] = useState(null)
  const [personOpen, setPersonOpen] = useState(null)
  const panel = useRef(null)
  const groups = useMemo(() => groupPartyProposals(topics, proposals), [topics, proposals])
  const filtered = filterPartyTopics(groups, query, status)
  const listing = partyTopicPage(filtered, page, pageSize)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)')
    const update = () => { setPageSize(media.matches ? 4 : 8); setPage(1) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const covered = groups.filter((g) => g.proposals.length).length
  const proposalCount = groups.reduce((sum, g) => sum + g.proposals.length, 0)
  const responsible = lines(party.responsible_persons), founders = lines(party.founders)
  const persons = buildPartyPeople(party, people)
  const socials = SOCIALS.filter(([key]) => party[key])
  const sources = SOURCES.filter(([key]) => party[key]).map(([key, label]) => [key, key === 'positions_url' && party.kind === 'group' ? 'Οι θέσεις της ομάδας' : label])
  const hasSources = !!(party.manifesto || sources.length)
  const verified = party.profile_source === 'party_verified'
  const changeTab = (id) => setParams((old) => { const next = new URLSearchParams(old); id === 'proposals' ? next.delete('tab') : next.set('tab', id); return next })
  const tabKeys = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const index = TABS.findIndex(([id]) => id === tab)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    changeTab(TABS[next][0]); e.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
  }
  const changePage = (next) => { setPage(next); panel.current?.scrollIntoView({ block: 'start' }) }
  const clear = () => { setQuery(''); setStatus('all'); setPage(1) }
  const facts = [
    ['Τύπος', KIND[party.kind]], ['Έτος ίδρυσης', party.founded_year], ['Ιδρυτές', founders.join('\n')], ['Υπεύθυνα πρόσωπα', responsible.join('\n')],
    ['Προηγούμενη θητεία ιδρυτών', party.founders_prior_service ? 'Ιδρυτές με προηγούμενη κοινοβουλευτική θητεία.' : ''],
    ['Χρηματοδότηση', party.funding], ['Νομική υπόσταση', party.legal_status], ['Ομάδα και όργανα', party.team],
  ].filter(([, value]) => value)
  const pageStart = Math.min(Math.max(1, listing.page - 2), Math.max(1, listing.pages - 4))
  const pageNumbers = Array.from({ length: Math.min(5, listing.pages) }, (_, i) => pageStart + i)
  return <div className="wrap pad party-profile">
    <p className="crumb"><Link to="/kommata">Κόμματα και ομάδες</Link> / {party.name}</p>
    {!party.is_published && <div className="party-preview-banner"><span>Προεπισκόπηση · Το προφίλ δεν είναι δημόσιο.</span><Link className="btn ghost" to={isAdmin ? `/to-komma-mou?kommatos=${party.id}` : '/to-komma-mou'} title="Αυτή η σελίδα δεν είναι ορατή σε επισκέπτες">Κλείσιμο προεπισκόπησης</Link></div>}
    <header className="party-identity">
      <div className="party-identity-main">
        <div className="party-identity-logo">{partyImageUrl(party) ? <PartyLogo party={party} /> : <span aria-label={`Χωρίς λογότυπο: ${party.name}`}>{party.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span>}</div>
        <div className="party-identity-copy"><p className="eyebrow">Πολιτική παρουσία</p><h1>{party.name}</h1>
          {evidenceStatus(party.slogan) !== 'missing' && <p className="party-profile-slogan">{party.slogan}</p>}
          <div className="party-profile-badges"><span className="pill">{KIND[party.kind]}</span>{party.is_example ? <span className="pill pill-example">Παράδειγμα</span> : <span className={`pill ${verified ? 'pill-teal' : 'outline'}`}>{verified ? `Επιβεβαιωμένο από ${party.kind === 'group' ? 'την ομάδα' : 'το κόμμα'}` : 'Από δημόσιες πηγές'}</span>}<span className={`pill ${party.tier === 'full' ? 'pill-teal' : 'outline'}`}>{TIER[party.tier]}</span></div>
          {!party.is_example && !verified && <p className="note party-source-note">Το περιεχόμενο συγκεντρώθηκε από δημόσιες πηγές και δεν έχει επιβεβαιωθεί από {party.kind === 'group' ? 'την ομάδα' : 'το κόμμα'}. Δεν υπάρχει σχέση ή έγκριση από τον φορέα. {!!party.website && <>Δείτε πάντα την <a href={party.website} rel="noopener noreferrer nofollow" target="_blank">επίσημη ιστοσελίδα</a>. </>}</p>}
          {!party.is_example && <p className="note"><CorrectionRequest party={party} label={verified ? 'Αίτημα διόρθωσης' : 'Εκπροσωπείτε το φορέα ή βρήκατε λάθος; Ζητήστε διόρθωση ή απάντηση'} /></p>}
          {party.graduated && <p className="note">Απόφοιτο: εκπροσωπείται στη Βουλή, εκτός εναλλαγής.</p>}
        </div>
        {(socials.length > 0 || party.website) && <div className="party-identity-actions">
          {!!socials.length && <ul className="social party-profile-social" aria-label="Κοινωνικά δίκτυα" style={{ '--social-columns': socials.length > 4 ? 3 : socials.length, '--social-count': socials.length }}>{socials.map(([key, name]) => <li key={key}><a href={party[key]} rel="noopener noreferrer nofollow" target="_blank" aria-label={name} title={name}><SocialIcon platform={key} /></a></li>)}</ul>}
          {party.website && <a className="btn ghost" href={party.website} rel="noopener noreferrer nofollow" target="_blank">Επίσημη ιστοσελίδα <DiscussionIcon name="external" className="external-link-icon" /></a>}
        </div>}
      </div>
      <div className="party-profile-stats">
        <div><DiscussionIcon name="document" /><span><strong>{format(proposalCount)}</strong><small>Δημοσιευμένες προτάσεις</small></span></div>
        <div><DiscussionIcon name="layers" /><span><strong>{format(covered)} από {format(groups.length)}</strong><small>Θέματα με καταχώριση</small></span></div>
        <div><DiscussionIcon name="calendar" /><span><strong>{party.founded_year || '—'}</strong><small>Έτος ίδρυσης{!party.founded_year && ' · χωρίς καταχώριση'}</small></span></div>
      </div>
    </header>
    <div className="party-profile-tabs" role="tablist" aria-label="Ενότητες προφίλ">{TABS.map(([id, label]) => <button type="button" role="tab" id={`party-tab-${id}`} key={id} aria-selected={tab === id} aria-controls="party-profile-panel" tabIndex={tab === id ? 0 : -1} onClick={() => changeTab(id)} onKeyDown={tabKeys}>{label}</button>)}</div>
    <div ref={panel} id="party-profile-panel" className="party-profile-panel" role="tabpanel" aria-labelledby={`party-tab-${tab}`}>
      {tab === 'proposals' && <>
        <h2>Δομημένες προτάσεις</h2><p className="note">Επίλεξε θέμα και δες τι προτείνει {party.kind === 'group' ? 'η ομάδα' : 'το κόμμα'}.</p>
        <div className="party-topic-toolbar">
          <div className="party-topic-search"><label className="sr-only" htmlFor="party-topic-search">Αναζήτηση πρότασης ή θέματος</label><DiscussionIcon name="search" /><input type="search" id="party-topic-search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Αναζήτηση πρότασης ή θέματος…" /></div>
          <div><label className="sr-only" htmlFor="party-topic-status">Κατάσταση θεματικών</label><select id="party-topic-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="all">Όλα τα θέματα</option><option value="published">Με δημοσιευμένη πρόταση</option><option value="empty">Χωρίς καταχώριση</option></select></div>
          <p className="note" role="status">{format(listing.first)}–{format(listing.last)} από {format(filtered.length)} θέματα</p>
        </div>
        {!proposalCount && <p className="note">Δεν έχουν δημοσιευτεί προτάσεις ακόμη.</p>}
        {listing.items.length ? <div className="party-topic-grid">{listing.items.map((topic) => <TopicCard key={topic.id ?? topic.slug} topic={topic} onOpen={setTopicOpen} />)}</div> : <div className="party-profile-empty"><DiscussionIcon name="search" /><p>{groups.length ? 'Δεν βρέθηκαν θέματα για αυτά τα φίλτρα.' : 'Δεν έχουν καταχωριστεί θεματικές ενότητες ακόμη.'}</p>{groups.length > 0 && <button type="button" className="btn ghost" onClick={clear}>Καθαρισμός φίλτρων</button>}</div>}
        <p className="note party-coverage-note">Η απουσία καταχώρισης δεν σημαίνει ότι {party.kind === 'group' ? 'η ομάδα' : 'το κόμμα'} δεν έχει θέση.</p>
        {listing.pages > 1 && <nav className="party-topic-pagination" aria-label="Σελίδες θεματικών"><button type="button" className="btn ghost" disabled={listing.page === 1} aria-label="Προηγούμενη σελίδα" onClick={() => changePage(listing.page - 1)}><span aria-hidden="true">←</span><span className="page-word"> Προηγούμενη</span></button>{pageNumbers.map((p) => <button type="button" className={`btn${p === listing.page ? '' : ' ghost'}`} key={p} aria-current={p === listing.page ? 'page' : undefined} aria-label={`Σελίδα ${p}`} onClick={() => changePage(p)}>{format(p)}</button>)}<button type="button" className="btn ghost" disabled={listing.page === listing.pages} aria-label="Επόμενη σελίδα" onClick={() => changePage(listing.page + 1)}><span className="page-word">Επόμενη </span><span aria-hidden="true">→</span></button></nav>}
        {hasSources && <div className="party-sources-shortcut"><DiscussionIcon name="document" /><strong>Διακήρυξη και επίσημες πηγές</strong><button type="button" className="btn ghost" onClick={() => { changeTab('identity'); panel.current?.scrollIntoView({ block: 'start' }) }}>Δες τις πηγές <span aria-hidden="true">→</span></button></div>}
      </>}
      {tab === 'identity' && <>
        <h2>Ταυτότητα {party.kind === 'group' ? 'ομάδας' : 'κόμματος'}</h2>
        <dl className="party-identity-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {(party.contact_email || party.website) && <section className="party-information-panel"><h3>Επικοινωνία</h3>{party.contact_email && <p><a href={`mailto:${party.contact_email}`}>{party.contact_email}</a></p>}{party.website && <p><a href={party.website} rel="noopener noreferrer nofollow" target="_blank">{party.website}</a></p>}</section>}
        {(party.manifesto || party.manifesto_url) && <section className="party-information-panel"><h3>Διακήρυξη</h3>{party.manifesto && <p className="party-full-text">{party.manifesto}</p>}{party.manifesto_url && <p><a href={party.manifesto_url} rel="noopener noreferrer nofollow" target="_blank">Επίσημο κείμενο της διακήρυξης <DiscussionIcon name="external" className="external-link-icon" /></a></p>}</section>}
        {!!sources.filter(([key]) => key !== 'manifesto_url').length && <section className="party-information-panel"><h3>Χρήσιμοι σύνδεσμοι</h3><ul className="party-source-links">{sources.filter(([key]) => key !== 'manifesto_url').map(([key, label]) => <li key={key}><a href={party[key]} rel="noopener noreferrer nofollow" target="_blank">{label} <DiscussionIcon name="external" className="external-link-icon" /></a></li>)}</ul></section>}
      </>}
      {tab === 'people' && <><h2>Πρόσωπα</h2><p className="note">Γνώρισε τους ιδρυτές και τα πρόσωπα που έχουν καταχωριστεί στο προφίλ.</p>{persons.length ? <div className="party-person-grid">{persons.map((person) => <button type="button" className="person-btn" key={person.name} onClick={() => setPersonOpen(person)}><PersonPortrait person={person} /><span className="party-person-copy">{person.name}<small>{person.role}</small><small className="party-person-action">Δες το βιογραφικό →</small></span></button>)}</div> : <p className="party-profile-empty">Δεν έχουν καταχωριστεί πρόσωπα ακόμη.</p>}</>}
      {tab === 'videos' && <><h2>Βίντεο</h2>{videos.length ? <><ul className="videos">{videos.map((video) => <li key={video.id}><a href={video.url} rel="noopener noreferrer nofollow" target="_blank"><span className="vplay" aria-hidden="true">▶</span><span>{video.title}<small>Άνοιγμα στο YouTube</small></span></a></li>)}</ul><p className="note">Τα βίντεο ανοίγουν στο YouTube. Η πλατφόρμα δεν τα φιλοξενεί και δεν τα αξιολογεί.</p></> : <p className="party-profile-empty">Δεν έχουν καταχωριστεί βίντεο ακόμη.</p>}</>}
      {tab === 'discussion' && <><p className="note">Για τις δημόσιες ομάδες και το γενικό δωμάτιο, μεταβείτε στη <Link to="/sizitisi">Συζήτηση</Link>.</p><Chat room={{ party_id: party.id }} title={`Ζωντανή συζήτηση: ${party.name}`} /></>}
    </div>
    <ProfileDialog open={!!topicOpen} onClose={() => setTopicOpen(null)} titleId="party-topic-dialog-title">{topicOpen && <><p className="eyebrow">Δημοσιευμένες προτάσεις</p><h2 id="party-topic-dialog-title">{topicOpen.name}</h2><p className="note">{party.name} · {format(topicOpen.proposals.length)} προτάσεις</p><ul className="party-proposal-list">{topicOpen.proposals.map((p) => <li key={p.id}><h3><Link to={`/protasi/${p.id}`}>{p.title}</Link></h3>{p.action && <p>{p.action}</p>}<Link to={`/protasi/${p.id}`}>Δες την πρόταση →</Link></li>)}</ul></>}</ProfileDialog>
    <ProfileDialog open={!!personOpen} onClose={() => setPersonOpen(null)} titleId="party-person-dialog-title">{personOpen && <><div className="party-person-bio-heading"><PersonPortrait person={personOpen} large /><div><p className="eyebrow">{personOpen.role}</p><h2 id="party-person-dialog-title">{personOpen.name}</h2></div></div>{personOpen.contexts.length > 0 && <details className="party-person-context"><summary>Πώς αναφέρεται στο προφίλ</summary>{personOpen.contexts.map((text) => <p key={text}>{text}</p>)}</details>}{personOpen.person ? <dl className="bio">{[['Ιδιότητα', personOpen.person.occupation], ['Εκπαίδευση', personOpen.person.education], ['Εμπειρία', personOpen.person.experience]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<dt>Προηγούμενη θητεία</dt><dd>{personOpen.person.public_office === 'none' ? 'Καμία δημόσια ή κομματική θητεία' : OFFICE[personOpen.person.public_office] ? `${OFFICE[personOpen.person.public_office]}: ${personOpen.person.office_details || '—'}` : 'Δεν έχει καταγραφεί.'}</dd>{personOpen.person.motivation && <><dt>Γιατί συμμετέχει</dt><dd>{personOpen.person.motivation}</dd></>}</dl> : <p className="note">Δεν έχει προστεθεί βιογραφικό.</p>}{personOpen.portrait && <p className="party-photo-source"><a href={personOpen.portrait.sourceUrl} rel="noopener noreferrer nofollow" target="_blank">Πηγή φωτογραφίας <DiscussionIcon name="external" className="external-link-icon" /></a></p>}{personOpen.person?.social_url && <p><a href={personOpen.person.social_url} rel="noopener noreferrer nofollow" target="_blank">Προφίλ σε κοινωνικό δίκτυο <DiscussionIcon name="external" className="external-link-icon" /></a></p>}</>}</ProfileDialog>
  </div>
}
