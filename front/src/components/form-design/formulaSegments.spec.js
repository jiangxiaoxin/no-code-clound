import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildFormulaRefLabels } from './formulaField.js'
import {
  buildFormulaSegments,
  remapSourceOffset,
  segmentsSignature,
  segmentsToDisplayExpression,
  segmentsToExpression,
} from './formulaSegments.js'

const fields = [
  { key: 'name', type: 'input', title: '姓名' },
  { key: 'price', type: 'number', title: '单价' },
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

function labels(fields, currentField) {
  return buildFormulaRefLabels(fields, currentField)
}

test('字段引用切成 token，显示标题', () => {
  const segments = buildFormulaSegments("CONCATENATE($'name', 'x')", labels(fields, { key: 't' }))
  assert.deepEqual(
    segments.map((segment) => (segment.type === 'token' ? `token:${segment.label}` : segment.text)),
    ['CONCATENATE', '(', 'token:姓名', ', ', "'x'", ')'],
  )
  assert.equal(segments[0].kind, 'fn')
  assert.equal(segments[4].kind, 'str')
})

test('token 序列化回字段 key，文本原样', () => {
  const expr = "CONCATENATE($'name', 'x') + ROUND($'price', 2)"
  const segments = buildFormulaSegments(expr, labels(fields, { key: 't' }))
  assert.equal(segmentsToExpression(segments), expr)
})

test('手打的字段标题也被认成 token', () => {
  const segments = buildFormulaSegments("CONCATENATE($'姓名', $'单价')", labels(fields, { key: 't' }))
  assert.deepEqual(segmentsToExpression(segments), "CONCATENATE($'name', $'price')")
  assert.deepEqual(
    segments.filter((segment) => segment.type === 'token').map((segment) => segment.label),
    ['姓名', '单价'],
  )
  // 重画要把 $'标题'（5 字）换成 $'name'（7 字），sourceLength 记的是前者
  assert.deepEqual(
    segments.filter((segment) => segment.type === 'token').map((segment) => segment.sourceLength),
    [5, 5],
  )
})

test('子表列用子表路径，显示「子表标题.字段标题」', () => {
  const segments = buildFormulaSegments("SUM($'sub01.qty')", labels(fields, { key: 't' }))
  assert.equal(segments[2].type, 'token')
  assert.equal(segments[2].label, '明细.数量')
  assert.equal(segmentsToExpression(segments), "SUM($'sub01.qty')")
})

test('行内公式里带子表单标题的引用能认回本行字段的 key', () => {
  const segments = buildFormulaSegments(
    "CONCATENATE($'明细.数量', $'姓名')",
    labels(fields, { key: 'note', type: 'input' }),
  )
  assert.equal(segmentsToExpression(segments), "CONCATENATE($'qty', $'name')")
})

test('认不出的引用按普通文本留着，不吞掉', () => {
  const expr = "$'missing' + 1"
  const segments = buildFormulaSegments(expr, labels(fields, { key: 't' }))
  assert.equal(segmentsToExpression(segments), expr)
  assert.equal(segments.some((segment) => segment.type === 'token'), false)
})

test('函数名不区分大小写，参数里的裸词不算函数', () => {
  const segments = buildFormulaSegments('if(1, true, false)', labels(fields, { key: 't' }))
  assert.equal(segments[0].kind, 'fn')
  assert.equal(segments[0].text, 'if')
  assert.equal(
    segments.filter((segment) => segment.kind === 'fn').length,
    1,
  )
})

test('未闭合的引号不会把内容吃掉', () => {
  assert.equal(segmentsToExpression(buildFormulaSegments("CONCATENATE('a", labels(fields, { key: 't' }))), "CONCATENATE('a")
  assert.equal(segmentsToExpression(buildFormulaSegments("$'na", labels(fields, { key: 't' }))), "$'na")
})

test('结构签名区分 token、函数、字符串', () => {
  const refLabels = labels(fields, { key: 't' })
  const a = segmentsSignature(buildFormulaSegments("$'name'", refLabels))
  const b = segmentsSignature(buildFormulaSegments("$'missing'", refLabels))
  assert.notEqual(a, b)
  assert.equal(segmentsSignature(buildFormulaSegments("$'name' + 1", refLabels)), segmentsSignature(buildFormulaSegments("$'name'+1", refLabels)))
})

test('复制出去的文本按字段标题写，粘回来还是同一个公式', () => {
  const refLabels = labels(fields, { key: 't' })
  const expr = "CONCATENATE($'name', '-', $'price') + SUM($'sub01.qty')"
  const copied = segmentsToDisplayExpression(buildFormulaSegments(expr, refLabels))
  assert.equal(copied, "CONCATENATE($'姓名', '-', $'单价') + SUM($'明细.数量')")
  // 粘回来：再把复制的文本切一遍，序列化结果应与原公式一致
  assert.equal(segmentsToExpression(buildFormulaSegments(copied, refLabels)), expr)
})

test('重名字段复制出去带序号，粘回来仍是各自那一个', () => {
  const duplicated = [
    { key: 'a', type: 'input', title: '单行文本' },
    { key: 'b', type: 'input', title: '单行文本' },
  ]
  const refLabels = labels(duplicated, { key: 't' })
  const expr = "CONCATENATE($'a', $'b')"
  const copied = segmentsToDisplayExpression(buildFormulaSegments(expr, refLabels))
  assert.equal(copied, "CONCATENATE($'单行文本', $'单行文本(2)')")
  assert.equal(segmentsToExpression(buildFormulaSegments(copied, refLabels)), expr)
})

test('手打标题重画成 key 后，光标偏移跟着换算', () => {
  const refLabels = labels(fields, { key: 't' })
  const typed = "CONCATENATE($'姓名')"
  const segments = buildFormulaSegments(typed, refLabels)
  const canonical = segmentsToExpression(segments)
  assert.equal(canonical, "CONCATENATE($'name')")
  // 光标在最后：重画后仍在最后，不能被夹到标签后面
  assert.equal(remapSourceOffset(typed.length, segments), canonical.length)
  // 光标紧贴标签后面：落在整颗标签之后
  assert.equal(remapSourceOffset(17, segments), "CONCATENATE($'name'".length)
  // 光标在标签前面：落在标签之前
  assert.equal(remapSourceOffset(12, segments), 12)
  // 光标在普通文本里：偏移不变
  assert.equal(remapSourceOffset(5, segments), 5)
  // 已经是 key 形态时是恒等换算
  assert.equal(remapSourceOffset(canonical.length, segments), canonical.length)
})
