const normalize = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/g, 'σ')
const iconNames = [
  ['Φορολογία', 'tax'], ['Υγεία', 'health'], ['Παιδεία', 'education'], ['Αγορά εργασίας', 'work'],
  ['Μετανάστευση', 'globe'], ['Ενέργεια και περιβάλλον', 'environment'], ['Στέγαση', 'house'], ['Θεσμοί', 'institutions'],
  ['Εκλογικό σύστημα', 'ballot'], ['Ευρώπη', 'globe'], ['Αγροτική πολιτική', 'agriculture'], ['Ανάπτυξη και επενδύσεις', 'economy'],
  ['Πολιτική προστασία και ασφάλεια', 'shield'], ['Τουρισμός', 'sun'], ['Υποδομές και μεταφορές', 'transport'], ['Αθλητισμός', 'sport'],
]
const icons = new Map(iconNames.map(([name, icon]) => [normalize(name), icon]))
export const partyTopicIcon = (topic) => icons.get(normalize(topic.name)) || 'layers'

const topicKey = (topic) => String(topic.id ?? topic.slug ?? 'other')

export function groupPartyProposals(topics, proposals) {
  const groups = new Map(topics.map((t) => [topicKey(t), { ...t, proposals: [] }]))
  const seen = new Set()
  for (const p of proposals) {
    if (p.is_published === false || seen.has(p.id)) continue
    seen.add(p.id)
    const topic = topics.find((t) => String(t.id) === String(p.topic_id) || (p.topic?.slug && t.slug === p.topic.slug)) || p.topic || { id: 'other', name: 'Άλλο θέμα', slug: '', order: Infinity }
    const key = topicKey(topic)
    if (!groups.has(key)) groups.set(key, { ...topic, proposals: [] })
    groups.get(key).proposals.push(p)
  }
  return [...groups.values()].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name, 'el'))
}

export function filterPartyTopics(groups, query = '', status = 'all') {
  const search = normalize(query).trim()
  return groups.filter((g) =>
    (status !== 'published' || g.proposals.length > 0) &&
    (status !== 'empty' || g.proposals.length === 0) &&
    (!search || normalize(g.name).includes(search) || g.proposals.some((p) => normalize(`${p.title} ${p.action || ''}`).includes(search))))
}

export function partyTopicPage(groups, requestedPage = 1, pageSize = 8) {
  const pages = Math.max(1, Math.ceil(groups.length / pageSize))
  const page = Math.max(1, Math.min(pages, requestedPage))
  const offset = (page - 1) * pageSize
  return { page, pages, items: groups.slice(offset, offset + pageSize), first: groups.length ? offset + 1 : 0, last: Math.min(offset + pageSize, groups.length) }
}
