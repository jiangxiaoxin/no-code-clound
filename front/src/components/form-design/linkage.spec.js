import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cloneLinkage,
  compatibleCurrentFields,
  filterLinkageSourceFields,
  hasLinkage,
  isCompleteCondition,
  optionSourceChoices,
  sourceTypesFor,
} from './linkage.js'

test('option source choices: value fields get custom and linkage, select gets three, radio none', () => {
  assert.deepEqual(
    optionSourceChoices('input').map((item) => item.value),
    ['custom', 'linkage'],
  )
  assert.deepEqual(
    optionSourceChoices('select').map((item) => item.value),
    ['dictionary', 'table_data', 'linkage'],
  )
  assert.deepEqual(optionSourceChoices('radio'), [])
})

test('hasLinkage requires source form, trigger field, and at least one complete condition', () => {
  const field = {
    optionSource: 'linkage',
    linkage: {
      sourceFormId: 12,
      match: 'all',
      conditions: [{ key: 'empNo', op: 'eq', valueType: 'field', value: 'empNo' }],
      sourceKey: 'name',
    },
  }
  assert.equal(hasLinkage(field), true)
  assert.equal(hasLinkage({ optionSource: 'custom' }), false)
  assert.equal(
    hasLinkage({
      optionSource: 'linkage',
      linkage: { sourceFormId: 12, sourceKey: 'name', conditions: [] },
    }),
    false,
  )
  assert.equal(
    hasLinkage({
      optionSource: 'linkage',
      linkage: {
        sourceFormId: 12,
        sourceKey: 'name',
        conditions: [{ key: '', op: 'eq', valueType: 'custom', value: 'x' }],
      },
    }),
    false,
  )
})

test('complete condition needs a value unless op is empty/nempty', () => {
  assert.equal(
    isCompleteCondition({ key: 'a', op: 'empty', valueType: 'custom', value: '' }),
    true,
  )
  assert.equal(
    isCompleteCondition({ key: 'a', op: 'eq', valueType: 'field', value: 'b' }),
    true,
  )
  assert.equal(
    isCompleteCondition({ key: 'a', op: 'eq', valueType: 'field', value: '' }),
    false,
  )
  assert.equal(
    isCompleteCondition({ key: 'a', op: 'eq', valueType: 'custom', value: '' }),
    false,
  )
  assert.equal(
    isCompleteCondition({
      key: 'day',
      op: 'between',
      valueType: 'custom',
      value: ['2026-08-01', ''],
    }),
    true,
  )
  assert.equal(
    isCompleteCondition({
      key: 'day',
      op: 'dynamic',
      valueType: 'dynamic',
      value: { start: ['current', 'day'], end: ['current', 'day'] },
    }),
    true,
  )
})

test('cloneLinkage copies match, conditions and trigger key', () => {
  const cloned = cloneLinkage({
    sourceFormId: 3,
    match: 'any',
    sourceKey: 'name',
    conditions: [{ key: 'no', op: 'eq', valueType: 'field', value: 'no' }],
  })
  assert.equal(cloned.sourceFormId, 3)
  assert.equal(cloned.match, 'any')
  assert.equal(cloned.sourceKey, 'name')
  assert.equal(cloned.conditions[0].value, 'no')
  cloned.conditions[0].value = 'other'
  assert.equal(
    cloneLinkage({
      sourceFormId: 3,
      sourceKey: 'name',
      conditions: [{ key: 'no', op: 'eq', valueType: 'field', value: 'no' }],
    }).conditions[0].value,
    'no',
  )
})

test('source type matching follows spec relaxations', () => {
  assert.deepEqual(sourceTypesFor('input'), ['input', 'textarea', 'radio', 'select'])
  assert.deepEqual(sourceTypesFor('textarea'), ['input', 'textarea', 'radio', 'select'])
  assert.deepEqual(sourceTypesFor('select-multiple'), ['select-multiple', 'checkbox'])
  assert.deepEqual(sourceTypesFor('number'), ['number'])
  assert.deepEqual(sourceTypesFor('date'), ['date'])
  const fields = filterLinkageSourceFields(
    [
      { key: 'name', type: 'input', title: '姓名' },
      { key: 'age', type: 'number', title: '年龄' },
      { key: 'city', type: 'select', title: '城市' },
    ],
    'input',
  )
  assert.deepEqual(
    fields.map((item) => item.key),
    ['name', 'city'],
  )
  assert.deepEqual(
    compatibleCurrentFields(
      [
        { key: 'empNo', type: 'input' },
        { key: 'age', type: 'number' },
        { key: 'city', type: 'select' },
      ],
      'input',
    ).map((item) => item.key),
    ['empNo', 'city'],
  )
})
