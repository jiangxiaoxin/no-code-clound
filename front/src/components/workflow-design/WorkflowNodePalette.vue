<template>
  <div class="wf-palette">
    <div class="wf-palette-title">节点</div>
    <el-button plain class="wf-palette-item" @click="addApprove" @mousedown="onDragStartApprove">
      <el-icon><CircleCheck /></el-icon>
      <span>审批节点</span>
    </el-button>
    <el-button plain class="wf-palette-item" @click="addBranch" @mousedown="onDragStartBranch">
      <el-icon><Share /></el-icon>
      <span>分支节点</span>
    </el-button>
    <el-button plain class="wf-palette-item" @click="addEnd" @mousedown="onDragStartEnd">
      <el-icon><Finished /></el-icon>
      <span>结束节点</span>
    </el-button>
  </div>
</template>

<script setup>
import { CircleCheck, Finished, Share } from '@element-plus/icons-vue'

const emit = defineEmits(['add', 'drag-start'])

function addApprove() {
  emit('add', 'approve')
}

function addBranch() {
  emit('add', 'branch')
}

function addEnd() {
  emit('add', 'end')
}

function onDragStartApprove(event) {
  onDragStart('approve', event)
}

function onDragStartBranch(event) {
  onDragStart('branch', event)
}

function onDragStartEnd(event) {
  onDragStart('end', event)
}

function onDragStart(type, event) {
  if (event.button !== 0) return
  event.preventDefault()
  emit('drag-start', type)
}
</script>

<style scoped lang="less">
.wf-palette {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: 140px;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
  border-right: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.wf-palette-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.wf-palette-item {
  margin-left: 0 !important;
  margin-bottom: 8px;
  width: 100%;
}
</style>
