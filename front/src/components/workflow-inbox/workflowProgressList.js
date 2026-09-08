import { formatDateTime } from '../../utils/timeValue.js'

export function buildProgressRows(progress, formatTime = formatDateTime) {
  const data = progress || {}
  const titles = Object.fromEntries(
    (data.graph?.nodes || []).map((node) => [node.key, node.title || node.key]),
  )
  const list = []
  for (const note of data.notes || []) {
    list.push({
      time: formatTime(note.at),
      sort: note.at || '',
      text: note.text,
    })
  }
  for (const task of data.tasks || []) {
    const nodeTitle =
      task.nodeKey === 'start' && task.status === 'pending'
        ? '待发起人修改'
        : titles[task.nodeKey] || task.nodeKey
    const parts = [task.assigneeName || '审批人', nodeTitle]
    if (task.status === 'cancelled') {
      parts.push('未处理（已取消）')
      if (task.cancelReason) parts.push(task.cancelReason)
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
    if (task.comment && task.action !== 'cc') parts.push(task.comment)
    list.push({
      time: formatTime(task.finishedAt || task.createdAt),
      sort: task.finishedAt || task.createdAt || '',
      text: parts.join(' · '),
    })
  }
  return list.sort((a, b) => String(a.sort).localeCompare(String(b.sort)))
}
