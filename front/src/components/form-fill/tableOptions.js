import {
  isTimeFilterField,
  resolveDynamicPath,
} from '../form-design/optionFilters.js'
import { formatQueryTimeValue } from '../../utils/timeValue.js'

function hasText(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every((item) => item != null && item !== '')
  return value != null && value !== ''
}

function betweenFilter(key, start, end) {
  if (hasText(start) && hasText(end)) {
    return { key, op: 'between', value: [start, end] }
  }
  if (hasText(start)) return { key, op: 'gte', value: start }
  if (hasText(end)) return { key, op: 'lte', value: end }
  return null
}

function findValueField(formFields, key) {
  return (formFields || []).find((field) => field.key === key)
}

function serializeCompareValue(item, value, valueField) {
  const type = valueField?.type || item.sourceType
  const format = valueField?.format || item.sourceFormat
  if (!isTimeFilterField(type)) {
    return { value }
  }
  const next = formatQueryTimeValue(type, format, value)
  return next ? { value: next } : null
}

export function buildSourceQuery(optionFilters, values, formFields, paging) {
  const match = optionFilters?.match === 'any' ? 'any' : 'all'
  const filters = []
  for (const item of optionFilters?.conditions || []) {
    if (!item.key || !item.op) continue
    if (item.op === 'empty' || item.op === 'nempty') {
      filters.push({ key: item.key, op: item.op })
      continue
    }
    if (item.op === 'between') {
      const range = Array.isArray(item.value) ? item.value : []
      const next = betweenFilter(item.key, range[0], range[1])
      if (next) filters.push(next)
      continue
    }
    if (item.op === 'dynamic') {
      const start = resolveDynamicPath(
        item.value?.start,
        'start',
        item.sourceType,
        undefined,
        item.sourceFormat,
      )
      const end = resolveDynamicPath(
        item.value?.end,
        'end',
        item.sourceType,
        undefined,
        item.sourceFormat,
      )
      const next = betweenFilter(item.key, start, end)
      if (next) filters.push(next)
      continue
    }
    let value = item.value
    let valueField = null
    if (item.valueType === 'field') {
      if (!item.value) continue
      valueField = findValueField(formFields, item.value)
      value = values?.[item.value]
      if (Array.isArray(value)) {
        value = value.length === 1 ? value[0] : undefined
      }
    }
    if (value == null || value === '') continue
    const serialized = serializeCompareValue(item, value, valueField)
    if (!serialized) continue
    filters.push({
      key: item.key,
      op: item.op,
      ...serialized,
    })
  }
  // 这里写死了100条数据，那需要通过筛选条件将数据压到100条以下,才能满足下拉框的使用。否则有些数据，下拉框永远选不到
  // 而选择数据和关联数据，都是通过翻页table实现，怎么的都能查到数据
  return {
    match,
    filters,
    page: paging?.page ?? 1,
    pageSize: paging?.pageSize ?? 100,
  }
}

export function mergeFilterQueries(...parts) {
  const groups = parts.filter((item) => item?.filters?.length)
  if (!groups.length) return {}
  if (groups.length === 1) {
    return {
      match: groups[0].match || 'all',
      filters: groups[0].filters,
    }
  }
  return {
    groups: groups.map((item) => ({
      match: item.match || 'all',
      filters: item.filters,
    })),
  }
}

export function optionFieldLoadKey(field, values) {
  const formId = Number(field.sourceFormId)
  const resolved = Number.isInteger(formId) && formId > 0 ? formId : 0
  const refs = (field.optionFilters?.conditions || [])
    .filter((item) => item.valueType === 'field' && item.value)
    .map(
      (item) => `${item.value}=${JSON.stringify(values?.[item.value])}`,
    )
  return [
    resolved,
    field.sourceFieldKey,
    field.optionFilters?.match,
    JSON.stringify(field.optionFilters?.conditions || []),
    refs.join('&'),
  ].join(':')
}

export function recordsToSelectItems(records, fieldKey) {
  const seen = new Set()
  const items = []
  function add(value) {
    if (value == null || value === '') {
      return
    }
    if (Array.isArray(value)) {
      value.forEach(add)
      return
    }
    if (typeof value === 'object') {
      return
    }
    const next = typeof value === 'string' ? value : String(value)
    if (seen.has(next)) {
      return
    }
    seen.add(next)
    items.push({ label: next, value: next })
  }
  for (const row of records || []) {
    add(row?.data?.[fieldKey])
  }
  return items
}
