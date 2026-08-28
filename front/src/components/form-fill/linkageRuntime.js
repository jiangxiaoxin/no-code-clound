import { isSelectType } from '../form-design/fieldTypes.js'
import { needsFilterValue } from '../form-design/optionFilters.js'
import { emptyValue } from './fillValues.js'
import { imageMaxCount, imageUrlsOf } from './imageField.js'
import { recordsToSelectItems } from './tableOptions.js'

function hasCurrentValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value != null && value !== ''
}

export function linkageConditionsReady(linkage, values) {
  for (const item of linkage?.conditions || []) {
    if (!needsFilterValue(item.op)) continue
    if (item.valueType !== 'field') continue
    if (!hasCurrentValue(values?.[item.value])) return false
  }
  return true
}

export function linkageQueryPaging(field) {
  if (isSelectType(field?.type) || field?.type === 'image') {
    return { page: 1, pageSize: 100 }
  }
  return { page: 1, pageSize: 2 }
}

function recordCount(result) {
  if (typeof result?.total === 'number') return result.total
  return result?.items?.length || 0
}

function triggerValue(row, sourceKey) {
  const value = row?.data?.[sourceKey]
  if (value == null || value === '') return undefined
  return value
}

function emptyResult(field) {
  return { value: emptyValue(field), items: [], message: '' }
}

function fieldMessageLabel(field) {
  const title = typeof field?.title === 'string' ? field.title.trim() : ''
  const desc =
    typeof field?.description === 'string' ? field.description.trim() : ''
  return [title, desc].filter(Boolean).join('，')
}

export function linkageManyMessage(field) {
  return `[ ${fieldMessageLabel(field)} ] 字段联动查询出多条数据`
}

export function linkageImageOverflowMessage(field) {
  return `[ ${fieldMessageLabel(field)} ] 字段联动图片超过最多 ${imageMaxCount(field)} 张`
}

function collectImageUrls(items, sourceKey) {
  const urls = []
  const seen = new Set()
  for (const row of items) {
    for (const url of imageUrlsOf(row?.data?.[sourceKey])) {
      if (seen.has(url)) continue
      seen.add(url)
      urls.push(url)
    }
  }
  return urls
}

export function applyLinkageResult(field, result, currentValue) {
  const sourceKey = field?.linkage?.sourceKey
  const items = result?.items || []
  if (isSelectType(field?.type)) {
    const options = recordsToSelectItems(items, sourceKey)
    if (!options.length) return emptyResult(field)
    if (options.length === 1) {
      const value = options[0].value
      return {
        value: field.type === 'select-multiple' ? [value] : value,
        items: options,
        message: '',
      }
    }
    if (field.type === 'select-multiple') {
      const allowed = new Set(options.map((item) => item.value))
      const current = Array.isArray(currentValue) ? currentValue : []
      return {
        value: current.filter((item) => allowed.has(item)),
        items: options,
        message: '',
      }
    }
    const allowed = new Set(options.map((item) => item.value))
    return {
      value: allowed.has(currentValue) ? currentValue : undefined,
      items: options,
      message: '',
    }
  }

  if (field.type === 'image') {
    const urls = collectImageUrls(items, sourceKey)
    if (!urls.length) return emptyResult(field)
    const max = imageMaxCount(field)
    if (urls.length > max) {
      return {
        value: emptyValue(field),
        items: [],
        message: linkageImageOverflowMessage(field),
      }
    }
    return {
      value: urls,
      items: [],
      message: '',
    }
  }

  const count = recordCount(result)
  if (count <= 0) return emptyResult(field)
  if (count > 1) {
    return {
      value: emptyValue(field),
      items: [],
      message: linkageManyMessage(field),
    }
  }
  return {
    value: triggerValue(items[0], sourceKey),
    items: [],
    message: '',
  }
}
