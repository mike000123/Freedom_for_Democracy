import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeLandscape, evidenceStatus, sourceUrl, readPages } from '../src/homeData.js'

test('public landscape excludes private, example and graduated profiles, including their published proposals', () => {
  const base = { kind: 'party', tier: 'in_progress', is_published: true, is_example: false, graduated: false }
  const parties = [
    { ...base, id: 'a', tier: 'full' }, { ...base, id: 'b' },
    { ...base, id: 'group', kind: 'group' },
    { ...base, id: 'example', is_example: true },
    { ...base, id: 'private', is_published: false },
    { ...base, id: 'graduate', graduated: true },
  ]
  const proposals = [
    { id: '1', party_id: 'a', topic_id: 1, is_published: true },
    { id: '2', party_id: 'b', topic_id: 1, is_published: true },
    { id: '3', party_id: 'group', topic_id: 1, is_published: true },
    { id: '4', party_id: 'a', topic_id: 2, is_published: true },
    { id: 'draft', party_id: 'b', topic_id: 2, is_published: false },
    ...['example', 'private', 'graduate', 'deleted'].map((party_id) => ({ id: party_id, party_id, topic_id: 1, is_published: true })),
    { id: 'missing-topic', party_id: 'a', topic_id: 99, is_published: true },
  ]
  const topics = [{ id: 2, order: 1 }, { id: 1, order: 0 }, { id: 3, order: 2 }]
  const result = summarizeLandscape(parties, [...proposals, proposals[0]], topics)
  assert.equal(result.nParties, 2)
  assert.equal(result.nGroups, 1)
  assert.equal(result.nFull, 1)
  assert.equal(result.nProgress, 1)
  assert.equal(result.proposals.length, 4)
  assert.deepEqual(result.perTopic.map((t) => [t.id, t.n]), [[1, 3], [2, 1], [3, 0]])
  assert.equal(result.coverage.get('a:2').id, '4')
  assert.equal(result.coverage.has('b:2'), false)
  assert.equal(result.coverage.has('private:1'), false)
  assert.equal(parties.length, 6)
  assert.equal(topics[0].id, 2)
})

test('empty and all-draft landscapes have zero counts and keep topics with no recorded position', () => {
  const result = summarizeLandscape([], [{ id: 'draft', is_published: false }], [{ id: 1, order: 0 }])
  assert.equal(result.proposals.length, 0)
  assert.equal(result.parties.length, 0)
  assert.equal(result.perTopic[0].n, 0)
  assert.equal(result.nFull + result.nProgress + result.nGroups, 0)
})

test('placeholder text is absent evidence; partial references remain distinguishable from recorded text', () => {
  for (const text of ['', null, '  ', 'N/A', 'Ν/Α', '—', 'Δεν προσδιορίζεται στην παρατιθέμενη επίσημη πηγή.',
    'Δεν δημοσιεύεται ποσοτική κοστολόγηση ή αναλυτικό χρηματοδοτικό σχέδιο στο παρεχόμενο κείμενο.',
    'Δεν δίνεται συγκεκριμένο χρονοδιάγραμμα στο παρεχόμενο κείμενο.',
    'Δεν ορίζεται ποσοτικός δείκτης αξιολόγησης.', 'Δεν υπάρχουν διαθέσιμες πληροφορίες (N/A).']) {
    assert.equal(evidenceStatus(text), 'missing', text)
  }
  for (const text of ['Αναφέρονται βραχυπρόθεσμος και μεσοπρόθεσμος ορίζοντας, χωρίς συγκεκριμένες ημερομηνίες.',
    'Αναφέρεται εργοδοτική εισφορά. Δεν καθορίζονται ποσοστά εισφορών ή συνολική κοστολόγηση.',
    'Δεν δημοσιεύεται πλήρης κοστολόγηση. Αναφέρονται κονδύλια για τον πρώτο χρόνο.']) {
    assert.equal(evidenceStatus(text), 'partial', text)
  }
  assert.equal(evidenceStatus('Κατώτατος μισθός 1.200 ευρώ μικτά, με στόχο τουλάχιστον 900 ευρώ καθαρά.'), 'recorded')
  assert.equal(evidenceStatus('Υλοποίηση σε τετραετία.'), 'recorded')
})

test('a source mark means an HTTP(S) link exists, never that the linked claims were verified', () => {
  assert.equal(sourceUrl('https://example.org/source'), 'https://example.org/source')
  for (const text of ['', null, 'Δεν προσδιορίζεται', 'javascript:alert(1)', 'data:text/html,test', '/local']) assert.equal(sourceUrl(text), '')
})

test('paged reads include every row, stop after a short page and propagate read failures', async () => {
  const rows = Array.from({ length: 401 }, (_, id) => ({ id }))
  const calls = []
  const actual = await readPages(async (from, to) => { calls.push([from, to]); return rows.slice(from, to + 1) })
  assert.deepEqual(actual, rows)
  assert.deepEqual(calls, [[0, 199], [200, 399], [400, 599]])
  const exact = await readPages(async (from, to) => rows.slice(0, 400).slice(from, to + 1))
  assert.equal(exact.length, 400)
  await assert.rejects(readPages(async () => { throw new Error('read failed') }), /read failed/)
})
