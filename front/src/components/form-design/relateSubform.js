import { PAGE_SIZES } from '../../utils/pagination.js'
import { flattenFields } from './tabsField.js'

const DEFAULT_COLUMN_COUNT = 5

export const RELATE_SUBFORM_SYSTEM_FIELDS = [
  { key: '__createdBy', title: '创建人' },
  { key: '__createdAt', title: '创建时间' },
  { key: '__updatedBy', title: '更新人' },
  { key: '__updatedAt', title: '更新时间' },
]

export function isRelateSubformField(field) {
  return field?.type === 'relate-subform'
}

export const RELATE_SUBFORM_TITLE_TIP =
  '关联子表单，详情里只读查看关联本表的数据'

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

export function relateSubformDisplayColumnOptions(childFields) {
  return [
    ...(childFields || []).filter((item) => item.type !== 'relate'),
    ...RELATE_SUBFORM_SYSTEM_FIELDS,
  ]
}

export function relateSubformColumnTitles(columnKeys, childFields, formName = '') {
  if (!Array.isArray(childFields)) return []
  const titleByKey = new Map()
  for (const item of [...childFields, ...RELATE_SUBFORM_SYSTEM_FIELDS]) {
    if (!item?.key) continue
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    titleByKey.set(item.key, title || item.key)
  }
  const tableName = typeof formName === 'string' ? formName.trim() : ''
  const columns = []
  for (const key of Array.isArray(columnKeys) ? columnKeys : []) {
    if (typeof key !== 'string' || !key) continue
    const title = titleByKey.get(key)
    if (!title) {
      const table = tableName || '关联表'
      console.log(`[${table}的${key}字段无法匹配列名，因此被隐藏]`)
      continue
    }
    columns.push({ key, title })
  }
  return columns
}

export function relateSubformReady(field) {
  return Boolean(Number(field?.childFormId) > 0 && field?.childRelateKey)
}

export function relateSubformCanViewDetail(field) {
  return field?.canViewDetail === true
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
