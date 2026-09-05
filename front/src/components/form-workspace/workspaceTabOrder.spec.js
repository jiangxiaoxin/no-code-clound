import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_WORKSPACE_TAB_ORDER,
  normalizeWorkspaceTabOrder,
  readWorkspaceTabOrder,
  workspaceTabOrderFromMode,
  workspaceTabOrderStorageKey,
  workspaceTabOrderToMode,
  writeWorkspaceTabOrder,
} from './workspaceTabOrder.js'

test('缺省顺序是添加数据在前', () => {
  assert.deepEqual(DEFAULT_WORKSPACE_TAB_ORDER, ['create', 'list'])
  assert.deepEqual(normalizeWorkspaceTabOrder(undefined), ['create', 'list'])
  assert.deepEqual(normalizeWorkspaceTabOrder(['list']), ['list', 'create'])
  assert.deepEqual(normalizeWorkspaceTabOrder(['list', 'create', 'list']), [
    'list',
    'create',
  ])
})

test('模式和数组互转', () => {
  assert.equal(workspaceTabOrderToMode(['list', 'create']), 'list-first')
  assert.equal(workspaceTabOrderToMode(['create', 'list']), 'create-first')
  assert.deepEqual(workspaceTabOrderFromMode('list-first'), ['list', 'create'])
  assert.deepEqual(workspaceTabOrderFromMode('create-first'), ['create', 'list'])
})

test('缓存键按人、应用、表单分开', () => {
  assert.equal(
    workspaceTabOrderStorageKey(3, 8, 12),
    'form-workspace-tab-order:3:8:12',
  )
  assert.equal(workspaceTabOrderStorageKey(0, 8, 12), '')
})

test('读写本地缓存，缺键或坏数据退回默认', () => {
  const store = new Map()
  const orig = globalThis.localStorage
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  }
  try {
    assert.deepEqual(readWorkspaceTabOrder(3, 8, 12), ['create', 'list'])
    writeWorkspaceTabOrder(3, 8, 12, ['list', 'create'])
    assert.deepEqual(readWorkspaceTabOrder(3, 8, 12), ['list', 'create'])
    store.set('form-workspace-tab-order:3:8:12', '{')
    assert.deepEqual(readWorkspaceTabOrder(3, 8, 12), ['create', 'list'])
    assert.deepEqual(readWorkspaceTabOrder(0, 8, 12), ['create', 'list'])
  } finally {
    globalThis.localStorage = orig
  }
})
