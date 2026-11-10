import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { buildPartyPeople } from '../src/personPortraits.js'
import { PERSON_IDENTITIES } from '../src/personPortraitData.js'

const identity = PERSON_IDENTITIES.find(p => p.name === 'Αλέξης Τσίπρας')
const party = { id: identity.partyId, founders: '', responsible_persons: '' }

test('merges a reviewed name and annotated references, retaining biography and context', () => {
  const context = 'Αλέξης Τσίπρας — ιστορική αναφορά, δεν πιστοποιεί σημερινή ιδιότητα'
  const bio = { name: 'Αλέξης Τσίπρας', education: 'Σπουδές' }
  const rows = buildPartyPeople({ ...party, founders: context, responsible_persons: 'Αλέξης Τσίπρας' }, [bio])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].portrait.file, identity.file)
  assert.equal(rows[0].person, bio)
  assert.deepEqual(rows[0].contexts, [context])
  assert.equal(rows[0].role, 'Ιστορική αναφορά στο προφίλ')
})

test('photos are scoped to the reviewed party and never borrowed by examples', () => {
  for (const overrides of [{ id: 'another-party' }, { is_example: true }]) {
    const [row] = buildPartyPeople({ ...party, responsible_persons: identity.name, ...overrides }, [])
    assert.equal(row.name, identity.name)
    assert.equal(row.portrait, null)
  }
})

test('a coalition paragraph creates separate people and preserves its historical caveat', () => {
  const ids = PERSON_IDENTITIES.filter(p => p.partyId === 'cc2fd7fa-dbd8-46f7-b9b7-bacc30d3589b')
  const context = ids.map(p => p.name).join(' και ') + ' — ιστορική αναφορά στις εκλογές του 2023'
  const rows = buildPartyPeople({ id: ids[0].partyId, founders: context }, [])
  assert.deepEqual(rows.map(p => p.name), ids.map(p => p.name))
  assert.ok(rows.every(p => p.contexts[0] === context && p.role === 'Ιστορική αναφορά στο προφίλ'))
})

test('organization descriptions do not become people; unknown names and biographies remain', () => {
  const description = 'Το κόμμα ιδρύθηκε από συλλογική πρωτοβουλία πολιτών και όχι από ένα πρόσωπο.'
  const input = { id: 'unknown', founders: description, responsible_persons: 'Νίκος Δοκιμαστικός' }
  const bio = { name: 'Άννα Νέα', motivation: 'Κείμενο' }
  const rows = buildPartyPeople(input, [bio])
  assert.equal(input.founders, description)
  assert.deepEqual(rows.map(p => p.name), ['Νίκος Δοκιμαστικός', 'Άννα Νέα'])
  assert.ok(rows.every(p => p.portrait === null))
  assert.equal(rows[1].person, bio)
})

test('each bundled portrait has a traceable source and matches its recorded original hash', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/person-portraits/sources.json', import.meta.url)))
  for (const record of PERSON_IDENTITIES.filter(p => p.file)) {
    const source = manifest.portraits.find(p => p.file === record.file)
    assert.equal(source.name, record.name)
    assert.equal(source.sourceUrl, record.sourceUrl)
    assert.ok(source.sourceUrl.startsWith('https://'))
    const bytes = readFileSync(new URL('../public/person-portraits/' + record.file, import.meta.url))
    assert.equal(bytes.length, source.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256)
  }
})
