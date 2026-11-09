import { test } from 'node:test'
import assert from 'node:assert/strict'
import { directoryRooms, filterRooms, paginateRooms, roomCategory } from '../src/roomDirectory.js'

const rooms = [
  { id: 'official', kind: 'official', name: 'Δημόσια παιδεία', topic_id: 1, visibility: 'public' },
  { id: 'public', kind: 'group', name: 'Το χρέος της Ελλάδας', visibility: 'public' },
  { id: 'joined-public', kind: 'group', name: 'Δημογραφικό', visibility: 'public', is_member: true },
  { id: 'joined-private', kind: 'group', name: 'Προσωπική ομάδα', visibility: 'private', is_member: true },
  { id: 'other-private', kind: 'group', name: 'Ιδιωτική ομάδα άλλου', visibility: 'private', is_member: false },
  { id: 'archived', kind: 'group', name: 'Αρχειοθετημένη', visibility: 'public', archived: true },
]
const ids = (rows) => rows.map((r) => r.id)

test('exploration excludes private groups, including joined private groups, for every viewer', () => {
  for (const signedIn of [false, true]) {
    assert.deepEqual(ids(directoryRooms(rooms, { signedIn, groupsOn: true })), ['official', 'public', 'joined-public'])
  }
  assert.deepEqual(ids(directoryRooms(rooms, { groupsOn: false })), ['official'])
})

test('personal groups require a signed in viewer and enabled groups; only memberships are included', () => {
  assert.deepEqual(directoryRooms(rooms, { view: 'mine', groupsOn: true }), [])
  assert.deepEqual(directoryRooms(rooms, { view: 'mine', signedIn: true, groupsOn: false }), [])
  assert.deepEqual(ids(directoryRooms(rooms, { view: 'mine', signedIn: true, groupsOn: true })), ['joined-public', 'joined-private'])
})

test('explicit topics take priority; older groups are organized by title then description', () => {
  assert.equal(roomCategory({ name: 'Το κόστος της υγείας', topic_id: 5 }, { 5: 'Υγεία' }).id, 'health')
  assert.equal(roomCategory({ name: 'ΠΑΙΔΕΙΑ και μέλλον των νέων' }).id, 'education')
  assert.equal(roomCategory({ name: 'Το χρέος της Ελλάδας' }).id, 'economy')
  assert.equal(roomCategory({ name: 'Σκάνδαλα και διαφθορά' }).id, 'institutions')
  assert.equal(roomCategory({ name: 'Δημογραφικό' }).id, 'society')
  assert.equal(roomCategory({ name: 'Μια συζήτηση', description: 'Ιδέες για το περιβάλλον' }).id, 'environment')
  assert.equal(roomCategory({ name: 'Γενική κουβέντα' }).id, 'other')
})

test('search ignores Greek accents and case, combines filters and preserves the provided order', () => {
  const visible = directoryRooms(rooms, { groupsOn: true })
  assert.deepEqual(ids(filterRooms(visible, {}, { query: 'ΧΡΕΟΣ' })), ['public'])
  assert.deepEqual(ids(filterRooms(visible, { 1: 'Παιδεία' }, { category: 'education', type: 'official' })), ['official'])
  assert.deepEqual(filterRooms(visible, {}, { query: 'ανύπαρκτο' }), [])
  assert.deepEqual(ids(filterRooms(visible, {}, { type: 'group' })), ['public', 'joined-public'])
  assert.deepEqual(ids(visible), ['official', 'public', 'joined-public'])
})

test('six cards per page reach every room once, and filters can clamp a stale page safely', () => {
  const rows = Array.from({ length: 18 }, (_, id) => ({ id }))
  const pages = [1, 2, 3].map((p) => paginateRooms(rows, p))
  assert.deepEqual(pages.flatMap((p) => p.items), rows)
  assert.deepEqual(pages.map((p) => [p.first, p.last, p.pages]), [[1, 6, 3], [7, 12, 3], [13, 18, 3]])
  assert.equal(paginateRooms(rows.slice(0, 2), 3).page, 1)
  assert.deepEqual(paginateRooms([], 99), { page: 1, pages: 1, items: [], first: 0, last: 0 })
})
