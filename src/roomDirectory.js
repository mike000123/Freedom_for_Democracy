const normalize = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/g, 'σ')

// Use the room's explicit topic first. Older user groups have no topic field;
// organize those by their title, then description, without changing stored data.
export const ROOM_CATEGORIES = [
  { id: 'all', label: 'Όλα τα θέματα', icon: 'layers' },
  { id: 'education', label: 'Παιδεία', icon: 'education', topics: ['Παιδεία'], words: /παιδει|εκπαιδευ|σχολει|πανεπιστημ|φοιτητ|σπουδ|μαθητ/ },
  { id: 'economy', label: 'Οικονομία', icon: 'economy', topics: ['Φορολογία', 'Αγορά εργασίας', 'Αγροτική πολιτική', 'Ανάπτυξη και επενδύσεις', 'Τουρισμός'], words: /οικονομ|χρεοσ|φορολ|εργασ|ανεργ|μισθ|συνταξ|ακριβεια|επενδ|αγροτ|τουρισ/ },
  { id: 'institutions', label: 'Θεσμοί', icon: 'institutions', topics: ['Θεσμοί', 'Εκλογικό σύστημα', 'Ευρώπη', 'Πολιτική προστασία και ασφάλεια'], words: /θεσμ|δημοκρατ|εκλογ|διαφθορ|σκανδαλ|δικαιοσ|λογοδοσ|κομμα|διαφανει|συνταγμ/ },
  { id: 'society', label: 'Κοινωνία', icon: 'people', topics: ['Μετανάστευση', 'Στέγαση', 'Αθλητισμός'], words: /κοινων|δημογραφ|οικογεν|στεγασ|ενοικ|μεταναστ|προσφυγ|δικαιωμα|ισοτητ|αθλητ|νεολαι/ },
  { id: 'health', label: 'Υγεία', icon: 'health', topics: ['Υγεία'], words: /υγεια|υγειασ|υγειο|νοσοκομ|γιατρ|ιατρ|περιθαλψ|προνοια|ψυχικ/ },
  { id: 'environment', label: 'Περιβάλλον', icon: 'environment', topics: ['Ενέργεια και περιβάλλον', 'Υποδομές και μεταφορές'], words: /περιβαλλον|κλιμα|ενεργεια|ανακυκλ|μεταφορ|συγκοινων|υποδομ|πολη|πολεισ|δημοσιοσ χωροσ/ },
  { id: 'other', label: 'Άλλα θέματα', icon: 'more' },
]

export function roomCategory(room, topics = {}) {
  const topic = normalize(topics[room.topic_id])
  const explicit = ROOM_CATEGORIES.find((c) => c.topics?.some((name) => normalize(name) === topic))
  if (explicit) return explicit
  for (const text of [room.name, room.description]) {
    const match = ROOM_CATEGORIES.find((c) => c.words?.test(normalize(text)))
    if (match) return match
  }
  return ROOM_CATEGORIES.find((c) => c.id === 'other')
}

// Private groups belong only in an authenticated member's personal view.
// The database still enforces access; these checks also prevent stale UI data.
export function directoryRooms(rooms, { signedIn = false, groupsOn = false, view = 'explore' } = {}) {
  return rooms.filter((r) => {
    if (r.archived) return false
    if (view === 'mine') return signedIn && groupsOn && r.kind === 'group' && r.is_member === true
    return r.kind === 'official' || (groupsOn && r.kind === 'group' && r.visibility === 'public')
  })
}

export function filterRooms(rooms, topics, { category = 'all', query = '', type = 'all' } = {}) {
  const search = normalize(query).trim()
  return rooms.filter((r) =>
    (category === 'all' || roomCategory(r, topics).id === category) &&
    (!search || normalize(`${r.name} ${r.description || ''}`).includes(search)) &&
    (type === 'all' || r.kind === type || r.visibility === type))
}

export function paginateRooms(rooms, requestedPage = 1, pageSize = 6) {
  const pages = Math.max(1, Math.ceil(rooms.length / pageSize))
  const page = Math.max(1, Math.min(pages, requestedPage))
  const start = (page - 1) * pageSize
  return { page, pages, items: rooms.slice(start, start + pageSize), first: rooms.length ? start + 1 : 0, last: Math.min(start + pageSize, rooms.length) }
}
