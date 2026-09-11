<template>
  <button type="button" class="wf-card" @click="onOpen">
    <div class="wf-card-top">
      <span class="wf-card-form">{{ card.formName }}</span>
      <span class="wf-card-status" :class="statusClass">{{ card.statusText }}</span>
    </div>
    <div class="wf-card-summary">{{ card.summary }}</div>
    <div v-if="dueHint" class="wf-card-due">{{ dueHint }}</div>
    <div class="wf-card-meta">
      <span v-if="showApp">{{ card.appName }}</span>
      <span>{{ card.initiatorName }}</span>
      <span>{{ timeLabel }}</span>
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { formatDateTime } from '../../utils/timeValue.js'
import { workflowCardStatusClass } from './workflowStatus.js'

const props = defineProps({
  card: { type: Object, required: true },
  showApp: { type: Boolean, default: true },
})

const emit = defineEmits(['open'])

const timeLabel = computed(() => formatDateTime(props.card.time))

const dueHint = computed(() => {
  if (props.card.status !== 'running' || !props.card.dueAt) return ''
  const text = formatDateTime(props.card.dueAt)
  return text ? `请于 ${text} 前完成` : ''
})

const statusClass = computed(() =>
  workflowCardStatusClass({
    status: props.card.status,
    statusText: props.card.statusText,
    kind: props.card.kind,
  }),
)

function onOpen() {
  emit('open', props.card)
}
</script>

<style scoped lang="less">
.wf-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 14px 16px;
  text-align: left;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
}

.wf-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.wf-card-top,
.wf-card-meta {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.wf-card-form {
  font-weight: 600;
}

.wf-card-status {
  flex-shrink: 0;
  padding: 0 6px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 4px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
}

.wf-card-status.is-running {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.wf-card-status.is-approved {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.wf-card-status.is-rejected {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.wf-card-status.is-error,
.wf-card-status.is-return {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.wf-card-status.is-cc {
  color: var(--el-color-info);
  background: var(--el-color-info-light-9);
}

.wf-card-due {
  color: var(--el-color-warning);
  font-size: 12px;
}

.wf-card-meta,
.wf-card-summary {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.wf-card-summary {
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
</style>
