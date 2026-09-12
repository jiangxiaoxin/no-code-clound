import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateAst, parseFormula } from '../form-fill/formula/evaluator.js'
import { buildFormulaHelp, parseParamNames } from './formulaHelp.js'

const help = buildFormulaHelp()

// 和 evaluator.spec.js 用同一个固定时间，日期类示例才有确定的期望值
function contextOf(values) {
  return {
    now: new Date('2026-09-11T10:00:00'),
    resolve: (path) => {
      if (path.length === 1) return values?.[path[0]]
      const rows = values?.[path[0]]
      return Array.isArray(rows) ? rows.map((row) => row?.[path[1]]) : undefined
    },
  }
}

test('每个函数都有一份帮助文档', () => {
  assert.ok(help.length > 0)
  for (const item of help) {
    assert.ok(item.signature, `${item.name} 缺签名`)
    assert.ok(item.description, `${item.name} 缺说明`)
    assert.ok(item.returns, `${item.name} 缺返回值说明`)
    assert.ok(item.examples.length > 0, `${item.name} 缺使用示例`)
  }
})

test('参数说明的条数和签名里的参数对得上', () => {
  for (const item of help) {
    assert.equal(
      item.params.length,
      item.paramNames.length,
      `${item.name} 签名有 ${item.paramNames.length} 个参数，帮助里写了 ${item.params.length} 条说明`,
    )
  }
})

test('parseParamNames 从签名里抠参数名', () => {
  assert.deepEqual(parseParamNames('IF(条件, 结果1, 结果2)'), ['条件', '结果1', '结果2'])
  assert.deepEqual(parseParamNames('CONCATENATE(文本, ...)'), ['文本', '...'])
  assert.deepEqual(parseParamNames('TODAY()'), [])
  assert.deepEqual(parseParamNames(''), [])
})

test('帮助里的使用示例都能解析、能算出结果', () => {
  for (const item of help) {
    for (const example of item.examples) {
      const parsed = parseFormula(example.expr)
      assert.equal(parsed.ok, true, `${item.name} 示例「${example.expr}」解析失败`)
      if (!parsed.ok) continue
      const result = evaluateAst(parsed.ast, contextOf(example.values))
      assert.equal(
        result.ok,
        true,
        `${item.name} 示例「${example.expr}」算不出来：${JSON.stringify(result.error)}`,
      )
      if (!result.ok) continue
      if (example.expect === undefined) continue
      assert.deepEqual(
        result.value ?? null,
        example.expect,
        `${item.name} 示例「${example.expr}」结果和文档写的不一致`,
      )
      // 示例引用了字段，就必须在 values 里给出对应样例值，别写出算不出结果的文档
      if (parsed.refs.length && !example.values) {
        assert.fail(`${item.name} 示例「${example.expr}」引用了字段但没给样例值`)
      }
    }
  }
})

test('示例里写的字段都在样例值里，或本身就是常量', () => {
  for (const item of help) {
    for (const example of item.examples) {
      const parsed = parseFormula(example.expr)
      if (!parsed.ok) continue
      for (const ref of parsed.refs) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(example.values || {}, ref.split('.')[0]),
          `${item.name} 示例「${example.expr}」里的 ${ref} 在样例值里没有`,
        )
      }
    }
  }
})
