import { flattenFields } from '../form-design/tabsField.js'
import { asDate, formatTimeFieldValue, parseCalendarParts } from '../../utils/timeValue.js'
import {
  isAddressEmpty,
  isAddressValueReady,
  normalizeAddressValue,
  addressDisplay,
} from './addressField.js'
import { fileItemsOf } from './fileField.js'
import { imageUrlsOf } from './imageField.js'
import {
  emptySubformRow,
  stripEmptySubformRows,
  subformRowsRequiredError,
  uniqueInRowsError,
} from './subformField.js'

const SKIP_TYPES = new Set([
  'divider',
  'currentUser',
  'currentUserDept',
  'subform',
  'member',
  'dept',
  'data',
  'relate',
  'tabs',
  'serialNumber',
])

export function isFillable(field) {
  return Boolean(field?.key) && !SKIP_TYPES.has(field.type)
}

export function isListColumn(field) {
  return (
    isFillable(field) ||
    field?.type === 'subform' ||
    field?.type === 'serialNumber'
  )
}

function persistsValue(field) {
  return isFillable(field) || field.type === 'data' || field.type === 'subform'
}

export function emptyValue(field) {
  if (field.type === 'subform') {
    return []
  }
  if (
    field.type === 'checkbox' ||
    field.type === 'select-multiple' ||
    field.type === 'image' ||
    field.type === 'file'
  ) {
    return []
  }
  return undefined
}

function defaultSubformRows(field) {
  if (field.optionSource === 'linkage') {
    return []
  }
  const count = Number(field.defaultRowCount)
  const n = Number.isInteger(count) ? Math.min(10, Math.max(0, count)) : 0
  return Array.from({ length: n }, () => emptySubformRow(field.fields))
}

export function emptyRecordValues(fields) {
  fields = flattenFields(fields)
  const next = {}
  for (const field of fields) {
    if (!persistsValue(field)) {
      continue
    }
    next[field.key] =
      field.type === 'subform' ? defaultSubformRows(field) : emptyValue(field)
  }
  return next
}

