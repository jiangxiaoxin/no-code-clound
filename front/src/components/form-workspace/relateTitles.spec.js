import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chunkIds, relateIdsByForm, relateTitleKey } from './relateTitles.js'

test('relateTitleKey 拼表单和数据 id', () => {
  assert.equal(relateTitleKey(12, 'abc'), '12:abc')
})

test('relateIdsByForm 按主表归并且去重', () => {
  const fields = [
    { key: 'r1', type: 'relate', sourceFormId: 12 },
    { key: 'r2', type: 'relate', sourceFormId: 12 },
    { key: 'r3', type: 'relate', sourceFormId: 13 },
  ]
  const records = [
    { data: { r1: 'a', r2: 'a', r3: 'x' } },
    { data: { r1: 'b', r2: '', r3: null } },
  ]
  assert.deepEqual(relateIdsByForm(fields, records), [
    { formId: 12, ids: ['a', 'b'] },
    { formId: 13, ids: ['x'] },
  ])
})

test('按 ids 回显标题时不传 pickApproved', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'relateTitles.js'),
    'utf8',
  )
  assert.match(source, /ids:\s*chunk/)
  assert.doesNotMatch(source, /pickApproved/)
})

test('chunkIds 按 100 切片', () => {
  const ids = Array.from({ length: 205 }, (_, i) => String(i))
  const chunks = chunkIds(ids)
  assert.deepEqual(
    chunks.map((item) => item.length),
    [100, 100, 5],
  )
})
