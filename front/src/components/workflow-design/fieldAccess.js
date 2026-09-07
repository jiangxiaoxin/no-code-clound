import { flattenFields } from '../form-design/tabsField.js'

const ACCESS_MODES = new Set(['editable', 'readonly', 'hidden'])
const SKIP_TYPES = new Set(['relate-subform', 'divider', 'tabs'])

export function resolveFieldAccess(fieldAccess, key) {
  const value = fieldAccess?.[key]
  return ACCESS_MODES.has(value) ? value : 'readonly'
}

export function accessFormFields(fields) {
  return flattenFields(fields).filter(
    (field) => field?.key && !SKIP_TYPES.has(field.type),
  )
}

export function withDefaultFieldAccess(fieldAccess, fields) {
  const next = { ...(fieldAccess || {}) }
  for (const field of accessFormFields(fields)) {
    if (!ACCESS_MODES.has(next[field.key])) next[field.key] = 'readonly'
  }
  return next
}

export function applyDefaultFieldAccessToGraph(graph, fields) {
  return {
    ...graph,
    nodes: (graph.nodes || []).map((node) => {
      if (node.type !== 'approve' && node.type !== 'cc') return node
      return {
        ...node,
        fieldAccess: withDefaultFieldAccess(node.fieldAccess, fields),
      }
    }),
  }
}