export function cloneRecordValues(fields, data) {
  fields = flattenFields(fields)
  const next = {}
  for (const field of fields) {
    if (field.type === 'subform') {
      const rows = Array.isArray(data?.[field.key]) ? data[field.key] : []
      next[field.key] = rows.map((row) =>
        cloneRecordValues(field.fields || [], row),
      )
      continue
    }
    if (field.type === 'data') {
      const value = data?.[field.key]
      next[field.key] =
        typeof value === 'string' && value ? value : undefined
      continue
    }
    if (field.type === 'image') {
      next[field.key] = imageUrlsOf(data?.[field.key])
      continue
    }
    if (field.type === 'file') {
      next[field.key] = fileItemsOf(data?.[field.key])
      continue
    }
    if (field.type === 'serialNumber') {
      const value = data?.[field.key]
      next[field.key] = typeof value === 'string' ? value : undefined
      continue
    }
    if (field.type === 'address') {
      const raw = normalizeAddressValue(data?.[field.key])
      next[field.key] = raw.ids.length
        ? {
            ids: [...raw.ids],
            labels: [...raw.labels],
            ...(raw.detail ? { detail: raw.detail } : {}),
          }
        : undefined
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
  if (field.type === 'image') {
    return imageUrlsOf(value).length === 0
  }
  if (field.type === 'file') {
    return fileItemsOf(value).length === 0
  }
  if (field.type === 'address') {
    return isAddressEmpty(value)
  }
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    return !Array.isArray(value) || value.length === 0
  }
  if (field.type === 'number') {
    return value == null || value === ''
  }
  return value == null || value === ''
}

export function serializeValue(field, value) {
  if (field.type === 'subform') {
    const rows = stripEmptySubformRows(field.fields, value).map((row) => {
      const next = {}
      for (const child of field.fields || []) {
        const cell = serializeValue(child, row[child.key])
        if (cell !== undefined) {
          next[child.key] = cell
        }
      }
      return next
    })
    return rows
  }
  if (isEmptyValue(field, value)) {
    return undefined
  }
  if (field.type === 'image') {
    const urls = imageUrlsOf(value)
    return urls.length ? urls : undefined
  }
  if (field.type === 'file') {
    const items = fileItemsOf(value)
    return items.length ? items : undefined
  }
  if (field.type === 'address') {
    const next = normalizeAddressValue(value)
    return next.ids.length ? next : undefined
  }
  if (field.type === 'date') {
    // YYYY-MM-DD 按日历日期读，避免被当成 UTC 零点后在西时区变成前一天
    const parts = parseCalendarParts(value)
    if (!parts) return undefined
    if (field.format === 'year') return `${parts.y}-01-01`
    if (field.format === 'month') return `${parts.y}-${parts.m}-01`
    return `${parts.y}-${parts.m}-${parts.d}`
  }
  if (field.type === 'datetime') {
    const d = asDate(value)
    return d ? d.toISOString() : undefined
  }
  if (field.type === 'time') {
    if (typeof value === 'string') return value
    const d = asDate(value)
    if (!d) return undefined
    return formatTimeFieldValue('time', field.format, d)
  }
  return value
}

export function buildRecordData(fields, values, { clearEmpty = false } = {}) {
  fields = flattenFields(fields)
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

export function firstRequiredError(fields, values) {
  for (const field of flattenFields(fields)) {
    if (field.type === 'subform') {
      const required = subformRowsRequiredError(field, values[field.key])
      if (required) {
        return { message: required, key: field.key }
      }
      const unique = uniqueInRowsError(
        field.fields,
        stripEmptySubformRows(field.fields, values[field.key]),
      )
      if (unique) {
        return { message: unique, key: field.key }
      }
      continue
    }
    if (!isFillable(field) || !field.required) continue
    const missing =
      field.type === 'address'
        ? !isAddressValueReady(field, values[field.key])
        : isEmptyValue(field, values[field.key])
    if (missing) {
      return {
        message: `请填写「${field.title || '未命名'}」`,
        key: field.key,
      }
    }
  }
  return null
}

export function validateRequired(fields, values) {
  return firstRequiredError(fields, values)?.message || ''
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
  'address',
])

export function isInlineEditable(field) {
  return (
    isFillable(field) &&
    INLINE_EDIT_TYPES.has(field.type) &&
    !field.disabled &&
    field.editable !== false &&
    field.optionSource !== 'linkage'
  )
}

export function cloneCellValue(field, value) {
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    return Array.isArray(value) ? [...value] : []
  }
  if (field.type === 'address') {
    const raw = normalizeAddressValue(value)
    if (!raw.ids.length) return undefined
    return {
      ids: [...raw.ids],
      labels: [...raw.labels],
      ...(raw.detail ? { detail: raw.detail } : {}),
    }
  }
  return value == null ? emptyValue(field) : value
}

export function valuesEqual(field, a, b) {
  return (
    JSON.stringify(serializeValue(field, a) ?? null) ===
    JSON.stringify(serializeValue(field, b) ?? null)
  )
}

function formatSubformCellValue(field, value, dictItemsByCode) {
  const rows = stripEmptySubformRows(field.fields, value)
  if (!rows.length) return ''
  return rows
    .map((row) =>
      (field.fields || [])
        .map((child) => formatCellValue(child, row[child.key], dictItemsByCode))
        .filter(Boolean)
        .join(' / '),
    )
    .filter(Boolean)
    .join('；')
}

export function formatCellValue(field, value, dictItemsByCode) {
  if (field?.type === 'subform') {
    return formatSubformCellValue(field, value, dictItemsByCode)
  }
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
  if (field.type === 'image') {
    const urls = imageUrlsOf(value)
    return urls.length ? `${urls.length} 张图片` : ''
  }
  if (field.type === 'file') {
    return fileItemsOf(value)
      .map((item) => item.name)
      .join('、')
  }
  if (field.type === 'address') {
    return addressDisplay(value)
  }
  if (Array.isArray(value)) return value.join('、')
  return String(value)
}
