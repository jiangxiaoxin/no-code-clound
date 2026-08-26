import {
  CREATED_AT_KEY,
  CREATED_BY_KEY,
  UPDATED_AT_KEY,
  UPDATED_BY_KEY,
} from '../form-workspace/columnPrefs'

export const DATA_SELECT_SYSTEM_FIELDS = [
  { key: CREATED_BY_KEY, title: '创建人' },
  { key: CREATED_AT_KEY, title: '创建时间' },
  { key: UPDATED_BY_KEY, title: '更新人' },
  { key: UPDATED_AT_KEY, title: '更新时间' },
]

export function cloneDisplayFieldKeys(raw) {
  return Array.isArray(raw)
    ? raw.filter((key) => typeof key === 'string' && key)
    : []
}

export function cloneDisplayFieldLabels(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const next = {}
  for (const [key, title] of Object.entries(raw)) {
    if (key && typeof title === 'string' && title) {
      next[key] = title
    }
  }
  return next
}

export function displayFieldTitle(field, key) {
  const title = field?.displayFieldLabels?.[key]
  return typeof title === 'string' && title ? title : key
}

export function findDisplaySourceField(sourceFields, key) {
  return (
    (sourceFields || []).find((field) => field.key === key) ||
    DATA_SELECT_SYSTEM_FIELDS.find((field) => field.key === key) ||
    null
  )
}

export function withSystemDisplayFields(sourceFields) {
  return [...(sourceFields || []), ...DATA_SELECT_SYSTEM_FIELDS]
}

export function cloneFillMappings(raw) {
  return Array.isArray(raw)
    ? raw.map((item) => ({
        sourceKey: item?.sourceKey || '',
        targetKey: item?.targetKey || '',
      }))
    : []
}

export function hasDisplayFieldKeys(raw) {
  return cloneDisplayFieldKeys(raw).length > 0
}

export function hasFillMappings(raw) {
  return cloneFillMappings(raw).some((item) => item.sourceKey && item.targetKey)
}
