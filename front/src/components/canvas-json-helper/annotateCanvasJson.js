export const MISSING_NAME = '未查找到'

const FIELD_REF_KEYS = new Set([
  'key',
  'sourceFieldKey',
  'sourceKey',
  'targetKey',
  'fieldKey',
])
const FORM_REF_KEYS = new Set(['sourceFormId'])
const DICT_REF_KEYS = new Set(['dictCode'])
const FIELD_REF_ARRAY_KEYS = new Set(['displayFieldKeys', 'pickerColumnKeys'])
const SYSTEM_FIELD_TITLES = {
  createdBy: '创建人',
  updatedBy: '更新人',
  createdAt: '创建时间',
  updatedAt: '更新时间',
  __createdBy: '创建人',
  __updatedBy: '更新人',
  __createdAt: '创建时间',
  __updatedAt: '更新时间',
}

export function parseCanvasJson(text) {
  const raw = String(text ?? '').trim()
  if (!raw) {
    throw new Error('请粘贴画布 JSON')
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('JSON 无法解析')
  }
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  if (!value || typeof value !== 'object') return
  visit(value)
  for (const child of Object.values(value)) walk(child, visit)
}

export function collectFieldTitles(value, map = new Map()) {
  walk(value, (obj) => {
    const key = obj.key
    const title = obj.title
    if (typeof key === 'string' && key && typeof title === 'string' && title) {
      map.set(key, title)
    }
  })
  return map
}

export function collectSourceFormIds(value, out = new Set()) {
  walk(value, (obj) => {
    const id = Number(obj.sourceFormId)
    if (Number.isInteger(id) && id > 0) out.add(id)
  })
  return out
}

export function formTitlesFromDirectory(directory) {
  const map = new Map()
  const add = (form) => {
    const id = Number(form?.id)
    if (Number.isInteger(id) && id > 0) {
      map.set(id, typeof form.name === 'string' ? form.name : '')
    }
  }
  for (const form of directory?.forms || []) add(form)
  for (const group of directory?.groups || []) {
    for (const form of group.forms || []) add(form)
  }
  return map
}

export function lookupFieldTitle(key, canvasTitles, sourceTitles) {
  if (canvasTitles?.has(key)) {
    const title = canvasTitles.get(key)
    return title || MISSING_NAME
  }
  if (sourceTitles?.has(key)) {
    const title = sourceTitles.get(key)
    return title || MISSING_NAME
  }
  return SYSTEM_FIELD_TITLES[key] || MISSING_NAME
}

export function lookupFormTitle(id, formTitles) {
  const title = formTitles?.get(Number(id))
  return title || MISSING_NAME
}

export function dictTitlesFromOptions(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const code = typeof row?.code === 'string' ? row.code : ''
    if (!code) continue
    map.set(code, typeof row.name === 'string' ? row.name : '')
  }
  return map
}

export function lookupDictTitle(code, dictTitles) {
  const title = dictTitles?.get(code)
  return title || MISSING_NAME
}

function commentForProp(key, value, canvasTitles, sourceTitles, formTitles, dictTitles) {
  if (FORM_REF_KEYS.has(key)) {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) return ''
    return lookupFormTitle(id, formTitles)
  }
  if (DICT_REF_KEYS.has(key) && typeof value === 'string') {
    if (!value) return ''
    return lookupDictTitle(value, dictTitles)
  }
  if (FIELD_REF_KEYS.has(key) && typeof value === 'string') {
    return lookupFieldTitle(value, canvasTitles, sourceTitles)
  }
  return ''
}

function annotateValue(
  value,
  canvasTitles,
  sourceTitles,
  formTitles,
  dictTitles,
  indent,
  itemHint,
) {
  const pad = '  '.repeat(indent)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const lines = ['[']
    value.forEach((item, index) => {
      const comma = index < value.length - 1 ? ',' : ''
      const nested = annotateValue(
        item,
        canvasTitles,
        sourceTitles,
        formTitles,
        dictTitles,
        indent + 1,
        '',
      )
      const hintComment =
        itemHint === 'field' && typeof item === 'string'
          ? lookupFieldTitle(item, canvasTitles, sourceTitles)
          : ''
      const nestedLines = nested.split('\n')
      if (nestedLines.length === 1) {
        lines.push(
          `${pad}  ${nestedLines[0]}${comma}${hintComment ? ` // ${hintComment}` : ''}`,
        )
        return
      }
      lines.push(`${pad}  ${nestedLines[0]}`)
      for (let i = 1; i < nestedLines.length; i += 1) {
        const last = i === nestedLines.length - 1
        lines.push(last ? `${nestedLines[i]}${comma}` : nestedLines[i])
      }
    })
    lines.push(`${pad}]`)
    return lines.join('\n')
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (!keys.length) return '{}'
    const lines = ['{']
    keys.forEach((key, index) => {
      const comma = index < keys.length - 1 ? ',' : ''
      const child = value[key]
      const comment = commentForProp(
        key,
        child,
        canvasTitles,
        sourceTitles,
        formTitles,
        dictTitles,
      )
      const hint = FIELD_REF_ARRAY_KEYS.has(key) ? 'field' : ''
      const nested = annotateValue(
        child,
        canvasTitles,
        sourceTitles,
        formTitles,
        dictTitles,
        indent + 1,
        hint,
      )
      const nestedLines = nested.split('\n')
      if (nestedLines.length === 1) {
        lines.push(
          `${pad}  ${JSON.stringify(key)}: ${nestedLines[0]}${comma}${comment ? ` // ${comment}` : ''}`,
        )
        return
      }
      lines.push(`${pad}  ${JSON.stringify(key)}: ${nestedLines[0]}`)
      for (let i = 1; i < nestedLines.length; i += 1) {
        const last = i === nestedLines.length - 1
        lines.push(last ? `${nestedLines[i]}${comma}` : nestedLines[i])
      }
    })
    lines.push(`${pad}}`)
    return lines.join('\n')
  }
  return JSON.stringify(value)
}

export function annotateCanvasJson(
  value,
  canvasTitles,
  sourceTitles,
  formTitles,
  dictTitles,
) {
  return annotateValue(
    value,
    canvasTitles,
    sourceTitles,
    formTitles,
    dictTitles,
    0,
    '',
  )
}
