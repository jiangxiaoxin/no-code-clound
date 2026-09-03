import assert from 'node:assert/strict'
import { test } from 'node:test'
import { insertAfterKey, insertIntoList } from './canvasInsert.js'

test('insertAfterKey appends when nothing is selected', () => {
  const list = [{ key: 'a' }, { key: 'b' }]
  insertAfterKey(list, { key: 'c' }, '')
  assert.deepEqual(
    list.map((item) => item.key),
    ['a', 'b', 'c'],
  )
})

test('insertAfterKey puts the field immediately after the selected key', () => {
  const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
  insertAfterKey(list, { key: 'x' }, 'a')
  assert.deepEqual(
    list.map((item) => item.key),
    ['a', 'x', 'b', 'c'],
  )
})

test('insertAfterKey appends when the selected key is last', () => {
  const list = [{ key: 'a' }, { key: 'b' }]
  insertAfterKey(list, { key: 'x' }, 'b')
  assert.deepEqual(
    list.map((item) => item.key),
    ['a', 'b', 'x'],
  )
})

test('insertAfterKey appends when the selected key is not in this list', () => {
  const list = [{ key: 'a' }, { key: 'b' }]
  insertAfterKey(list, { key: 'x' }, 'pane-field')
  assert.deepEqual(
    list.map((item) => item.key),
    ['a', 'b', 'x'],
  )
})

test('insertIntoList still inserts before the given key', () => {
  const list = [{ key: 'a' }, { key: 'b' }]
  insertIntoList(list, { key: 'x' }, 'b')
  assert.deepEqual(
    list.map((item) => item.key),
    ['a', 'x', 'b'],
  )
})
