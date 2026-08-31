import assert from 'node:assert/strict'
import { test } from 'node:test'
import { optionFieldLoadKey } from './tableOptions.js'

const tableSelect = {
  sourceFormId: 23,
  sourceFieldKey: 'unit',
  optionFilters: { match: 'all', conditions: [] },
}

test('optionFieldLoadKey ignores the select own value when it is not a filter', () => {
  const before = optionFieldLoadKey(tableSelect, { unit: '吨', name: '螺丝' })
  const after = optionFieldLoadKey(tableSelect, { unit: '台', name: '螺丝' })
  assert.equal(before, after)
})

test('optionFieldLoadKey changes when a field used in optionFilters changes', () => {
  const field = {
    ...tableSelect,
    optionFilters: {
      match: 'all',
      conditions: [{ key: 'name', op: 'eq', valueType: 'field', value: 'name' }],
    },
  }
  const before = optionFieldLoadKey(field, { unit: '吨', name: '螺丝' })
  const after = optionFieldLoadKey(field, { unit: '吨', name: '垫片' })
  assert.notEqual(before, after)
})
