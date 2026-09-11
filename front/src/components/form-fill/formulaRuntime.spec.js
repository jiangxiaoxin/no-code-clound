import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectMainFormulaFields,
  mainFormulaSignature,
  computeMainFormulaWrites,
  collectRowFormulaChildren,
  rowFormulaSignature,
  computeRowFormulaWrites,
} from './formulaRuntime.js'

test('collectMainFormulaFields 收集主表公式字段并穿透标签页', () => {
  const fields = [
    { key: 'a', type: 'number', title: '数量' },
    {
      type: 'tabs',
      key: 'tabs_1',
      panes: [
        {
          id: 'p1',
          title: 'A',
          fields: [
            { key: 't', type: 'number', formula: { expr: "$'a' + 1", refs: ['a'] } },
          ],
        },
      ],
    },
    {
      key: 'sub',
      type: 'subform',
      fields: [
        { key: 'c', type: 'number', formula: { expr: "$'a' + 1", refs: ['a'] } },
      ],
    },
  ]
  assert.deepEqual(
    collectMainFormulaFields(fields).map((field) => field.key),
    ['t'],
  )
})

test('mainFormulaSignature 跟随引用值变化并忽略公式字段自身值', () => {
  const formulaFields = [
    { key: 't', type: 'number', formula: { expr: "$'a' + 1", refs: ['a'] } },
  ]
  const base = mainFormulaSignature(formulaFields, { a: 1, t: 2 })
  assert.notEqual(mainFormulaSignature(formulaFields, { a: 2, t: 2 }), base)
  assert.equal(mainFormulaSignature(formulaFields, { a: 1, t: 99 }), base)
})

test('mainFormulaSignature 跟随子表列变化', () => {
  const formulaFields = [
    { key: 's', type: 'number', formula: { expr: "SUM($'sub.qty')", refs: ['sub.qty'] } },
  ]
  const base = mainFormulaSignature(formulaFields, { sub: [{ qty: 1 }, { qty: 2 }] })
  assert.notEqual(
    mainFormulaSignature(formulaFields, { sub: [{ qty: 1 }, { qty: 3 }] }),
    base,
  )
  assert.notEqual(mainFormulaSignature(formulaFields, { sub: [{ qty: 1 }] }), base)
})

test('computeMainFormulaWrites 计算并按类型归一化', () => {
  const formulaFields = [
    { key: 't', type: 'number', formula: { expr: "$'a' + 1", refs: ['a'] } },
    { key: 'n', type: 'input', formula: { expr: "$'a' * 2", refs: ['a'] } },
  ]
  assert.deepEqual(computeMainFormulaWrites(formulaFields, { a: 3 }), [
    { key: 't', value: 4 },
    { key: 'n', value: '6' },
  ])
})

test('computeMainFormulaWrites 引用缺失时该字段留空', () => {
  const formulaFields = [
    { key: 't', type: 'number', formula: { expr: "$'a' + 1", refs: ['a'] } },
  ]
  assert.deepEqual(computeMainFormulaWrites(formulaFields, {}), [])
})

test('computeMainFormulaWrites 聚合子表列', () => {
  const formulaFields = [
    { key: 's', type: 'number', formula: { expr: "SUM($'sub.qty')", refs: ['sub.qty'] } },
  ]
  assert.deepEqual(
    computeMainFormulaWrites(formulaFields, {
      sub: [{ qty: 1 }, { qty: 2 }, { other: 9 }],
    }),
    [{ key: 's', value: 3 }],
  )
})

test('computeMainFormulaWrites 链式公式一趟算完', () => {
  const formulaFields = [
    { key: 'c', type: 'number', formula: { expr: "$'b' + 1", refs: ['b'] } },
    { key: 'b', type: 'number', formula: { expr: "$'a' + 1", refs: ['a'] } },
  ]
  assert.deepEqual(computeMainFormulaWrites(formulaFields, { a: 1 }), [
    { key: 'b', value: 2 },
    { key: 'c', value: 3 },
  ])
})

test('computeMainFormulaWrites 日期时间归一化为 Date', () => {
  const formulaFields = [
    {
      key: 'd',
      type: 'datetime',
      formula: { expr: "DATEDELTA($'day', 1)", refs: ['day'] },
    },
  ]
  const writes = computeMainFormulaWrites(formulaFields, { day: '2026-09-11' })
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0].value, new Date(2026, 8, 12))
})

test('collectRowFormulaChildren 只留公式子字段', () => {
  const children = [
    { key: 'name', type: 'input', title: '名称' },
    {
      key: 'amount',
      type: 'number',
      formula: { expr: "$'qty' * $'price'", refs: ['qty', 'price'] },
    },
  ]
  assert.deepEqual(
    collectRowFormulaChildren(children).map((child) => child.key),
    ['amount'],
  )
})

test('rowFormulaSignature 跟随行值与主表引用值变化', () => {
  const children = [
    {
      key: 'amount',
      type: 'number',
      formula: { expr: "$'qty' * $'price'", refs: ['qty', 'price'] },
    },
  ]
  const rows = [{ __uid: 1, qty: 1, amount: 5 }]
  const base = rowFormulaSignature(children, rows, { price: 5 })
  assert.notEqual(
    rowFormulaSignature(children, [{ __uid: 1, qty: 2, amount: 5 }], { price: 5 }),
    base,
  )
  assert.notEqual(rowFormulaSignature(children, rows, { price: 6 }), base)
  assert.equal(
    rowFormulaSignature(children, [{ __uid: 1, qty: 1, amount: 999 }], { price: 5 }),
    base,
  )
  assert.notEqual(
    rowFormulaSignature(
      children,
      [...rows, { __uid: 2, qty: 1, amount: 5 }],
      { price: 5 },
    ),
    base,
  )
})

test('computeRowFormulaWrites 引用本行与主表字段并支持链式', () => {
  const children = [
    {
      key: 'amount',
      type: 'number',
      formula: { expr: "$'qty' * $'price'", refs: ['qty', 'price'] },
    },
    {
      key: 'total',
      type: 'number',
      formula: { expr: "$'amount' + 100", refs: ['amount'] },
    },
  ]
  assert.deepEqual(
    computeRowFormulaWrites(children, { __uid: 1, qty: 2 }, { price: 5 }),
    { amount: 10, total: 110 },
  )
})

test('computeRowFormulaWrites 行值优先于主表且空结果不写', () => {
  const children = [
    { key: 'a', type: 'number', formula: { expr: "$'qty'", refs: ['qty'] } },
  ]
  assert.deepEqual(computeRowFormulaWrites(children, { __uid: 1, qty: 3 }, { qty: 9 }), {
    a: 3,
  })
  assert.deepEqual(computeRowFormulaWrites(children, { __uid: 1, qty: null }, {}), {})
})
