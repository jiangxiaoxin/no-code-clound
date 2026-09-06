<template>
  <button type="button" class="wf-card" @click="onOpen">
    <div class="wf-card-top">
      <span class="wf-card-form">{{ card.formName }}</span>
      <span class="wf-card-status">{{ card.statusText }}</span>
    </div>
    <div class="wf-card-summary">{{ card.summary }}</div>
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

const props = defineProps({
  card: { type: Object, required: true },
  showApp: { type: Boolean, default: true },
})

const emit = defineEmits(['open'])

const timeLabel = computed(() => formatDateTime(props.card.time))

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
  justify-content: space-between;
  gap: 12px;
}

.wf-card-form {
  font-weight: 600;
}

.wf-card-status,
.wf-card-meta,
.wf-card-summary {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.wf-card-summary {
  color: var(--el-text-color-regular);
}
</style>
