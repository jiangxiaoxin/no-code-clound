import { asDate, formatTimeFieldValue, pad } from '../../utils/timeValue.js'

const SKIP_TYPES = new Set([
  'divider',
  'image',
  'file',
  'subform',
  'member',
  'dept',
  'data',
  'relate',
])

export function isFillable(field) {
  return Boolean(field?.key) && !SKIP_TYPES.has(field.type)
}

function persistsValue(field) {
  return isFillable(field) || field.type === 'data'
}

export function emptyValue(field) {
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    return []
  }
  return undefined
}

export function emptyRecordValues(fields) {
  const next = {}
  for (const field of fields) {
    if (persistsValue(field)) {
      next[field.key] = emptyValue(field)
    }
  }
  return next
}

export function cloneRecordValues(fields, data) {
  const next = {}
  for (const field of fields) {
    if (field.type === 'data') {
      const value = data?.[field.key]
      next[field.key] =
        typeof value === 'string' && value ? value : undefined
      continue
    }
    if (!isFillable(field)) {
      continue
    }
    const value = data?.[field.key]
    next[field.key] =
      value == null ? emptyValue(field) : Array.isArray(value) ? [...value] : value
  }
  return next
}

export function isEmptyValue(field, value) {
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    return !Array.isArray(value) || value.length === 0
  }
  if (field.type === 'number') {
    return value == null || value === ''
  }
  return value == null || value === ''
}

export function serializeValue(field, value) {
  if (isEmptyValue(field, value)) {
    return undefined
  }
  if (field.type === 'date') {
    const d = asDate(value)
    if (!d) return undefined
    const y = d.getFullYear()
    const m = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    if (field.format === 'year') return `${y}-01-01`
    if (field.format === 'month') return `${y}-${m}-01`
    return `${y}-${m}-${day}`
  }
  if (field.type === 'datetime') {
    const d = asDate(value)
    return d ? d.toISOString() : undefined
  }
  if (field.type === 'time') {
    if (typeof value === 'string') return value
    const d = asDate(value)
    if (!d) return undefined
    const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    return (field.format || 'HH:mm:ss') === 'HH:mm' ? clock.slice(0, 5) : clock
  }
  return value
}

export function buildRecordData(fields, values, { clearEmpty = false } = {}) {
  const data = {}
  for (const field of fields) {
    if (!persistsValue(field)) continue
    const next = serializeValue(field, values[field.key])
    if (next !== undefined) {
      data[field.key] = next
    } else if (clearEmpty) {
      data[field.key] = null
    }
  }
  return data
}

export function validateRequired(fields, values) {
  for (const field of fields) {
    if (!isFillable(field) || !field.required) continue
    if (isEmptyValue(field, values[field.key])) {
      return `请填写「${field.title || '未命名'}」`
    }
  }
  return ''
}

const INLINE_EDIT_TYPES = new Set([
  'input',
  'textarea',
  'number',
  'radio',
  'checkbox',
  'select',
  'select-multiple',
  'date',
  'time',
  'datetime',
])

export function isInlineEditable(field) {
  return isFillable(field) && INLINE_EDIT_TYPES.has(field.type)
}

export function cloneCellValue(field, value) {
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    return Array.isArray(value) ? [...value] : []
  }
  return value == null ? emptyValue(field) : value
}

export function valuesEqual(field, a, b) {
  return (
    JSON.stringify(serializeValue(field, a) ?? null) ===
    JSON.stringify(serializeValue(field, b) ?? null)
  )
}

export function formatCellValue(field, value, dictItemsByCode) {
  if (value == null || value === '') return ''
  /**
   * 下拉多选，要么按照字典选，要么是按照其他表数据选
   * 按照字典选，记录的是字典项的value。value不可变，label随便变，变了以后会跟着刷新显示
   * 按照其他表数据选，选的是表里数据的某个字段，存的也是这个字段的值，所以数据源里修改了数据，下拉这里不会跟着一起变
   */
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    const items = dictItemsByCode[field.dictCode] || []
    const map = Object.fromEntries(items.map((item) => [item.value, item.label]))
    return (Array.isArray(value) ? value : [value])
      .map((item) => map[item] || item)
      .join('、')
  }
  if (
    field.type === 'radio' ||
    field.type === 'select'
  ) {
    const items = dictItemsByCode[field.dictCode] || []
    const found = items.find((item) => item.value === value)
    return found ? found.label : String(value)
  }
  if (field.type === 'date' || field.type === 'time' || field.type === 'datetime') {
    const d = asDate(value)
    if (!d) return String(value)
    return formatTimeFieldValue(field.type, field.format, d)
  }
  if (Array.isArray(value)) return value.join('、')
  return String(value)
}
