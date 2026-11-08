import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { findPartyLogo } from '../src/partyLogos.js'
import { PARTY_LOGOS } from '../src/partyLogoData.js'

test('known names, Greek case and documented aliases identify their own logo', () => {
  for (const logo of PARTY_LOGOS) {
    for (const name of logo.aliases) {
      assert.equal(findPartyLogo({ name, kind: 'party' })?.file, logo.file, name)
      assert.equal(findPartyLogo({ name: name.toLocaleUpperCase('el') })?.file, logo.file, name)
    }
  }
})

test('the two KKE variants remain separate despite punctuation normalization', () => {
  assert.match(findPartyLogo({ name: 'ΚΚΕ (μ-λ)' }).file, /^kke-ml-/)
  assert.match(findPartyLogo({ name: 'Μ-Λ ΚΚΕ' }).file, /^m-l-kke-/)
})

test('only exact known hosts identify renamed parties', () => {
  assert.match(findPartyLogo({ name: 'Προσαρμοσμένο όνομα', website: 'https://www.oakke.gr/path?q=1' }).file, /^oakke-/)
  assert.equal(findPartyLogo({ name: 'Άγνωστο', website: 'https://fonilogikis.gr.example.org/' }), null)
})

test('unknown, conflicting, example and group identities do not borrow logos', () => {
  assert.equal(findPartyLogo(null), null)
  assert.equal(findPartyLogo({ name: 'Άγνωστο κόμμα', slug: 'antarsya' }), null)
  assert.equal(findPartyLogo({ name: 'ΑΝΤΑΡΣΥΑ', is_example: true }), null)
  assert.equal(findPartyLogo({ name: 'ΑΝΤΑΡΣΥΑ', kind: 'group' }), null)
  assert.equal(findPartyLogo({ name: 'Φωνή Λογικής', website: 'https://www.oakke.gr/' }), null)
})

test('bundled files retain the reviewed original bytes and published source references', () => {
  const root = new URL('../public/party-logos/', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('sources.json', root), 'utf8'))
  for (const logo of PARTY_LOGOS) {
    const source = manifest.logos.find((entry) => entry.file === logo.file)
    assert.ok(source, logo.name)
    assert.match(source.source, /^https:\/\//)
    assert.equal(source.unchanged_original, true)
    assert.equal(createHash('sha256').update(readFileSync(new URL(logo.file, root))).digest('hex'), source.sha256)
  }
})
