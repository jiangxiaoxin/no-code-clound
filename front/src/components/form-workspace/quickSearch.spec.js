import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildQuickSearchQuery,
  isQuickSearchField,
  normalizeQuickSearchPrefs,
} from './quickSearch.js'

test('only text number select radio checkbox join quick search', () => {
  assert.equal(isQuickSearchField({ key: 'a', type: 'input' }), true)
  assert.equal(isQuickSearchField({ key: 'a', type: 'date' }), false)
  assert.equal(isQuickSearchField({ key: 'a', type: 'data' }), false)
  assert.equal(isQuickSearchField({ type: 'input' }), false)
})

test('empty keyword yields no query', () => {
  assert.equal(
    buildQuickSearchQuery([{ key: 'name', type: 'input' }], '  '),
    null,
  )
})

test('default search uses contains across fields with match any', () => {
  assert.deepEqual(
    buildQuickSearchQuery(
      [
        { key: 'name', type: 'input' },
        { key: 'age', type: 'number' },
        { key: 'when', type: 'date' },
      ],
      '18',
    ),
    {
      match: 'any',
      filters: [
        { key: 'name', op: 'contains', value: '18' },
        { key: 'age', op: 'contains', value: '18' },
      ],
    },
  )
})

test('dict option fields match label via in', () => {
  assert.deepEqual(
    buildQuickSearchQuery(
      [{ key: 'status', type: 'radio', dictCode: 'st' }],
      '启',
      { st: [{ label: '启用', value: '1' }, { label: '停用', value: '2' }] },
    ),
    {
      match: 'any',
      filters: [{ key: 'status', op: 'in', value: ['1'] }],
    },
  )
})

test('quick search prefs drop missing fields and keep specific mode', () => {
  assert.deepEqual(
    normalizeQuickSearchPrefs(
      { mode: 'specific', selectedKeys: ['name', 'gone', 'name', 1] },
      [
        { key: 'name', type: 'input' },
        { key: 'when', type: 'date' },
      ],
    ),
    { mode: 'specific', selectedKeys: ['name'] },
  )
})
