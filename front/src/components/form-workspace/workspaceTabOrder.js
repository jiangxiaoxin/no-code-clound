export const DEFAULT_WORKSPACE_TAB_ORDER = ['create', 'list']

export function workspaceTabOrderStorageKey(userId, appId, formId) {
  if (!userId || !appId || !formId) return ''
  return `form-workspace-tab-order:${userId}:${appId}:${formId}`
}

export function normalizeWorkspaceTabOrder(value) {
  console.log("🚀 ~ workspaceTabOrder.js:9 ~ normalizeWorkspaceTabOrder ~ value:", value)

  const seen = new Set()
  const order = []
  if (Array.isArray(value)) {
    for (const key of value) {
      if ((key === 'create' || key === 'list') && !seen.has(key)) {
        seen.add(key)
        order.push(key)
      }
    }
  }
  // 这就是写的全面，还考虑了万一有的tab没带进来，再从默认order 里补充一下
  // 但实际肯定是全的，完整的
  for (const key of DEFAULT_WORKSPACE_TAB_ORDER) {
    if (!seen.has(key)) order.push(key)
  }
  return order
}

export function workspaceTabOrderToMode(order) {
  return normalizeWorkspaceTabOrder(order)[0] === 'list' ? 'list-first' : 'create-first'
}

export function workspaceTabOrderFromMode(mode) {
  return mode === 'list-first' ? ['list', 'create'] : [...DEFAULT_WORKSPACE_TAB_ORDER]
}

export function readWorkspaceTabOrder(userId, appId, formId) {
  const key = workspaceTabOrderStorageKey(userId, appId, formId)
  if (!key) return [...DEFAULT_WORKSPACE_TAB_ORDER]
  try {
    return normalizeWorkspaceTabOrder(JSON.parse(localStorage.getItem(key) || 'null'))
  } catch {
    return [...DEFAULT_WORKSPACE_TAB_ORDER]
  }
}

export function writeWorkspaceTabOrder(userId, appId, formId, order) {
  const key = workspaceTabOrderStorageKey(userId, appId, formId)
  if (!key) return
  localStorage.setItem(key, JSON.stringify(normalizeWorkspaceTabOrder(order)))
}
