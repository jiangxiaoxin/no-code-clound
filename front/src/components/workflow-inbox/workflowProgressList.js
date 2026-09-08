import { asDate, formatDateTime } from '../../utils/timeValue.js'

function formatNoteText(text, names = {}) {
  if (!text) return text
  const nameOf = (id) => names[String(id)] || names[Number(id)] || id
  const addSign = text.match(/^(\d+) 加签 ([\d、]+)([：:].*)?$/)
  if (addSign) {
    const actor = nameOf(addSign[1])
    const targets = addSign[2]
      .split('、')
      .map((id) => nameOf(id.trim()))
      .join('、')
    return `${actor} 加签 ${targets}${addSign[3] || ''}`
  }
  return text
}

function buildNameMap(progress) {
  const map = { ...(progress?.names || {}) }
  for (const task of progress?.tasks || []) {
    if (task.assigneeId != null && task.assigneeName) {
      map[String(task.assigneeId)] = task.assigneeName
    }
  }
  return map
}

function taskStatusText(task) {
  const parts = []
  if (task.status === 'cancelled') {
    parts.push('未处理（已取消）')
  } else if (task.action === 'approve') {
    parts.push('同意')
  } else if (task.action === 'reject') {
    parts.push('驳回')
  } else if (task.action === 'cc') {
    parts.push('已抄送')
  } else if (task.action === 'transfer') {
    parts.push('转交')
  } else if (task.action === 'returnPrevious') {
    parts.push('退回至上一审批节点')
  } else if (task.action === 'returnStart') {
    parts.push('退回至发起人')
  } else if (task.action === 'resubmit') {
    parts.push('已重新提交')
  } else if (task.action === 'submit') {
    parts.push(task.round > 1 ? '再次提交' : '已提交')
  } else if (task.status === 'pending') {
    parts.push('待处理')
  }
  if (task.assigneeDisabled) parts.push('审批人已停用')
  return parts.join(' · ')
}

function taskComment(task) {
  if (task.comment && task.action !== 'cc') return task.comment
  if (task.status === 'cancelled' && task.cancelReason) return task.cancelReason
  return ''
}

function timeMs(value) {
  const parsed = asDate(value)
  return parsed ? parsed.getTime() : 0
}

function maxDoneFinishedAt(task, tasks) {
  let latest = null
  let latestMs = 0
  for (const other of tasks || []) {
    if (other.nodeKey !== task.nodeKey || other.round !== task.round) continue
    if (other.status !== 'done' || !other.finishedAt) continue
    const ms = timeMs(other.finishedAt)
    if (ms > latestMs) {
      latestMs = ms
      latest = other.finishedAt
    }
  }
  return latest
}

function taskSortAt(task, tasks) {
  if (task.finishedAt) return task.finishedAt
  // 旧数据取消时没写 finishedAt，会落成加签创建时间，排到驳回前面
  if (task.status === 'cancelled') {
    const fromDone = maxDoneFinishedAt(task, tasks)
    if (fromDone) return fromDone
  }
  return task.createdAt || ''
}

function rowRank(row) {
  if (row.kind === 'note') return 1
  if (row.status === 'cancelled') return 3
  if (row.status === 'pending') return 2
  return 1
}

export function buildProgressRows(progress, formatTime = formatDateTime) {
  const data = progress || {}
  const titles = Object.fromEntries(
    (data.graph?.nodes || []).map((node) => [node.key, node.title || node.key]),
  )
  const nameMap = buildNameMap(data)
  const list = []
  for (const note of data.notes || []) {
    list.push({
      kind: 'note',
      time: formatTime(note.at),
      sort: note.at || '',
      text: formatNoteText(note.text, nameMap),
    })
  }
  for (const task of data.tasks || []) {
    const nodeTitle =
      task.nodeKey === 'start' && task.status === 'pending'
        ? '待发起人修改'
        : titles[task.nodeKey] || task.nodeKey
    const sortAt = taskSortAt(task, data.tasks)
    list.push({
      kind: 'task',
      time: formatTime(sortAt),
      sort: sortAt,
      status: task.status,
      assigneeName: task.assigneeName || '审批人',
      nodeTitle,
      nodeKey: task.nodeKey,
      statusText: taskStatusText(task),
      comment: taskComment(task),
    })
  }
  return list.sort((a, b) => {
    const diff = timeMs(a.sort) - timeMs(b.sort)
    if (diff !== 0) return diff
    return rowRank(a) - rowRank(b)
  })
}
