export function pad(n) {
  return String(n).padStart(2, '0')
}

export function asDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' && value !== '') {
    if (/^\d{4}$/.test(value)) return new Date(Number(value), 0, 1)
    if (/^\d{4}-\d{2}$/.test(value)) {
      const [year, month] = value.split('-').map(Number)
      return new Date(year, month - 1, 1)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number)
      return new Date(year, month - 1, day)
    }
    const wall = value.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
    )
    if (wall) {
      return new Date(
        Number(wall[1]),
        Number(wall[2]) - 1,
        Number(wall[3]),
        Number(wall[4]),
        Number(wall[5]),
        Number(wall[6] || 0),
      )
    }
    const clock = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
    if (clock) {
      return new Date(
        1970,
        0,
        1,
        Number(clock[1]),
        Number(clock[2]),
        Number(clock[3] || 0),
      )
    }
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTimeFieldValue(type, format, d) {
  if (type === 'time') {
    const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    return (format || 'HH:mm:ss') === 'HH:mm' ? clock.slice(0, 5) : clock
  }
  if (type === 'datetime') {
    const text = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    return (format || 'YYYY-MM-DD HH:mm:ss') === 'YYYY-MM-DD HH:mm'
      ? text.slice(0, 16)
      : text
  }
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  if (format === 'year') return String(year)
  if (format === 'month') return `${year}-${month}`
  return `${year}-${month}-${day}`
}

export function formatQueryTimeValue(type, format, value) {
  const d = asDate(value)
  if (!d) return ''
  return formatTimeFieldValue(type, format, d)
}
