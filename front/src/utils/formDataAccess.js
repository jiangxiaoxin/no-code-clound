export const ROW_SCOPE_OPTIONS = [
  { value: 'related', label: '与自己相关' },
  { value: 'created', label: '仅本人创建' },
  { value: 'dept', label: '本部门' },
  { value: 'all', label: '全部' },
]

export function normalizeRowScope(raw) {
  if (raw === 'created' || raw === 'dept' || raw === 'all' || raw === 'related') {
    return raw
  }
  return 'related'
}

export function normalizeFormViewers(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const list = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const type = item.type
    const targetId = Number(item.targetId)
    if (type !== 'user' && type !== 'department' && type !== 'role') continue
    if (!Number.isInteger(targetId) || targetId <= 0) continue
    const key = `${type}:${targetId}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push({
      type,
      targetId,
      label: typeof item.label === 'string' ? item.label : '',
      effective: item.effective !== false,
    })
  }
  return list
}
