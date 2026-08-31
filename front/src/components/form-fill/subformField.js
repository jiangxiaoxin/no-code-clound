export function walkFormFields(fields, visit) {
  for (const field of fields || []) {
    visit(field)
    if (field.type === 'subform' && Array.isArray(field.fields)) {
      walkFormFields(field.fields, visit)
    }
    if (field.type === 'tabs') {
      for (const pane of field.panes || []) {
        walkFormFields(pane.fields || [], visit)
      }
    }
  }
}

export function findFieldByKey(fields, key) {
  if (!key) {
    return null
  }
  let found = null
  walkFormFields(fields, (field) => {
    if (!found && field.key === key) {
      found = field
    }
  })
  return found
}

export function findParentSubform(fields, childKey) {
  if (!childKey) {
    return null
  }
  for (const field of fields || []) {
    if (field.type === 'subform') {
      if ((field.fields || []).some((child) => child.key === childKey)) {
        return field
      }
    }
    if (field.type === 'tabs') {
      for (const pane of field.panes || []) {
        const found = findParentSubform(pane.fields || [], childKey)
        if (found) return found
      }
    }
  }
  return null
}

export const SUBFORM_CHILD_TYPES = [
  'input',
  'textarea',
  'number',
  'date',
  'time',
  'datetime',
  'radio',
  'checkbox',
  'select',
  'select-multiple',
  'address',
  'image',
  'file',
  'data',
]

const CHILD_TYPE_SET = new Set(SUBFORM_CHILD_TYPES)
const UNIQUE_CHILD_TYPES = new Set(['input', 'number', 'data'])
const SUBFORM_MAX_ROWS = 200

export function isSubformChildType(type) {
  return CHILD_TYPE_SET.has(type)
}

function fieldTitle(field) {
  return field?.title || '未命名'
}

function isAddressEmpty(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return true
  }
  return !Array.isArray(value.ids) || value.ids.length === 0
}

function imageUrlsOf(value) {
  if (typeof value === 'string' && value) {
    return [value]
  }
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item) => typeof item === 'string' && item)
}

function fileItemsOf(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item) => {
    if (!item || typeof item !== 'object') {
      return false
    }
    return Boolean(item.url && item.name)
  })
}

export function isSubformCellEmpty(field, value) {
  if (!field) {
    return true
  }
  if (field.type === 'image') {
    return imageUrlsOf(value).length === 0
  }
  if (field.type === 'file') {
    return fileItemsOf(value).length === 0
  }
  if (field.type === 'address') {
    return isAddressEmpty(value)
  }
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    return !Array.isArray(value) || value.length === 0
  }
  if (field.type === 'number') {
    return value == null || value === ''
  }
  if (field.type === 'data') {
    return value == null || value === ''
  }
  return value == null || value === ''
}

export function emptySubformRow(fields) {
  const row = {}
  for (const field of fields || []) {
    if (!field?.key) {
      continue
    }
    if (
      field.type === 'checkbox' ||
      field.type === 'select-multiple' ||
      field.type === 'image' ||
      field.type === 'file'
    ) {
      row[field.key] = []
    } else {
      row[field.key] = undefined
    }
  }
  return row
}

export function isSubformRowEmpty(fields, row) {
  if (!row || typeof row !== 'object') {
    return true
  }
  for (const field of fields || []) {
    if (!field?.key) {
      continue
    }
    if (!isSubformCellEmpty(field, row[field.key])) {
      return false
    }
  }
  return true
}

function pickRowByFields(fields, row) {
  const next = {}
  for (const field of fields || []) {
    if (!field?.key) {
      continue
    }
    next[field.key] = row?.[field.key]
  }
  return next
}

export function stripEmptySubformRows(fields, rows) {
  if (!Array.isArray(rows)) {
    return []
  }
  const kept = []
  for (const row of rows) {
    if (isSubformRowEmpty(fields, row)) {
      continue
    }
    kept.push(pickRowByFields(fields, row))
    if (kept.length >= SUBFORM_MAX_ROWS) {
      break
    }
  }
  return kept
}

export function subformRequiredError(field, rows) {
  if (!field?.required) {
    return ''
  }
  const kept = stripEmptySubformRows(field.fields, rows)
  if (kept.length === 0) {
    return `[${fieldTitle(field)}]不能为空`
  }
  return ''
}

export function subformChildRequiredError(fields, row) {
  if (isSubformRowEmpty(fields, row)) {
    return ''
  }
  for (const field of fields || []) {
    if (!field?.required) {
      continue
    }
    if (isSubformCellEmpty(field, row?.[field.key])) {
      return `[${fieldTitle(field)}]不能为空`
    }
  }
  return ''
}

