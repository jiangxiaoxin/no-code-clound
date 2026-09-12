import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFormulaRefGroups,
  buildFormulaRefLabels,
  clearFormulaExclusiveFlags,
  formulaDisplaySummary,
  formulaFromDisplay,
  formulaToDisplay,
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

test('formulaDisplaySummary 按字段标题显示并超长截断', () => {
  const expr = "CONCATENATE($'name', $'price')"
  const display = "CONCATENATE($'姓名', $'单价')"
  assert.equal(
    formulaDisplaySummary({ key: 'total', formula: { expr } }, fields),
    `${display.slice(0, 24)}…`,
  )
  assert.equal(formulaDisplaySummary({ key: 'total', formula: { expr: '1 + 2' } }, fields), '1 + 2')
  assert.equal(formulaDisplaySummary({ formula: { expr: '  ' } }, fields), '')
  assert.equal(formulaDisplaySummary({}, fields), '')
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
  // 本行字段也写成「子表单标题.字段标题」，和主表公式里的子表列叫法一致
  assert.deepEqual(sub.items.map((item) => item.label), ['明细.数量'])
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

test('编辑器显示字段标题，存库仍是字段 key', () => {
  const labels = buildFormulaRefLabels(fields, { key: 'total', type: 'number' })
  assert.equal(
    formulaToDisplay("CONCATENATE($'name', $'price')", labels),
    "CONCATENATE($'姓名', $'单价')",
  )
  assert.equal(
    formulaFromDisplay("CONCATENATE($'姓名', $'单价')", labels),
    "CONCATENATE($'name', $'price')",
  )
})

test('子表列显示为「子表标题.字段标题」，翻译回子表路径', () => {
  const labels = buildFormulaRefLabels(fields, { key: 'total', type: 'number' })
  assert.equal(formulaToDisplay("SUM($'sub01.qty')", labels), "SUM($'明细.数量')")
  assert.equal(formulaFromDisplay("SUM($'明细.数量')", labels), "SUM($'sub01.qty')")
})

test('行内公式的兄弟列带子表单标题、主表字段只写标题', () => {
  const labels = buildFormulaRefLabels(fields, { key: 'note', type: 'input' })
  assert.equal(
    formulaToDisplay("CONCATENATE($'qty', $'name')", labels),
    "CONCATENATE($'明细.数量', $'姓名')",
  )
  assert.equal(
    formulaFromDisplay("CONCATENATE($'明细.数量', $'姓名')", labels),
    "CONCATENATE($'qty', $'name')",
  )
  assert.equal(labels.tokenByPath.get('qty'), "$'明细.数量'")
})

test('标题重名时第二个带序号，仍能各自翻译回自己的 key', () => {
  const duplicated = [
    { key: 'a', type: 'input', title: '单行文本' },
    { key: 'b', type: 'input', title: '单行文本' },
    { key: 'c', type: 'input', title: '单行文本(2)' },
  ]
  const labels = buildFormulaRefLabels(duplicated, { key: 't', type: 'input' })
  assert.equal(
    formulaToDisplay("CONCATENATE($'a', $'b', $'c')", labels),
    "CONCATENATE($'单行文本', $'单行文本(2)', $'单行文本(2)(2)')",
  )
  assert.equal(
    formulaFromDisplay("CONCATENATE($'单行文本', $'单行文本(2)', $'单行文本(2)(2)')", labels),
    "CONCATENATE($'a', $'b', $'c')",
  )
})

test('标题里有引号时换一种引号，两种都有则退回 key', () => {
  const oneQuote = buildFormulaRefLabels(
    [{ key: 'x1', type: 'input', title: "客户's名称" }],
    { key: 't', type: 'input' },
  )
  assert.equal(formulaToDisplay("$'x1'", oneQuote), '$"客户\'s名称"')
  assert.equal(formulaFromDisplay('$"客户\'s名称"', oneQuote), "$'x1'")

  const bothQuotes = buildFormulaRefLabels(
    [{ key: 'x2', type: 'input', title: '客户\'s"名称' }],
    { key: 't', type: 'input' },
  )
  assert.equal(formulaToDisplay("$'x2'", bothQuotes), "$'x2'")
  assert.equal(formulaFromDisplay("$'x2'", bothQuotes), "$'x2'")
})

test('认不出的引用（手打的错字段名）原样保留', () => {
  const labels = buildFormulaRefLabels(fields, { key: 'price', type: 'number' })
  assert.equal(formulaToDisplay("$'missing' + 1", labels), "$'missing' + 1")
  assert.equal(formulaFromDisplay("$'missing' + 1", labels), "$'missing' + 1")
})
