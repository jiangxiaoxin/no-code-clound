import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildRecordData,
  cloneRecordValues,
  emptyRecordValues,
  isFillable,
} from './fillValues.js'

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

test('create payload keeps 选择数据 source record id', () => {
  assert.deepEqual(
    buildRecordData(
      [...fields, { key: 'pick', type: 'data' }],
      { name: '张三', pick: '64abc' },
    ),
    { name: '张三', pick: '64abc' },
  )
})

test('选择数据 id is persisted but not treated as a fillable column', () => {
  const pick = { key: 'pick', type: 'data' }
  assert.equal(isFillable(pick), false)
  assert.deepEqual(emptyRecordValues([pick]), { pick: undefined })
  assert.deepEqual(cloneRecordValues([pick], { pick: '64abc' }), {
    pick: '64abc',
  })
  assert.deepEqual(cloneRecordValues([pick], { pick: '' }), {
    pick: undefined,
  })
  assert.deepEqual(
    buildRecordData([pick], { pick: undefined }, { clearEmpty: true }),
    { pick: null },
  )
})
