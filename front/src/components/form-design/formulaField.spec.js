import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFormulaRefGroups,
  clearFormulaExclusiveFlags,
  formulaSummary,
  isFormulaCapable,
  isFormulaField,
  validateFormulaConfig,
} from './formulaField.js'

const fields = [
  { key: 'name', type: 'input', title: '姓名' },
  { key: 'price', type: 'number', title: '单价' },
  { key: 'pic', type: 'image', title: '图片' },
  {
    key: 'sub01',
    type: 'subform',
    title: '明细',
    fields: [
      { key: 'qty', type: 'number', title: '数量' },
      { key: 'note', type: 'input', title: '备注' },
    ],
  },
]

test('isFormulaCapable 只认六类控件', () => {
  for (const type of ['input', 'textarea', 'number', 'date', 'time', 'datetime']) {
    assert.equal(isFormulaCapable(type), true)
  }
  for (const type of ['radio', 'subform', 'serialNumber', 'tabs', undefined]) {
    assert.equal(isFormulaCapable(type), false)
  }
})

test('isFormulaField 要求公式表达式非空', () => {
  assert.equal(isFormulaField({ formula: { expr: " $'a' " } }), true)
  assert.equal(isFormulaField({ formula: { expr: '  ' } }), false)
  assert.equal(isFormulaField({}), false)
  assert.equal(isFormulaField(null), false)
})

test('formulaSummary 超长截断', () => {
  const long = '1234567890123456789012345678'
  assert.equal(formulaSummary({ formula: { expr: ` ${long} ` } }), `${long.slice(0, 24)}…`)
  assert.equal(formulaSummary({ formula: { expr: 'abc' } }), 'abc')
  assert.equal(formulaSummary({}), '')
})

test('clearFormulaExclusiveFlags 清掉必填与重复值标记', () => {
  const field = { required: true, unique: true, uniqueInRows: true }
  clearFormulaExclusiveFlags(field)
  assert.equal(field.required, false)
  assert.equal(field.unique, false)
  assert.equal(field.uniqueInRows, false)
})

test('主表公式的字段列表含主表字段与子表数字列', () => {
  const groups = buildFormulaRefGroups(fields, { key: 'price', type: 'number' })
  const main = groups.find((group) => group.label === '主表字段')
  assert.deepEqual(main.items.map((item) => item.token), ["$'name'"])
  const sub = groups.find((group) => group.label === '明细')
  assert.deepEqual(sub.items.map((item) => item.token), ["$'sub01.qty'"])
  assert.deepEqual(sub.items[0].path, ['sub01', 'qty'])
  assert.equal(sub.items[0].label, '明细.数量')
})

test('行内公式的字段列表是本子表兄弟列加主表字段', () => {
  const groups = buildFormulaRefGroups(fields, { key: 'note', type: 'input' })
  const sub = groups.find((group) => group.label === '明细')
  assert.deepEqual(sub.items.map((item) => item.token), ["$'qty'"])
  const main = groups.find((group) => group.label === '主表字段')
  assert.deepEqual(main.items.map((item) => item.token), ["$'name'", "$'price'"])
})

test('validateFormulaConfig 通过合法主表公式并给出引用', () => {
  const result = validateFormulaConfig("SUM($'sub01.qty') + $'price'", {
    field: { key: 'total', type: 'number' },
    fields,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.refs, ['sub01.qty', 'price'])
})

test('validateFormulaConfig 拦住不存在的字段', () => {
  const result = validateFormulaConfig("$'missing' + 1", {
    field: { key: 't', type: 'number' },
    fields,
  })
  assert.equal(result.ok, false)
  assert.equal(result.message, "公式引用了不存在的字段 $'missing'")
})

test('validateFormulaConfig 拦住主表公式直接引用子表列', () => {
  const result = validateFormulaConfig("$'sub01.qty' + 1", {
    field: { key: 't', type: 'number' },
    fields,
  })
  assert.equal(result.ok, false)
  assert.equal(result.message, "公式引用了不存在的字段 $'sub01.qty'")
})

test('validateFormulaConfig 拦住聚合非数字列', () => {
  const result = validateFormulaConfig("SUM($'sub01.note')", {
    field: { key: 't', type: 'number' },
    fields,
  })
  assert.equal(result.ok, false)
  assert.equal(result.message, '聚合函数参数请选择子表单数字字段')
})

test('validateFormulaConfig 拦住数字字段配文本公式', () => {
  const result = validateFormulaConfig("CONCATENATE($'name', 'x')", {
    field: { key: 't', type: 'number' },
    fields,
  })
  assert.equal(result.ok, false)
  assert.equal(result.message, '公式结果类型与字段不匹配')
})

test('validateFormulaConfig 语法错误带行列', () => {
  const result = validateFormulaConfig('SUM((', {
    field: { key: 't', type: 'number' },
    fields,
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /公式语法错误：第 \d+ 行第 \d+ 列附近/)
})

test('validateFormulaConfig 行内公式可引用兄弟列与主表字段', () => {
  const result = validateFormulaConfig("CONCATENATE($'qty', $'name')", {
    field: { key: 'note', type: 'input' },
    fields,
  })
  assert.equal(result.ok, true)
})
