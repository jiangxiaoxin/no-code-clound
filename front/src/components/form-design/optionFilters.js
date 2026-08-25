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
