import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyLinkageResult,
  linkageConditionsReady,
  linkageManyMessage,
  linkageQueryPaging,
} from './linkageRuntime.js'

const linkage = {
  sourceFormId: 12,
  match: 'all',
  sourceKey: 'name',
  conditions: [{ key: 'empNo', op: 'eq', valueType: 'field', value: 'empNo' }],
}

test('field-ref conditions are not ready until current values are filled', () => {
  assert.equal(linkageConditionsReady(linkage, {}), false)
  assert.equal(linkageConditionsReady(linkage, { empNo: '' }), false)
  assert.equal(linkageConditionsReady(linkage, { empNo: 'E1' }), true)
})

test('empty/nempty and custom conditions do not wait on current fields', () => {
  assert.equal(
    linkageConditionsReady(
      {
        ...linkage,
        conditions: [{ key: 'empNo', op: 'nempty', valueType: 'custom', value: '' }],
      },
      {},
    ),
    true,
  )
  assert.equal(
    linkageConditionsReady(
      {
        ...linkage,
        conditions: [{ key: 'status', op: 'eq', valueType: 'custom', value: '在职' }],
      },
      {},
    ),
    true,
  )
})

test('value fields: 0 clears, 1 writes, many clears with message', () => {
  const field = {
    title: '姓名',
    type: 'input',
    linkage,
  }
  assert.deepEqual(applyLinkageResult(field, { items: [], total: 0 }, '旧'), {
    value: undefined,
    items: [],
    message: '',
  })
  assert.deepEqual(
    applyLinkageResult(
      field,
      { items: [{ data: { name: '张三' } }], total: 1 },
      undefined,
    ),
    { value: '张三', items: [], message: '' },
  )
  assert.deepEqual(
    applyLinkageResult(
      field,
      {
        items: [{ data: { name: '张三' } }, { data: { name: '李四' } }],
        total: 2,
      },
      '张三',
    ),
    {
      value: undefined,
      items: [],
      message: '[ 姓名 ] 字段联动查询出多条数据',
    },
  )
})

test('many records with the same trigger value still count as many for text fields', () => {
  const field = { title: '姓名', type: 'input', linkage }
  const result = applyLinkageResult(
    field,
    {
      items: [{ data: { name: '张三' } }, { data: { name: '张三' } }],
      total: 2,
    },
    undefined,
  )
  assert.equal(result.value, undefined)
  assert.equal(result.message, '[ 姓名 ] 字段联动查询出多条数据')
})

test('many-records message includes title and description', () => {
  assert.equal(
    linkageManyMessage({ title: '奖金基数', description: '数字越大给的越多' }),
    '[ 奖金基数，数字越大给的越多 ] 字段联动查询出多条数据',
  )
  assert.equal(
    linkageManyMessage({ title: '姓名' }),
    '[ 姓名 ] 字段联动查询出多条数据',
  )
})

test('select: 0 clears, 1 auto-selects, many keeps current if still in options', () => {
  const field = { title: '城市', type: 'select', linkage }
  assert.deepEqual(applyLinkageResult(field, { items: [], total: 0 }, '上海'), {
    value: undefined,
    items: [],
    message: '',
  })
  assert.deepEqual(
    applyLinkageResult(
      field,
      { items: [{ data: { name: '上海' } }], total: 1 },
      undefined,
    ),
    {
      value: '上海',
      items: [{ label: '上海', value: '上海' }],
      message: '',
    },
  )
  const many = applyLinkageResult(
    field,
    {
      items: [{ data: { name: '上海' } }, { data: { name: '北京' } }],
      total: 2,
    },
    '上海',
  )
  assert.equal(many.value, '上海')
  assert.equal(many.message, '')
  assert.equal(many.items.length, 2)
  const dropped = applyLinkageResult(
    field,
    {
      items: [{ data: { name: '广州' } }, { data: { name: '北京' } }],
      total: 2,
    },
    '上海',
  )
  assert.equal(dropped.value, undefined)
})

test('select-multiple keeps values that remain in the result set', () => {
  const field = { title: '标签', type: 'select-multiple', linkage }
  const one = applyLinkageResult(
    field,
    { items: [{ data: { name: 'A' } }], total: 1 },
    [],
  )
  assert.deepEqual(one.value, ['A'])
  const many = applyLinkageResult(
    field,
    {
      items: [{ data: { name: 'A' } }, { data: { name: 'B' } }],
      total: 2,
    },
    ['A', 'C'],
  )
  assert.deepEqual(many.value, ['A'])
  assert.equal(many.message, '')
})

test('value fields query two rows, select queries up to 100', () => {
  assert.deepEqual(linkageQueryPaging({ type: 'input' }), { page: 1, pageSize: 2 })
  assert.deepEqual(linkageQueryPaging({ type: 'select' }), {
    page: 1,
    pageSize: 100,
  })
})
