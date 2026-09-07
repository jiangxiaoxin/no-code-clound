<template>
  <div class="wf-palette">
    <div class="wf-palette-title">节点</div>
    <el-button
      plain
      class="wf-palette-item"
      :disabled="disabled"
      @click="addApprove"
      @mousedown="onDragStartApprove"
    >
      <el-icon><CircleCheck /></el-icon>
      <span>审批节点</span>
    </el-button>
    <el-button
      plain
      class="wf-palette-item"
      :disabled="disabled"
      @click="addBranch"
      @mousedown="onDragStartBranch"
    >
      <el-icon><Share /></el-icon>
      <span>分支节点</span>
    </el-button>
    <el-button
      plain
      class="wf-palette-item"
      :disabled="disabled"
      @click="addCc"
      @mousedown="onDragStartCc"
    >
      <el-icon><ChatDotRound /></el-icon>
      <span>抄送节点</span>
    </el-button>
    <el-button
      plain
      class="wf-palette-item"
      :disabled="disabled"
      @click="addEnd"
      @mousedown="onDragStartEnd"
    >
      <el-icon><Finished /></el-icon>
      <span>结束节点</span>
    </el-button>
  </div>
</template>

<script setup>
import { ChatDotRound, CircleCheck, Finished, Share } from '@element-plus/icons-vue'

const props = defineProps({
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['add', 'drag-start'])

function addApprove() {
  if (props.disabled) return
  emit('add', 'approve')
}

function addBranch() {
  if (props.disabled) return
  emit('add', 'branch')
}

function addCc() {
  if (props.disabled) return
  emit('add', 'cc')
}

function addEnd() {
  if (props.disabled) return
  emit('add', 'end')
}

function onDragStartApprove(event) {
  onDragStart('approve', event)
}

function onDragStartBranch(event) {
  onDragStart('branch', event)
}

function onDragStartCc(event) {
  onDragStart('cc', event)
}

function onDragStartEnd(event) {
  onDragStart('end', event)
}

function onDragStart(type, event) {
  if (props.disabled) return
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
