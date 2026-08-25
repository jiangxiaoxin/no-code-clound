export function buildSourceQuery(optionFilters, values) {
  const match = optionFilters?.match === 'any' ? 'any' : 'all'
  const filters = []
  for (const item of optionFilters?.conditions || []) {
    if (!item.key || !item.op) continue
    if (item.op === 'empty' || item.op === 'nempty') {
      filters.push({ key: item.key, op: item.op })
      continue
    }
    let value = item.value
    if (item.valueType === 'field') {
      if (!item.value) continue
      value = values?.[item.value]
      if (Array.isArray(value)) {
        value = value.length === 1 ? value[0] : undefined
      }
    }
    if (value == null || value === '') continue
    filters.push({ key: item.key, op: item.op, value })
  }
  return { match, filters, page: 1, pageSize: 100 }
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
