const NODE_TYPES = new Set(['start', 'approve', 'branch', 'end'])

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function emptyDraftGraph() {
  return {
    nodes: [{ key: 'start', type: 'start', title: '开始', x: 240, y: 40 }],
    edges: [],
  }
}

export function toLogicflowGraph(product) {
  const nodes = (product?.nodes || []).map((node) => ({
    id: node.key,
    type: node.type,
    x: asNumber(node.x),
    y: asNumber(node.y),
    text: node.title || '',
    properties: {
      key: node.key,
      title: node.title || '',
      type: node.type,
      approver: node.approver,
      signMode: node.signMode,
      commentRequiredOnApprove: node.commentRequiredOnApprove,
      commentRequiredOnReject: node.commentRequiredOnReject,
      fieldAccess: node.fieldAccess,
      briefFieldKeys: node.briefFieldKeys,
    },
  }))
  const edges = (product?.edges || []).map((edge) => ({
    id: edge.key,
    type: 'polyline',
    sourceNodeId: edge.from,
    targetNodeId: edge.to,
    text: edge.title || '',
    properties: {
      key: edge.key,
      title: edge.title,
      sort: edge.sort,
      isDefault: edge.isDefault,
      when: edge.when,
    },
  }))
  return { nodes, edges }
}

export function toProductGraph(raw) {
  const nodes = (raw?.nodes || [])
    .filter((node) => NODE_TYPES.has(node.type) || NODE_TYPES.has(node.properties?.type))
    .map((node) => {
      const props = node.properties || {}
      const type = NODE_TYPES.has(node.type) ? node.type : props.type
      const base = {
        key: props.key || node.id,
        type,
        title: props.title || node.text?.value || node.text || '',
        x: asNumber(node.x),
        y: asNumber(node.y),
      }
      if (type === 'approve') {
        return {
          ...base,
          approver: {
            userIds: props.approver?.userIds || [],
            roleIds: props.approver?.roleIds || [],
            memberFieldKeys: props.approver?.memberFieldKeys || [],
            sameDeptAsInitiator: props.approver?.sameDeptAsInitiator !== false,
            deptLeaderOfInitiator: Boolean(props.approver?.deptLeaderOfInitiator),
          },
          signMode: props.signMode === 'all' ? 'all' : 'any',
          commentRequiredOnApprove: Boolean(props.commentRequiredOnApprove),
          commentRequiredOnReject: props.commentRequiredOnReject !== false,
          fieldAccess: props.fieldAccess || {},
          briefFieldKeys: Array.isArray(props.briefFieldKeys)
            ? props.briefFieldKeys.filter((key) => typeof key === 'string' && key)
            : undefined,
        }
      }
      return base
    })
  const edges = (raw?.edges || []).map((edge) => {
    const props = edge.properties || {}
    return {
      key: props.key || edge.id,
      from: edge.sourceNodeId,
      to: edge.targetNodeId,
      title: props.title || edge.text?.value || edge.text || '',
      sort: asNumber(props.sort, 0),
      isDefault: Boolean(props.isDefault),
      when: props.when,
    }
  })
  return { nodes, edges }
}
