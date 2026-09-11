import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  evaluateAst,
  inferType,
  normalizeFormulaValue,
  parseFormula,
} from './evaluator.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(
  readFileSync(
    join(
      here,
      '../../../../../server/src/application/form-record/formula/formula.fixtures.json',
    ),
    'utf-8',
  ),
)

function contextOf(f) {
  if (f.row || f.parent) {
    return {
      now: new Date('2026-09-11T10:00:00'),
      resolve: (path) => {
        if (path.length !== 1) return undefined
        const rowValue = (f.row ?? {})[path[0]]
        return rowValue === undefined || rowValue === null
          ? (f.parent ?? {})[path[0]]
          : rowValue
      },
    }
  }
  return {
    now: new Date('2026-09-11T10:00:00'),
    resolve: (path) => {
      if (path.length === 1) return f.values?.[path[0]]
      const rows = f.values?.[path[0]]
      return Array.isArray(rows)
        ? rows.map((row) => row?.[path[1]])
        : undefined
    },
  }
}

for (const f of fixtures) {
  test(f.desc, () => {
    const parsed = parseFormula(f.expr)
    if (f.expectError) {
      assert.equal(parsed.ok, false)
      if (!parsed.ok) assert.equal(parsed.error.code, f.expectError)
      return
    }
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    if (f.expectRefs) {
      assert.deepEqual(parsed.refs, f.expectRefs)
    }
    if (f.types) {
      const typeOf = (path) => f.types?.[path.join('.')] ?? 'unknown'
      const inferred = inferType(parsed.ast, typeOf)
      if (f.expectTypeError) {
        assert.equal(inferred.ok, false)
        if (!inferred.ok) assert.equal(inferred.error.code, 'type')
        return
      }
      assert.equal(inferred.ok, true)
    }
    const result = evaluateAst(parsed.ast, contextOf(f))
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(result.value ?? null, f.expect ?? null)
  })
}

test('TODAY 返回当天本地零点', () => {
  const parsed = parseFormula('TODAY()')
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const now = new Date(2026, 8, 11, 10, 30, 0)
  const result = evaluateAst(parsed.ast, { now, resolve: () => undefined })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value, new Date(2026, 8, 11, 0, 0, 0).getTime())
  }
})

test('NOW 返回注入的当前时间', () => {
  const parsed = parseFormula('NOW()')
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const now = new Date(2026, 8, 11, 10, 30, 0)
  const result = evaluateAst(parsed.ast, { now, resolve: () => undefined })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value, now.getTime())
  }
})

test('datetime 字段写 Date 对象', () => {
  const field = { key: 'd', type: 'datetime' }
  assert.deepEqual(
    normalizeFormulaValue(field, '2026-09-11 10:30:00'),
    new Date(2026, 8, 11, 10, 30, 0),
  )
})

test('time 字段按格式归一化', () => {
  const hm = { key: 't', type: 'time', format: 'HH:mm' }
  assert.equal(normalizeFormulaValue(hm, '10:30:00'), '10:30')
  const hms = { key: 't', type: 'time' }
  assert.equal(normalizeFormulaValue(hms, '10:30'), '10:30:00')
})

test('非法结果返回 undefined', () => {
  assert.equal(
    normalizeFormulaValue({ key: 'n', type: 'number' }, 'abc'),
    undefined,
  )
  assert.equal(
    normalizeFormulaValue({ key: 'd', type: 'date' }, 'not-date'),
    undefined,
  )
})
