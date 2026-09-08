function startNodeKey(graph) {
  return (graph?.nodes || []).find((node) => node.type === 'start')?.key || ''
}

export function resolveHighlightNodeKey({
  currentNodeKey,
  instanceStatus,
  graph,
  visitedNodeKeys,
  allowResubmitAfterTerminated,
}) {
  if (instanceStatus === 'draft') {
    return startNodeKey(graph)
  }
  const canResubmit = allowResubmitAfterTerminated !== false
  const current = (graph?.nodes || []).find((node) => node.key === currentNodeKey)
  if (currentNodeKey && !(canResubmit && current?.type === 'end')) {
    return currentNodeKey
  }
  if (canResubmit) return ''
  if (instanceStatus !== 'approved' && instanceStatus !== 'rejected') return ''
  const endNodes = (graph?.nodes || []).filter((node) => node.type === 'end')
  if (!endNodes.length) return ''
  if (endNodes.length === 1) return endNodes[0].key
  const endKeys = new Set(endNodes.map((node) => node.key))
  const visited = new Set(visitedNodeKeys || [])
  for (const edge of graph?.edges || []) {
    if (endKeys.has(edge.to) && visited.has(edge.from)) {
      return edge.to
    }
  }
  return endNodes[0].key
}
