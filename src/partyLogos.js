import { PARTY_LOGOS } from './partyLogoData.js'

// Ignore spelling accents and punctuation, but require a whole known name.
// In particular, ΚΚΕ(μ-λ) and Μ-Λ ΚΚΕ keep their different letter order.
const identity = (value) => String(value || '').normalize('NFKD')
  .replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/g, 'σ')
  .replace(/[^\p{L}\p{N}]/gu, '')

const logos = PARTY_LOGOS.map((logo) => ({
  ...logo,
  names: new Set(logo.aliases.map(identity)),
}))

export function findPartyLogo(party) {
  if (!party || party.is_example || (party.kind && party.kind !== 'party')) return null
  let host = ''
  try { host = new URL(party.website).hostname.toLowerCase().replace(/^www\./, '') } catch { /* A name can still identify the party. */ }
  const name = identity(party.name)
  const matches = logos.filter((logo) => logo.names.has(name) || (host && logo.hosts.includes(host)))
  // A conflicting name and website must not silently select another party's logo.
  return matches.length === 1 ? matches[0] : null
}
