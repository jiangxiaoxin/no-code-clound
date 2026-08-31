import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyRowLinkages,
  isSubformChildType,
  mapSourceSubformRows,
  shouldSubformDataSelectMultiple,
  stripEmptySubformRows,
  uniqueInRowsError,
} from './subformField.js'

test('rejects nested subform and divider', () => {
  assert.equal(isSubformChildType('input'), true)
  assert.equal(isSubformChildType('image'), true)
  assert.equal(isSubformChildType('data'), true)
  assert.equal(isSubformChildType('subform'), false)
  assert.equal(isSubformChildType('divider'), false)
})

test('strips empty rows and keeps zero', () => {
  const fields = [
    { key: 'name', type: 'input' },
    { key: 'qty', type: 'number' },
  ]
  const rows = stripEmptySubformRows(fields, [
    { name: '', qty: null },
    { name: 'A', qty: 0 },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].qty, 0)
})

test('uniqueInRows catches duplicate text and data id', () => {
  const fields = [{ key: 'code', type: 'input', uniqueInRows: true, title: '编码' }]
  const msg = uniqueInRowsError(fields, [{ code: 'A' }, { code: 'A' }])
  assert.equal(msg, '[编码]同一子表内不允许重复值')
})

test('maps source subform rows by fieldMappings', () => {
  const rows = mapSourceSubformRows({
    sourceRows: [{ a: '螺丝', b: 2 }],
    mappings: [{ sourceKey: 'a', targetKey: 'name' }],
    targetFields: [{ key: 'name', type: 'input' }],
  })
  assert.deepEqual(rows, [{ name: '螺丝' }])
})

test('mapSourceSubformRows drops empty source and missing columns', () => {
  const rows = mapSourceSubformRows({
    sourceRows: [{ a: '' }, { a: '垫片' }],
    mappings: [{ sourceKey: 'a', targetKey: 'name' }],
    targetFields: [{ key: 'name', type: 'input' }],
  })
  assert.deepEqual(rows, [{ name: '垫片' }])
})

test('mapSourceSubformRows caps at 200 rows', () => {
  const sourceRows = Array.from({ length: 205 }, (_, index) => ({ a: `n${index}` }))
  const rows = mapSourceSubformRows({
    sourceRows,
    mappings: [{ sourceKey: 'a', targetKey: 'name' }],
    targetFields: [{ key: 'name', type: 'input' }],
  })
  assert.equal(rows.length, 200)
})

test('multiple only when empty row and filters ignore sibling keys', () => {
  assert.equal(
    shouldSubformDataSelectMultiple({
      filters: { conditions: [] },
      rowHasId: false,
      childKeys: ['a'],
    }),
    true,
  )
  assert.equal(
    shouldSubformDataSelectMultiple({
      filters: { conditions: [{ valueType: 'field', value: 'a' }] },
      rowHasId: false,
      childKeys: ['a'],
    }),
    false,
  )
})

test('applyRowLinkages writes only the current row cell', () => {
  const row = { code: 'A', name: '' }
  const next = applyRowLinkages({
    children: [
      {
        key: 'name',
        type: 'input',
        optionSource: 'linkage',
        linkage: { sourceKey: 'title' },
      },
    ],
    row,
    parentValues: { deviceNo: 'E001' },
    resultsByKey: { name: { records: [{ title: '螺丝' }] } },
  })
  assert.equal(next.name, '螺丝')
  assert.equal(next.code, 'A')
  assert.equal(row.name, '')
})
