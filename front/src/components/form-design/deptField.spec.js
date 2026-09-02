import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DELETED_DEPT_LABEL,
  allowedDeptIds,
  currentUserDeptId,
  defaultDeptValue,
  deptDisplayName,
  deptValueIds,
  filterDeptTree,
  flattenDeptNames,
  hasCustomDeptScope,
  isDeptField,
  normalizeDeptScope,
  pruneDeptsOutOfScope,
} from './deptField.js'

const tree = [
  {
    id: 1,
    name: '总部',
    children: [
      { id: 2, name: '研发', children: [{ id: 4, name: '前端' }] },
      { id: 3, name: '财务' },
    ],
  },
]

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
  const names = flattenDeptNames(tree)
  assert.equal(names[1], '总部')
  assert.equal(names['4'], '前端')
})

test('deptDisplayName falls back to deleted', () => {
  assert.equal(deptDisplayName(3, { 3: '财务' }), '财务')
  assert.equal(deptDisplayName(9, {}), DELETED_DEPT_LABEL)
})

test('normalizeDeptScope and hasCustomDeptScope', () => {
  assert.equal(normalizeDeptScope('custom'), 'custom')
  assert.equal(normalizeDeptScope('nope'), 'all')
  assert.equal(hasCustomDeptScope({ deptScopeConfig: { departmentIds: [1] } }), true)
  assert.equal(hasCustomDeptScope({ deptScopeConfig: { departmentIds: [] } }), false)
})

test('custom scope includes descendants; empty custom has none', () => {
  const field = {
    deptScope: 'custom',
    deptScopeConfig: { departmentIds: [2] },
  }
  assert.deepEqual([...allowedDeptIds(field, tree)].sort((a, b) => a - b), [2, 4])
  assert.equal(
    allowedDeptIds({ deptScope: 'custom', deptScopeConfig: { departmentIds: [] } }, tree)
      .size,
    0,
  )
  assert.deepEqual(
    [...allowedDeptIds({ deptScope: 'all' }, tree)].sort((a, b) => a - b),
    [1, 2, 3, 4],
  )
})

test('filterDeptTree promotes allowed children when parent is out of scope', () => {
  const filtered = filterDeptTree(tree, new Set([2, 4]))
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, 2)
  assert.equal(filtered[0].children[0].id, 4)
})

test('currentUserDeptId uses first positive id', () => {
  assert.equal(currentUserDeptId({ departmentIds: [10, 20] }), 10)
  assert.equal(currentUserDeptId({ departmentIds: [] }), undefined)
  assert.equal(currentUserDeptId(null), undefined)
})

test('defaultDeptValue only when current_user_dept and in scope', () => {
  const user = { departmentIds: [2] }
  assert.equal(
    defaultDeptValue({ type: 'dept', optionSource: 'custom' }, user, tree),
    undefined,
  )
  assert.equal(
    defaultDeptValue(
      { type: 'dept', optionSource: 'current_user_dept', deptScope: 'all' },
      user,
      tree,
    ),
    2,
  )
  assert.deepEqual(
    defaultDeptValue(
      { type: 'dept-multiple', optionSource: 'current_user_dept', deptScope: 'all' },
      user,
      tree,
    ),
    [2],
  )
  assert.equal(
    defaultDeptValue(
      {
        type: 'dept',
        optionSource: 'current_user_dept',
        deptScope: 'custom',
        deptScopeConfig: { departmentIds: [3] },
      },
      user,
      tree,
    ),
    undefined,
  )
})

test('pruneDeptsOutOfScope', () => {
  const allowed = new Set([2, 4])
  assert.equal(pruneDeptsOutOfScope('dept', 3, allowed), undefined)
  assert.equal(pruneDeptsOutOfScope('dept', 2, allowed), 2)
  assert.deepEqual(pruneDeptsOutOfScope('dept-multiple', [2, 3, 4], allowed), [2, 4])
})
