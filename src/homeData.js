// Page through public reads so the dashboard is not limited to PostgREST's row cap.
export async function readPages(fetchPage, size = 200) {
  const rows = []
  for (let start = 0; ; start += size) {
    const page = await fetchPage(start, start + size - 1)
    rows.push(...page)
    if (page.length < size) return rows
  }
}

export function summarizeLandscape(parties, proposals, topics) {
  const visible = parties.filter((p) => p.is_published && !p.is_example && !p.graduated && ['party', 'group'].includes(p.kind))
  const partyIds = new Set(visible.map((p) => p.id))
  const orderedTopics = [...topics].sort((a, b) => a.order - b.order || a.id - b.id)
  const topicIds = new Set(orderedTopics.map((t) => t.id))
  const published = [...new Map(proposals.filter((p) => p.is_published && partyIds.has(p.party_id) && topicIds.has(p.topic_id)).map((p) => [p.id, p])).values()]
  const coverage = new Map(published.map((p) => [`${p.party_id}:${p.topic_id}`, p]))
  return {
    parties: visible,
    proposals: published,
    topics: orderedTopics,
    coverage,
    perTopic: orderedTopics.map((t) => ({ ...t, n: new Set(published.filter((p) => p.topic_id === t.id).map((p) => p.party_id)).size })),
    nParties: visible.filter((p) => p.kind === 'party').length,
    nGroups: visible.filter((p) => p.kind === 'group').length,
    nFull: visible.filter((p) => p.kind === 'party' && p.tier === 'full').length,
    nProgress: visible.filter((p) => p.kind === 'party' && p.tier !== 'full').length,
  }
}

const normalize = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
const missingOpening = /^(?:δεν\s+(?:προσδιοριζ|διευκρινιζ|αναφερ|παρεχ|δινετ|διδετ|οριζ|καθοριζ|καταγραφ|τεκμηριων|δημοσιευ|υπαρχ|περιγραφ|παρατιθ|εχει\s+(?:δημοσιευ|προσδιορισ|παρασχε|τεκμηριωθ|καταγραφ))|μη\s+διαθεσιμ|αγνωστ|χωρις\s+(?:στοιχει|πληροφορι)|not\s+(?:specified|available|provided|published)|no\s+(?:data|information)|unspecified)/u
const limitations = /χωρις\s+(?:συγκεκριμεν|πληρ|αναλυτικ|ημερομην|ποσοτικ)|δεν\s+(?:επαληθευ|καθοριζ|προσδιοριζ|διευκρινιζ|παραθετ)/u

// Describes recorded text, not policy quality, feasibility or independent verification.
// Imported "not specified" sentences must never turn into positive completeness marks.
export function evidenceStatus(value) {
  const text = normalize(value)
  if (!text || /^(?:n\s*\/?\s*a|ν\s*\/?\s*α|[-—–.]+)$/u.test(text)) return 'missing'
  const clauses = text.split(/[.!?;](?:\s+|$)|\n+/u).map((s) => s.trim()).filter(Boolean)
  if (clauses.every((s) => missingOpening.test(s))) return 'missing'
  if (clauses.some((s) => missingOpening.test(s) || limitations.test(s))) return 'partial'
  return 'recorded'
}

export function sourceUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}
