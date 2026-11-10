import { PERSON_IDENTITIES } from './personPortraitData.js'
import { evidenceStatus } from './homeData.js'
import { lines } from './util.js'

const nameKey = (value) => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/g, 'σ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const includesName = (text, name) => ` ${nameKey(text)} `.includes(` ${nameKey(name)} `)
const historical = (value) => /ιστορικ|δεν πιστοποι|δεν εχει διασταυρωθει|εκλογ.{0,25}2023/.test(nameKey(value))
const simpleName = (value) => {
  const words = value.trim().split(/\s+/)
  return value.length <= 120 && words.length >= 2 && words.length <= 6 && words.every((w) => /^\p{Lu}[\p{L}.’'\-]*$/u.test(w)) && evidenceStatus(value) !== 'missing'
}

// Match reviewed people only within their own party. Descriptive source notes
// are kept as context, not mistaken for extra people or stripped of caveats.
export function buildPartyPeople(party, people) {
  const identities = party.is_example ? [] : PERSON_IDENTITIES.filter((p) => p.partyId === party.id)
  const records = new Map()
  const get = (name, identity) => {
    const key = nameKey(name)
    if (!records.has(key)) records.set(key, { name, roles: new Set(), contexts: new Set(), person: null, portrait: identity?.file ? identity : null, historical: false })
    return records.get(key)
  }
  for (const [field, role] of [['responsible_persons', 'responsible'], ['founders', 'founder']]) {
    for (const raw of lines(party[field])) {
      const matches = identities.filter((p) => [p.name, ...(p.aliases || [])].some((name) => includesName(raw, name)))
      if (matches.length) for (const identity of matches) {
        const entry = get(identity.name, identity)
        entry.roles.add(role)
        if (nameKey(raw) !== nameKey(identity.name)) entry.contexts.add(raw)
        entry.historical ||= historical(raw)
      }
      else if (simpleName(raw)) get(raw).roles.add(role)
    }
  }
  for (const person of people) {
    const identity = identities.find((p) => [p.name, ...(p.aliases || [])].some((name) => nameKey(name) === nameKey(person.name)))
    get(identity?.name || person.name, identity).person = person
  }
  return [...records.values()].map((entry) => ({
    name: entry.name, person: entry.person, portrait: entry.portrait, contexts: [...entry.contexts],
    role: entry.historical ? 'Ιστορική αναφορά στο προφίλ' : entry.roles.has('responsible') && entry.roles.has('founder') ? 'Υπεύθυνο πρόσωπο και ιδρυτής' : entry.roles.has('responsible') ? 'Υπεύθυνο πρόσωπο' : entry.roles.has('founder') ? 'Ιδρυτής' : 'Βιογραφικό',
  }))
}
