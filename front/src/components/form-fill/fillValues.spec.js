import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildRecordData,
  cloneRecordValues,
  emptyRecordValues,
  formatCellValue,
  isFillable,
  isInlineEditable,
  serializeValue,
  validateRequired,
} from './fillValues.js'
import { asDate, formatQueryTimeValue } from '../../utils/timeValue.js'

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

test('登录人姓名 is display-only and not persisted', () => {
  const field = { key: 'me', type: 'currentUser' }
  assert.equal(isFillable(field), false)
  assert.deepEqual(emptyRecordValues([field]), {})
  assert.deepEqual(cloneRecordValues([field], { me: '张三' }), {})
  assert.deepEqual(buildRecordData([field], { me: '张三' }), {})
})

test('登录人部门 is display-only and not persisted', () => {
  const field = { key: 'dept', type: 'currentUserDept' }
  assert.equal(isFillable(field), false)
  assert.deepEqual(emptyRecordValues([field]), {})
  assert.deepEqual(cloneRecordValues([field], { dept: '研发部' }), {})
  assert.deepEqual(buildRecordData([field], { dept: '研发部' }), {})
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

test('asDate keeps ISO datetime in UTC and parses wall-clock strings locally', () => {
  const iso = asDate('2026-07-31T16:00:00.000Z')
  assert.equal(iso.getTime(), Date.parse('2026-07-31T16:00:00.000Z'))
  const wall = asDate('2026-08-01 00:00:00')
  assert.equal(wall.getFullYear(), 2026)
  assert.equal(wall.getMonth(), 7)
  assert.equal(wall.getDate(), 1)
  assert.equal(wall.getHours(), 0)
})

test('formatQueryTimeValue follows field format', () => {
  const picked = new Date(2026, 7, 1, 14, 30, 0)
  assert.equal(formatQueryTimeValue('date', 'year', picked), '2026')
  assert.equal(
    formatQueryTimeValue('datetime', 'YYYY-MM-DD HH:mm', picked),
    '2026-08-01 14:30',
  )
})

test('disabled field still validates required and is not inline editable', () => {
  const field = {
    key: 'name',
    type: 'input',
    title: '姓名',
    required: true,
    disabled: true,
  }
  assert.equal(validateRequired([field], { name: '' }), '请填写「姓名」')
  assert.equal(isInlineEditable(field), false)
  assert.equal(
    isInlineEditable({ key: 'name', type: 'input', disabled: false }),
    true,
  )
})

test('uneditable field cannot be inline edited after create', () => {
  assert.equal(
    isInlineEditable({ key: 'name', type: 'input', editable: false }),
    false,
  )
  assert.equal(
    isInlineEditable({ key: 'name', type: 'input' }),
    true,
  )
})

test('linkage fields cannot be inline edited', () => {
  assert.equal(
    isInlineEditable({
      key: 'name',
      type: 'input',
      optionSource: 'linkage',
    }),
    false,
  )
})

test('formatCellValue shows datetime from ISO in local time', () => {
  assert.equal(
    formatCellValue(
      { type: 'datetime', format: 'YYYY-MM-DD HH:mm:ss' },
      '2026-07-31T16:00:00.000Z',
    ),
    formatQueryTimeValue(
      'datetime',
      'YYYY-MM-DD HH:mm:ss',
      new Date('2026-07-31T16:00:00.000Z'),
    ),
  )
})

test('serializeValue keeps YYYY-MM-DD strings as calendar dates', () => {
  assert.equal(
    serializeValue({ type: 'date' }, '2026-08-27'),
    '2026-08-27',
  )
})

test('serializeValue does not shift a stored date when building an edit payload', () => {
  assert.deepEqual(
    buildRecordData([{ key: 'day', type: 'date' }], { day: '2026-01-01' }),
    { day: '2026-01-01' },
  )
})

test('serializeValue serializes a local Date from the picker without UTC conversion', () => {
  assert.equal(
    serializeValue({ type: 'date' }, new Date(2026, 7, 27)),
    '2026-08-27',
  )
})

test('serializeValue normalizes year and month formats from calendar strings', () => {
  assert.equal(
    serializeValue({ type: 'date', format: 'year' }, '2026-08-27'),
    '2026-01-01',
  )
  assert.equal(
    serializeValue({ type: 'date', format: 'month' }, '2026-08'),
    '2026-08-01',
  )
})

test('image field is fillable, persisted as url list, and not inline editable', () => {
  const field = { key: 'pics', type: 'image', title: '图片', required: true }
  assert.equal(isFillable(field), true)
  assert.equal(isInlineEditable(field), false)
  assert.deepEqual(emptyRecordValues([field]), { pics: [] })
  assert.deepEqual(cloneRecordValues([field], { pics: '/uploads/a.png' }), {
    pics: ['/uploads/a.png'],
  })
  assert.deepEqual(
    buildRecordData([field], { pics: ['/uploads/a.png'] }),
    { pics: ['/uploads/a.png'] },
  )
  assert.deepEqual(
    buildRecordData([field], { pics: [] }, { clearEmpty: true }),
    { pics: null },
  )
  assert.equal(validateRequired([field], { pics: [] }), '请填写「图片」')
  assert.equal(validateRequired([field], { pics: ['/uploads/a.png'] }), '')
})

test('file field is fillable, persisted as url and name list, and not inline editable', () => {
  const field = { key: 'docs', type: 'file', title: '附件', required: true }
  const item = { url: '/uploads/files/a.docx', name: '合同.docx' }
  assert.equal(isFillable(field), true)
  assert.equal(isInlineEditable(field), false)
  assert.deepEqual(emptyRecordValues([field]), { docs: [] })
  assert.deepEqual(cloneRecordValues([field], { docs: [item] }), {
    docs: [item],
  })
  assert.deepEqual(buildRecordData([field], { docs: [item] }), { docs: [item] })
  assert.deepEqual(
    buildRecordData([field], { docs: [] }, { clearEmpty: true }),
    { docs: null },
  )
  assert.equal(validateRequired([field], { docs: [] }), '请填写「附件」')
  assert.equal(validateRequired([field], { docs: [item] }), '')
})

test('address is fillable, persisted as object, empty omitted', () => {
  const field = { key: 'addr', type: 'address' }
  const value = {
    ids: ['110000'],
    labels: ['北京市'],
    detail: '某街',
  }
  assert.equal(isFillable(field), true)
  assert.deepEqual(buildRecordData([field], { addr: value }), { addr: value })
  assert.deepEqual(buildRecordData([field], { addr: { ids: [], labels: [] } }), {})
  assert.equal(
    validateRequired([{ ...field, required: true, title: '地址' }], {}),
    '请填写「地址」',
  )
  assert.equal(
    validateRequired(
      [
        {
          ...field,
          required: true,
          title: '地址',
          addressFormat: 'province-city-district',
        },
      ],
      { addr: { ids: ['370000'], labels: ['山东省'] } },
    ),
    '请填写「地址」',
  )
})

test('address is inline editable unless disabled, locked, or linkage', () => {
  assert.equal(
    isInlineEditable({ key: 'addr', type: 'address', disabled: false }),
    true,
  )
  assert.equal(
    isInlineEditable({
      key: 'addr',
      type: 'address',
      optionSource: 'linkage',
    }),
    false,
  )
})
