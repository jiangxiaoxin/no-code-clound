import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultRelateSubformColumns,
  hasRelateSubformField,
  isRelateSubformField,
  relateSubformOptions,
  relateSubformColumnTitles,
  relateSubformCanViewDetail,
  relateSubformQuery,
  relateSubformReady,
  RELATE_SUBFORM_TITLE_TIP,
} from './relateSubform.js'

const forms = [
  {
    id: 30,
    name: '人员表',
    fields: [
      { key: 'name', type: 'input', title: '工人名' },
      { key: 'no', type: 'input', title: '工人编号' },
      { key: 'r1', type: 'relate', title: '所属工厂', sourceFormId: 12 },
      { key: 'r2', type: 'relate', title: '常驻工厂', sourceFormId: 12 },
      { key: 'r3', type: 'relate', title: '所属仓库', sourceFormId: 13 },
    ],
  },
  {
    id: 31,
    name: '设备表',
    fields: [{ key: 'code', type: 'input', title: '设备编码' }],
  },
]

test('isRelateSubformField 只认 relate-subform', () => {
  assert.equal(isRelateSubformField({ type: 'relate-subform' }), true)
  assert.equal(isRelateSubformField({ type: 'relate' }), false)
})

test('标题提示文案固定', () => {
  assert.match(RELATE_SUBFORM_TITLE_TIP, /关联子表单/)
})

test('候选项按「表单 + 关联字段」拆开，只留指向当前表单的', () => {
  const options = relateSubformOptions(forms, 12)
  assert.deepEqual(
    options.map((item) => item.label),
    ['人员表 · 所属工厂', '人员表 · 常驻工厂'],
  )
  assert.equal(options[0].formId, 30)
  assert.equal(options[0].relateKey, 'r1')
  assert.deepEqual(
    options[0].fields.map((item) => item.key),
    ['name', 'no'],
  )
})

test('没有表单关联本表单时候选为空', () => {
  assert.deepEqual(relateSubformOptions(forms, 99), [])
})

test('同一个表单 + 关联字段只能加一个', () => {
  const fields = [
    { key: 'rs1', type: 'relate-subform', childFormId: 30, childRelateKey: 'r1' },
  ]
  assert.equal(hasRelateSubformField(fields, 30, 'r1'), true)
  assert.equal(hasRelateSubformField(fields, 30, 'r2'), false)
  assert.equal(hasRelateSubformField(fields, 31, 'r1'), false)
})

test('默认取前 5 个可展示字段当列', () => {
  const childFields = Array.from({ length: 7 }, (_, i) => ({
    key: `f${i}`,
    type: 'input',
    title: `字段${i}`,
  }))
  assert.deepEqual(defaultRelateSubformColumns(childFields), [
    'f0',
    'f1',
    'f2',
    'f3',
    'f4',
  ])
  assert.deepEqual(defaultRelateSubformColumns([]), [])
})

test('画布表头用字段标题，找不到时才退回 key', () => {
  assert.deepEqual(
    relateSubformColumnTitles(['name', 'no', 'missing'], forms[0].fields),
    [
      { key: 'name', title: '工人名' },
      { key: 'no', title: '工人编号' },
      { key: 'missing', title: 'missing' },
    ],
  )
  assert.deepEqual(relateSubformColumnTitles(['name'], []), [
    { key: 'name', title: 'name' },
  ])
})

test('配好关联表单才算就绪', () => {
  assert.equal(relateSubformReady({ childFormId: 30, childRelateKey: 'r1' }), true)
  assert.equal(relateSubformReady({ childFormId: 30 }), false)
  assert.equal(relateSubformReady({}), false)
})

test('是否可查看详情默认关闭，只有显式 true 才开启', () => {
  assert.equal(relateSubformCanViewDetail({}), false)
  assert.equal(relateSubformCanViewDetail({ canViewDetail: false }), false)
  assert.equal(relateSubformCanViewDetail({ canViewDetail: true }), true)
})

test('查询体按关联字段等于当前数据 id，每页条数用查看时传入的值', () => {
  const field = { childFormId: 30, childRelateKey: 'r1' }
  assert.deepEqual(relateSubformQuery(field, 'abc', 2, 20), {
    page: 2,
    pageSize: 20,
    filters: [{ key: 'r1', op: 'eq', value: 'abc' }],
    sort: { key: 'updatedAt', order: 'desc' },
  })
  assert.equal(relateSubformQuery({ childRelateKey: 'r1' }, 'abc', 1).pageSize, 10)
  assert.equal(relateSubformQuery({ childRelateKey: 'r1' }, 'abc', 1, 99).pageSize, 10)
})
