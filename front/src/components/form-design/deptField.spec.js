import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DELETED_DEPT_LABEL,
  deptDisplayName,
  deptValueIds,
  flattenDeptNames,
  isDeptField,
} from './deptField.js'

test('isDeptField recognizes single and multiple', () => {
  assert.equal(isDeptField('dept'), true)
  assert.equal(isDeptField({ type: 'dept-multiple' }), true)
  assert.equal(isDeptField('member'), false)
})

test('deptValueIds reads single and multiple', () => {
  assert.deepEqual(deptValueIds('dept', 8), [8])
  assert.deepEqual(deptValueIds('dept', undefined), [])
  assert.deepEqual(deptValueIds('dept-multiple', [1, 1, 2]), [1, 2])
})

test('flattenDeptNames walks tree', () => {
  const names = flattenDeptNames([
    { id: 1, name: '总部', children: [{ id: 2, name: '研发' }] },
  ])
  assert.equal(names[1], '总部')
  assert.equal(names['2'], '研发')
})

test('deptDisplayName falls back to deleted', () => {
  assert.equal(deptDisplayName(3, { 3: '财务' }), '财务')
  assert.equal(deptDisplayName(9, {}), DELETED_DEPT_LABEL)
})
