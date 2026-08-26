// 目前只有这些类型支持快捷筛选
export const QUICK_SEARCH_TYPES = new Set([
  'input',
  'textarea',
  'number',
  'select',
  'select-multiple',
  'radio',
  'checkbox',
])

export function isQuickSearchField(field) {
  return Boolean(field?.key) && QUICK_SEARCH_TYPES.has(field.type)
}

function usesDictOptions(field) {
  const isChoice =
    field.type === 'radio' ||
    field.type === 'checkbox' ||
    field.type === 'select' ||
    field.type === 'select-multiple'
  return (
    isChoice &&
    (field.optionSource || 'dictionary') === 'dictionary' &&
    field.dictCode
  )
}

function dictValuesMatching(items, keyword) {
  const q = keyword.toLowerCase()
  return (items || [])
    .filter((item) => {
      const label = String(item?.label ?? '').toLowerCase()
      const value = String(item?.value ?? '').toLowerCase()
      return label.includes(q) || value.includes(q)
    })
    .map((item) => item.value)
}

export function buildQuickSearchQuery(fields, keyword, dictItemsByCode = {}) {
  const q = typeof keyword === 'string' ? keyword.trim() : ''
  if (!q || !fields?.length) return null
  const filters = []
  for (const field of fields) {
    if (!isQuickSearchField(field)) continue
    if (usesDictOptions(field)) {
      const matched = dictValuesMatching(
        dictItemsByCode[field.dictCode],
        q,
      )
      if (matched.length) {
        filters.push({ key: field.key, op: 'in', value: matched })
        continue
      }
    }
    filters.push({ key: field.key, op: 'contains', value: q })
  }
  if (!filters.length) return null
  return { match: 'any', filters }
}

/**
 * 根据用户id，应用id，表单id生成的唯一key
 * 用于存储和获取快速筛选的偏好
 * @param {*} userId 
 * @param {*} appId 
 * @param {*} formId 
 * @returns 
 */
export function quickSearchStorageKey(userId, appId, formId) {
  if (!userId || !appId || !formId) return ''
  return `form-list-quick-search:${userId}:${appId}:${formId}`
}

export function normalizeQuickSearchPrefs(raw, fields) {
  const valid = new Set(
    (fields || []).filter(isQuickSearchField).map((field) => field.key),
  )
  const seen = new Set() //字段去重，但实际上有必要吗？key 是不会重复的
  const selectedKeys = []
  for (const key of Array.isArray(raw?.selectedKeys) ? raw.selectedKeys : []) {
    if (typeof key !== 'string' || !valid.has(key) || seen.has(key)) continue
    seen.add(key)
    selectedKeys.push(key)
  }
  return {
    mode: raw?.mode === 'specific' ? 'specific' : 'all',
    selectedKeys,
  }
}

export function loadQuickSearchPrefs(storageKey, fields) {
  if (!storageKey) return { mode: 'all', selectedKeys: [] }
  try {
    return normalizeQuickSearchPrefs(
      JSON.parse(localStorage.getItem(storageKey) || '{}'),
      fields,
    )
  } catch {
    return { mode: 'all', selectedKeys: [] }
  }
}

export function saveQuickSearchPrefs(storageKey, prefs, fields) {
  if (!storageKey || !fields?.length) return
  localStorage.setItem(
    storageKey,
    JSON.stringify(normalizeQuickSearchPrefs(prefs, fields)),
  )
}
