import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRecordData } from './fillValues.js'

const fields = [
  { key: 'name', type: 'input' },
  { key: 'note', type: 'textarea' },
  { key: 'tags', type: 'checkbox' },
  { key: 'age', type: 'number' },
]

test('create payload omits empty fields', () => {
  assert.deepEqual(
    buildRecordData(fields, { name: '张三', note: '', tags: [], age: undefined }),
    { name: '张三' },
  )
})

test('update payload sends null so cleared fields can be removed', () => {
  assert.deepEqual(
    buildRecordData(
      fields,
      { name: '张三', note: '', tags: [], age: undefined },
      { clearEmpty: true },
    ),
    { name: '张三', note: null, tags: null, age: null },
  )
})
