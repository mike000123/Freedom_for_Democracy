import { Routes, Route, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import Home from './pages/Home'
import { Catalog, Party } from './pages/Parties'
import { Topics, Topic, Proposal, CitizenProposal, Question } from './pages/Topics'
import { Rules, Privacy, Transparency } from './pages/Static'
import Compare from './pages/Compare'
import CompareParties from './pages/CompareParties'
import { Register, Login, Forgot, NewPassword, Account } from './pages/Account'
import { useAuth } from './auth'
import { NewCitizenProposal } from './pages/Post'
import Manage, { useMembership } from './pages/Manage'
import Apply from './pages/Apply'
import Quiz from './pages/Quiz'
import { ChatPage } from './pages/Chat'
import { RoomsHub, RoomPage } from './pages/Rooms'
import Admin, { useIsAdmin } from './pages/Admin'
import { sb } from './supabase'
import { useData } from './util'
import { Brand } from './components'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  const { session, profile, signOut, recovering } = useAuth()
  const nav = useNavigate()
  const { partyId } = useMembership()
  const { isAdmin } = useIsAdmin()
  const apps = useData(async () => (await sb.from('feature_flags').select('key,state').in('key', ['applications', 'chat', 'questionnaire'])).data, [])
  const flagOn = (k) => { const st = apps.data?.find((f) => f.key === k)?.state; return st === 'on' || (st === 'test' && isAdmin) }
  const appsOn = flagOn('applications')
  const chatOn = flagOn('chat')
  const quizOn = flagOn('questionnaire')
  // Ο σύνδεσμος επαναφοράς κωδικού ανοίγει το site συνδεδεμένο· οδηγούμε τον χρήστη στη φόρμα νέου κωδικού.
  useEffect(() => {
    if (recovering) nav('/neos-kodikos')
  }, [recovering, nav])
  return (
    <>
      <ScrollTop />
      <div className="banner" aria-hidden="true">&nbsp;</div>
      <header className="site">
        <div className="wrap">
          <Brand />
          <nav aria-label="Κύριο μενού">
            <NavLink to="/" end>Αρχική</NavLink>
            <NavLink to="/kommata">Κόμματα και ομάδες</NavLink>
            <NavLink to="/themata">Προτάσεις</NavLink>
            <NavLink to="/sygkrisi">Σύγκριση</NavLink>
            {chatOn && <NavLink to="/sizitisi">Συζήτηση</NavLink>}
            <NavLink to="/kanones">Κανόνες</NavLink>
            <NavLink to="/diafaneia">Διαφάνεια</NavLink>
            {session ? (
              <>
                {partyId && <NavLink to="/to-komma-mou">Το κόμμα μου</NavLink>}
                {isAdmin && <NavLink to="/diaxeirisi">Διαχείριση</NavLink>}
                <Link className="btn-outline" to="/logariasmos">{profile?.display_name ?? 'Λογαριασμός'}</Link>
                <button className="link" type="button" onClick={signOut}>Αποσύνδεση</button>
              </>
            ) : <Link className="btn-outline" to="/eisodos">Σύνδεση</Link>}
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/kommata" element={<Catalog />} />
          <Route path="/kommata/:slug" element={<Party />} />
          <Route path="/themata" element={<Topics />} />
          <Route path="/themata/:slug" element={<Topic />} />
          <Route path="/themata/:slug/nea-protasi" element={<NewCitizenProposal />} />
          <Route path="/protasi/:id" element={<Proposal />} />
          <Route path="/protasi-politi/:id" element={<CitizenProposal />} />
          <Route path="/erotima/:id" element={<Question />} />
          <Route path="/sygkrisi" element={<Compare />} />
          <Route path="/sygkrisi-kommaton" element={<CompareParties />} />
          <Route path="/eggrafi" element={<Register />} />
          <Route path="/eisodos" element={<Login />} />
          <Route path="/xechasa-kodiko" element={<Forgot />} />
          <Route path="/neos-kodikos" element={<NewPassword />} />
          <Route path="/to-komma-mou" element={<Manage />} />
          <Route path="/aitisi" element={<Apply />} />
          <Route path="/erotimatologio" element={<Quiz />} />
          <Route path="/sizitisi" element={<RoomsHub />} />
          <Route path="/sizitisi/geniko" element={<ChatPage />} />
          <Route path="/sizitisi/:id" element={<RoomPage />} />
          <Route path="/diaxeirisi" element={<Admin />} />
          <Route path="/logariasmos" element={<Account />} />
          <Route path="/kanones" element={<Rules />} />
          <Route path="/aporrito" element={<Privacy />} />
          <Route path="/diafaneia" element={<Transparency />} />
          <Route path="*" element={<div className="wrap pad"><h1>Η σελίδα δεν βρέθηκε</h1><p><Link to="/">Αρχική</Link></p></div>} />
        </Routes>
      </main>
      <footer className="site">
        <div className="wrap foot">
          <p className="foot-title">Ο δημόσιος διάλογος<br />χρειάζεται χώρο.</p>
          <ul className="foot-links">
            <li><Link to="/kanones">Κανόνες και απόρρητο</Link></li>
            <li><Link to="/diafaneia">Πώς λειτουργεί η προβολή</Link></li>
            <li><Link to="/aporrito">Πολιτική απορρήτου</Link></li>
            {quizOn && <li><Link to="/erotimatologio">Ερωτηματολόγιο προτιμήσεων</Link></li>}
            {appsOn && <li><Link to="/aitisi">Αίτηση συμμετοχής κόμματος</Link></li>}
            {!session && <li><Link to="/eggrafi">Προαιρετικός λογαριασμός</Link></li>}
            {!session && <li><Link to="/eisodos">Είσοδος</Link></li>}
          </ul>
        </div>
        <div className="wrap foot-small foot-bottom">
          <Brand footer />
          <p>Freedom for Democracy · Μη κερδοσκοπική πρωτοβουλία · Χωρίς διαφημίσεις. Καμία πληρωμή δεν επηρεάζει την έκθεση των κομμάτων.</p>
        </div>
      </footer>
    </>
  )
}
