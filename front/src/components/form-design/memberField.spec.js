import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  candidateUsers,
  createDefaultMemberField,
  deptFieldsForMemberScope,
  isMemberField,
  memberValueIds,
  normalizeMemberScope,
  positiveIntIds,
  pruneMembersOutOfScope,
} from './memberField.js'

test('default field is all + custom optionSource', () => {
  const single = createDefaultMemberField('m1', 'member')
  assert.equal(single.type, 'member')
  assert.equal(single.key, 'm1')
  assert.equal(single.memberScope, 'all')
  assert.equal(single.optionSource, 'custom')
  const multi = createDefaultMemberField('m2', 'member-multiple')
  assert.equal(multi.type, 'member-multiple')
})

test('isMemberField', () => {
  assert.equal(isMemberField('member'), true)
  assert.equal(isMemberField({ type: 'member-multiple' }), true)
  assert.equal(isMemberField('dept'), false)
})

test('normalizeMemberScope falls back to all', () => {
  assert.equal(normalizeMemberScope('custom'), 'custom')
  assert.equal(normalizeMemberScope('dept_field'), 'dept_field')
  assert.equal(normalizeMemberScope('nope'), 'all')
  assert.equal(normalizeMemberScope(''), 'all')
})

test('positiveIntIds de-dupes and keeps order', () => {
  assert.deepEqual(positiveIntIds([2, 0, 2, -1, 3, 'x']), [2, 3])
})

test('memberValueIds reads single and multiple', () => {
  assert.deepEqual(memberValueIds('member', 8), [8])
  assert.deepEqual(memberValueIds('member', undefined), [])
  assert.deepEqual(memberValueIds('member-multiple', [1, 1, 2]), [1, 2])
})

test('deptFieldsForMemberScope only type dept after flatten', () => {
  const fields = [
    { key: 'd1', type: 'dept', title: '部门' },
    { key: 'm1', type: 'member' },
    {
      type: 'tabs',
      panes: [{ id: 'p1', fields: [{ key: 'd2', type: 'dept', title: '页内部' }] }],
    },
  ]
  assert.deepEqual(
    deptFieldsForMemberScope(fields).map((item) => item.key),
    ['d1', 'd2'],
  )
})

test('candidateUsers all / custom union / empty custom / dept_field', () => {
  const users = [
    { id: 1, displayName: '甲', departmentId: 10, roleIds: [100], status: 'active' },
    { id: 2, displayName: '乙', departmentId: 11, roleIds: [], status: 'active' },
    { id: 3, displayName: '丙', departmentId: null, roleIds: [100], status: 'active' },
    { id: 4, displayName: '丁', departmentId: 10, roleIds: [], status: 'disabled' },
  ]
  const departments = [
    {
      id: 10,
      name: '研发',
      parentId: null,
      status: 'active',
      children: [
        { id: 11, name: '前端', parentId: 10, status: 'active', children: [] },
      ],
    },
  ]
  const all = candidateUsers({ memberScope: 'all' }, users, departments, {})
  assert.deepEqual(all.map((u) => u.id), [1, 2, 3])
  const custom = candidateUsers(
    {
      memberScope: 'custom',
      memberScopeConfig: { departmentIds: [11], roleIds: [100], userIds: [] },
    },
    users,
    departments,
    {},
  )
  assert.deepEqual(custom.map((u) => u.id).sort(), [1, 2, 3])
  const empty = candidateUsers(
    {
      memberScope: 'custom',
      memberScopeConfig: { departmentIds: [], roleIds: [], userIds: [] },
    },
    users,
    departments,
    {},
  )
  assert.deepEqual(empty, [])
  const byDept = candidateUsers(
    { memberScope: 'dept_field', sourceDeptFieldKey: 'dept1' },
    users,
    departments,
    { dept1: 10 },
  )
  assert.deepEqual(byDept.map((u) => u.id), [1, 2])
  const noDept = candidateUsers(
    { memberScope: 'dept_field', sourceDeptFieldKey: 'dept1' },
    users,
    departments,
    {},
  )
  assert.deepEqual(noDept, [])
})

test('pruneMembersOutOfScope clears single and filters multiple', () => {
  const allowed = new Set([1, 2])
  assert.equal(pruneMembersOutOfScope('member', 3, allowed), undefined)
  assert.equal(pruneMembersOutOfScope('member', 1, allowed), 1)
  assert.deepEqual(
    pruneMembersOutOfScope('member-multiple', [1, 3, 2], allowed),
    [1, 2],
  )
})
