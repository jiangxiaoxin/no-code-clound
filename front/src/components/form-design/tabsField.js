export const MIN_TAB_PANES = 2
export const MAX_TAB_PANES = 10

export function isTabsField(field) {
  return field?.type === 'tabs'
}

export function flattenFields(fields) {
  const out = []
  for (const field of fields || []) {
    if (isTabsField(field)) {
      for (const pane of field.panes || []) {
        out.push(...flattenFields(pane.fields || []))
      }
      continue
    }
    out.push(field)
  }
  return out
}

export function hasTabsField(fields) {
  return (fields || []).some(isTabsField)
}

export function findTabsField(fields) {
  return (fields || []).find(isTabsField) || null
}

export function findFieldByKey(fields, key) {
  for (const field of fields || []) {
    if (field.key === key) return field
    if (isTabsField(field)) {
      for (const pane of field.panes || []) {
        const found = findFieldByKey(pane.fields || [], key)
        if (found) return found
      }
    }
  }
  return null
}

export function paneIdOfField(fields, key) {
  const tabs = findTabsField(fields)
  if (!tabs) return ''
  for (const pane of tabs.panes || []) {
    if ((pane.fields || []).some((item) => item.key === key)) return pane.id
  }
  return ''
}

export function defaultPanes(ids) {
  return [
    { id: ids[0], title: '标签页1', fields: [] },
    { id: ids[1], title: '标签页2', fields: [] },
  ]
}

export function createTabsField(key, paneIds) {
  return {
    type: 'tabs',
    key,
    component: 'Tabs',
    title: '标签页',
    placeholder: '',
    width: '1',
    required: false,
    disabled: false,
    editable: true,
    description: '',
    panes: defaultPanes(paneIds),
  }
}

export function nextPaneTitle(panes) {
  let max = 0
  let hasNumbered = false
  for (const pane of panes || []) {
    const match = String(pane.title || '').match(/^标签页(\d+)$/)
    if (!match) continue
    hasNumbered = true
    max = Math.max(max, Number(match[1]))
  }
  const n = hasNumbered ? max + 1 : (panes?.length || 0) + 1
  return `标签页${n}`
}

export function canAddPane(panes) {
  return (panes?.length || 0) < MAX_TAB_PANES
}

export function canRemovePane(panes) {
  return (panes?.length || 0) > MIN_TAB_PANES
}

export function neighborPaneId(panes, removedId) {
  const list = panes || []
  const index = list.findIndex((pane) => pane.id === removedId)
  if (index < 0) return list[0]?.id || ''
  return list[index + 1]?.id || list[index - 1]?.id || ''
}

export function trimPaneTitle(title, fallback) {
  const trimmed = String(title || '').trim()
  if (trimmed) return trimmed
  const prev = String(fallback || '').trim()
  return prev || '标签页'
}

export function reorderPanes(panes, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return panes
  const list = panes || []
  const from = list.findIndex((item) => item.id === fromId)
  const to = list.findIndex((item) => item.id === toId)
  if (from < 0 || to < 0) return list
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return list
}
