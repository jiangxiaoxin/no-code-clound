import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasSelfRelateField,
  isRelateField,
  isSelfRelate,
  relateColumnFields,
  relateSourceFormId,
} from './relateField.js'

test('isRelateField 只认 relate', () => {
  assert.equal(isRelateField({ type: 'relate' }), true)
  assert.equal(isRelateField({ type: 'data' }), false)
  assert.equal(isRelateField(null), false)
})

test('relateSourceFormId 过滤非法值', () => {
  assert.equal(relateSourceFormId({ sourceFormId: 12 }), 12)
  assert.equal(relateSourceFormId({ sourceFormId: '12' }), 12)
  assert.equal(relateSourceFormId({ sourceFormId: 0 }), 0)
  assert.equal(relateSourceFormId({}), 0)
})

test('isSelfRelate 比较主表和当前表单', () => {
  assert.equal(isSelfRelate({ type: 'relate', sourceFormId: 30 }, 30), true)
  assert.equal(isSelfRelate({ type: 'relate', sourceFormId: 31 }, 30), false)
  assert.equal(isSelfRelate({ type: 'data', sourceFormId: 30 }, 30), false)
})

test('hasSelfRelateField 展开标签页并可排除自己', () => {
  const fields = [
    { key: 'a', type: 'input' },
    {
      key: 't',
      type: 'tabs',
      panes: [
        { id: 'p1', fields: [{ key: 'r1', type: 'relate', sourceFormId: 30 }] },
      ],
    },
  ]
  assert.equal(hasSelfRelateField(fields, 30), true)
  assert.equal(hasSelfRelateField(fields, 30, 'r1'), false)
  assert.equal(hasSelfRelateField(fields, 31), false)
})

test('relateColumnFields 只要配好主表的关联数据', () => {
  const fields = [
    { key: 'r1', type: 'relate', sourceFormId: 12 },
    { key: 'r2', type: 'relate' },
    { key: 'd1', type: 'data', sourceFormId: 12 },
  ]
  assert.deepEqual(
    relateColumnFields(fields).map((item) => item.key),
    ['r1'],
  )
})
