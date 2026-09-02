import { isSelectType } from './fieldTypes.js'
import {
  cloneOptionFilters,
  needsFilterValue,
  withFilterSystemFields,
} from './optionFilters.js'

export const LINKAGE_VALUE_TYPES = [
  'input',
  'textarea',
  'number',
  'date',
  'time',
  'datetime',
  'image',
  'file',
  'address',
  'member',
  'member-multiple',
  'dept',
  'dept-multiple',
]

export function hasLinkageSource(type) {
  return LINKAGE_VALUE_TYPES.includes(type) || type === 'select' || type === 'select-multiple'
}

export function optionSourceChoices(type) {
  if (type === 'dept' || type === 'dept-multiple') {
    return [
      { value: 'custom', label: '自定义' },
      { value: 'current_user_dept', label: '当前用户所在部门' },
      { value: 'linkage', label: '数据联动' },
    ]
  }
  if (LINKAGE_VALUE_TYPES.includes(type)) {
    return [
      { value: 'custom', label: '自定义' },
      { value: 'linkage', label: '数据联动' },
    ]
  }
  if (type === 'select' || type === 'select-multiple') {
    return [
      { value: 'dictionary', label: '系统字典表' },
      { value: 'table_data', label: '其他表数据' },
      { value: 'linkage', label: '数据联动' },
    ]
  }
  return []
}

function hasConditionValue(value) {
  if (Array.isArray(value)) {
    return value.some((item) => item != null && item !== '')
  }
  if (value && typeof value === 'object') {
    const start = value.start
    const end = value.end
    return (
      Array.isArray(start) &&
      start.length > 0 &&
      Array.isArray(end) &&
      end.length > 0
    )
  }
  return value != null && value !== ''
}

export function isCompleteCondition(item) {
  if (!item?.key || !item.op) return false
  if (!needsFilterValue(item.op)) return true
  if (item.valueType === 'field') return Boolean(item.value)
  return hasConditionValue(item.value)
}

export function cloneLinkage(raw) {
  const filters = cloneOptionFilters(raw)
  const id = Number(raw?.sourceFormId)
  return {
    sourceFormId: Number.isInteger(id) && id > 0 ? id : null,
    match: filters.match,
    conditions: filters.conditions,
    sourceKey: raw?.sourceKey || '',
  }
}

export function isLinkageConfigured(linkage) {
  const id = Number(linkage?.sourceFormId)
  if (!Number.isInteger(id) || id <= 0) return false
  if (!linkage?.sourceKey) return false
  return (linkage.conditions || []).some(isCompleteCondition)
}

export function hasLinkage(field) {
  return field?.optionSource === 'linkage' && isLinkageConfigured(field.linkage)
}

export function cloneSubformLinkage(raw) {
  const base = cloneLinkage(raw)
  return {
    ...base,
    sourceSubformKey: raw?.sourceSubformKey || '',
    fieldMappings: Array.isArray(raw?.fieldMappings)
      ? raw.fieldMappings.map((item) => ({
          sourceKey: item?.sourceKey || '',
          targetKey: item?.targetKey || '',
        }))
      : [],
  }
}

export function isSubformLinkageConfigured(linkage) {
  const id = Number(linkage?.sourceFormId)
  if (!Number.isInteger(id) || id <= 0) return false
  if (!linkage?.sourceSubformKey) return false
  if (
    !(linkage.fieldMappings || []).some(
      (item) => item.sourceKey && item.targetKey,
    )
  ) {
    return false
  }
  return (linkage.conditions || []).some(isCompleteCondition)
}

export function hasSubformLinkage(field) {
  return (
    field?.type === 'subform' &&
    field?.optionSource === 'linkage' &&
    isSubformLinkageConfigured(field.linkage)
  )
}

export function needsOptionSourceHint(field) {
  if (!isSelectType(field?.type)) return false
  const source = field.optionSource || 'dictionary'
  if (source === 'table_data') return !field.sourceFormId || !field.sourceFieldKey
  if (source === 'linkage') return !hasLinkage(field)
  return !field.dictCode
}

export function sourceTypesFor(fieldType) {
  if (
    fieldType === 'input' ||
    fieldType === 'textarea' ||
    fieldType === 'select'
  ) {
    return ['input', 'textarea', 'radio', 'select']
  }
  if (fieldType === 'select-multiple') {
    return ['select-multiple', 'checkbox']
  }
  return [fieldType]
}

export function filterLinkageSourceFields(sourceFields, currentType) {
  const allowed = new Set(sourceTypesFor(currentType))
  return withFilterSystemFields(sourceFields).filter((field) =>
    allowed.has(field.type),
  )
}

export function compatibleCurrentFields(formFields, sourceType) {
  if (!sourceType) return formFields || []
  const family =
    sourceType === 'textarea' || sourceType === 'radio' || sourceType === 'select'
      ? 'input'
      : sourceType
  const allowed = new Set(sourceTypesFor(family))
  allowed.add(sourceType)
  return (formFields || []).filter((field) => allowed.has(field.type))
}
