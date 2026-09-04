import { PAGE_SIZES } from '../../utils/pagination.js'
import { flattenFields } from './tabsField.js'

const DEFAULT_COLUMN_COUNT = 5

export function isRelateSubformField(field) {
  return field?.type === 'relate-subform'
}

export function relateSubformOptions(forms, currentFormId) {
  const options = []
  for (const form of forms || []) {
    const fields = form?.fields || []
    const plain = fields.filter((item) => item.type !== 'relate')
    for (const item of fields) {
      if (item.type !== 'relate') continue
      if (Number(item.sourceFormId) !== Number(currentFormId)) continue
      const formName = form.name || ''
      const relateTitle = item.title || item.key
      options.push({
        formId: Number(form.id),
        formName,
        relateKey: item.key,
        relateTitle,
        fields: plain,
        label: `${formName} · ${relateTitle}`,
      })
    }
  }
  return options
}

export function hasRelateSubformField(fields, childFormId, childRelateKey) {
  return flattenFields(fields).some(
    (field) =>
      isRelateSubformField(field) &&
      Number(field.childFormId) === Number(childFormId) &&
      field.childRelateKey === childRelateKey,
  )
}

export function defaultRelateSubformColumns(childFields) {
  return (childFields || [])
    .slice(0, DEFAULT_COLUMN_COUNT)
    .map((field) => field.key)
}

export function relateSubformColumnTitles(columnKeys, childFields) {
  const titleByKey = new Map()
  for (const item of childFields || []) {
    if (!item?.key) continue
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    titleByKey.set(item.key, title || item.key)
  }
  return (Array.isArray(columnKeys) ? columnKeys : [])
    .filter((key) => typeof key === 'string' && key)
    .map((key) => ({
      key,
      title: titleByKey.get(key) || key,
    }))
}

export function relateSubformReady(field) {
  return Boolean(Number(field?.childFormId) > 0 && field?.childRelateKey)
}

export function relateSubformQuery(field, recordId, page, pageSize) {
  const size = Number(pageSize)
  return {
    page,
    pageSize: PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0],
    filters: [{ key: field.childRelateKey, op: 'eq', value: recordId }],
    sort: { key: 'updatedAt', order: 'desc' },
  }
}