export function subformRowsRequiredError(field, rows) {
  const required = subformRequiredError(field, rows)
  if (required) {
    return required
  }
  const children = field?.fields || []
  for (const row of Array.isArray(rows) ? rows : []) {
    const childError = subformChildRequiredError(children, row)
    if (childError) {
      return childError
    }
  }
  return ''
}

function uniqueChildValue(field, value) {
  if (!UNIQUE_CHILD_TYPES.has(field.type)) {
    return undefined
  }
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined
    }
    return value
  }
  if (typeof value !== 'string' || value === '') {
    return undefined
  }
  return value
}

function wantsUniqueInRows(field) {
  return Boolean(field?.unique || field?.uniqueInRows)
}

export function uniqueInRowsError(fields, rows) {
  const list = Array.isArray(rows) ? rows : []
  for (const field of fields || []) {
    if (!wantsUniqueInRows(field) || !UNIQUE_CHILD_TYPES.has(field.type)) {
      continue
    }
    const seen = new Set()
    for (const row of list) {
      const value = uniqueChildValue(field, row?.[field.key])
      if (value === undefined) {
        continue
      }
      if (seen.has(value)) {
        return `[${fieldTitle(field)}]同一子表内不允许重复值`
      }
      seen.add(value)
    }
  }
  return ''
}

function coerceMappedCell(field, value) {
  if (!field) {
    return { ok: false }
  }
  if (isSubformCellEmpty(field, value)) {
    return { ok: true, value: undefined }
  }
  if (field.type === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { ok: true, value }
    }
    if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) {
      return { ok: true, value: Number(value) }
    }
    return { ok: false }
  }
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? { ok: true, value }
      : { ok: false }
  }
  if (field.type === 'image') {
    const urls = imageUrlsOf(value)
    return urls.length ? { ok: true, value: urls } : { ok: false }
  }
  if (field.type === 'file') {
    const items = fileItemsOf(value)
    return items.length ? { ok: true, value: items } : { ok: false }
  }
  if (field.type === 'address') {
    return isAddressEmpty(value) ? { ok: false } : { ok: true, value }
  }
  if (
    field.type === 'input' ||
    field.type === 'textarea' ||
    field.type === 'date' ||
    field.type === 'time' ||
    field.type === 'datetime' ||
    field.type === 'radio' ||
    field.type === 'select' ||
    field.type === 'data'
  ) {
    return typeof value === 'string' ? { ok: true, value } : { ok: false }
  }
  return { ok: true, value }
}

export function mapSourceSubformRows({
  sourceRows,
  mappings,
  targetFields,
} = {}) {
  const maps = Array.isArray(mappings) ? mappings : []
  const fields = Array.isArray(targetFields) ? targetFields : []
  const fieldByKey = new Map(fields.map((field) => [field.key, field]))
  const out = []
  for (const source of Array.isArray(sourceRows) ? sourceRows : []) {
    const row = emptySubformRow(fields)
    let rowFailed = false
    for (const map of maps) {
      const targetKey = map?.targetKey
      const sourceKey = map?.sourceKey
      if (!targetKey || !sourceKey) {
        continue
      }
      const field = fieldByKey.get(targetKey)
      const coerced = coerceMappedCell(field, source?.[sourceKey])
      if (!coerced.ok) {
        rowFailed = true
        break
      }
      row[targetKey] = coerced.value
    }
    if (rowFailed || isSubformRowEmpty(fields, row)) {
      continue
    }
    out.push(row)
    if (out.length >= SUBFORM_MAX_ROWS) {
      break
    }
  }
  return out
}

export function shouldSubformDataSelectMultiple({
  filters,
  rowHasId,
  childKeys,
} = {}) {
  if (rowHasId) {
    return false
  }
  const keys = new Set(childKeys || [])
  const conditions = Array.isArray(filters?.conditions) ? filters.conditions : []
  for (const item of conditions) {
    if (item?.valueType === 'field' && keys.has(item.value)) {
      return false
    }
  }
  return true
}

export function fieldRefLabel(field, { parentTitle } = {}) {
  const title = fieldTitle(field)
  if (parentTitle) {
    return `${parentTitle || '子表单'}.${title}`
  }
  return `当前表单.${title}`
}

export function applyRowLinkages({
  children,
  row,
  parentValues,
  resultsByKey,
} = {}) {
  const next = { ...(row && typeof row === 'object' ? row : {}) }
  for (const child of children || []) {
    if (child?.optionSource !== 'linkage' || !child.linkage?.sourceKey) {
      continue
    }
    const result = resultsByKey?.[child.key]
    const records = Array.isArray(result?.records) ? result.records : []
    if (records.length !== 1) {
      continue
    }
    const sourceKey = child.linkage.sourceKey
    next[child.key] = records[0]?.[sourceKey]
  }
  void parentValues
  return next
}
