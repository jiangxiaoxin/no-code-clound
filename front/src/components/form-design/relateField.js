import { flattenFields } from './tabsField.js'

export function isRelateField(field) {
  return field?.type === 'relate'
}

export function relateSourceFormId(field) {
  const n = Number(field?.sourceFormId)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export function isSelfRelate(field, formId) {
  return isRelateField(field) && relateSourceFormId(field) === Number(formId)
}

export function hasSelfRelateField(fields, formId, exceptKey = '') {
  return flattenFields(fields).some(
    (field) => field.key !== exceptKey && isSelfRelate(field, formId),
  )
}

export function relateColumnFields(fields) {
  return flattenFields(fields).filter(
    (field) => isRelateField(field) && relateSourceFormId(field) > 0,
  )
}
