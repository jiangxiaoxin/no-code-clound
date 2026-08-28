import { dayjs, formatTimeFieldValue } from '../../utils/timeValue.js'

export const FILTER_OPS = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'ncontains', label: '不包含' },
  { value: 'empty', label: '为空' },
  { value: 'nempty', label: '不为空' },
]

export const TIME_FILTER_OPS = [
  { value: 'between', label: '选择范围' },
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lte', label: '小于等于' },
  { value: 'dynamic', label: '动态筛选' },
]

export const FILTER_MATCH_OPTIONS = [
  { value: 'all', label: '所有' },
  { value: 'any', label: '任一' },
]

export const FILTER_SYSTEM_FIELDS = [
  { key: 'createdBy', title: '创建人', type: 'member' },
  { key: 'updatedBy', title: '更新人', type: 'member' },
  { key: 'createdAt', title: '创建时间', type: 'datetime' },
  { key: 'updatedAt', title: '更新时间', type: 'datetime' },
]

export const PERSON_FILTER_OPS = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'empty', label: '为空' },
  { value: 'nempty', label: '不为空' },
]

const TIME_FILTER_TYPES = new Set(['date', 'time', 'datetime'])
const DYNAMIC_UNITS = [
  { value: 'day', label: '天' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
  { value: 'year', label: '年' },
]
const DYNAMIC_AMOUNTS = Array.from({ length: 31 }, (_, index) => {
  const value = String(index + 1)
  return { value, label: value, children: DYNAMIC_UNITS }
})

export const DYNAMIC_FILTER_OPTIONS = [
  { value: 'current', label: '当前', children: DYNAMIC_UNITS },
  { value: 'past', label: '过去', children: DYNAMIC_AMOUNTS },
  { value: 'future', label: '未来', children: DYNAMIC_AMOUNTS },
]

export function isTimeFilterField(type) {
  return TIME_FILTER_TYPES.has(type)
}

export function emptyCondition(valueType = 'custom') {
  return {
    key: '',
    op: 'eq',
    valueType: valueType === 'field' ? 'field' : 'custom',
    sourceType: '',
    sourceFormat: '',
    value: '',
  }
}

function cloneConditionValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => (Array.isArray(item) ? [...item] : item))
  }
  if (value && typeof value === 'object') {
    return {
      start: Array.isArray(value.start) ? [...value.start] : (value.start ?? ''),
      end: Array.isArray(value.end) ? [...value.end] : (value.end ?? ''),
    }
  }
  return value ?? ''
}

function cloneValueType(valueType) {
  if (valueType === 'field' || valueType === 'dynamic') return valueType
  return 'custom'
}

export function cloneOptionFilters(raw) {
  return {
    match: raw?.match === 'any' ? 'any' : 'all',
    conditions: Array.isArray(raw?.conditions)
      ? raw.conditions.map((item) => ({
          key: item.key || '',
          op: item.op || 'eq',
          valueType: cloneValueType(item.valueType),
          sourceType: item.sourceType || '',
          sourceFormat: item.sourceFormat || '',
          value: cloneConditionValue(item.value),
        }))
      : [],
  }
}

export function hasOptionFilters(raw) {
  return Array.isArray(raw?.conditions) && raw.conditions.length > 0
}

export function needsFilterValue(op) {
  return op !== 'empty' && op !== 'nempty'
}

export function opsForFieldType(type) {
  if (isTimeFilterField(type)) return TIME_FILTER_OPS
  if (type === 'member') return PERSON_FILTER_OPS
  return FILTER_OPS
}

export function withFilterSystemFields(sourceFields) {
  const fields = sourceFields || []
  const used = new Set(fields.map((field) => field.key))
  return [
    ...fields,
    ...FILTER_SYSTEM_FIELDS.filter((field) => !used.has(field.key)),
  ]
}

export function emptyValueForOp(op) {
  if (op === 'between') return []
  if (op === 'dynamic') return { start: [], end: [] }
  return ''
}

export function valueTypeForTimeOp(op) {
  if (op === 'between') return 'custom'
  if (op === 'dynamic') return 'dynamic'
  return 'field'
}

export function sourceFieldDictCode(field) {
  if (!field || field.optionSource === 'table_data') return ''
  if (field.dictCode == null || field.dictCode === '') return ''
  return String(field.dictCode)
}

export function mapDictFilterValue(value, items) {
  if (typeof value !== 'string' || !items?.length) return value
  if (items.some((item) => item.value === value)) return value
  const found = items.find((item) => item.label === value)
  return found ? found.value : value
}

function periodOf(d, unit) {
  const t = dayjs(d)
  if (unit === 'week') {
    return { start: t.startOf('isoWeek').toDate(), end: t.endOf('isoWeek').toDate() }
  }
  if (unit === 'month') {
    return { start: t.startOf('month').toDate(), end: t.endOf('month').toDate() }
  }
  if (unit === 'quarter') {
    return { start: t.startOf('quarter').toDate(), end: t.endOf('quarter').toDate() }
  }
  if (unit === 'year') {
    return { start: t.startOf('year').toDate(), end: t.endOf('year').toDate() }
  }
  return { start: t.startOf('day').toDate(), end: t.endOf('day').toDate() }
}

function shiftByUnit(d, amount, unit) {
  const t = dayjs(d)
  if (unit === 'week') return t.add(amount, 'week').toDate()
  if (unit === 'month') return t.add(amount, 'month').toDate()
  if (unit === 'quarter') return t.add(amount, 'quarter').toDate()
  if (unit === 'year') return t.add(amount, 'year').toDate()
  return t.add(amount, 'day').toDate()
}

export function resolveDynamicPath(path, bound, fieldType, now = new Date(), format) {
  if (!Array.isArray(path) || !path.length) return ''
  const dir = path[0]
  let unit = path[1]
  let amount = 0
  if (dir === 'past' || dir === 'future') {
    amount = Number(path[1])
    unit = path[2]
    if (!Number.isInteger(amount) || amount < 1) return ''
  } else if (dir !== 'current') {
    return ''
  }
  if (!unit) return ''
  const signed = dir === 'past' ? -amount : amount
  const period = periodOf(shiftByUnit(now, signed, unit), unit)
  const d = bound === 'end' ? period.end : period.start
  return formatTimeFieldValue(fieldType || 'date', format, d)
}
