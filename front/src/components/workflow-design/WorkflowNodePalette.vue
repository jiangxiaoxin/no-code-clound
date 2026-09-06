<template>
  <div class="wf-palette">
    <div class="wf-palette-title">节点</div>
    <button type="button" class="wf-palette-item" @click="addApprove">
      <el-icon><CircleCheck /></el-icon>
      <span>审批</span>
    </button>
    <button type="button" class="wf-palette-item" @click="addBranch">
      <el-icon><Share /></el-icon>
      <span>分支</span>
    </button>
    <button type="button" class="wf-palette-item" @click="addEnd">
      <el-icon><Finished /></el-icon>
      <span>结束</span>
    </button>
  </div>
</template>

<script setup>
import { CircleCheck, Finished, Share } from '@element-plus/icons-vue'

const emit = defineEmits(['add'])

function addApprove() {
  emit('add', 'approve')
}

function addBranch() {
  emit('add', 'branch')
}

function addEnd() {
  emit('add', 'end')
}
</script>

<style scoped lang="less">
.wf-palette {
  display: flex;
  flex-direction: column;
  width: 140px;
  padding: 12px;
  border-right: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.wf-palette-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.wf-palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-bg-color);
  cursor: pointer;
  margin-bottom: 8px;
}
</style>
