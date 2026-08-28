import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import isoWeek from 'dayjs/plugin/isoWeek.js'
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js'

dayjs.extend(customParseFormat)
dayjs.extend(isoWeek)
dayjs.extend(quarterOfYear)

export { dayjs }

const DATE_ONLY = ['YYYY', 'YYYY-MM', 'YYYY-MM-DD']
const WALL_CLOCK = [
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DDTHH:mm:ss',
]
const CLOCK = ['HH:mm:ss', 'HH:mm']

export function asDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' && value !== '') {
    if (/^\d{4}$/.test(value) || /^\d{4}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = dayjs(value, DATE_ONLY, true)
      return parsed.isValid() ? parsed.toDate() : null
    }
    const wall = dayjs(value, WALL_CLOCK, true)
    if (wall.isValid()) return wall.toDate()
    if (/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
      const clock = dayjs(`1970-01-01 ${value}`, [
        'YYYY-MM-DD HH:mm:ss',
        'YYYY-MM-DD HH:mm',
      ], true)
      return clock.isValid() ? clock.toDate() : null
    }
  }
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.toDate() : null
}

export function formatTimeFieldValue(type, format, d) {
  const t = dayjs(d)
  if (!t.isValid()) return ''
  if (type === 'time') {
    return t.format((format || 'HH:mm:ss') === 'HH:mm' ? 'HH:mm' : 'HH:mm:ss')
  }
  if (type === 'datetime') {
    return t.format(format || 'YYYY-MM-DD HH:mm:ss')
  }
  if (format === 'year') return t.format('YYYY')
  if (format === 'month') return t.format('YYYY-MM')
  return t.format('YYYY-MM-DD')
}

export function formatQueryTimeValue(type, format, value) {
  const d = asDate(value)
  if (!d) return ''
  return formatTimeFieldValue(type, format, d)
}

export function formatDateTime(value, emptyText = '') {
  if (value == null || value === '') return emptyText
  const t = dayjs(value)
  return t.isValid() ? t.format('YYYY-MM-DD HH:mm:ss') : String(value)
}

export function parseCalendarParts(value) {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const day = dayjs(value.slice(0, 10), 'YYYY-MM-DD', true)
      if (day.isValid()) {
        return { y: day.format('YYYY'), m: day.format('MM'), d: day.format('DD') }
      }
    }
    if (/^\d{4}-\d{2}$/.test(value)) {
      const month = dayjs(value, 'YYYY-MM', true)
      if (month.isValid()) {
        return { y: month.format('YYYY'), m: month.format('MM'), d: '01' }
      }
    }
    if (/^\d{4}$/.test(value)) {
      const year = dayjs(value, 'YYYY', true)
      if (year.isValid()) {
        return { y: year.format('YYYY'), m: '01', d: '01' }
      }
    }
  }
  const d = asDate(value)
  if (!d) return null
  const t = dayjs(d)
  return { y: t.format('YYYY'), m: t.format('MM'), d: t.format('DD') }
}
