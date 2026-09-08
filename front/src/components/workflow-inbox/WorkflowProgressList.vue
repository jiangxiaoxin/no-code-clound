<template>
  <div class="wf-progress-list">
    <div v-for="(item, index) in rows" :key="index" class="wf-progress-row">
      <span class="wf-progress-time">{{ item.time }}</span>
      <p v-if="item.kind === 'note'" class="wf-progress-note">{{ item.text }}</p>
      <template v-else>
        <div class="wf-progress-main">
          <span class="wf-progress-user">{{ item.assigneeName }}</span>
          <el-tag size="small" effect="light" class="wf-progress-node">
            {{ item.nodeTitle }}
          </el-tag>
          <span v-if="item.statusText" class="wf-progress-status">{{ item.statusText }}</span>
        </div>
        <p v-if="item.comment" class="wf-progress-comment">{{ item.comment }}</p>
      </template>
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
  gap: 10px;
}

.wf-progress-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  line-height: 1.5;
}

.wf-progress-time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.wf-progress-note {
  margin: 0;
  color: var(--el-text-color-regular);
}

.wf-progress-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.wf-progress-user {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.wf-progress-node {
  flex-shrink: 0;
}

.wf-progress-status {
  color: var(--el-text-color-regular);
}

.wf-progress-comment {
  margin: 0;
  padding: 6px 10px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 4px;
}
</style>
