import { flattenFields } from './tabsField.js'

export const MEMBER_SCOPES = ['all', 'custom', 'dept_field']
export const DELETED_MEMBER_LABEL = '已删除'

export function isMemberField(fieldOrType) {
  const type =
    typeof fieldOrType === 'string' ? fieldOrType : fieldOrType?.type
  return type === 'member' || type === 'member-multiple'
}

export function createDefaultMemberField(key, type) {
  return {
    key,
    type: type === 'member-multiple' ? 'member-multiple' : 'member',
    memberScope: 'all',
    optionSource: 'custom',
  }
}

export function normalizeMemberScope(value) {
  return MEMBER_SCOPES.includes(value) ? value : 'all'
}

export function positiveIntIds(raw) {
  const out = []
  const seen = new Set()
  const list = Array.isArray(raw) ? raw : []
  for (const item of list) {
    const n = typeof item === 'number' ? item : Number(item)
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function memberValueIds(type, value) {
  if (type === 'member-multiple') {
    return positiveIntIds(value)
  }
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return [value]
  }
  return []
}

export function deptFieldsForMemberScope(fields) {
  return flattenFields(fields).filter((field) => field?.type === 'dept' && field.key)
}

export function hasCustomMemberScope(field) {
  const cfg = field?.memberScopeConfig || {}
  return (
    positiveIntIds(cfg.departmentIds).length +
      positiveIntIds(cfg.roleIds).length +
      positiveIntIds(cfg.userIds).length >
    0
  )
}

function activeUsers(users) {
  return (users || []).filter((user) => user?.status !== 'disabled')
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
    if (!node) return
    ids.add(id)
    for (const child of node.children || []) {
      walk(child.id)
    }
  }
  walk(rootId)
  return ids
}

function usersInDepartments(users, departmentIds, deptMap) {
  const allowed = new Set()
  for (const id of departmentIds) {
    for (const childId of descendantIds(id, deptMap)) {
      const node = deptMap.get(childId)
      if (node && node.status === 'disabled') continue
      allowed.add(childId)
    }
  }
  return users.filter((user) => allowed.has(user.departmentId))
}

export function candidateUsers(field, users, departments, recordValues) {
  const scope = normalizeMemberScope(field?.memberScope)
  const enabled = activeUsers(users)
  const deptMap = flattenDeptMap(departments)

  if (scope === 'all') {
    return enabled
  }

  if (scope === 'custom') {
    const cfg = field?.memberScopeConfig || {}
    const departmentIds = positiveIntIds(cfg.departmentIds)
    const roleIds = new Set(positiveIntIds(cfg.roleIds))
    const userIds = new Set(positiveIntIds(cfg.userIds))
    if (!departmentIds.length && !roleIds.size && !userIds.size) {
      return []
    }
    const fromDept = usersInDepartments(enabled, departmentIds, deptMap)
    const seen = new Set()
    const out = []
    const push = (user) => {
      if (seen.has(user.id)) return
      seen.add(user.id)
      out.push(user)
    }
    for (const user of fromDept) push(user)
    for (const user of enabled) {
      if ((user.roleIds || []).some((id) => roleIds.has(id))) push(user)
      if (userIds.has(user.id)) push(user)
    }
    return out
  }

  const key = field?.sourceDeptFieldKey
  const raw = key ? recordValues?.[key] : undefined
  const deptId =
    typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 0
  if (!deptId) return []
  return usersInDepartments(enabled, [deptId], deptMap)
}

export function pruneMembersOutOfScope(type, value, allowed) {
  if (type === 'member-multiple') {
    return memberValueIds(type, value).filter((id) => allowed.has(id))
  }
  const ids = memberValueIds('member', value)
  if (!ids.length || !allowed.has(ids[0])) return undefined
  return ids[0]
}

export function memberDisplayName(id, names) {
  if (!id) return ''
  const name = names?.[id] ?? names?.[String(id)]
  return name || DELETED_MEMBER_LABEL
}
