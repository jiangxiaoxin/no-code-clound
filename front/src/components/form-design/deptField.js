export const DELETED_DEPT_LABEL = '已删除'

export function isDeptField(fieldOrType) {
  const type =
    typeof fieldOrType === 'string' ? fieldOrType : fieldOrType?.type
  return type === 'dept' || type === 'dept-multiple'
}

export function deptValueIds(type, value) {
  if (type === 'dept-multiple') {
    const out = []
    const seen = new Set()
    for (const item of Array.isArray(value) ? value : []) {
      const n = typeof item === 'number' ? item : Number(item)
      if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue
      seen.add(n)
      out.push(n)
    }
    return out
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
