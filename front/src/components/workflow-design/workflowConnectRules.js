function nodeByKey(graph, key) {
  return (graph.nodes || []).find((node) => node.key === key)
}

function nodeType(graph, key) {
  return nodeByKey(graph, key)?.type
}

function outgoing(graph, from, exceptKey) {
  return (graph.edges || []).filter(
    (edge) => edge.from === from && edge.key !== exceptKey,
  )
}

function isMainEdge(graph, edge) {
  return nodeType(graph, edge.to) !== 'cc'
}

function mainOutgoing(graph, from, exceptKey) {
  return outgoing(graph, from, exceptKey).filter((edge) => isMainEdge(graph, edge))
}

/**
 * 校验画布新连线是否允许（不含抄送/结束无出线等已有规则外的业务约束）。
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateCanvasEdge(graph, { from, to, key }) {
  const sourceType = nodeType(graph, from)
  const targetType = nodeType(graph, to)

  if (sourceType === 'cc' || sourceType === 'end') {
    return { ok: false, message: '抄送和结束不能再连出线' }
  }

  if (sourceType !== 'branch') {
    const existingMain = mainOutgoing(graph, from, key)
    const existingToApprove = existingMain.filter(
      (edge) => nodeType(graph, edge.to) === 'approve',
    )

    if (targetType === 'approve' && existingToApprove.length > 0) {
      return {
        ok: false,
        message: '一个节点不能同时连接多个审批节点，请添加分支节点后再分别连接',
      }
    }

    if (
      (sourceType === 'start' || sourceType === 'approve') &&
      existingMain.length > 0
    ) {
      return {
        ok: false,
        message:
          sourceType === 'start'
            ? '开始节点只能有一条主出线'
            : '审批节点只能有一条主出线',
      }
    }
  }

  return { ok: true }
}
