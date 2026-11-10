import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPartyTopics, groupPartyProposals, partyTopicIcon, partyTopicPage } from '../src/partyProfileData.js'

const topics = [{ id: 2, name: 'Υγεία', slug: 'ygeia', order: 1 }, { id: 1, name: 'Φορολογία', slug: 'forologia', order: 0 }, { id: 3, name: 'Παιδεία', slug: 'paideia', order: 2 }]
const proposals = [{ id: 'a', topic_id: 2, title: 'Πρωτοβάθμια φροντίδα', is_published: true }, { id: 'b', topic_id: 2, title: 'Στελέχωση νοσοκομείων', is_published: true }, { id: 'c', topic_id: 1, title: 'Αφορολόγητο', action: 'Αύξηση ορίου', is_published: true }, { id: 'draft', topic_id: 3, title: 'Μη δημοσιευμένη', is_published: false }]

test('grouping preserves every published proposal, includes empty themes, excludes drafts and avoids duplicate counts', () => {
  const groups = groupPartyProposals(topics, [...proposals, proposals[0]])
  assert.deepEqual(groups.map((g) => [g.id, g.proposals.map((p) => p.id)]), [[1, ['c']], [2, ['a', 'b']], [3, []]])
  assert.equal(topics[0].id, 2)
  assert.equal(proposals.length, 4)
})

test('joined topic metadata and missing topic data keep published proposals accessible', () => {
  const groups = groupPartyProposals(topics, [{ id: 'old', topic: { name: 'Υγεία', slug: 'ygeia', order: 1 } }, { id: 'orphan', topic: null }])
  assert.equal(groups.find((g) => g.id === 2).proposals[0].id, 'old')
  assert.equal(groups.at(-1).name, 'Άλλο θέμα')
  assert.equal(groups.at(-1).proposals[0].id, 'orphan')
})

test('Greek search covers topic names, proposal titles and actions while retaining all choices in a matching theme', () => {
  const groups = groupPartyProposals(topics, proposals)
  assert.deepEqual(filterPartyTopics(groups, 'ΠΡΩΤΟΒΑΘΜΙΑ').map((g) => g.proposals.length), [2])
  assert.deepEqual(filterPartyTopics(groups, 'ΑΥΞΗΣΗ').map((g) => g.id), [1])
  assert.deepEqual(filterPartyTopics(groups, '', 'empty').map((g) => g.id), [3])
  assert.deepEqual(filterPartyTopics(groups, '', 'published').map((g) => g.id), [1, 2])
  assert.deepEqual(filterPartyTopics(groups, 'ανύπαρκτο'), [])
})

test('eight topics per page cover all sixteen topics, including zero-proposal topics', () => {
  const groups = groupPartyProposals(Array.from({ length: 16 }, (_, i) => ({ id: i, name: `Θέμα ${i}`, order: i })), [])
  assert.deepEqual([1, 2].flatMap((page) => partyTopicPage(groups, page).items), groups)
  assert.deepEqual([1, 2, 3, 4].flatMap((page) => partyTopicPage(groups, page, 4).items), groups)
  assert.equal(partyTopicPage(groups, 99).page, 2)
  assert.deepEqual(partyTopicPage([], 9), { page: 1, pages: 1, items: [], first: 0, last: 0 })
})

test('topic icons match the topic, normalize Greek spelling and have a neutral fallback', () => {
  assert.equal(partyTopicIcon({ name: 'ΦΟΡΟΛΟΓΙΑ' }), 'tax')
  assert.equal(partyTopicIcon({ name: 'Υγεία' }), 'health')
  assert.equal(partyTopicIcon({ name: 'Στέγαση' }), 'house')
  assert.equal(partyTopicIcon({ name: 'Άγνωστο θέμα' }), 'layers')
})
