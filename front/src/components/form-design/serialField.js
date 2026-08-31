import { flattenFields } from './tabsField.js'

export const DEFAULT_SERIAL_SEPARATOR = '-'

export const SERIAL_DATETIME_OPTIONS = [
  { value: 'YYYY', label: '2025' },
  { value: 'YYYYMM', label: '202508' },
  { value: 'YYYYMMDD', label: '20250823' },
  { value: 'YYYYMMDDHHmmss', label: '20250823102035' },
  { value: 'epochMs', label: '毫秒时间戳' },
]

export const SERIAL_RESET_PERIODS = [
  { value: 'day', label: '天' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季度' },
  { value: 'year', label: '年' },
]

export function isSerialField(field) {
  return field?.type === 'serialNumber'
}

export function hasSerialNumberField(fields) {
  return flattenFields(fields).some(isSerialField)
}

export function countSerialCounters(rule) {
  return (rule || []).filter((item) => item?.kind === 'counter').length
}

export function canAddSerialCounter(rule) {
  return countSerialCounters(rule) === 0
}

export function serialSeparatorOf(field) {
  if (field == null || field.serialSeparator == null) {
    return DEFAULT_SERIAL_SEPARATOR
  }
  return String(field.serialSeparator).trim().slice(0, 8)
}

export function newSerialSegment(kind) {
  const id = crypto.randomUUID()
  if (kind === 'fixed') {
    return { id, kind: 'fixed', text: '' }
  }
  if (kind === 'datetime') {
    return { id, kind: 'datetime', format: 'YYYYMMDD' }
  }
  if (kind === 'counter') {
    return { id, kind: 'counter', start: 1, digits: 5, reset: false }
  }
  return { id, kind: 'field', fieldKey: '' }
}

export function createDefaultSerialField(key) {
  return {
    type: 'serialNumber',
    key,
    component: 'SerialNumber',
    title: '流水号生成',
    placeholder: '保存后自动生成',
    width: '1',
    required: false,
    disabled: false,
    editable: true,
    description: '',
    serialSeparator: DEFAULT_SERIAL_SEPARATOR,
    serialRule: [
      newSerialSegment('datetime'),
      newSerialSegment('counter'),
    ],
  }
}

export function serialRefFields(fields, serialKey) {
  return flattenFields(fields).filter(
    (item) =>
      item?.key &&
      item.key !== serialKey &&
      (item.type === 'input' || item.type === 'number'),
  )
}

export function reorderSerialRule(rule, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return rule
  const list = rule || []
  const from = list.findIndex((item) => item.id === fromId)
  const to = list.findIndex((item) => item.id === toId)
  if (from < 0 || to < 0) return list
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return list
}

function resetPeriodLabel(period) {
  return SERIAL_RESET_PERIODS.find((item) => item.value === period)?.label || period
}

export function serialSegmentSummary(seg, fields) {
  if (!seg) return ''
  if (seg.kind === 'fixed') {
    const text = String(seg.text || '')
    return text || '固定字符'
  }
  if (seg.kind === 'datetime') {
    return (
      SERIAL_DATETIME_OPTIONS.find((item) => item.value === seg.format)?.label ||
      seg.format ||
      '日期时间'
    )
  }
  if (seg.kind === 'counter') {
    const start = Number.isInteger(seg.start) ? seg.start : 1
    const digits = Number.isInteger(seg.digits) ? seg.digits : 5
    const resetText = seg.reset
      ? `按${resetPeriodLabel(seg.resetPeriod || 'day')}重置`
      : '不重置'
    return `起始 ${start} / ${digits} 位 / ${resetText}`
  }
  if (seg.kind === 'field') {
    const found = flattenFields(fields).find((item) => item.key === seg.fieldKey)
    if (!found) return '字段已删除'
    return found.title || found.key
  }
  return ''
}
