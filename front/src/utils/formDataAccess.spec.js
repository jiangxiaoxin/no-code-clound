import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeFormViewers, normalizeRowScope } from './formDataAccess.js'

test('缺省数据范围是与自己相关', () => {
  assert.equal(normalizeRowScope(undefined), 'related')
  assert.equal(normalizeRowScope('oops'), 'related')
})

test('名单去重并丢掉非法项', () => {
  const rows = normalizeFormViewers([
    { type: 'department', targetId: 3, label: '研发部' },
    { type: 'department', targetId: 3, label: '研发部' },
    { type: 'group', targetId: 1 },
    { type: 'role', targetId: 8, label: '人事专员' },
  ])
  assert.deepEqual(
    rows.map((row) => `${row.type}:${row.targetId}`),
    ['department:3', 'role:8'],
  )
})
