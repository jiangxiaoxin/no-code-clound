import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_SERIAL_SEPARATOR,
  canAddSerialCounter,
  countSerialCounters,
  createDefaultSerialField,
  hasSerialNumberField,
  isSerialField,
  newSerialSegment,
  serialRefFields,
  serialSeparatorOf,
  reorderSerialRule,
} from './serialField.js'

test('default field is date plus one counter', () => {
  const field = createDefaultSerialField('sn1')
  assert.equal(field.type, 'serialNumber')
  assert.equal(field.placeholder, '保存后自动生成')
  assert.equal(field.serialSeparator, DEFAULT_SERIAL_SEPARATOR)
  assert.equal(field.serialRule.length, 2)
  assert.equal(field.serialRule[0].kind, 'datetime')
  assert.equal(field.serialRule[0].format, 'YYYYMMDD')
  assert.equal(field.serialRule[1].kind, 'counter')
  assert.equal(field.serialRule[1].start, 1)
  assert.equal(field.serialRule[1].digits, 5)
  assert.equal(field.serialRule[1].reset, false)
  assert.equal(isSerialField(field), true)
})

test('hasSerialNumberField sees tabs inner field', () => {
  assert.equal(hasSerialNumberField([{ type: 'input', key: 'a' }]), false)
  assert.equal(
    hasSerialNumberField([
      {
        type: 'tabs',
        key: 't',
        panes: [{ id: 'p1', fields: [createDefaultSerialField('sn1')] }],
      },
    ]),
    true,
  )
})

test('counter at most one', () => {
  const field = createDefaultSerialField('sn1')
  assert.equal(canAddSerialCounter(field.serialRule), false)
  assert.equal(countSerialCounters([{ kind: 'fixed', text: 'A' }]), 0)
  assert.equal(canAddSerialCounter([{ kind: 'fixed', text: 'A' }]), true)
})

test('serialRefFields only input and number on flattened main form', () => {
  const fields = [
    { key: 'name', type: 'input', title: '姓名' },
    { key: 'age', type: 'number', title: '年龄' },
    { key: 'when', type: 'date', title: '日期' },
    createDefaultSerialField('sn1'),
    {
      type: 'tabs',
      key: 't',
      panes: [{ id: 'p1', fields: [{ key: 'code', type: 'input', title: '编号' }] }],
    },
  ]
  const refs = serialRefFields(fields, 'sn1')
  assert.deepEqual(
    refs.map((item) => item.key),
    ['name', 'age', 'code'],
  )
})

test('separator trims; empty means none', () => {
  assert.equal(serialSeparatorOf({ serialSeparator: ' - ' }), '-')
  assert.equal(serialSeparatorOf({ serialSeparator: '   ' }), '')
  assert.equal(serialSeparatorOf({}), DEFAULT_SERIAL_SEPARATOR)
})

test('reorderSerialRule moves by id', () => {
  const rule = [
    { id: 'a', kind: 'fixed', text: 'A' },
    { id: 'b', kind: 'fixed', text: 'B' },
  ]
  reorderSerialRule(rule, 'b', 'a')
  assert.equal(rule[0].id, 'b')
})

test('newSerialSegment builds each kind', () => {
  assert.equal(newSerialSegment('fixed').kind, 'fixed')
  assert.equal(newSerialSegment('datetime').format, 'YYYYMMDD')
  assert.equal(newSerialSegment('counter').digits, 5)
  assert.equal(newSerialSegment('field').fieldKey, '')
})
