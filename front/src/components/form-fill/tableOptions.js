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
  for (const row of records || []) {
    const value = row?.data?.[fieldKey]
    if (value == null || value === '' || Array.isArray(value) || seen.has(value)) {
      continue
    }
    seen.add(value)
    items.push({ label: String(value), value })
  }
  return items
}
