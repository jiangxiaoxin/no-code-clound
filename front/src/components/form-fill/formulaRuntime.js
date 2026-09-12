import { flattenFields } from '../form-design/tabsField.js'
import {
  evaluateAst,
  normalizeFormulaValue,
  parseFormula,
} from './formula/evaluator.js'

// 公式字段值只由计算写回，签名里不包含公式字段自身的值，
// 否则写回会再次触发 watch 造成多余的循环（公式环在 schema 保存时已拦截）。
function topoOrderFormulaFields(formulaFields) {
  const byKey = new Map(formulaFields.map((field) => [field.key, field]))
  const done = new Set()
  const ordered = []
  const visit = (field) => {
    if (done.has(field.key)) return
    done.add(field.key)
    for (const ref of field.formula.refs || []) {
      if (ref.includes('.')) continue
      const dep = byKey.get(ref)
      if (dep) visit(dep)
    }
    ordered.push(field)
  }
  for (const field of formulaFields) visit(field)
  return ordered
}

export function collectMainFormulaFields(fields) {
  return flattenFields(fields).filter(
    (field) => field.formula?.expr && field.type !== 'subform',
  )
}

export function mainFormulaSignature(formulaFields, values) {
  const seen = new Set()
  const parts = []
  for (const field of formulaFields) {
    for (const ref of field.formula.refs || []) {
      if (seen.has(ref)) continue
      seen.add(ref)
      const path = ref.split('.')
      if (path.length === 1) {
        parts.push(values?.[path[0]])
        continue
      }
      const rows = values?.[path[0]]
      parts.push(
        Array.isArray(rows) ? rows.map((row) => row?.[path[1]]) : undefined,
      )
    }
  }
  return JSON.stringify(parts)
}

export function computeMainFormulaWrites(formulaFields, values) {
  const overlay = {}
  const writes = []
  for (const field of topoOrderFormulaFields(formulaFields)) {
    const parsed = parseFormula(field.formula.expr)
    if (!parsed.ok) continue
    const result = evaluateAst(parsed.ast, {
      now: new Date(),
      resolve: (path) => {
        if (path.length === 1) {
          if (path[0] in overlay) return overlay[path[0]]
          return values?.[path[0]]
        }
        const rows = values?.[path[0]]
        return Array.isArray(rows)
          ? rows.map((row) => row?.[path[1]])
          : undefined
      },
    })
    const value =
      result.ok && result.value !== undefined
        ? normalizeFormulaValue(field, result.value)
        : undefined
    overlay[field.key] = value
    writes.push({ key: field.key, value })
  }
  return writes
}

export function collectRowFormulaChildren(children) {
  return (children || []).filter((child) => child.formula?.expr)
}

export function rowFormulaSignature(formulaChildren, rows, parentValues) {
  const formulaKeys = new Set(formulaChildren.map((child) => child.key))
  const parentKeys = new Set()
  for (const child of formulaChildren) {
    for (const ref of child.formula.refs || []) {
      if (!ref.includes('.')) parentKeys.add(ref)
    }
  }
  const rowSnapshot = (rows || []).map((row) => {
    const item = {}
    for (const [key, value] of Object.entries(row)) {
      if (key === '__uid' || formulaKeys.has(key)) continue
      item[key] = value
    }
    return item
  })
  const parentSnapshot = {}
  for (const key of parentKeys) {
    parentSnapshot[key] = parentValues?.[key]
  }
  return JSON.stringify([rowSnapshot, parentSnapshot])
}

export function computeRowFormulaWrites(formulaChildren, row, parentValues) {
  const overlay = {}
  const next = {}
  for (const child of topoOrderFormulaFields(formulaChildren)) {
    const parsed = parseFormula(child.formula.expr)
    if (!parsed.ok) continue
    const result = evaluateAst(parsed.ast, {
      now: new Date(),
      resolve: (path) => {
        if (path.length !== 1) return undefined
        if (path[0] in overlay) return overlay[path[0]]
        return row[path[0]] ?? parentValues?.[path[0]]
      },
    })
    const value =
      result.ok && result.value !== undefined
        ? normalizeFormulaValue(child, result.value)
        : undefined
    overlay[child.key] = value
    next[child.key] = value
  }
  return next
}
