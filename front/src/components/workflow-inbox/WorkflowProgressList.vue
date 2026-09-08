<template>
  <div class="wf-progress-list">
    <div v-for="(item, index) in rows" :key="index" class="wf-progress-row">
      <span class="wf-progress-time">{{ item.time }}</span>
      <span>{{ item.text }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatDateTime } from '../../utils/timeValue.js'

const props = defineProps({
  progress: { type: Object, default: null },
})

const rows = computed(() => {
  const progress = props.progress || {}
  const titles = Object.fromEntries(
    (progress.graph?.nodes || []).map((node) => [node.key, node.title || node.key]),
  )
  const list = []
  for (const note of progress.notes || []) {
    list.push({
      time: formatDateTime(note.at),
      sort: note.at || '',
      text: note.text,
    })
  }
  for (const task of progress.tasks || []) {
    const nodeTitle =
      task.nodeKey === 'start' && task.status === 'pending'
        ? '待发起人修改'
        : titles[task.nodeKey] || task.nodeKey
    const parts = [task.assigneeName || '审批人', nodeTitle]
    if (task.status === 'cancelled') {
      parts.push('未处理（已取消）')
      if (task.cancelReason) parts.push(task.cancelReason)
    } else if (task.action === 'approve') {
      parts.push('通过')
    } else if (task.action === 'reject') {
      parts.push('驳回')
    } else if (task.action === 'cc') {
      parts.push('已抄送')
    } else if (task.action === 'transfer') {
      parts.push('转交')
    } else if (task.action === 'returnPrevious') {
      parts.push('退回至上一节点')
    } else if (task.action === 'returnStart') {
      parts.push('打回至发起人修改')
    } else if (task.action === 'resubmit') {
      parts.push('已重新提交')
    } else if (task.status === 'pending') {
      parts.push('待处理')
    }
    if (task.assigneeDisabled) parts.push('审批人已停用')
    if (task.comment && task.action !== 'cc') parts.push(task.comment)
    list.push({
      time: formatDateTime(task.finishedAt || task.createdAt),
      sort: task.finishedAt || task.createdAt || '',
      text: parts.join(' · '),
    })
  }
  return list.sort((a, b) => String(a.sort).localeCompare(String(b.sort)))
})
</script>

<style scoped lang="less">
.wf-progress-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wf-progress-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  line-height: 1.5;
}

.wf-progress-time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
