function flattenFields(fields) {
  const out = []
  for (const field of fields || []) {
    if (field.type === 'tabs') {
      for (const pane of field.panes || []) {
        out.push(...flattenFields(pane.fields || []))
      }
      continue
    }
    out.push(field)
  }
  return out
}

function outgoing(graph, from) {
  return (graph.edges || [])
    .filter((edge) => edge.from === from)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
}

function fieldKeys(fields) {
  return new Set(flattenFields(fields).map((field) => field.key).filter(Boolean))
}

function memberFieldKeys(fields) {
  return new Set(
    flattenFields(fields)
      .filter((field) => field.type === 'member' || field.type === 'member-multiple')
      .map((field) => field.key),
  )
}

function hasCycle(graph) {
  const visiting = new Set()
  const done = new Set()
  const walk = (key) => {
    if (done.has(key)) return false
    if (visiting.has(key)) return true
    visiting.add(key)
    for (const edge of outgoing(graph, key)) {
      if (walk(edge.to)) return true
    }
    visiting.delete(key)
    done.add(key)
    return false
  }
  return (graph.nodes || []).some((node) => walk(node.key))
}

function reachableFromStart(graph) {
  const start = (graph.nodes || []).find((node) => node.type === 'start')
  const seen = new Set()
  if (!start) return seen
  const queue = [start.key]
  while (queue.length) {
    const key = queue.shift()
    if (seen.has(key)) continue
    seen.add(key)
    for (const edge of outgoing(graph, key)) {
      if (!seen.has(edge.to)) queue.push(edge.to)
    }
  }
  return seen
}

function canReachEnd(graph, from) {
  const seen = new Set()
  const queue = [from]
  while (queue.length) {
    const key = queue.shift()
    if (seen.has(key)) continue
    seen.add(key)
    const node = (graph.nodes || []).find((item) => item.key === key)
    if (node?.type === 'end') return true
    for (const edge of outgoing(graph, key)) queue.push(edge.to)
  }
  return false
}

export function validatePublishedGraph(graph, formFields) {
  const errors = []
  const nodes = graph.nodes || []
  const starts = nodes.filter((node) => node.type === 'start')
  const ends = nodes.filter((node) => node.type === 'end')
  const approves = nodes.filter((node) => node.type === 'approve')
  if (starts.length !== 1) {
    errors.push('必须恰好有一个开始节点')
  } else if (outgoing(graph, starts[0].key).length !== 1) {
    errors.push('开始必须有且仅有一条出线')
  }
  if (!approves.length) errors.push('至少需要一个审批节点')
  if (!ends.length) errors.push('至少需要一个结束节点')

  for (const node of approves) {
    if (!String(node.title || '').trim()) errors.push('审批节点需要名称')
    if (outgoing(graph, node.key).length !== 1) {
      errors.push(`审批「${node.title || node.key}」必须有且仅有一条出线`)
    }
    const rule = node.approver || {}
    const hasPeople =
      (rule.userIds || []).length > 0 ||
      (rule.roleIds || []).length > 0 ||
      (rule.memberFieldKeys || []).length > 0 ||
      Boolean(rule.deptLeaderOfInitiator)
    if (!hasPeople) errors.push(`节点「${node.title || node.key}」没有审批人`)
    const members = memberFieldKeys(formFields)
    for (const key of rule.memberFieldKeys || []) {
      if (!members.has(key)) {
        errors.push(`节点「${node.title || node.key}」选的人员字段已从表单删除`)
      }
    }
  }

  for (const node of nodes.filter((item) => item.type === 'branch')) {
    const outs = outgoing(graph, node.key)
    const defaults = outs.filter((edge) => edge.isDefault)
    if (outs.length < 2 || defaults.length !== 1) {
      errors.push(`分支「${node.title || node.key}」需要至少两条出线且恰好一条「其他情况」`)
    }
    for (const edge of outs) {
      if (!edge.isDefault && !edge.when?.items?.length) {
        errors.push(`分支「${node.title || node.key}」的连线没有条件`)
      }
    }
  }

  for (const node of ends) {
    if (outgoing(graph, node.key).length) errors.push('结束不能有出线')
  }
  if (hasCycle(graph)) errors.push('流程不能绕回已经走过的节点')

  const reachable = reachableFromStart(graph)
  for (const node of nodes) {
    if (node.type === 'start') continue
    if (!reachable.has(node.key)) {
      errors.push(`节点「${node.title || node.key}」从开始走不到`)
    }
  }
  for (const node of nodes) {
    if (node.type === 'end' || node.type === 'start') continue
    if (reachable.has(node.key) && !canReachEnd(graph, node.key)) {
      errors.push(`节点「${node.title || node.key}」走不到结束`)
    }
  }

  const keys = fieldKeys(formFields)
  for (const edge of graph.edges || []) {
    for (const item of edge.when?.items || []) {
      if (item.key && !keys.has(item.key)) {
        const from = nodes.find((node) => node.key === edge.from)
        errors.push(`分支「${from?.title || edge.from}」的连线用了已删除的字段`)
      }
    }
  }
  return errors
}
