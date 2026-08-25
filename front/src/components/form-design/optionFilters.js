export const FILTER_OPS = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'ncontains', label: '不包含' },
  { value: 'empty', label: '为空' },
  { value: 'nempty', label: '不为空' },
]

export const FILTER_MATCH_OPTIONS = [
  { value: 'all', label: '所有' },
  { value: 'any', label: '任一' },
]

export function emptyCondition() {
  return {
    key: '',
    op: 'eq',
    valueType: 'custom',
    value: '',
  }
}

export function cloneOptionFilters(raw) {
  return {
    match: raw?.match === 'any' ? 'any' : 'all',
    conditions: Array.isArray(raw?.conditions)
      ? raw.conditions.map((item) => ({
          key: item.key || '',
          op: item.op || 'eq',
          valueType: item.valueType === 'field' ? 'field' : 'custom',
          value: item.value ?? '',
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
