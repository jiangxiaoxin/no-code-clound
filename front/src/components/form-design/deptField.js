import { positiveIntIds } from './memberField.js'

export const DELETED_DEPT_LABEL = '已删除'
export const DEPT_SCOPES = ['all', 'custom']

export function isDeptField(fieldOrType) {
  const type =
    typeof fieldOrType === 'string' ? fieldOrType : fieldOrType?.type
  return type === 'dept' || type === 'dept-multiple'
}

export function normalizeDeptScope(value) {
  return DEPT_SCOPES.includes(value) ? value : 'all'
}

export function deptValueIds(type, value) {
  if (type === 'dept-multiple') {
    return positiveIntIds(value)
  }
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return [value]
  }
  return []
}

export function flattenDeptNames(nodes, map = {}) {
  for (const node of nodes || []) {
    if (node?.id) {
      map[node.id] = node.name || ''
      map[String(node.id)] = node.name || ''
    }
    flattenDeptNames(node.children, map)
  }
  return map
}

export function deptDisplayName(id, names) {
  if (!id) return ''
  const name = names?.[id] ?? names?.[String(id)]
  return name || DELETED_DEPT_LABEL
}

export function hasCustomDeptScope(field) {
  return positiveIntIds(field?.deptScopeConfig?.departmentIds).length > 0
}

function flattenDeptMap(nodes, map = new Map()) {
  for (const node of nodes || []) {
    map.set(node.id, node)
    flattenDeptMap(node.children, map)
  }
  return map
}

function descendantIds(rootId, map) {
  const ids = new Set()
  const walk = (id) => {
    const node = map.get(id)
    if (!node) {
      ids.add(id)
      return
    }
    ids.add(id)
    for (const child of node.children || []) {
      walk(child.id)
    }
  }
  walk(rootId)
  return ids
}

export function allowedDeptIds(field, departments) {
  const map = flattenDeptMap(departments)
  if (normalizeDeptScope(field?.deptScope) === 'all') {
    return new Set(map.keys())
  }
  const allowed = new Set()
  for (const id of positiveIntIds(field?.deptScopeConfig?.departmentIds)) {
    for (const childId of descendantIds(id, map)) {
      allowed.add(childId)
    }
  }
  return allowed
}

export function filterDeptTree(nodes, allowedIds) {
  const allowed =
    allowedIds instanceof Set ? allowedIds : new Set(allowedIds || [])
  const out = []
  for (const node of nodes || []) {
    const children = filterDeptTree(node.children || [], allowed)
    if (allowed.has(node.id)) {
      out.push({ ...node, children })
    } else {
      out.push(...children)
    }
  }
  return out
}

export function collectDeptTreeIds(nodes) {
  const ids = []
  const walk = (list) => {
    for (const node of list || []) {
      if (node?.id) ids.push(node.id)
      walk(node.children)
    }
  }
  walk(nodes)
  return ids
}

export function currentUserDeptId(user) {
  const raw = user?.departmentIds
  if (!Array.isArray(raw)) return undefined
  for (const item of raw) {
    const n = typeof item === 'number' ? item : Number(item)
    if (Number.isInteger(n) && n > 0) return n
  }
  return undefined
}

export function defaultDeptValue(field, user, departments) {
  if (field?.optionSource !== 'current_user_dept') return undefined
  const id = currentUserDeptId(user)
  if (!id) return undefined
  const allowed = allowedDeptIds(field, departments)
  if (!allowed.has(id)) return undefined
  return field?.type === 'dept-multiple' ? [id] : id
}

export function pruneDeptsOutOfScope(type, value, allowed) {
  const ids = deptValueIds(type, value).filter((id) => allowed.has(id))
  if (type === 'dept-multiple') return ids
  return ids[0]
}
