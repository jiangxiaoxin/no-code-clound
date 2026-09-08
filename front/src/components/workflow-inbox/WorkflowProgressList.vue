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
import { buildProgressRows } from './workflowProgressList.js'

const props = defineProps({
  progress: { type: Object, default: null },
})

const rows = computed(() => buildProgressRows(props.progress))
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
