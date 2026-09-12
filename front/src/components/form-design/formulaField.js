import { flattenFields } from './tabsField.js'
import { findParentSubform } from '../form-fill/subformField.js'
import {
  AGGREGATE_FUNCTION_NAMES,
  FORMULA_FIELD_TYPES,
  inferType,
  parseFormula,
} from '../form-fill/formula/evaluator.js'

export { FORMULA_FIELD_TYPES }

// 与服务端 formula-schema 的 REF_SOURCE_TYPES 保持一致
const FORMULA_REF_TYPES = [
  'input',
  'textarea',
  'number',
  'date',
  'time',
  'datetime',
  'radio',
  'select',
  'select-multiple',
  'checkbox',
  'member',
  'dept',
  'serialNumber',
]

const DATE_LIKE_FIELD_TYPES = ['date', 'time', 'datetime']

export function isFormulaCapable(type) {
  return FORMULA_FIELD_TYPES.includes(type)
}

export function isFormulaField(field) {
  const expr = field?.formula?.expr
  return typeof expr === 'string' && expr.trim() !== ''
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

// 属性面板的摘要：和编辑器一样按字段标题显示，不要露出一串字段 key
export function formulaDisplaySummary(field, fields, max = 24) {
  const expr = String(field?.formula?.expr || '').trim()
  if (!expr) return ''
  return truncate(formulaToDisplay(expr, buildFormulaRefLabels(fields, field)), max)
}

export function clearFormulaExclusiveFlags(field) {
  if (!field) return
  field.required = false
  field.unique = false
  field.uniqueInRows = false
}

export function buildFormulaRefGroups(fields, currentField) {
  const list = fields || []
  const flat = flattenFields(list)
  const mainItems = flat
    .filter(
      (item) =>
        item?.key &&
        item.key !== currentField?.key &&
        FORMULA_REF_TYPES.includes(item.type),
    )
    .map((item) => ({
      token: `$'${item.key}'`,
      label: item.title || item.key,
      type: item.type,
      path: [item.key],
    }))
  const parent = findParentSubform(list, currentField?.key)
  if (parent) {
    const parentLabel = parent.title || '子表单'
    const groups = [
      {
        label: parentLabel,
        items: (parent.fields || [])
          .filter(
            (child) =>
              child?.key &&
              child.key !== currentField?.key &&
              FORMULA_REF_TYPES.includes(child.type),
          )
          .map((child) => ({
            token: `$'${child.key}'`,
            // 本行字段也带上子表单标题，和主表公式里的子表列叫法一致
            label: `${parentLabel}.${child.title || child.key}`,
            type: child.type,
            path: [child.key],
          })),
      },
    ]
    if (mainItems.length) groups.push({ label: '主表字段', items: mainItems })
    return groups
  }
  const groups = mainItems.length ? [{ label: '主表字段', items: mainItems }] : []
  for (const item of flat) {
    if (item?.type !== 'subform' || !item.key) continue
    const childItems = (item.fields || [])
      .filter((child) => child?.key && child.type === 'number')
      .map((child) => ({
        token: `$'${item.key}.${child.key}'`,
        label: `${item.title || '子表单'}.${child.title || child.key}`,
        type: child.type,
        path: [item.key, child.key],
      }))
    if (childItems.length) {
      groups.push({ label: item.title || '子表单', items: childItems })
    }
  }
  return groups
}

// 编辑器里给人看的是字段标题，存库仍是字段 key，所以要在「显示文本」和「引用路径」之间来回翻译。
// 标题重名时给后面的加序号；标题里单双引号都有时写不进 $'...'，退回 key。
export function buildFormulaRefLabels(fields, currentField) {
  const byLabel = new Map()
  const byPath = new Map()
  const tokenByPath = new Map()
  const used = new Set()
  for (const group of buildFormulaRefGroups(fields, currentField)) {
    for (const item of group.items) {
      const path = item.path.join('.')
      const title = String(item.label || '').trim()
      const label = uniqueRefLabel(
        title.includes("'") && title.includes('"') ? path : title,
        used,
      )
      used.add(label)
      byLabel.set(label, path)
      byPath.set(path, label)
      tokenByPath.set(path, refToken(label) || item.token)
    }
  }
  return { byLabel, byPath, tokenByPath }
}

function uniqueRefLabel(label, used) {
  if (!used.has(label)) return label
  let index = 2
  while (used.has(`${label}(${index})`)) index += 1
  return `${label}(${index})`
}

function refToken(label) {
  if (!label.includes("'")) return `$'${label}'`
  if (!label.includes('"')) return `$"${label}"`
  return ''
}

// 把一条引用路径写成公式里的引用文本
export function formulaRefToken(path) {
  return refToken(path)
}

const REF_TOKEN_RE = /\$(["'])([\s\S]*?)\1/g

function replaceRefTokens(text, resolve) {
  return String(text || '').replace(REF_TOKEN_RE, (whole, quote, inner) => {
    const value = resolve(inner.trim())
    return value ? refToken(value) || whole : whole
  })
}

export function formulaToDisplay(expr, labels) {
  return replaceRefTokens(expr, (inner) => labels.byPath.get(inner))
}

export function formulaFromDisplay(text, labels) {
  return replaceRefTokens(text, (inner) => labels.byLabel.get(inner))
}

function formulaStaticType(type) {
  switch (type) {
    case 'number':
      return 'number'
    case 'input':
    case 'textarea':
    case 'radio':
    case 'select':
    case 'select-multiple':
    case 'checkbox':
    case 'serialNumber':
      return 'string'
    case 'date':
    case 'time':
    case 'datetime':
      return 'date'
    default:
      return 'unknown'
  }
}

function walkRefNodes(node, inAggregate, cb) {
  if (!node || typeof node !== 'object') return
  if (node.kind === 'ref') {
    cb(node, inAggregate)
    return
  }
  if (node.kind === 'call') {
    const aggregate = AGGREGATE_FUNCTION_NAMES.includes(node.name)
    for (const arg of node.args) walkRefNodes(arg, inAggregate || aggregate, cb)
    return
  }
  if (node.kind === 'binary') {
    walkRefNodes(node.left, inAggregate, cb)
    walkRefNodes(node.right, inAggregate, cb)
    return
  }
  if (node.kind === 'unary') {
    walkRefNodes(node.operand, inAggregate, cb)
  }
}

// 与服务端 assertFormulaSchemas 的校验口径一致，编辑器先拦一遍
export function validateFormulaConfig(expr, { field, fields }) {
  const parsed = parseFormula(expr)
  if (!parsed.ok) {
    const error = parsed.error
    if (error.code === 'syntax') {
      return {
        ok: false,
        message: `公式语法错误：第 ${error.line} 行第 ${error.column} 列附近（${error.message}）`,
      }
    }
    return { ok: false, message: error.message }
  }
  const groups = buildFormulaRefGroups(fields || [], field)
  const itemsByPath = new Map()
  for (const group of groups) {
    for (const item of group.items) itemsByPath.set(item.path.join('.'), item)
  }
  let refError = null
  walkRefNodes(parsed.ast, false, (ref, inAggregate) => {
    if (refError) return
    const token = `$'${ref.path.join('.')}'`
    if (inAggregate) {
      if (ref.path.length !== 2) {
        refError = '聚合函数参数请选择子表单数字字段'
        return
      }
      const item = itemsByPath.get(ref.path.join('.'))
      if (!item || item.type !== 'number') {
        refError = '聚合函数参数请选择子表单数字字段'
      }
      return
    }
    if (ref.path.length !== 1 || !itemsByPath.get(ref.path[0])) {
      refError = `公式引用了不存在的字段 ${token}`
    }
  })
  if (refError) return { ok: false, message: refError }
  const inferred = inferType(parsed.ast, (path) =>
    formulaStaticType(itemsByPath.get(path.join('.'))?.type),
  )
  if (!inferred.ok) return { ok: false, message: inferred.error.message }
  const rootType = inferred.type
  if (
    (field?.type === 'number' &&
      rootType !== 'number' &&
      rootType !== 'unknown') ||
    (DATE_LIKE_FIELD_TYPES.includes(field?.type) &&
      !['date', 'number', 'unknown'].includes(rootType))
  ) {
    return { ok: false, message: '公式结果类型与字段不匹配' }
  }
  return { ok: true, refs: parsed.refs }
}
