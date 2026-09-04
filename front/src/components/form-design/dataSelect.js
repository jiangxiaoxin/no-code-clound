import { flattenFields } from './tabsField.js'
import { isSelectType } from './fieldTypes'
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

export function fillInfluencerTips(fields) {
  fields = flattenFields(fields)
  const namesByTarget = {}
  function collect(list) {
    for (const field of list || []) {
      if (field.type === 'subform') {
        collect(field.fields)
        continue
      }
      if (field.type !== 'data' && field.type !== 'relate') continue
      const name =
        (typeof field.title === 'string' && field.title.trim()) || field.key
      if (!name) continue
      for (const item of cloneFillMappings(field.fillMappings)) {
        if (!item.sourceKey || !item.targetKey) continue
        const list =
          namesByTarget[item.targetKey] || (namesByTarget[item.targetKey] = [])
        if (!list.includes(name)) list.push(name)
      }
    }
  }
  collect(fields)
  const tips = {}
  for (const [key, names] of Object.entries(namesByTarget)) {
    tips[key] = `会受 [ ${names.join('、')} ] 字段影响`
  }
  return tips
}

export function sourceDictCodes(fields) {
  const codes = []
  const seen = new Set()
  for (const field of fields || []) {
    const usesDict =
      (field.type === 'radio' ||
        field.type === 'checkbox' ||
        isSelectType(field.type)) &&
      (field.optionSource || 'dictionary') === 'dictionary' &&
      field.dictCode
    if (!usesDict || seen.has(field.dictCode)) continue
    seen.add(field.dictCode)
    codes.push(field.dictCode)
  }
  return codes
}
